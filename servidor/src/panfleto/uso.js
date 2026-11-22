// Panfleto grátis do site: o desenho é montado no navegador; o servidor só conta quantos cada conta gerou por dia.
// Plano pago/testador = sem limite e sem a marca "Feito com a Vênus".
import { ErroId, validarSessao } from "../id/conta.js";
import { diaDeBrasilia, semLimite } from "../pdf/uso.js";

export const LIMITE_PANFLETOS_POR_DIA = 2;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
export const ehRotaDePanfleto = (c) => c === "/panfleto/uso";

export async function situacaoPanfleto(env, usuario, agora = Date.now()) {
  const ilimitado = await semLimite(env, usuario, agora);
  const l = await env.DB.prepare("SELECT usos FROM panfleto_uso WHERE usuario = ? AND dia = ?").bind(usuario.id, diaDeBrasilia(agora)).first();
  const usados = l?.usos ?? 0;
  return { ilimitado, limite: ilimitado ? null : LIMITE_PANFLETOS_POR_DIA, usados, restantes: ilimitado ? null : Math.max(0, LIMITE_PANFLETOS_POR_DIA - usados) };
}

/** Conta um panfleto gerado. Um único UPDATE condicionado: nunca passa do limite, mesmo com dois toques ao mesmo tempo. */
export async function registrarPanfleto(env, usuario, agora = Date.now()) {
  if (await semLimite(env, usuario, agora)) return { ok: true, ...(await situacaoPanfleto(env, usuario, agora)) };
  const dia = diaDeBrasilia(agora);
  await env.DB.prepare("INSERT OR IGNORE INTO panfleto_uso (usuario, dia, usos) VALUES (?, ?, 0)").bind(usuario.id, dia).run();
  const r = await env.DB.prepare("UPDATE panfleto_uso SET usos = usos + 1 WHERE usuario = ? AND dia = ? AND usos < ?").bind(usuario.id, dia, LIMITE_PANFLETOS_POR_DIA).run();
  return { ok: (r.meta?.changes ?? 0) > 0, ...(await situacaoPanfleto(env, usuario, agora)) };
}

export async function tratarPanfleto(req, env, url, caminho) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const ctx = await validarSessao(env, req, {});
    if (req.method === "GET") return json(await situacaoPanfleto(env, ctx.usuario));
    if (req.method === "POST") {
      const r = await registrarPanfleto(env, ctx.usuario);
      return json(r, r.ok ? 200 : 429);
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroId) return json({ error: e.message, codigo: e.codigo }, e.status);
    console.error("panfleto", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
