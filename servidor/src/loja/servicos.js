// Rotas de marketing, QR/Pix, BI, assinatura e 2FA (depois da autenticação da loja).
import { ErroLoja, acessoLiberado } from "./lojas.js";
import { auditar, financeiro } from "./bi.js";
import { darForma, limparHashtags, preencherFila, regenerar } from "./marketing.js";
import { destinos, guardarDestino, logDaLoja, publicarAgora } from "./publicar.js";
import { matrizQr, pixCopiaECola, svgQr } from "./qr.js";
import { confirmar2fa, estadoDaAssinatura, iniciar2fa, iniciarCobranca, liberarAcesso } from "./assinatura.js";

const json = (d, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });

export const ehServico = (c) =>
  c.startsWith("/marketing/") || c.startsWith("/bi/") || c.startsWith("/qr") || c.startsWith("/assinatura") || c.startsWith("/seguranca/") || c === "/painel";

export async function tratarServico(req, env, loja, url, caminho, { corpoJson, exigeAcesso, gerar }) {
  const origem = url.origin;
  const ids = (d) => (Array.isArray(d.ids) ? d.ids.map(Number).filter(Number.isInteger).slice(0, 50) : []);
  // ----- marketing
  if (caminho === "/marketing/fila" && req.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT f.*, p.nome AS produto_nome, p.imagem FROM fila_posts f LEFT JOIN produtos p ON p.id = f.produto WHERE f.loja = ? ORDER BY f.id DESC LIMIT 100").bind(loja.id).all();
    return json({ fila: results.map(darForma) });
  }
  if (caminho === "/marketing/sugestoes" && req.method === "POST") {
    exigeAcesso(loja);
    const d = await corpoJson(req);
    const criados = await preencherFila(env, loja, { quantidade: Number(d.quantidade) || 5, gerar });
    return json({ criados }, 201);
  }
  if (caminho === "/marketing/regenerar" && req.method === "POST") {
    exigeAcesso(loja);
    const d = await corpoJson(req);
    let lista = ids(d);
    if (d.todos) lista = (await env.DB.prepare("SELECT id FROM fila_posts WHERE loja = ? AND status = 'sugerido' LIMIT 20").bind(loja.id).all()).results.map((r) => r.id);
    return json({ regenerados: await regenerar(env, loja, lista, { gerar }) });
  }
  let m = /^\/marketing\/fila\/(\d+)(\/agendar|\/editar)?$/.exec(caminho);
  // o Android (HttpURLConnection) não faz PATCH: o app usa POST em /agendar
  if (m && ((req.method === "PATCH" && !m[2]) || (req.method === "POST" && m[2]))) {
    const d = await corpoJson(req);
    if (d.agendarPara === undefined || m[2] === "/editar") { // só edição do texto/hashtags/canal/imagem: não mexe no agendamento
      const canal = d.canal === undefined ? null : ["instagram", "webhook"].includes(d.canal) ? d.canal : null;
      let imagem = null;
      if (d.imagem !== undefined) {
        if (d.imagem && !/^https:\/\//.test(String(d.imagem))) throw new ErroLoja(400, "imagem_invalida", "A imagem precisa ser um endereço https.");
        imagem = String(d.imagem || "").slice(0, 500);
      }
      const r = await env.DB.prepare("UPDATE fila_posts SET legenda = COALESCE(?, legenda), copy = COALESCE(?, copy), hashtags = COALESCE(?, hashtags), canal = COALESCE(?, canal), imagem = COALESCE(?, imagem), atualizado = ? WHERE id = ? AND loja = ? AND status NOT IN ('publicado','publicando')")
        .bind(d.legenda === undefined ? null : String(d.legenda).slice(0, 600), d.copy === undefined ? null : String(d.copy).slice(0, 200),
          Array.isArray(d.hashtags) ? JSON.stringify(limparHashtags(d.hashtags)) : null, canal, imagem, Date.now(), Number(m[1]), loja.id).run();
      if (!r.meta.changes) throw new ErroLoja(404, "post_inexistente", "Postagem não encontrada ou já publicada.");
      return json({ ok: true });
    }
    const quando = d.agendarPara === null ? null : Number(d.agendarPara);
    if (quando !== null && !(quando > Date.now() - 60_000)) throw new ErroLoja(400, "data_invalida", "Informe uma data futura (milissegundos).");
    const r = await env.DB.prepare("UPDATE fila_posts SET status = ?, agendado_para = ?, legenda = COALESCE(?, legenda), copy = COALESCE(?, copy), atualizado = ? WHERE id = ? AND loja = ?")
      .bind(quando ? "agendado" : "sugerido", quando, d.legenda ? String(d.legenda).slice(0, 600) : null, d.copy ? String(d.copy).slice(0, 200) : null, Date.now(), Number(m[1]), loja.id).run();
    if (!r.meta.changes) throw new ErroLoja(404, "post_inexistente", "Postagem não encontrada.");
    return json({ ok: true });
  }
  if (m && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM fila_posts WHERE id = ? AND loja = ?").bind(Number(m[1]), loja.id).run();
    return json({ ok: true });
  }
  if (m && !m[2] && req.method === "POST") {
    exigeAcesso(loja);
    return json({ regenerados: await regenerar(env, loja, [Number(m[1])], { gerar }) });
  }
  if (caminho === "/marketing/excluir" && req.method === "POST") { // exclusão em lote
    const lista = ids(await corpoJson(req));
    if (!lista.length) return json({ removidos: 0 });
    const r = await env.DB.prepare(`DELETE FROM fila_posts WHERE loja = ? AND status != 'publicando' AND id IN (${lista.map(() => "?").join(",")})`).bind(loja.id, ...lista).run();
    return json({ removidos: r.meta.changes });
  }
  if (caminho === "/marketing/destinos" && req.method === "GET") return json({ destinos: await destinos(env, loja) });
  m = /^\/marketing\/destinos\/(instagram|webhook)$/.exec(caminho);
  if (m && req.method === "PUT") { exigeAcesso(loja); return json(await guardarDestino(env, loja, m[1], await corpoJson(req))); }
  if (m && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM publicacao_destinos WHERE loja = ? AND tipo = ?").bind(loja.id, m[1]).run();
    return json({ ok: true });
  }
  m = /^\/marketing\/fila\/(\d+)\/publicar$/.exec(caminho);
  if (m && req.method === "POST") { exigeAcesso(loja); return json(await publicarAgora(env, loja, Number(m[1]))); }
  if (caminho === "/marketing/log" && req.method === "GET") return json({ log: await logDaLoja(env, loja) });
  if (caminho === "/marketing/limpar" && req.method === "POST") {
    const d = await corpoJson(req);
    const alvo = ["agendado", "sugerido", "todos"].includes(d.status) ? d.status : "agendado";
    const r = alvo === "todos"
      ? await env.DB.prepare("DELETE FROM fila_posts WHERE loja = ?").bind(loja.id).run()
      : await env.DB.prepare("DELETE FROM fila_posts WHERE loja = ? AND status = ?").bind(loja.id, alvo).run();
    return json({ removidos: r.meta.changes });
  }
  // ----- QR e Pix
  if (caminho === "/qr" && req.method === "POST") {
    const d = await corpoJson(req);
    let texto = String(d.texto || "");
    if (d.tipo === "pix") texto = pixCopiaECola({ chave: d.chave, nome: d.nome || loja.nome, cidade: d.cidade, valorCentavos: d.valorCentavos, descricao: d.descricao, txid: d.txid });
    else if (d.tipo === "link" || d.tipo === "rede") {
      try { if (new URL(texto).protocol !== "https:") throw 0; } catch (e) { throw new ErroLoja(400, "link_invalido", "Use um endereço https."); }
    }
    return json({ texto, ...matrizQr(texto), svg: d.svg ? svgQr(texto, { cor: d.cor }) : undefined });
  }
  // ----- BI
  if (caminho === "/bi/auditoria" && req.method === "GET") {
    const produtos = (await env.DB.prepare("SELECT * FROM produtos WHERE loja = ?").bind(loja.id).all()).results.map((p) => ({ ...p, oculto: !!p.oculto }));
    const canais = (await env.DB.prepare("SELECT id, plataforma FROM canais WHERE loja = ?").bind(loja.id).all()).results;
    const vinc = (await env.DB.prepare("SELECT v.canal, v.produto FROM vinculos v JOIN canais c ON c.id = v.canal WHERE c.loja = ?").bind(loja.id).all()).results;
    return json(auditar(produtos, vinc, canais));
  }
  if (caminho === "/bi/financeiro" && req.method === "GET") {
    const dias = Math.min(Math.max(Number(url.searchParams.get("dias")) || 30, 1), 90);
    const canais = (await env.DB.prepare("SELECT id, plataforma, nome, config FROM canais WHERE loja = ?").bind(loja.id).all()).results;
    const pedidos = (await env.DB.prepare("SELECT canal, status, total_centavos, taxa_centavos, criado FROM pedidos WHERE loja = ? AND criado > ?").bind(loja.id, Date.now() - dias * 86_400_000).all()).results;
    return json(financeiro(pedidos, canais, dias));
  }
  m = /^\/bi\/canais\/([a-f0-9]{16})\/taxa$/.exec(caminho);
  if (m && req.method === "PUT") {
    const d = await corpoJson(req);
    const pct = Number(d.percentual);
    if (!(pct >= 0 && pct <= 60)) throw new ErroLoja(400, "taxa_invalida", "Informe a taxa em % (0 a 60).");
    const c = await env.DB.prepare("SELECT config FROM canais WHERE id = ? AND loja = ?").bind(m[1], loja.id).first();
    if (!c) throw new ErroLoja(404, "canal_inexistente", "Canal não encontrado.");
    await env.DB.prepare("UPDATE canais SET config = ? WHERE id = ?").bind(JSON.stringify({ ...JSON.parse(c.config || "{}"), taxa_percentual: pct }), m[1]).run();
    return json({ ok: true });
  }
  // ----- assinatura e 2FA
  if (caminho === "/assinatura" && req.method === "GET") return json(await estadoDaAssinatura(env, loja));
  if (caminho === "/assinatura/cobrar" && req.method === "POST") {
    const d = await corpoJson(req);
    return json(await iniciarCobranca(env, loja, String(d.gateway || ""), origem, Date.now(), String(d.pacote || "venus")), 201);
  }
  if (caminho === "/assinatura/liberar" && req.method === "POST") {
    const d = await corpoJson(req);
    return json(await liberarAcesso(env, loja, d.codigo));
  }
  if (caminho === "/seguranca/2fa/iniciar" && req.method === "POST") return json(await iniciar2fa(env, loja));
  if (caminho === "/seguranca/2fa/confirmar" && req.method === "POST") {
    const d = await corpoJson(req);
    await confirmar2fa(env, loja, d.codigo);
    return json({ ok: true });
  }
  return null;
}
