// Catálogo digital: validação do que vem de fora e a página pública (HTML puro; o carrinho é o /catalogo.js do site).
// Nada do que a pessoa digita entra como HTML: tudo passa por esc().

export const LIMITE_PRODUTOS_GRATIS = 12;
export const LIMITE_PRODUTOS_PAGO = 60;
export const MAX_FOTO_BYTES = 120 * 1024; // a foto chega reduzida do aparelho (uns 700 px)

export const CORES = ["#c2185b", "#1d4ed8", "#15803d", "#c2410c", "#6d4aff", "#0e9f8e"];

/** Temas do catálogo. Os 2 primeiros são grátis; os outros aparecem bloqueados na vitrine e só liberam com assinatura. */
export const TEMAS = [
  { id: "claro", nome: "Claro", gratis: true, bg: "#f6f6f9", card: "#ffffff", texto: "#1b1b24", suave: "#6b6b7a", borda: "#e4e4ec", titulo: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: "escuro", nome: "Escuro", gratis: true, bg: "#0f1020", card: "#1a1c33", texto: "#f1f1f8", suave: "#a5a8c4", borda: "#2b2e4d", titulo: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: "boutique", nome: "Boutique", gratis: false, bg: "#fbf4ea", card: "#ffffff", texto: "#3a2a1c", suave: "#8a7560", borda: "#e6d3b5", titulo: "Georgia, 'Times New Roman', serif" },
  { id: "gourmet", nome: "Gourmet", gratis: false, bg: "#fff1e0", card: "#fffaf3", texto: "#4a1d0e", suave: "#9a6a52", borda: "#f0cfae", titulo: "Georgia, 'Times New Roman', serif" },
  { id: "tech", nome: "Tech", gratis: false, bg: "#070d1f", card: "#101a36", texto: "#e8f0ff", suave: "#8ea2d6", borda: "#1e2d58", titulo: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif" },
  { id: "natural", nome: "Natural", gratis: false, bg: "#eef5ec", card: "#fbfdf9", texto: "#1f3a2b", suave: "#5f7d6c", borda: "#cfe0d0", titulo: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif" },
];
export const temaPorId = (id) => TEMAS.find((t) => t.id === id) || null;

export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const limpo = (t, max) => String(t ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export const brl = (centavos) => `R$ ${(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** WhatsApp só com dígitos, com o 55 na frente quando vier sem. Vazio se não parecer um número. */
export function numeroWhats(t) {
  let n = String(t ?? "").replace(/\D/g, "");
  if (n.length < 10 || n.length > 13) return "";
  if (n.length <= 11) n = "55" + n;
  return n;
}
export const slugDe = (nome) => String(nome || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28).replace(/-+$/g, "");
export const slugValido = (s) => /^[a-z0-9][a-z0-9-]{2,29}$/.test(s);

/** JPEG de verdade (assinatura FFD8FF) e do tamanho certo; devolve a base64 limpa ou null. */
export function fotoValida(b64) {
  const dados = String(b64 ?? "").replace(/^data:image\/jpeg;base64,/, "");
  if (!dados || dados.length > Math.ceil((MAX_FOTO_BYTES * 4) / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(dados)) return null;
  try {
    const ini = atob(dados.slice(0, 8));
    if (ini.charCodeAt(0) !== 0xff || ini.charCodeAt(1) !== 0xd8 || ini.charCodeAt(2) !== 0xff) return null;
  } catch { return null; }
  return dados;
}

/** Só o que o catálogo aceita: tudo conferido item por item. `limiteProdutos` vem do plano. Fotos novas ficam em `fotoNova` (base64). */
export function normalizarCatalogo(c = {}, { limiteProdutos = LIMITE_PRODUTOS_GRATIS } = {}) {
  const erros = [];
  const nome = limpo(c.nome, 40);
  if (!nome) erros.push("Escreva o nome da sua loja.");
  const whats = numeroWhats(c.whats);
  if (!whats) erros.push("Coloque o WhatsApp com DDD, para os pedidos chegarem até você.");
  const tema = temaPorId(c.tema) ? c.tema : "claro";
  const cor = CORES.includes(c.cor) ? c.cor : CORES[0];
  const lista = Array.isArray(c.produtos) ? c.produtos : [];
  if (lista.length > limiteProdutos) erros.push(`O seu plano permite até ${limiteProdutos} produtos.`);
  const produtos = [];
  for (const p of lista.slice(0, limiteProdutos)) {
    const n = limpo(p?.nome, 60);
    if (!n) continue;
    const preco = Number.isFinite(Number(p?.preco)) && Number(p.preco) >= 0 && Number(p.preco) <= 99_999_999 ? Math.round(Number(p.preco)) : 0;
    const item = { nome: n, preco, desc: limpo(p?.desc, 160), foto: /^[a-z0-9]{8,24}$/.test(String(p?.foto ?? "")) ? String(p.foto) : "" };
    if (p?.fotoNova) {
      const f = fotoValida(p.fotoNova);
      if (!f) erros.push(`A foto de "${n}" não é uma imagem válida ou é grande demais.`); else item.fotoNova = f;
    }
    produtos.push(item);
  }
  if (!produtos.length) erros.push("Coloque pelo menos um produto.");
  return { erros, valor: { nome, whats, descricao: limpo(c.descricao, 200), tema, cor, produtos } };
}

const mensagemItem = (loja, p) => `Olá, ${loja}! Tenho interesse em: ${p.nome}${p.preco ? ` (${brl(p.preco)})` : ""}.`;

/**
 * A página pública. `fotoUrl(produto)` diz de onde vem cada foto (no site real, /c/<nome>/f/<id>; na prévia, data URL).
 * Sem JavaScript funciona (cada produto tem o seu "Pedir no WhatsApp"); o /catalogo.js troca isso por carrinho com total.
 */
export function renderizarCatalogo(c, { fotoUrl = () => "", scriptUrl = "/catalogo.js", marca = true, previa = false } = {}) {
  const t = temaPorId(c.tema) || TEMAS[0];
  const cor = CORES.includes(c.cor) ? c.cor : CORES[0];
  const wa = `https://wa.me/${c.whats}`;
  const itens = c.produtos.map((p, i) => {
    const foto = p.foto || p.fotoNova ? fotoUrl(p, i) : "";
    return `<li class="p" data-produto data-nome="${esc(p.nome)}" data-preco="${p.preco}">${foto ? `<img src="${esc(foto)}" alt="${esc(p.nome)}" loading="lazy" width="320" height="320">` : `<div class="sem">${esc(p.nome.slice(0, 1).toUpperCase())}</div>`}<div class="i"><h3>${esc(p.nome)}</h3>${p.desc ? `<p class="d">${esc(p.desc)}</p>` : ""}${p.preco ? `<p class="v">${esc(brl(p.preco))}</p>` : ""}<a class="pedir" href="${esc(`${wa}?text=${encodeURIComponent(mensagemItem(c.nome, p))}`)}" rel="noopener">Pedir no WhatsApp</a></div></li>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.nome)} · Catálogo</title><meta name="description" content="${esc(c.descricao || `Catálogo de ${c.nome}. Peça pelo WhatsApp.`)}">${previa ? '<meta name="robots" content="noindex">' : ""}<style>
*{box-sizing:border-box}body{margin:0;background:${t.bg};color:${t.texto};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding-bottom:90px}
header{padding:28px 16px 18px;text-align:center;background:${cor};color:#fff}header h1{margin:0;font:800 26px/1.15 ${t.titulo}}header p{margin:8px auto 0;max-width:560px;opacity:.92;font-size:15px}
main{max-width:980px;margin:0 auto;padding:18px 14px}ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
@media(min-width:720px){ul{grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}}@media(min-width:960px){ul{grid-template-columns:repeat(4,minmax(0,1fr))}}
.p{background:${t.card};border:1px solid ${t.borda};border-radius:16px;overflow:hidden;display:flex;flex-direction:column}.p img,.sem{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}
.sem{display:grid;place-items:center;font:800 54px ${t.titulo};color:${cor};background:${cor}22}.i{padding:10px 12px 14px;display:flex;flex-direction:column;gap:6px;flex:1}
.i h3{margin:0;font:700 15.5px/1.25 ${t.titulo}}.d{margin:0;font-size:13px;color:${t.suave};line-height:1.35}.v{margin:0;font-weight:800;font-size:17px;color:${cor}}
.pedir,.add{margin-top:auto;display:block;text-align:center;text-decoration:none;font:700 14px system-ui,sans-serif;padding:11px 10px;border-radius:12px;border:2px solid ${cor};color:${cor};background:transparent;cursor:pointer;min-height:44px}
.add{display:none}.js .pedir{display:none}.js .add{display:block}.add.no{background:${cor};color:#fff}
.qtd{display:none;align-items:center;justify-content:space-between;margin-top:auto;gap:8px}.js .qtd.on{display:flex}.js .qtd.on+.add{display:none}
.qtd button{width:44px;height:44px;border-radius:12px;border:2px solid ${cor};background:transparent;color:${cor};font:800 20px system-ui;cursor:pointer}.qtd b{font-size:17px}
#barra{position:fixed;left:0;right:0;bottom:0;display:none;padding:12px 14px calc(12px + env(safe-area-inset-bottom));background:${t.card};border-top:1px solid ${t.borda};box-shadow:0 -6px 20px #0003}
#barra.on{display:flex;align-items:center;justify-content:space-between;gap:12px}#barra span{font-weight:700}#barra a{background:${cor};color:#fff;text-decoration:none;font:800 15px system-ui;padding:13px 18px;border-radius:12px;min-height:44px;display:inline-flex;align-items:center}
footer{text-align:center;padding:10px 16px 30px;color:${t.suave};font-size:13px}footer a{color:${cor};font-weight:700}
</style></head><body data-whats="${esc(c.whats)}" data-loja="${esc(c.nome)}"><header><h1>${esc(c.nome)}</h1>${c.descricao ? `<p>${esc(c.descricao)}</p>` : ""}</header><main><ul>${itens}</ul></main><div id="barra" aria-live="polite"><span id="barra-txt"></span><a id="barra-pedir" href="${esc(wa)}" rel="noopener">Pedir no WhatsApp</a></div><footer>${marca ? `Catálogo feito com a <a href="/vitrine/">Vênus Vitrine</a>` : esc(c.nome)}</footer><script src="${esc(scriptUrl)}" defer></script></body></html>`;
}
