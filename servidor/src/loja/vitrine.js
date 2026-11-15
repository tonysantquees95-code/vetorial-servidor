// Vitrine web instantânea (uma página só) com a identidade da Vetorial Tech, e encurtador de links.
//   vetorial.tech/<loja>          → vitrine do catálogo
//   vetorial.tech/<loja>/<sku>    → página do produto
//   vetorial.tech/l/<codigo>      → link curto (redireciona e conta o clique)
import { ErroLoja } from "./lojas.js";

export const RESERVADAS = new Set(["l", "v", "api", "admin", "loja", "canais", "produtos", "pedidos", "webhook", "oauth", "saude", "chat", "v1", "atualizacao", "aviso", "cobranca", "estoque", "links", "assets", "static", "app", "www"]);

export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const reais = (c) => (c === null || c === undefined ? "" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const corValida = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c).toUpperCase() : "#E36BD0");
export const urlHttps = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" ? x.toString() : null;
  } catch {
    return null;
  }
};
/** Atributos vêm de canais externos: JSON quebrado não pode derrubar a página inteira. */
export function lerAtributos(t) {
  try {
    const o = typeof t === "string" ? JSON.parse(t || "{}") : t;
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}
export const soDigitos = (t) => String(t || "").replace(/\D/g, "");

export function validarCodigo(codigo) {
  const c = String(codigo || "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(c) || RESERVADAS.has(c)) throw new ErroLoja(400, "codigo_invalido", "Use de 3 a 32 letras minúsculas, números ou hífen (e não use nomes reservados).");
  return c;
}

export function visiveis(produtos) {
  return produtos.filter((p) => !p.oculto && p.preco_centavos !== null && p.preco_centavos !== undefined && p.estoque > 0);
}

const CSS = (cor) => `
:root{--cor:${cor};--fundo:#070a1c;--painel:#0e1330;--texto:#f3f4ff;--suave:#8b95c0}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1200px 600px at 20% -10%,#1a1f4d 0,var(--fundo) 60%);color:var(--texto);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh}
.topo{padding:44px 20px 18px;text-align:center}.logo{width:76px;height:76px;border-radius:50%;object-fit:cover;border:2px solid var(--cor);margin-bottom:10px}
h1{margin:0;font-size:26px;letter-spacing:.04em}.desc{color:var(--suave);max-width:560px;margin:8px auto 0;line-height:1.5}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;padding:18px 16px 40px;max-width:980px;margin:0 auto}
.cartao{background:var(--painel);border:1px solid #ffffff1a;border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;display:flex;flex-direction:column}
.cartao img,.sem-foto{width:100%;aspect-ratio:1;object-fit:cover;background:#151b44}.sem-foto{display:flex;align-items:center;justify-content:center;color:var(--suave);font-size:12px}
.info{padding:12px}.nome{font-size:14px;line-height:1.3;margin:0 0 6px}.preco{font-weight:700;color:var(--cor)}.de{color:var(--suave);text-decoration:line-through;font-size:12px;margin-right:6px}
.botao{display:block;text-align:center;background:var(--cor);color:#06081a;font-weight:700;padding:14px;border-radius:26px;text-decoration:none;margin:18px 0}
.pagina{max-width:560px;margin:0 auto;padding:20px}.pagina img{width:100%;border-radius:20px}.voltar{color:var(--suave);text-decoration:none;font-size:14px}
.rodape{text-align:center;color:var(--suave);font-size:12px;padding:26px 0 36px}.rodape b{color:var(--texto);letter-spacing:.12em}.vazio{text-align:center;color:var(--suave);padding:60px 20px}
.attrs{color:var(--suave);font-size:14px;line-height:1.8}`;

function moldura(titulo, descricao, cor, corpo, extraHead = "") {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descricao).slice(0, 160)}"><meta property="og:title" content="${esc(titulo)}"><meta name="theme-color" content="#070a1c">
${extraHead}<style>${CSS(corValida(cor))}</style></head><body>${corpo}
<div class="rodape">Feito com a Vênus · <b>VETORIAL TECH</b></div></body></html>`;
}

function linkWhats(loja, texto) {
  const n = soDigitos(loja.whatsapp);
  return n.length >= 10 ? `https://wa.me/${n.length <= 11 ? "55" + n : n}?text=${encodeURIComponent(texto)}` : null;
}

export function paginaDaVitrine(loja, produtos, base) {
  const lista = visiveis(produtos);
  const nome = loja.titulo || loja.nome || "Loja";
  const cartoes = lista.map((p) => {
    const promo = p.promocao_centavos && p.promocao_centavos < p.preco_centavos;
    return `<a class="cartao" href="${esc(base)}/${esc(encodeURIComponent(p.sku))}">${p.imagem && urlHttps(p.imagem) ? `<img loading="lazy" src="${esc(p.imagem)}" alt="${esc(p.nome)}">` : `<div class="sem-foto">sem foto</div>`}
<div class="info"><p class="nome">${esc(p.nome)}</p><div>${promo ? `<span class="de">${reais(p.preco_centavos)}</span>` : ""}<span class="preco">${reais(promo ? p.promocao_centavos : p.preco_centavos)}</span></div></div></a>`;
  }).join("");
  const topo = `<div class="topo">${loja.logo && urlHttps(loja.logo) ? `<img class="logo" src="${esc(loja.logo)}" alt="">` : ""}<h1>${esc(nome)}</h1>${loja.descricao ? `<p class="desc">${esc(loja.descricao)}</p>` : ""}</div>`;
  return moldura(nome, loja.descricao || `Catálogo de ${nome}`, loja.cor, `${topo}${lista.length ? `<div class="grade">${cartoes}</div>` : `<div class="vazio">Em breve, novidades por aqui.</div>`}`);
}

export function paginaDoProduto(loja, p, base) {
  const promo = p.promocao_centavos && p.promocao_centavos < p.preco_centavos;
  const attrs = Object.entries(p.atributos || {}).filter(([, v]) => v).map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join("");
  const zap = linkWhats(loja, `Olá! Tenho interesse em: ${p.nome} (${reais(promo ? p.promocao_centavos : p.preco_centavos)})`);
  const corpo = `<div class="pagina"><a class="voltar" href="${esc(base)}">‹ ${esc(loja.titulo || loja.nome || "Voltar")}</a>
${p.imagem && urlHttps(p.imagem) ? `<img src="${esc(p.imagem)}" alt="${esc(p.nome)}" style="margin-top:14px">` : ""}
<h1 style="font-size:22px;margin-top:16px">${esc(p.nome)}</h1>
<p>${promo ? `<span class="de">${reais(p.preco_centavos)}</span>` : ""}<span class="preco" style="font-size:22px">${reais(promo ? p.promocao_centavos : p.preco_centavos)}</span></p>
<div class="attrs">${attrs}</div>${zap ? `<a class="botao" href="${esc(zap)}">Pedir pelo WhatsApp</a>` : ""}</div>`;
  return moldura(`${p.nome} · ${loja.titulo || loja.nome}`, p.nome, loja.cor, corpo, p.imagem && urlHttps(p.imagem) ? `<meta property="og:image" content="${esc(p.imagem)}">\n` : "");
}

export const html = (corpo, status = 200, cache = "public, max-age=60") =>
  new Response(corpo, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });

export function endereco(env, req, slug, sku = "") {
  const url = new URL(req.url);
  const curto = env.DOMINIO_CURTO && url.hostname === env.DOMINIO_CURTO;
  const raiz = curto ? `https://${env.DOMINIO_CURTO}/${slug}` : `${url.origin}/v/${slug}`;
  return sku ? `${raiz}/${encodeURIComponent(sku)}` : raiz;
}
