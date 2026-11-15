// Ponte Vênus ↔ Vindex. A Vênus (voz) pede uma ação; o Vindex aberto no aparelho do usuário busca, executa e devolve o resultado.
// Só existem ações da lista abaixo: nenhum caminho de arquivo ou comando livre passa por aqui.
import { ErroLoja } from "../loja/lojas.js";
import { aleatorio } from "../loja/cripto.js";
import { ErroId, validarSessao } from "../id/conta.js";

export const ACOES = { otimizar: "Otimização com 1 clique", diagnostico: "Diagnóstico do aparelho" };
export const VALIDADE_MS = 5 * 60_000;
export const PRESENCA_MS = 20_000;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
export const ehRotaVindex = (c) => c.startsWith("/vindex/");

async function corpo(req) {
  const t = await req.text();
  if (t.length > 20_000) throw new ErroLoja(413, "corpo_grande", "Pedido grande demais.");
  try { const d = JSON.parse(t || "{}"); return d && typeof d === "object" && !Array.isArray(d) ? d : {}; } catch { throw new ErroLoja(400, "json_invalido", "O corpo precisa ser um JSON válido."); }
}

export async function vindexOnline(env, usuario, agora = Date.now()) {
  const p = await env.DB.prepare("SELECT plataforma, ultimo FROM vindex_presenca WHERE usuario = ?").bind(usuario).first();
  return p && agora - p.ultimo < PRESENCA_MS ? { online: true, plataforma: p.plataforma } : { online: false };
}

export async function pedir(env, usuario, comando, agora = Date.now()) {
  if (!ACOES[comando]) throw new ErroLoja(400, "acao_invalida", `Ação desconhecida. Use: ${Object.keys(ACOES).join(", ")}.`);
  const on = await vindexOnline(env, usuario, agora);
  if (!on.online) throw new ErroLoja(409, "vindex_fechado", "O Vindex não está aberto no seu aparelho agora. Abra o Vindex e peça de novo.");
  const pend = await env.DB.prepare("SELECT COUNT(*) AS n FROM vindex_comandos WHERE usuario = ? AND status IN ('pendente','recebido') AND criado > ?").bind(usuario, agora - VALIDADE_MS).first();
  if (pend.n >= 5) throw new ErroLoja(429, "muitos_pedidos", "Já há pedidos esperando o Vindex. Aguarde terminarem.");
  const id = aleatorio(12);
  await env.DB.prepare("INSERT INTO vindex_comandos (id, usuario, comando, criado, atualizado) VALUES (?, ?, ?, ?, ?)").bind(id, usuario, comando, agora, agora).run();
  return { id, comando, rotulo: ACOES[comando], plataforma: on.plataforma };
}

/** O Vindex pergunta o que há para fazer (e com isso diz que está aberto). */
export async function buscar(env, usuario, plataforma, agora = Date.now()) {
  await env.DB.prepare("INSERT INTO vindex_presenca (usuario, plataforma, ultimo) VALUES (?, ?, ?) ON CONFLICT(usuario) DO UPDATE SET plataforma = excluded.plataforma, ultimo = excluded.ultimo").bind(usuario, plataforma, agora).run();
  await env.DB.prepare("UPDATE vindex_comandos SET status = 'expirado', atualizado = ? WHERE usuario = ? AND status IN ('pendente','recebido') AND criado <= ?").bind(agora, usuario, agora - VALIDADE_MS).run();
  const { results } = await env.DB.prepare("SELECT id, comando, criado FROM vindex_comandos WHERE usuario = ? AND status = 'pendente' ORDER BY criado LIMIT 5").bind(usuario).all();
  for (const r of results) await env.DB.prepare("UPDATE vindex_comandos SET status = 'recebido', atualizado = ? WHERE id = ? AND status = 'pendente'").bind(agora, r.id).run();
  return results;
}

export async function responder(env, usuario, id, d, agora = Date.now()) {
  const c = await env.DB.prepare("SELECT * FROM vindex_comandos WHERE id = ? AND usuario = ?").bind(id, usuario).first();
  if (!c) throw new ErroLoja(404, "pedido_inexistente", "Pedido não encontrado.");
  if (c.status === "concluido" || c.status === "falhou") return { ok: true };
  const status = d.ok === false ? "falhou" : "concluido";
  const resumo = String(d.resumo || "").slice(0, 500);
  const dados = d.dados && typeof d.dados === "object" ? JSON.stringify(d.dados).slice(0, 4000) : null;
  await env.DB.prepare("UPDATE vindex_comandos SET status = ?, resumo = ?, dados = ?, atualizado = ? WHERE id = ?").bind(status, resumo, dados && dados.length < 4000 ? dados : null, agora, id).run();
  return { ok: true };
}

export async function consultar(env, usuario, id, agora = Date.now()) {
  const c = await env.DB.prepare("SELECT * FROM vindex_comandos WHERE id = ? AND usuario = ?").bind(id, usuario).first();
  if (!c) throw new ErroLoja(404, "pedido_inexistente", "Pedido não encontrado.");
  const status = (c.status === "pendente" || c.status === "recebido") && agora - c.criado > VALIDADE_MS ? "expirado" : c.status;
  return { id: c.id, comando: c.comando, status, resumo: c.resumo || "", dados: c.dados ? JSON.parse(c.dados) : null };
}

export async function tratarVindex(req, env, url, caminho) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const ctx = await validarSessao(env, req, {});
    const u = ctx.usuario.id;
    if (caminho === "/vindex/presenca" && req.method === "GET") return json(await vindexOnline(env, u));
    if (caminho === "/vindex/pedidos" && req.method === "POST") return json(await pedir(env, u, String((await corpo(req)).comando || "")), 201);
    if (caminho === "/vindex/fila" && req.method === "GET") return json({ pedidos: await buscar(env, u, url.searchParams.get("plataforma") === "android" ? "android" : "windows") });
    let m = /^\/vindex\/pedidos\/([a-f0-9]{24})$/.exec(caminho);
    if (m && req.method === "GET") return json(await consultar(env, u, m[1]));
    m = /^\/vindex\/pedidos\/([a-f0-9]{24})\/resultado$/.exec(caminho);
    if (m && req.method === "POST") return json(await responder(env, u, m[1], await corpo(req)));
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroLoja || e instanceof ErroId) return json({ error: e.message, codigo: e.codigo, ...(e.dados || {}) }, e.status);
    console.error("vindex", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
