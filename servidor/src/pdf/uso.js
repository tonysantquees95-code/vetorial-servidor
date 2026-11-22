// Vindex PDF na web: o download pede o Vetorial ID e tem limite diário por conta (quem tem plano pago não tem limite).
// Só guardamos a contagem por dia; o arquivo é processado no aparelho e nunca é enviado.
import { ErroId, validarSessao } from "../id/conta.js";
import { comPrivilegios } from "../loja/lojas.js";
import { estadoDaAssinatura } from "../loja/assinatura.js";

export const LIMITE_DIARIO = 10;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
export const ehRotaPdf = (c) => c.startsWith("/pdf/uso");

/** Dia no fuso de Brasília (-3), AAAA-MM-DD. */
export const diaDeBrasilia = (agora = Date.now()) => new Date(agora - 3 * 3_600_000).toISOString().slice(0, 10);

/** Plano pago (ou testador) = sem limite. Teste grátis e conta sem plano seguem o limite diário. */
export async function semLimite(env, usuario, agora = Date.now()) {
  if (!usuario?.loja) return false;
  const loja = await comPrivilegios(env, await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(usuario.loja).first());
  if (!loja) return false;
  const e = await estadoDaAssinatura(env, loja, agora);
  return !!e.acesso && !e.emTeste;
}

export async function situacao(env, usuario, agora = Date.now()) {
  const ilimitado = await semLimite(env, usuario, agora);
  const l = await env.DB.prepare("SELECT usos FROM pdf_uso WHERE usuario = ? AND dia = ?").bind(usuario.id, diaDeBrasilia(agora)).first();
  const usados = l?.usos ?? 0;
  return { ilimitado, limite: ilimitado ? null : LIMITE_DIARIO, usados, restantes: ilimitado ? null : Math.max(0, LIMITE_DIARIO - usados) };
}

/** Conta um download. A conta só sobe se ainda couber (um único UPDATE/INSERT condicionado, sem "consulta e depois grava"). */
export async function registrarUso(env, usuario, agora = Date.now()) {
  if (await semLimite(env, usuario, agora)) return { ok: true, ...(await situacao(env, usuario, agora)) };
  const dia = diaDeBrasilia(agora);
  await env.DB.prepare("INSERT OR IGNORE INTO pdf_uso (usuario, dia, usos) VALUES (?, ?, 0)").bind(usuario.id, dia).run();
  const r = await env.DB.prepare("UPDATE pdf_uso SET usos = usos + 1 WHERE usuario = ? AND dia = ? AND usos < ?").bind(usuario.id, dia, LIMITE_DIARIO).run();
  const s = await situacao(env, usuario, agora);
  return { ok: (r.meta?.changes ?? 0) > 0, ...s };
}

export async function tratarPdf(req, env, url, caminho) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const ctx = await validarSessao(env, req, {});
    if (caminho === "/pdf/uso" && req.method === "GET") return json(await situacao(env, ctx.usuario));
    if (caminho === "/pdf/uso" && req.method === "POST") {
      const r = await registrarUso(env, ctx.usuario);
      return json(r, r.ok ? 200 : 429);
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroId) return json({ error: e.message, codigo: e.codigo }, e.status);
    console.error("pdf", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
