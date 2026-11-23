// Banner do site: arte em SVG feita aqui (sem foto, sem direito autoral), com os símbolos do ramo da pessoa e a cor escolhida.
// O SVG sai sempre do servidor, só com cores validadas e símbolos da nossa lista fechada.
import { FT, TODOS_SIMBOLOS as SIMBOLOS } from "./logos.js";

const DO_RAMO = {
  salao: ["tesoura", "pente", "secador", "espelho", "batom", "flor"],
  barbearia: ["poste", "tesoura", "pente", "bigode", "coroa"],
  manicure: ["esmalte", "brilho", "flor", "estrela", "diamante"],
  estetica: ["folha", "flor", "lua", "coracao", "brilho", "xicara"],
  loja: ["sacola", "coroa", "brilho", "estrela", "coracao", "raio"],
  restaurante: ["pizza", "talheres", "hamburguer", "taca", "fogo", "bolo"],
  pet: ["gato", "pata", "coracao", "estrela", "folha"],
  oficina: ["engrenagem", "carro", "martelo", "chave", "raio"],
  fitness: ["haltere", "bola", "trofeu", "fogo", "coracao"],
  saude: ["dente", "coracao", "escudo", "folha", "brilho"],
  fotografia: ["camera", "brilho", "estrela", "sol", "lua"],
  reformas: ["martelo", "casa", "engrenagem", "lampada", "chave"],
  educacao: ["livro", "lapis", "lampada", "estrela", "trofeu"],
  outro: ["brilho", "estrela", "folha", "coroa", "raio", "coracao"],
};
const hex = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c).toLowerCase() : "#c2185b");
const mistura = (h, k) => { const n = parseInt(h.slice(1), 16); const m = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return "#" + [m((n >> 16) & 255), m((n >> 8) & 255), m(n & 255)].map((x) => x.toString(16).padStart(2, "0")).join(""); };


const luz = (h) => { const n = parseInt(h.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Banner 1200×400. Mesmo ramo + mesma cor = mesmo desenho (nada aleatório, para a prévia não ficar mudando).
 * Com `logo` (a receita já validada), o banner herda do logo: o símbolo, as cores, a fonte do nome e o brilho do neon.
 */
export function bannerSvg(nicho, cor, logo = null) {
  if (logo && logo.cores) return bannerDoLogo(nicho, logo);
  return bannerDoRamo(nicho, cor);
}

function bannerDoLogo(nicho, logo) {
  const { fundo, principal, apoio } = logo.cores, escuro = luz(hex(fundo)) < 0.4;
  const base = escuro ? hex(fundo) : hex(principal), traco = escuro ? hex(principal) : "#ffffff";
  const sim = logo.simbolo && logo.simbolo !== "inicial" && SIMBOLOS[logo.simbolo] ? logo.simbolo : (DO_RAMO[nicho] || DO_RAMO.outro).find((s) => SIMBOLOS[s]);
  const extra = (DO_RAMO[nicho] || DO_RAMO.outro).filter((s) => SIMBOLOS[s] && s !== sim);
  const pos = [[90, 70, 2.8, -14], [300, 250, 2.2, 12], [520, 60, 1.9, 8], [740, 230, 3, -8], [960, 70, 2.4, 16], [1100, 250, 2.1, -12], [610, 300, 1.6, 20], [190, 290, 1.5, -20]];
  const neon = logo.neon && logo.neon.ativo, brilho = neon ? hex(logo.neon.cor) : traco;
  const marcas = pos.map(([x, y, e, r], i) => { const id = i % 3 === 2 && extra.length ? extra[i % extra.length] : sim; return `<g transform="translate(${x} ${y}) rotate(${r}) scale(${e})" fill="none" stroke="${neon ? brilho : traco}" stroke-opacity="${neon ? ".55" : i % 2 ? ".2" : ".3"}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"${neon ? ' filter="url(#n)"' : ""}>${SIMBOLOS[id].d}</g>`; }).join("");
  const fo = FT[logo.fonte] || FT.moderna;
  const nome = `<text x="600" y="262" text-anchor="middle" font-family="${esc(fo.familia)}" font-weight="${fo.peso}" font-style="${fo.estilo}" font-size="150" fill="${traco}" fill-opacity=".09" textLength="${Math.min(1100, Math.max(420, String(logo.nome).length * 82))}" lengthAdjust="spacingAndGlyphs">${esc(String(logo.nome).slice(0, 24))}</text>`;
  const filtro = neon ? `<filter id="n" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b"/><feFlood flood-color="${brilho}"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice"><defs>${filtro}<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${escuro ? mistura(base, 1.5) : mistura(base, 1.12)}"/><stop offset="1" stop-color="${escuro ? base : mistura(base, 0.55)}"/></linearGradient><radialGradient id="l" cx=".8" cy=".1" r=".7"><stop offset="0" stop-color="${escuro ? hex(apoio) : "#ffffff"}" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="400" fill="url(#g)"/><rect width="1200" height="400" fill="url(#l)"/>${nome}${marcas}</svg>`;
}

function bannerDoRamo(nicho, cor) {
  const c = hex(cor), lista = (DO_RAMO[nicho] || DO_RAMO.outro).filter((s) => SIMBOLOS[s]);
  const pos = [[90, 70, 2.6, -14], [300, 250, 2.1, 12], [520, 60, 1.8, 8], [740, 230, 2.8, -8], [960, 70, 2.3, 16], [1100, 250, 2.0, -12], [610, 300, 1.5, 20], [190, 290, 1.4, -20]];
  const marcas = pos.map(([x, y, e, r], i) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${e})" fill="none" stroke="#fff" stroke-opacity="${i % 2 ? ".16" : ".24"}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${SIMBOLOS[lista[i % lista.length]].d}</g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mistura(c, 1.12)}"/><stop offset="1" stop-color="${mistura(c, 0.55)}"/></linearGradient><radialGradient id="l" cx=".8" cy=".1" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="400" fill="url(#g)"/><rect width="1200" height="400" fill="url(#l)"/>${marcas}</svg>`;
}
