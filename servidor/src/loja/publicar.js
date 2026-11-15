// Publicação automática dos posts da Central de Marketing: Instagram (API oficial da Meta) ou webhook (ex.: Vênus Robô).
import { cifrar, decifrar, hmacHex, aleatorio } from "./cripto.js";
import { ErroLoja } from "./lojas.js";

const GRAPH = "https://graph.facebook.com/v21.0";
export const MAX_TENTATIVAS = 3;
export const TIPOS = ["instagram", "webhook"];

export const textoDoPost = (p) => {
  const tags = (typeof p.hashtags === "string" ? JSON.parse(p.hashtags || "[]") : p.hashtags || []).map((t) => `#${String(t).replace(/^#/, "")}`).join(" ");
  return [p.legenda, p.copy, tags].map((s) => String(s || "").trim()).filter(Boolean).join("\n\n").slice(0, 2200);
};

export async function guardarDestino(env, loja, tipo, d, agora = Date.now()) {
  if (!TIPOS.includes(tipo)) throw new ErroLoja(400, "destino_invalido", "Use instagram ou webhook.");
  let dados;
  if (tipo === "instagram") {
    if (!/^\d{5,25}$/.test(String(d.igUserId || "")) || String(d.token || "").length < 20) throw new ErroLoja(400, "dados_invalidos", "Informe o ID da conta do Instagram e o token de acesso.");
    dados = { igUserId: String(d.igUserId), token: String(d.token) };
  } else {
    try { if (new URL(d.url).protocol !== "https:") throw 0; } catch { throw new ErroLoja(400, "dados_invalidos", "O webhook precisa ser um endereço https."); }
    dados = { url: String(d.url), segredo: String(d.segredo || "") || aleatorio(16) };
  }
  await env.DB.prepare("INSERT INTO publicacao_destinos (loja, tipo, dados, criado) VALUES (?, ?, ?, ?) ON CONFLICT(loja, tipo) DO UPDATE SET dados = excluded.dados, criado = excluded.criado")
    .bind(loja.id, tipo, await cifrar(env, dados), agora).run();
  return { tipo, segredo: tipo === "webhook" ? dados.segredo : undefined };
}

export async function destinos(env, loja) {
  const { results } = await env.DB.prepare("SELECT tipo, criado FROM publicacao_destinos WHERE loja = ?").bind(loja.id).all();
  return TIPOS.map((t) => ({ tipo: t, conectado: results.some((r) => r.tipo === t) }));
}

async function http(f, url, init) {
  const r = await f(url, init);
  const t = await r.text();
  let d = {};
  try { d = t ? JSON.parse(t) : {}; } catch { /* resposta não JSON */ }
  if (!r.ok) throw new Error((d.error && (d.error.message || d.error)) || `HTTP ${r.status}`);
  return d;
}

async function enviar(env, loja, post, f) {
  const linha = await env.DB.prepare("SELECT dados FROM publicacao_destinos WHERE loja = ? AND tipo = ?").bind(loja.id, post.canal).first();
  if (!linha) throw new Error(`Conecte o destino "${post.canal}" antes de publicar.`);
  const dest = await decifrar(env, linha.dados);
  const texto = textoDoPost(post);
  if (post.canal === "instagram") {
    const imagem = post.imagem || (post.produto ? (await env.DB.prepare("SELECT imagem FROM produtos WHERE id = ? AND loja = ?").bind(post.produto, loja.id).first())?.imagem : "");
    if (!/^https:\/\//.test(imagem || "")) throw new Error("O Instagram precisa de uma imagem pública (https) no post ou no produto.");
    const c = await http(f, `${GRAPH}/${dest.igUserId}/media`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image_url: imagem, caption: texto, access_token: dest.token }) });
    const p = await http(f, `${GRAPH}/${dest.igUserId}/media_publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creation_id: c.id, access_token: dest.token }) });
    return `Instagram: ${p.id || "publicado"}`;
  }
  const corpo = JSON.stringify({ evento: "post", id: post.id, texto, legenda: post.legenda, copy: post.copy, hashtags: JSON.parse(post.hashtags || "[]"), imagem: post.imagem || "" });
  await http(f, dest.url, { method: "POST", headers: { "content-type": "application/json", "x-venus-assinatura": await hmacHex(dest.segredo, corpo) }, body: corpo });
  return "Webhook entregue";
}

const registrar = (env, post, status, detalhe, agora) =>
  env.DB.prepare("INSERT INTO post_log (post, loja, quando, status, detalhe) VALUES (?, ?, ?, ?, ?)").bind(post.id, post.loja, agora, status, String(detalhe).slice(0, 300)).run();

/** Publica um post já "reservado" (status publicando). Em erro, tenta de novo em 10, 20 min; na 3ª falha fica como erro. */
async function publicarReservado(env, post, f, agora) {
  const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(post.loja).first();
  try {
    const detalhe = await enviar(env, loja, post, f);
    await env.DB.prepare("UPDATE fila_posts SET status = 'publicado', publicado_em = ?, erro = '', atualizado = ? WHERE id = ?").bind(agora, agora, post.id).run();
    await registrar(env, post, "publicado", detalhe, agora);
    return { ok: true, detalhe };
  } catch (e) {
    const t = post.tentativas + 1;
    const fim = t >= MAX_TENTATIVAS;
    await env.DB.prepare("UPDATE fila_posts SET status = ?, tentativas = ?, erro = ?, agendado_para = ?, atualizado = ? WHERE id = ?")
      .bind(fim ? "erro" : "agendado", t, String(e.message).slice(0, 300), fim ? post.agendado_para : agora + t * 10 * 60_000, agora, post.id).run();
    await registrar(env, post, fim ? "erro" : "tentando_de_novo", e.message, agora);
    return { ok: false, erro: e.message, definitivo: fim };
  }
}

async function reservar(env, id, deStatus, agora) {
  const r = await env.DB.prepare(`UPDATE fila_posts SET status = 'publicando', atualizado = ? WHERE id = ? AND status IN (${deStatus.map(() => "?").join(",")})`).bind(agora, id, ...deStatus).run();
  return r.meta.changes === 1 ? await env.DB.prepare("SELECT * FROM fila_posts WHERE id = ?").bind(id).first() : null;
}

/** Chamado pelo cron a cada 10 minutos. */
export async function publicarVencidos(env, { agora = Date.now(), f = fetch } = {}) {
  const { results } = await env.DB.prepare("SELECT id FROM fila_posts WHERE status = 'agendado' AND agendado_para IS NOT NULL AND agendado_para <= ? ORDER BY agendado_para LIMIT 10").bind(agora).all();
  // posts presos em "publicando" há mais de 15 minutos (o Worker caiu no meio) voltam para a fila
  await env.DB.prepare("UPDATE fila_posts SET status = 'agendado' WHERE status = 'publicando' AND atualizado < ?").bind(agora - 15 * 60_000).run();
  const saida = [];
  for (const { id } of results) {
    const post = await reservar(env, id, ["agendado"], agora);
    if (post) saida.push({ id, ...(await publicarReservado(env, post, f, agora)) });
  }
  return saida;
}

export async function publicarAgora(env, loja, id, { agora = Date.now(), f = fetch } = {}) {
  const post = await reservar(env, id, ["sugerido", "agendado", "erro"], agora);
  if (!post || post.loja !== loja.id) throw new ErroLoja(404, "post_inexistente", "Postagem não encontrada (ou já em publicação).");
  return publicarReservado(env, { ...post, tentativas: 0 }, f, agora);
}

export async function logDaLoja(env, loja, limite = 50) {
  return (await env.DB.prepare("SELECT post, quando, status, detalhe FROM post_log WHERE loja = ? ORDER BY id DESC LIMIT ?").bind(loja.id, limite).all()).results;
}
