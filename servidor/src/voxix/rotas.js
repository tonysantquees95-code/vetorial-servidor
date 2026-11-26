// Voxix (chat para gamers) — rotas do servidor. Login = Vetorial ID. Aqui moram perfis (apelido), bloqueios, denúncias, a
// entrega ao vivo e o histórico das conversas (guardado no banco, igual em todos os aparelhos da conta).
//   GET  /voxix/perfil                    → { apelido, nome } (ou { apelido: null })
//   PUT  /voxix/perfil {apelido, nome}    → cria o perfil
//   PUT  /voxix/perfil/apelido {apelido}  → troca o @ (1 vez a cada 30 dias; ver presenca.js, que também tem "jogando agora", conquistas e privacidade)
//   GET  /voxix/buscar?apelido=           → { apelido, nome } da pessoa (só busca exata, nada de lista)
//   POST /voxix/mensagens {para, corpo, idLocal} → entrega na caixa de quem recebe
//   GET  /voxix/historico?desde=&limite=  → mensagens da conta (enviadas e recebidas) depois de "desde"
//   DELETE /voxix/conversas/<apelido>     → apaga a conversa só para quem pediu
//   POST /voxix/ticket                    → { ticket }: código de uso único (60 s) para abrir o WebSocket
//   GET  /voxix/ws?ticket=                → WebSocket: fila de mensagens e entrega ao vivo (?token= só nas versões antigas)
//   GET/POST/DELETE /voxix/bloqueios      → bloquear e desbloquear
//   POST /voxix/denuncias {apelido, motivo, trecho?} → fila de revisão
//   /voxix/comunidades…, /voxix/convites/…, /voxix/salas/…/ws → comunidades, salas e convites (ver comunidades.js)
//   POST /voxix/espera {email}            → lista de espera do site (pública, sem login; ver espera.js)
//   POST /voxix/pontuar                   → ditado (põe vírgulas, pontos e maiúsculas no texto falado)
//   POST /voxix/transcrever               → ditado (áudio curto vira texto; o áudio não é guardado)
import { ErroLoja } from "../loja/lojas.js";
import { aleatorio } from "../loja/cripto.js";
import { ErroId, validarSessao } from "../id/conta.js";
import { tratarComunidades } from "./comunidades.js";
import { entrarNaEspera } from "./espera.js";
import { trocarApelido, apelidoReservadoPorOutro, definirPresenca, jogando, definirConquistas, perfilPublico, presencaDe } from "./presenca.js";

export const ehRotaVoxix = (c) => c.startsWith("/voxix/");
export const MAX_TEXTO = 2000;
export const MAX_AUDIO = 1_000_000; // ~1 MB: ditado curto
export const LIMITE_DIARIO = { denuncia: 20, transcricao: 60, mensagem: 3000, comunidade: 10, pontuacao: 400, troca_apelido: 20, presenca: 1800, conquistas: 200 };
const RESERVADOS = new Set(["admin", "administrador", "voxix", "vetorial", "suporte", "moderador", "sistema", "root", "ajuda", "oficial"]);
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });

/** Página do link de convite (https://…/voxix/entrar/CODIGO): mostra o código para colar no Voxix. Não mostra nada da comunidade. */
export function paginaDoConvite(codigo) {
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Convite do Voxix</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0714;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px"><main style="max-width:360px"><h1 style="margin:0 0 8px">Você foi convidado para uma comunidade no Voxix</h1><p style="color:#b9aecb">Abra o Voxix, toque em <b>Comunidades › Entrar com convite</b> e cole este link ou use o código:</p><p style="font-size:34px;letter-spacing:6px;font-weight:800;margin:16px 0">${codigo}</p></main></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export function apelidoValido(a) {
  const s = String(a || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(s)) throw new ErroLoja(400, "apelido_invalido", "O apelido tem de 3 a 20 letras minúsculas, números ou _ (sem espaço nem acento).");
  if (RESERVADOS.has(s)) throw new ErroLoja(400, "apelido_reservado", "Esse apelido é reservado. Escolha outro.");
  return s;
}
const nomeLimpo = (n, padrao) => String(n || padrao || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40) || padrao;
const hoje = (agora) => new Date(agora).toISOString().slice(0, 10);

async function corpo(req, max = 90_000) {
  const t = await req.text();
  if (t.length > max) throw new ErroLoja(413, "corpo_grande", "Pedido grande demais.");
  try { const d = JSON.parse(t || "{}"); return d && typeof d === "object" && !Array.isArray(d) ? d : {}; } catch { throw new ErroLoja(400, "json_invalido", "O corpo precisa ser um JSON válido."); }
}

export const MAX_AVATAR = 60_000;
/** Aceita só um avatar pronto ("p:robo") ou uma foto pequena em data URL; vazio remove. */
export function avatarValido(v) {
  if (v === null || v === undefined || v === "") return null;
  const t = String(v);
  if (/^p:[a-z0-9_]{1,24}$/.test(t)) return t;
  if (t.length <= MAX_AVATAR && /^f:data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(t)) return t;
  throw new ErroLoja(400, "avatar_invalido", "Essa foto não serve. Escolha um avatar ou uma imagem pequena (JPG, PNG ou WebP).");
}
export async function definirAvatar(env, usuario, avatar) {
  const p = await perfilDe(env, usuario);
  if (!p) throw new ErroLoja(409, "sem_perfil", "Crie o seu perfil do Voxix antes.");
  const a = avatarValido(avatar);
  await env.DB.prepare("UPDATE voxix_perfis SET avatar = ? WHERE usuario = ?").bind(a, usuario).run();
  return { avatar: a };
}
/** Avatares de várias pessoas de uma vez (para as conversas e a lista). */
export async function avatares(env, apelidos) {
  const lista = [...new Set(String(apelidos || "").split(",").map((x) => x.trim()).filter((x) => /^[A-Za-z0-9_]{3,20}$/.test(x)))].slice(0, 60);
  const r = {};
  if (!lista.length) return r;
  const { results } = await env.DB.prepare(`SELECT apelido, avatar FROM voxix_perfis WHERE apelido IN (${lista.map(() => "?").join(",")})`).bind(...lista).all();
  for (const x of results || []) r[x.apelido.toLowerCase()] = x.avatar || null;
  return r;
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
  if (await perfilDe(env, usuario)) throw new ErroLoja(409, "perfil_existe", "Você já tem um perfil no Voxix. Para mudar o @, use Trocar @.");
  const apelido = apelidoValido(d.apelido);
  if (await perfilPorApelido(env, apelido) || await apelidoReservadoPorOutro(env, usuario, apelido)) throw new ErroLoja(409, "apelido_em_uso", "Esse apelido já está em uso.");
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
  // o histórico fica no banco; a mensagem de quem foi bloqueado fica só para quem escreveu (entregue = 0)
  await env.DB.prepare("INSERT INTO voxix_mensagens (id, de, para, corpo, tipo, criado, entregue) VALUES (?, ?, ?, ?, 'texto', ?, ?)").bind(id, usuario, alvo.usuario, texto, agora, bloqueado ? 0 : 1).run();
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

export const HISTORICO_LOTE = 300;

/** Mensagens da conta (que escrevi e que recebi) depois de "desde", da mais antiga para a mais nova. `mais` = ainda há outras. */
export async function historico(env, usuario, { desde = 0, limite = HISTORICO_LOTE } = {}) {
  const de = Math.max(0, Number(desde) || 0);
  const n = Math.min(HISTORICO_LOTE, Math.max(1, Number(limite) || HISTORICO_LOTE));
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.corpo, m.tipo, m.criado, m.de = ?1 AS minha,
            o.apelido AS apelido, o.nome AS nome
       FROM voxix_mensagens m
       JOIN voxix_perfis o ON o.usuario = CASE WHEN m.de = ?1 THEN m.para ELSE m.de END
       LEFT JOIN voxix_limpezas l ON l.usuario = ?1 AND l.outro = o.usuario
      WHERE (m.de = ?1 OR (m.para = ?1 AND m.entregue = 1))
        AND m.criado > ?2 AND (l.ate IS NULL OR m.criado > l.ate)
      ORDER BY m.criado ASC, m.id ASC LIMIT ?3`
  ).bind(usuario, de, n + 1).all();
  const mais = results.length > n;
  return { mensagens: results.slice(0, n).map((r) => ({ id: r.id, minha: r.minha === 1, apelido: r.apelido, nome: r.nome, corpo: r.corpo, tipo: r.tipo, criado: r.criado })), mais };
}

/** "Apagar conversa": some só para quem pediu (o outro lado continua vendo). */
export async function limparConversa(env, usuario, apelido, agora = Date.now()) {
  const alvo = await perfilPorApelido(env, apelidoValido(apelido));
  if (!alvo) throw new ErroLoja(404, "pessoa_inexistente", "Não achei ninguém com esse apelido.");
  await env.DB.prepare("INSERT INTO voxix_limpezas (usuario, outro, ate) VALUES (?, ?, ?) ON CONFLICT(usuario, outro) DO UPDATE SET ate = excluded.ate").bind(usuario, alvo.usuario, agora).run();
  return { ok: true };
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

const PALAVRAS = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

/** Ditado: devolve o mesmo texto com vírgulas, pontos, interrogação e maiúsculas. Se a IA mexer nas palavras, devolve o texto original. */
export async function pontuar(env, usuario, texto, agora = Date.now()) {
  const original = String(texto ?? "").replace(/\u0000/g, "").trim();
  if (!original) throw new ErroLoja(400, "texto_vazio", "Não chegou texto.");
  if (original.length > MAX_TEXTO) throw new ErroLoja(413, "texto_grande", "Texto longo demais.");
  if (!env.AI) throw new ErroLoja(503, "pontuacao_indisponivel", "A pontuação automática ainda não está ligada no servidor.");
  await gastar(env, usuario, "pontuacao", agora);
  const r = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      { role: "system", content: "Você revisa textos ditados em português do Brasil. Devolva exatamente o mesmo texto com a pontuação e as letras maiúsculas corretas: vírgulas, pontos finais, pontos de interrogação e de exclamação, dois-pontos e travessão quando fizer sentido, e uma letra maiúscula no começo de cada frase e em nomes próprios. NÃO troque, NÃO tire e NÃO acrescente nenhuma palavra. Responda só com o texto revisado, sem aspas e sem explicações." },
      { role: "user", content: original },
    ],
    max_tokens: 900, temperature: 0,
  });
  const saida = String(r?.response ?? "").trim().replace(/^["“]|["”]$/g, "").trim();
  const igual = saida && PALAVRAS(saida).join(" ") === PALAVRAS(original).join(" ");
  return { texto: igual ? saida.slice(0, MAX_TEXTO) : original, ajustado: !!igual };
}

// O WebSocket do navegador não manda cabeçalhos. Em vez de pôr o token de login na URL (que aparece em registros),
// o app pede um código de uso único (vale 60 s) e abre o WebSocket com ele.
export const TICKET_MS = 60_000;
export async function criarTicket(env, token, agora = Date.now()) {
  await env.DB.prepare("DELETE FROM voxix_ticket WHERE expira < ?").bind(agora).run();
  const ticket = aleatorio(24);
  await env.DB.prepare("INSERT INTO voxix_ticket (ticket, token, expira) VALUES (?, ?, ?)").bind(ticket, token, agora + TICKET_MS).run();
  return { ticket, expira: agora + TICKET_MS };
}
export async function gastarTicket(env, ticket, agora = Date.now()) {
  const l = await env.DB.prepare("DELETE FROM voxix_ticket WHERE ticket = ? AND expira > ? RETURNING token").bind(String(ticket || ""), agora).first();
  return l ? l.token : null;
}

export async function tratarVoxix(req, env, url, caminho) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const conv = /^\/voxix\/entrar\/([A-HJ-NP-Z2-9]{8})$/i.exec(caminho);
    if (conv && req.method === "GET") return paginaDoConvite(conv[1].toUpperCase());
    if (caminho === "/voxix/espera" && req.method === "POST") return json(await entrarNaEspera(env, await corpo(req, 2000)), 201);
    // o WebSocket do navegador não manda cabeçalhos: o token vai na URL
    let pedido = req;
    if (caminho === "/voxix/ticket" && req.method === "POST") {
      await validarSessao(env, req, {});
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      return json(await criarTicket(env, token));
    }
    if (caminho === "/voxix/ws" || /^\/voxix\/salas\/[A-Za-z0-9]+\/ws$/.test(caminho)) {
      // novo: ?ticket= (uso único). Antigo, só para versões do app que ainda não usam código: ?token=
      const t = url.searchParams.get("ticket") ? await gastarTicket(env, url.searchParams.get("ticket")) : url.searchParams.get("token");
      if (t) pedido = new Request(req.url, { headers: { authorization: `Bearer ${t}` } });
    }
    const ctx = await validarSessao(env, pedido, {});
    const u = ctx.usuario.id;
    if (caminho === "/voxix/perfil" && req.method === "GET") { const p = await perfilDe(env, u); return json(p ? { apelido: p.apelido, nome: p.nome, avatar: p.avatar || null, presenca: p.presenca || "amigos", proximaTroca: p.apelido_trocado ? p.apelido_trocado + 30 * 86_400_000 : null } : { apelido: null, nomeSugerido: ctx.usuario.nome || "" }); }
    if (caminho === "/voxix/perfil/avatar" && req.method === "PUT") return json(await definirAvatar(env, u, (await corpo(req)).avatar));
    if (caminho === "/voxix/perfil/apelido" && req.method === "PUT") { await gastar(env, u, "troca_apelido"); return json(await trocarApelido(env, u, apelidoValido((await corpo(req)).apelido))); }
    if (caminho === "/voxix/privacidade" && req.method === "PUT") return json(await definirPresenca(env, u, (await corpo(req)).presenca));
    if (caminho === "/voxix/jogando" && req.method === "PUT") { await gastar(env, u, "presenca"); return json(await jogando(env, u, await corpo(req, 2000))); }
    if (caminho === "/voxix/conquistas" && req.method === "PUT") { await gastar(env, u, "conquistas"); return json(await definirConquistas(env, u, (await corpo(req, 20_000)).itens)); }
    if (caminho === "/voxix/presenca" && req.method === "GET") return json(await presencaDe(env, u, url.searchParams.get("apelidos")));
    const pes = /^\/voxix\/pessoas\/([A-Za-z0-9_]{3,20})$/.exec(caminho);
    if (pes && req.method === "GET") return json(await perfilPublico(env, u, pes[1].toLowerCase()));
    if (caminho === "/voxix/avatares" && req.method === "GET") return json({ avatares: await avatares(env, url.searchParams.get("apelidos")) });
    if (caminho === "/voxix/perfil" && req.method === "PUT") return json(await criarPerfil(env, u, await corpo(req), ctx.usuario.nome), 201);
    if (caminho === "/voxix/buscar" && req.method === "GET") {
      const a = await perfilPorApelido(env, apelidoValido(url.searchParams.get("apelido")));
      if (!a) throw new ErroLoja(404, "pessoa_inexistente", "Não achei ninguém com esse apelido.");
      return json({ apelido: a.apelido, nome: a.nome, avatar: a.avatar || null });
    }
    if (caminho === "/voxix/mensagens" && req.method === "POST") return json(await enviar(env, u, await corpo(req)), 201);
    if (caminho === "/voxix/historico" && req.method === "GET") return json(await historico(env, u, { desde: url.searchParams.get("desde"), limite: url.searchParams.get("limite") }));
    const lim = /^\/voxix\/conversas\/([A-Za-z0-9_]{3,20})$/.exec(caminho);
    if (lim && req.method === "DELETE") return json(await limparConversa(env, u, lim[1]));
    if (caminho === "/voxix/bloqueios" && req.method === "GET") return json(await listarBloqueios(env, u));
    if (caminho === "/voxix/bloqueios" && req.method === "POST") return json(await bloquear(env, u, (await corpo(req)).apelido));
    const m = /^\/voxix\/bloqueios\/([A-Za-z0-9_]{3,20})$/.exec(caminho);
    if (m && req.method === "DELETE") return json(await desbloquear(env, u, m[1]));
    if (caminho === "/voxix/denuncias" && req.method === "POST") return json(await denunciar(env, u, await corpo(req)), 201);
    if (caminho === "/voxix/pontuar" && req.method === "POST") return json(await pontuar(env, u, (await corpo(req)).texto));
    if (caminho === "/voxix/transcrever" && req.method === "POST") {
      const buf = await req.arrayBuffer();
      return json(await transcrever(env, u, buf, req.headers.get("content-type")));
    }
    if (caminho === "/voxix/ws" && req.method === "GET") {
      if (!(await perfilDe(env, u))) throw new ErroLoja(409, "sem_perfil", "Crie o seu perfil do Voxix antes de conversar.");
      if (!env.VOXIX_CAIXA) throw new ErroLoja(503, "indisponivel", "O chat ao vivo ainda não está ligado no servidor.");
      return await env.VOXIX_CAIXA.get(env.VOXIX_CAIXA.idFromName(u)).fetch(new Request("https://caixa/ws", req));
    }
    const com = await tratarComunidades(req, env, url, caminho, u, gastar);
    if (com instanceof Response) return com;
    if (com) return json(com.dados, com.status || 200);
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroLoja || e instanceof ErroId) return json({ error: e.message, codigo: e.codigo, ...(e.dados || {}) }, e.status);
    console.error("voxix", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
