// Logo grátis do site: vitrine pública com os 48 modelos (12 grátis, o resto só com assinatura) e criação pedindo o Vetorial ID.
// O servidor decide: modelo com assinatura só sai para plano pago/testador; o plano grátis cria 2 por dia nos modelos livres.
import { ErroId, validarSessao } from "../id/conta.js";
import { diaDeBrasilia, semLimite } from "../pdf/uso.js";
import { CATEGORIAS, listaPublica, modeloPorId, svgDoModelo } from "../meusite/modelos-logo.js";

export const LIMITE_LOGOS_POR_DIA = 2;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
const SVG = { "content-type": "image/svg+xml; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "x-content-type-options": "nosniff", "cache-control": "public, max-age=300", ...CORS };
export const ehRotaDeLogo = (c) => c.startsWith("/ferramentas/logo");

export async function situacaoLogo(env, usuario, agora = Date.now()) {
  const ilimitado = await semLimite(env, usuario, agora);
  const l = await env.DB.prepare("SELECT usos FROM logo_uso WHERE usuario = ? AND dia = ?").bind(usuario.id, diaDeBrasilia(agora)).first();
  const usados = l?.usos ?? 0;
  return { ilimitado, assinante: ilimitado, limite: ilimitado ? null : LIMITE_LOGOS_POR_DIA, usados, restantes: ilimitado ? null : Math.max(0, LIMITE_LOGOS_POR_DIA - usados) };
}

/** Conta um logo criado. Um único UPDATE condicionado: nunca passa do limite. */
export async function registrarLogo(env, usuario, agora = Date.now()) {
  if (await semLimite(env, usuario, agora)) return { ok: true, ...(await situacaoLogo(env, usuario, agora)) };
  const dia = diaDeBrasilia(agora);
  await env.DB.prepare("INSERT OR IGNORE INTO logo_uso (usuario, dia, usos) VALUES (?, ?, 0)").bind(usuario.id, dia).run();
  const r = await env.DB.prepare("UPDATE logo_uso SET usos = usos + 1 WHERE usuario = ? AND dia = ? AND usos < ?").bind(usuario.id, dia, LIMITE_LOGOS_POR_DIA).run();
  return { ok: (r.meta?.changes ?? 0) > 0, ...(await situacaoLogo(env, usuario, agora)) };
}

export async function tratarLogo(req, env, url, caminho) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    // vitrine: pública, sem login
    if (caminho === "/ferramentas/logo/modelos" && req.method === "GET") return json({ limite: LIMITE_LOGOS_POR_DIA, categorias: CATEGORIAS, modelos: listaPublica() });
    if (caminho === "/ferramentas/logo/previa" && req.method === "GET") {
      const m = modeloPorId(url.searchParams.get("modelo") || "");
      if (!m) return json({ error: "modelo não encontrado" }, 404);
      return new Response(svgDoModelo(m, url.searchParams.get("nome") || "", url.searchParams.get("sub") || "", { marcaDagua: !m.gratis }), { headers: SVG });
    }
    // criar: pede o Vetorial ID
    const ctx = await validarSessao(env, req, {});
    if (caminho === "/ferramentas/logo/situacao" && req.method === "GET") return json(await situacaoLogo(env, ctx.usuario));
    if (caminho === "/ferramentas/logo" && req.method === "POST") {
      const corpo = await req.json().catch(() => ({}));
      const m = modeloPorId(String(corpo.modelo || ""));
      if (!m) return json({ error: "modelo não encontrado" }, 404);
      const nome = String(corpo.nome ?? "").trim();
      if (!nome) return json({ error: "Escreva o nome do seu negócio." }, 400);
      if (!m.gratis && !(await semLimite(env, ctx.usuario))) return json({ error: "Este modelo é só para quem tem assinatura da Vênus.", codigo: "assinatura" }, 403);
      const r = await registrarLogo(env, ctx.usuario);
      if (!r.ok) return json({ ...r, error: "Você já criou os 2 logos grátis de hoje. Volte amanhã ou conheça os planos da Vênus.", codigo: "limite" }, 429);
      return json({ ...r, svg: svgDoModelo(m, nome, String(corpo.subtitulo ?? "")) });
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroId) return json({ error: e.message, codigo: e.codigo }, e.status);
    console.error("logo", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
