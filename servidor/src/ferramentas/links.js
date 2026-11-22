// Ferramentas grátis do site: link curto (e QR code). O link curto exige o Vetorial ID só na hora de criar.
// Conta grátis: 20 links por dia; plano pago/testador: sem limite. O clique só soma 1 e redireciona (sem JavaScript, sem cookie).
import { ErroId, validarSessao } from "../id/conta.js";
import { semLimite } from "../pdf/uso.js";
import { svgQr } from "../loja/qr.js";

export const LIMITE_LINKS_POR_DIA = 20;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
export const ehRotaDeLinks = (c) => /^\/l\/[a-z0-9]{4,12}$/.test(c) || c === "/links" || c.startsWith("/links/") || c === "/ferramentas/qr";

const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789"; // sem i, l, o, 0, 1 (não confunde)
export function novoCodigo(tamanho = 6) {
  const b = new Uint8Array(tamanho);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join("");
}

// Encurtadores conhecidos: um link curto apontando para outro é caminho de golpe e de laço.
const ENCURTADORES = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "ow.ly", "buff.ly", "t.ly", "tiny.cc", "wa.me"]);

/** Confere o endereço de destino. Devolve { ok: true, url } (normalizada) ou { ok: false, erro }. */
export function validarDestino(texto, hostsProprios = []) {
  let t = String(texto ?? "").trim();
  if (!t) return { ok: false, erro: "Cole o endereço que você quer encurtar." };
  if (t.length > 2000) return { ok: false, erro: "O endereço é grande demais (máximo de 2000 letras)." };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = "https://" + t; // "minhaloja.com.br/oferta" vira https://
  let u;
  try { u = new URL(t); } catch { return { ok: false, erro: "Esse endereço não parece válido. Confira e tente de novo." }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, erro: "Só dá para encurtar endereços que começam com http ou https." };
  if (u.username || u.password) return { ok: false, erro: "Endereços com usuário e senha não são aceitos." };
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return { ok: false, erro: "Use um endereço de site (com o nome, como minhaloja.com.br)." };
  const base = h.split(".").slice(-2).join(".");
  if (ENCURTADORES.has(h) || ENCURTADORES.has(base)) return { ok: false, erro: "Esse endereço já é um link curto. Use o endereço completo da página." };
  if (hostsProprios.some((p) => p && (h === p || h.endsWith("." + p)) && /^\/l\//.test(u.pathname))) return { ok: false, erro: "Esse já é um link curto da Vetorial." };
  return { ok: true, url: u.href };
}

const hostsDoServidor = (env, url) => [url.hostname.toLowerCase(), env.DOMINIO_CURTO?.toLowerCase()].filter(Boolean);
const linkCompleto = (url, codigo) => `${url.origin}/l/${codigo}`;
const publico = (url, l) => ({ codigo: l.codigo, curto: linkCompleto(url, l.codigo), destino: l.destino, criado: l.criado, cliques: l.cliques, ultimoClique: l.ultimo_clique ?? null, ativo: !!l.ativo });

/**
 * Cria o link. O limite diário é checado no próprio INSERT (nada de "conta e depois grava").
 * Devolve { ok, link } | { ok: false, motivo: "limite" | "codigo" }.
 */
export async function criarLink(env, usuario, destino, agora = Date.now()) {
  const ilimitado = await semLimite(env, usuario, agora);
  const desde = agora - 24 * 3_600_000;
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const codigo = novoCodigo();
    const r = await env.DB.prepare(
      `INSERT INTO links_curtos (codigo, usuario, destino, criado)
       SELECT ?, ?, ?, ? WHERE ? = 1 OR (SELECT COUNT(*) FROM links_curtos WHERE usuario = ? AND criado > ?) < ?`,
    ).bind(codigo, usuario.id, destino, agora, ilimitado ? 1 : 0, usuario.id, desde, LIMITE_LINKS_POR_DIA).run().catch((e) => {
      if (/UNIQUE|constraint/i.test(String(e?.message))) return { meta: { changes: -1 } };
      throw e;
    });
    const mudou = r.meta?.changes ?? 0;
    if (mudou > 0) return { ok: true, link: { codigo, usuario: usuario.id, destino, criado: agora, cliques: 0, ultimo_clique: null, ativo: 1 } };
    if (mudou === 0) return { ok: false, motivo: "limite" }; // o WHERE barrou
    // mudou === -1: código repetido, tenta outro
  }
  return { ok: false, motivo: "codigo" };
}

export async function tratarLinks(req, env, url, caminho) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    // QR code: grátis e sem login; o desenho é feito aqui e só devolve a imagem (nada é guardado).
    if (caminho === "/ferramentas/qr" && req.method === "GET") {
      const texto = url.searchParams.get("texto") ?? "";
      if (!texto || texto.length > 1000) return json({ error: "O conteúdo do QR Code deve ter de 1 a 1000 caracteres." }, 400);
      const svg = svgQr(texto, { cor: url.searchParams.get("cor") ?? "#000000", fundo: url.searchParams.get("fundo") ?? "#ffffff" });
      return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600", ...CORS } });
    }
    // Redirecionamento público.
    const m = caminho.match(/^\/l\/([a-z0-9]{4,12})$/);
    if (m && req.method === "GET") {
      const l = await env.DB.prepare("SELECT destino, ativo FROM links_curtos WHERE codigo = ?").bind(m[1]).first();
      if (!l || !l.ativo) return new Response("Link não encontrado ou desativado.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
      await env.DB.prepare("UPDATE links_curtos SET cliques = cliques + 1, ultimo_clique = ? WHERE codigo = ?").bind(Date.now(), m[1]).run();
      return new Response(null, { status: 302, headers: { location: l.destino, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }
    const ctx = await validarSessao(env, req, {});
    if (caminho === "/links" && req.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM links_curtos WHERE usuario = ? ORDER BY criado DESC LIMIT 100").bind(ctx.usuario.id).all();
      return json({ limite: LIMITE_LINKS_POR_DIA, ilimitado: await semLimite(env, ctx.usuario), links: results.map((l) => publico(url, l)) });
    }
    if (caminho === "/links" && req.method === "POST") {
      const corpo = await req.json().catch(() => ({}));
      const v = validarDestino(corpo.destino, hostsDoServidor(env, url));
      if (!v.ok) return json({ error: v.erro, codigo: "destino_invalido" }, 400);
      const r = await criarLink(env, ctx.usuario, v.url);
      if (!r.ok) {
        return r.motivo === "limite"
          ? json({ error: `Você já criou ${LIMITE_LINKS_POR_DIA} links nas últimas 24 horas. Tente de novo mais tarde ou assine um plano para não ter limite.`, codigo: "limite" }, 429)
          : json({ error: "Não consegui criar o link agora. Tente de novo.", codigo: "codigo" }, 503);
      }
      return json({ ok: true, link: publico(url, r.link) }, 201);
    }
    const apagar = caminho.match(/^\/links\/([a-z0-9]{4,12})$/);
    if (apagar && req.method === "DELETE") {
      const r = await env.DB.prepare("DELETE FROM links_curtos WHERE codigo = ? AND usuario = ?").bind(apagar[1], ctx.usuario.id).run();
      return (r.meta?.changes ?? 0) > 0 ? json({ ok: true }) : json({ error: "Link não encontrado." }, 404);
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroId) return json({ error: e.message, codigo: e.codigo }, e.status);
    console.error("links", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
