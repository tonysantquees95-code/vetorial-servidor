// Logo grátis do site: vitrine pública com os 48 modelos (12 grátis, o resto só com assinatura) e criação pedindo o Vetorial ID.
// O servidor decide: modelo com assinatura só sai para plano pago/testador; o plano grátis cria 2 por dia nos modelos livres.
import { ErroId, validarSessao } from "../id/conta.js";
import { diaDeBrasilia, semLimite } from "../pdf/uso.js";
import { CATEGORIAS, especDoModelo, listaPublica, modeloPorId, svgDoModelo } from "../meusite/modelos-logo.js";
import { FT, LAYOUTS, logoSvg, normalizarEspec, PALETAS, TODOS_SIMBOLOS } from "../meusite/logos.js";
import { PALAVRAS_BASE } from "../meusite/icones.js";

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

/** Opções do editor: tudo é lista fechada; o ícone vai pronto como SVG de miniatura (a tela mostra por <img>, nunca por HTML). */
export function opcoesDoEditor() {
  const miniatura = (s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="#222" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${s.d}</g></svg>`;
  return {
    fontes: Object.entries(FT).map(([id, f]) => ({ id, nome: f.nome, familia: f.familia, peso: f.peso, estilo: f.estilo })),
    layouts: Object.entries(LAYOUTS).map(([id, nome]) => ({ id, nome })),
    paletas: PALETAS.map((p) => ({ id: p.id, nome: p.nome, fundo: p.fundo, principal: p.principal, apoio: p.apoio, texto: p.texto })),
    simbolos: Object.entries(TODOS_SIMBOLOS).map(([id, s]) => ({ id, nome: s.nome, palavras: `${s.nome} ${s.palavras || PALAVRAS_BASE[id] || ""}`.toLowerCase(), svg: s.d ? miniatura(s) : "" })),
    limite: LIMITE_LOGOS_POR_DIA,
  };
}

/** Logo montado no editor: a espec é validada por inteiro; o neon é recurso de assinatura. */
const especDoEditor = (corpo) => normalizarEspec({ nome: String(corpo?.nome ?? "").slice(0, 40), ...(corpo?.espec && typeof corpo.espec === "object" ? corpo.espec : {}) });

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
    if (caminho === "/ferramentas/logo/editor/opcoes" && req.method === "GET") return json(opcoesDoEditor());
    if (caminho === "/ferramentas/logo/editor/modelo" && req.method === "GET") {
      const m = modeloPorId(url.searchParams.get("id") || "");
      if (!m) return json({ error: "modelo não encontrado" }, 404);
      const espec = especDoModelo(m, url.searchParams.get("nome") || "Seu negócio", url.searchParams.get("sub") || "");
      return json({ espec, gratis: m.gratis, svg: logoSvg(espec) });
    }
    if (caminho === "/ferramentas/logo/editor/previa" && req.method === "POST") {
      const espec = especDoEditor(await req.json().catch(() => ({})));
      return json({ espec, svg: logoSvg(espec) });
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
    if (caminho === "/ferramentas/logo/personalizado" && req.method === "POST") {
      const corpo = await req.json().catch(() => ({}));
      const espec = especDoEditor(corpo);
      if (!String(espec.nome || "").trim()) return json({ error: "Escreva o nome do seu negócio.", codigo: "nome" }, 400);
      const assinante = await semLimite(env, ctx.usuario);
      if (espec.neon.ativo && !assinante) return json({ error: "O efeito neon é só para quem tem assinatura da Vênus.", codigo: "assinatura" }, 403);
      const r = await registrarLogo(env, ctx.usuario);
      if (!r.ok) return json({ ...r, error: "Você já criou os 2 logos grátis de hoje. Volte amanhã ou conheça os planos da Vênus.", codigo: "limite" }, 429);
      return json({ ...r, espec, svg: logoSvg(espec) });
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroId) return json({ error: e.message, codigo: e.codigo }, e.status);
    console.error("logo", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
