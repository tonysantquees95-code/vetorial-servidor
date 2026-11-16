// Identidade visual de um site (cor, logo, nome): lida do próprio site da loja, para o cartão, o panfleto e a vitrine nascerem com a cara dela.
import { ErroLoja } from "./lojas.js";

const LIMITE_HTML = 600_000;
const LIMITE_CSS = 300_000;
const LIMITE_LOGO = 100_000; // vira data URL de até ~135 mil letras: cabe no cadastro da loja (limite 150 mil)

export function siteSeguro(entrada) {
  let t = String(entrada || "").trim();
  if (!t) throw new ErroLoja(400, "site_invalido", "Informe o endereço do site.");
  if (!/^https?:\/\//i.test(t)) t = "https://" + t;
  let u;
  try { u = new URL(t); } catch { throw new ErroLoja(400, "site_invalido", "Esse endereço não parece um site."); }
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) throw new ErroLoja(400, "site_invalido", "Use o endereço público do site (ex.: minhaloja.com.br).");
  u.protocol = "https:"; u.hash = "";
  return u;
}

const attr = (tag, nome) => { const m = new RegExp(`\\b${nome}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag); return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : ""; };
const tags = (html, nome) => html.match(new RegExp(`<${nome}\\b[^>]*>`, "gi")) || [];
const decodificar = (t) => t.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const meta = (html, chave) => { for (const t of tags(html, "meta")) if ([attr(t, "name"), attr(t, "property")].some((x) => x.toLowerCase() === chave)) return decodificar(attr(t, "content")); return ""; };

function hexCompleto(h) { const x = h.replace("#", "").toLowerCase(); return x.length === 3 ? "#" + x.split("").map((c) => c + c).join("") : x.length >= 6 ? "#" + x.slice(0, 6) : ""; }
function saturacao(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  return { s: mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)), l };
}
const vivida = (hex) => { const { s, l } = saturacao(hex); return s >= 0.35 && l >= 0.2 && l <= 0.75; };

export function corDoSite(html, css) {
  const tema = hexCompleto(meta(html, "theme-color"));
  if (tema && vivida(tema)) return tema;
  const tudo = html + "\n" + css;
  const v = /--(?:color-)?(?:primary|brand|accent|main)[\w-]*\s*:\s*(#[0-9a-f]{3,8})\b/i.exec(tudo);
  if (v && hexCompleto(v[1]) && vivida(hexCompleto(v[1]))) return hexCompleto(v[1]);
  const cont = new Map();
  for (const m of tudo.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) { const h = hexCompleto(m[0]); if (h && vivida(h)) cont.set(h, (cont.get(h) || 0) + 1); }
  return [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function candidatosDeLogo(html, base) {
  const lista = [];
  for (const t of tags(html, "link")) {
    const rel = attr(t, "rel").toLowerCase();
    if (!/icon/.test(rel)) continue;
    const tam = parseInt((attr(t, "sizes").split("x")[0] || "0"), 10) || 0;
    lista.push({ href: attr(t, "href"), nota: (/apple-touch/.test(rel) ? 1000 : 0) + tam });
  }
  const og = meta(html, "og:image");
  if (og) lista.push({ href: og, nota: 500 });
  return lista.sort((a, b) => b.nota - a.nota).flatMap((c) => { try { const u = new URL(c.href, base); return u.protocol === "https:" ? [u.toString()] : []; } catch { return []; } });
}

async function texto(f, url, limite) {
  const r = await f(url, { redirect: "follow", headers: { "user-agent": "VenusBot/1.0 (+https://vetorial.tech)" }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.text()).slice(0, limite);
}
const base64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

/** Lê nome, descrição, cor principal e logo (PNG, JPEG ou WebP até 100 KB) do site. */
export async function lerIdentidade(entrada, f = fetch) {
  const url = siteSeguro(entrada);
  let html;
  try { html = await texto(f, url.toString(), LIMITE_HTML); } catch { throw new ErroLoja(502, "site_fora", "Não consegui abrir esse site agora. Confira o endereço e tente de novo."); }
  let css = "";
  for (const t of tags(html, "link").filter((x) => /stylesheet/i.test(attr(x, "rel"))).slice(0, 2)) {
    try { const u = new URL(attr(t, "href"), url); if (u.protocol === "https:" && u.hostname === url.hostname) css += await texto(f, u.toString(), LIMITE_CSS); } catch { /* folha de estilo fora do ar: segue sem ela */ }
  }
  let logo = "";
  for (const c of candidatosDeLogo(html, url).slice(0, 4)) {
    try {
      const r = await f(c, { redirect: "follow", signal: AbortSignal.timeout(6000) });
      const tipo = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!r.ok || !/^image\/(png|jpeg|webp)$/.test(tipo)) continue;
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length && bytes.length <= LIMITE_LOGO) { logo = `data:${tipo};base64,${base64(bytes)}`; break; }
    } catch { /* tenta o próximo */ }
  }
  const titulo = meta(html, "og:site_name") || decodificar((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || "").split(/[|\-–—·]/)[0].trim();
  return { site: url.origin, nome: titulo.slice(0, 80), descricao: meta(html, "description").slice(0, 300), cor: corDoSite(html, css), logo };
}
