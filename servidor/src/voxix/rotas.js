// Voxix (chat para gamers) — rotas do servidor. Login = Vetorial ID. Aqui só moram perfis (apelido), bloqueios, denúncias e a
// entrega das mensagens; o histórico fica no aparelho de cada pessoa.
//   GET  /voxix/perfil                    → { apelido, nome } (ou { apelido: null })
//   PUT  /voxix/perfil {apelido, nome}    → cria o perfil (o apelido não muda depois)
//   GET  /voxix/buscar?apelido=           → { apelido, nome } da pessoa (só busca exata, nada de lista)
//   POST /voxix/mensagens {para, corpo, idLocal} → entrega na caixa de quem recebe
//   GET  /voxix/ws?token=                 → WebSocket: fila de mensagens e entrega ao vivo
//   GET/POST/DELETE /voxix/bloqueios      → bloquear e desbloquear
//   POST /voxix/denuncias {apelido, motivo, trecho?} → fila de revisão
//   POST /voxix/transcrever               → ditado (áudio curto vira texto; o áudio não é guardado)
import { ErroLoja } from "../loja/lojas.js";
import { aleatorio } from "../loja/cripto.js";
import { ErroId, validarSessao } from "../id/conta.js";

export const ehRotaVoxix = (c) => c.startsWith("/voxix/");
export const MAX_TEXTO = 2000;
export const MAX_AUDIO = 1_000_000; // ~1 MB: ditado curto
export const LIMITE_DIARIO = { denuncia: 20, transcricao: 60, mensagem: 3000 };
const RESERVADOS = new Set(["admin", "administrador", "voxix", "vetorial", "suporte", "moderador", "sistema", "root", "ajuda", "oficial"]);
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });

export function apelidoValido(a) {
  const s = String(a || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(s)) throw new ErroLoja(400, "apelido_invalido", "O apelido tem de 3 a 20 letras minúsculas, números ou _ (sem espaço nem acento).");
  if (RESERVADOS.has(s)) throw new ErroLoja(400, "apelido_reservado", "Esse apelido é reservado. Escolha outro.");
  return s;
}
const nomeLimpo = (n, padrao) => String(n || padrao || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40) || padrao;
const hoje = (agora) => new Date(agora).toISOString().slice(0, 10);

async function corpo(req, max = 20_000) {
  const t = await req.text();
  if (t.length > max) throw new ErroLoja(413, "corpo_grande", "Pedido grande demais.");
  try { const d = JSON.parse(t || "{}"); return d && typeof d === "object" && !Array.isArray(d) ? d : {}; } catch { throw new ErroLoja(400, "json_invalido", "O corpo precisa ser um JSON válido."); }
}

async function perfilDe(env, usuario) {
  return (await env.DB.prepare("SELECT * FROM voxix_perfis WHERE usuario = ?").bind(usuario).first()) || null;
}
async function perfilPorApelido(env, apelido) {
  return (await env.DB.prepare("SELECT * FROM voxix_perfis WHERE apelido = ?").bind(apelido).first()) || null;
}

/** Conta uso do dia; passou do limite, recusa (proteção contra abuso e contra custo). */
export async function gastar(env, usuario, tipo, agora = Date.now()) {
  const dia = hoje(agora);
  await env.DB.prepare("INSERT INTO voxix_uso (usuario, dia, tipo, n) VALUES (?, ?, ?, 1) ON CONFLICT(usuario, dia, tipo) DO UPDATE SET n = n + 1").bind(usuario, dia, tipo).run();
  const r = await env.DB.prepare("SELECT n FROM voxix_uso WHERE usuario = ? AND dia = ? AND tipo = ?").bind(usuario, dia, tipo).first();
  if (r.n > LIMITE_DIARIO[tipo]) throw new ErroLoja(429, "limite_diario", "Você chegou ao limite de hoje para isso. Tente amanhã.");
}

export async function criarPerfil(env, usuario, d, nomeConta) {
  if (await perfilDe(env, usuario)) throw new ErroLoja(409, "perfil_existe", "Você já tem um perfil no Voxix. O apelido não muda.");
  const apelido = apelidoValido(d.apelido);
  if (await perfilPorApelido(env, apelido)) throw new ErroLoja(409, "apelido_em_uso", "Esse apelido já está em uso.");
  const nome = nomeLimpo(d.nome, nomeConta || apelido);
  await env.DB.prepare("INSERT INTO voxix_perfis (usuario, apelido, nome, criado) VALUES (?, ?, ?, ?)").bind(usuario, apelido, nome, Date.now()).run();
  return { apelido, nome };
}

export async function enviar(env, usuario, d, agora = Date.now()) {
  const eu = await perfilDe(env, usuario);
  if (!eu) throw new ErroLoja(409, "sem_perfil", "Crie o seu perfil do Voxix antes de conversar.");
  const texto = String(d.corpo ?? "").replace(/\u0000/g, "").trim();
  if (!texto) throw new ErroLoja(400, "mensagem_vazia", "Escreva alguma coisa.");
  if (texto.length > MAX_TEXTO) throw new ErroLoja(413, "mensagem_grande", `A mensagem passa de ${MAX_TEXTO} letras.`);
  const alvo = await perfilPorApelido(env, apelidoValido(d.para));
  if (!alvo) throw new ErroLoja(404, "pessoa_inexistente", "Não achei ninguém com esse apelido.");
  if (alvo.usuario === usuario) throw new ErroLoja(400, "para_si", "Você não pode mandar mensagem para você mesmo.");
  await gastar(env, usuario, "mensagem", agora);
  const id = agora.toString(36).padStart(9, "0") + aleatorio(5);
  const bloqueado = await env.DB.prepare("SELECT 1 AS x FROM voxix_bloqueios WHERE usuario = ? AND bloqueado = ?").bind(alvo.usuario, usuario).first();
  // quem foi bloqueado não descobre: a mensagem "sai", mas não chega
  if (!bloqueado) {
    const caixa = env.VOXIX_CAIXA;
    if (!caixa) throw new ErroLoja(503, "indisponivel", "O chat ao vivo ainda não está ligado no servidor.");
    const r = await caixa.get(caixa.idFromName(alvo.usuario)).fetch("https://caixa/entregar", { method: "POST", body: JSON.stringify({ id, de: eu.apelido, deNome: eu.nome, conversa: eu.apelido, corpo: texto, criado: agora }) });
    const resp = await r.json();
    if (!resp.ok) throw new ErroLoja(429, resp.codigo || "caixa_cheia", "A caixa dessa pessoa está cheia. Tente mais tarde.");
  }
  return { ok: true, id, criado: agora, idLocal: typeof d.idLocal === "string" ? d.idLocal.slice(0, 40) : undefined };
}

export async function bloquear(env, usuario, apelido, agora = Date.now()) {
  const alvo = await perfilPorApelido(env, apelidoValido(apelido));
  if (!alvo) throw new ErroLoja(404, "pessoa_inexistente", "Não achei ninguém com esse apelido.");
  if (alvo.usuario === usuario) throw new ErroLoja(400, "para_si", "Você não pode bloquear você mesmo.");
  await env.DB.prepare("INSERT OR IGNORE INTO voxix_bloqueios (usuario, bloqueado, criado) VALUES (?, ?, ?)").bind(usuario, alvo.usuario, agora).run();
  return { ok: true, apelido: alvo.apelido };
}
export async function desbloquear(env, usuario, apelido) {
  const alvo = await perfilPorApelido(env, apelidoValido(apelido));
  if (alvo) await env.DB.prepare("DELETE FROM voxix_bloqueios WHERE usuario = ? AND bloqueado = ?").bind(usuario, alvo.usuario).run();
  return { ok: true };
}
export async function listarBloqueios(env, usuario) {
  const { results } = await env.DB.prepare("SELECT p.apelido, p.nome FROM voxix_bloqueios b JOIN voxix_perfis p ON p.usuario = b.bloqueado WHERE b.usuario = ? ORDER BY b.criado DESC").bind(usuario).all();
  return { bloqueios: results };
}

export async function denunciar(env, usuario, d, agora = Date.now()) {
  const alvo = await perfilPorApelido(env, apelidoValido(d.apelido));
  if (!alvo) throw new ErroLoja(404, "pessoa_inexistente", "Não achei ninguém com esse apelido.");
  const motivo = String(d.motivo || "").trim().slice(0, 300);
  if (!motivo) throw new ErroLoja(400, "motivo_vazio", "Diga o motivo da denúncia.");
  await gastar(env, usuario, "denuncia", agora);
  const id = aleatorio(10);
  const trecho = d.trecho ? String(d.trecho).slice(0, 1000) : null; // quem denuncia manda o trecho: o servidor não guarda conversas
  await env.DB.prepare("INSERT INTO voxix_denuncias (id, de, alvo, motivo, trecho, criado) VALUES (?, ?, ?, ?, ?, ?)").bind(id, usuario, alvo.usuario, motivo, trecho, agora).run();
  return { ok: true, id };
}

export async function transcrever(env, usuario, bytes, tipo, agora = Date.now()) {
  if (!env.AI) throw new ErroLoja(503, "ditado_indisponivel", "O ditado por este caminho ainda não está ligado no servidor.");
  if (!bytes.byteLength) throw new ErroLoja(400, "audio_vazio", "Não chegou áudio.");
  if (bytes.byteLength > MAX_AUDIO) throw new ErroLoja(413, "audio_grande", "Áudio longo demais. Fale uma frase de cada vez.");
  await gastar(env, usuario, "transcricao", agora);
  let bin = "";
  const u8 = new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  const r = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: btoa(bin), language: "pt" });
  return { texto: String(r?.text ?? "").trim().slice(0, MAX_TEXTO), tipo: String(tipo || "").slice(0, 40) };
}

export async function tratarVoxix(req, env, url, caminho) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    // o WebSocket do navegador não manda cabeçalhos: o token vai na URL
    let pedido = req;
    if (caminho === "/voxix/ws" && url.searchParams.get("token")) pedido = new Request(req.url, { headers: { authorization: `Bearer ${url.searchParams.get("token")}` } });
    const ctx = await validarSessao(env, pedido, {});
    const u = ctx.usuario.id;
    if (caminho === "/voxix/perfil" && req.method === "GET") { const p = await perfilDe(env, u); return json(p ? { apelido: p.apelido, nome: p.nome } : { apelido: null, nomeSugerido: ctx.usuario.nome || "" }); }
    if (caminho === "/voxix/perfil" && req.method === "PUT") return json(await criarPerfil(env, u, await corpo(req), ctx.usuario.nome), 201);
    if (caminho === "/voxix/buscar" && req.method === "GET") {
      const a = await perfilPorApelido(env, apelidoValido(url.searchParams.get("apelido")));
      if (!a) throw new ErroLoja(404, "pessoa_inexistente", "Não achei ninguém com esse apelido.");
      return json({ apelido: a.apelido, nome: a.nome });
    }
    if (caminho === "/voxix/mensagens" && req.method === "POST") return json(await enviar(env, u, await corpo(req)), 201);
    if (caminho === "/voxix/bloqueios" && req.method === "GET") return json(await listarBloqueios(env, u));
    if (caminho === "/voxix/bloqueios" && req.method === "POST") return json(await bloquear(env, u, (await corpo(req)).apelido));
    const m = /^\/voxix\/bloqueios\/([A-Za-z0-9_]{3,20})$/.exec(caminho);
    if (m && req.method === "DELETE") return json(await desbloquear(env, u, m[1]));
    if (caminho === "/voxix/denuncias" && req.method === "POST") return json(await denunciar(env, u, await corpo(req)), 201);
    if (caminho === "/voxix/transcrever" && req.method === "POST") {
      const buf = await req.arrayBuffer();
      return json(await transcrever(env, u, buf, req.headers.get("content-type")));
    }
    if (caminho === "/voxix/ws" && req.method === "GET") {
      if (!(await perfilDe(env, u))) throw new ErroLoja(409, "sem_perfil", "Crie o seu perfil do Voxix antes de conversar.");
      if (!env.VOXIX_CAIXA) throw new ErroLoja(503, "indisponivel", "O chat ao vivo ainda não está ligado no servidor.");
      return await env.VOXIX_CAIXA.get(env.VOXIX_CAIXA.idFromName(u)).fetch(new Request("https://caixa/ws", req));
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroLoja || e instanceof ErroId) return json({ error: e.message, codigo: e.codigo, ...(e.dados || {}) }, e.status);
    console.error("voxix", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
