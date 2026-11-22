// Banner do site: arte em SVG feita aqui (sem foto, sem direito autoral), com os símbolos do ramo da pessoa e a cor escolhida.
// O SVG sai sempre do servidor, só com cores validadas e símbolos da nossa lista fechada.
import { SIMBOLOS } from "./logos.js";

const DO_RAMO = {
  salao: ["tesoura", "pente", "secador", "espelho", "batom", "flor"],
  barbearia: ["poste", "tesoura", "pente", "bigode", "coroa"],
  manicure: ["esmalte", "brilho", "flor", "estrela", "diamante"],
  estetica: ["folha", "flor", "lua", "coracao", "brilho", "xicara"],
  loja: ["sacola", "coroa", "brilho", "estrela", "coracao", "raio"],
  outro: ["brilho", "estrela", "folha", "coroa", "raio", "coracao"],
};
const hex = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c).toLowerCase() : "#c2185b");
const mistura = (h, k) => { const n = parseInt(h.slice(1), 16); const m = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return "#" + [m((n >> 16) & 255), m((n >> 8) & 255), m(n & 255)].map((x) => x.toString(16).padStart(2, "0")).join(""); };

/** Banner 1200×400. Mesmo ramo + mesma cor = mesmo desenho (nada aleatório, para a prévia não ficar mudando). */
export function bannerSvg(nicho, cor) {
  const c = hex(cor), lista = (DO_RAMO[nicho] || DO_RAMO.outro).filter((s) => SIMBOLOS[s]);
  const pos = [[90, 70, 2.6, -14], [300, 250, 2.1, 12], [520, 60, 1.8, 8], [740, 230, 2.8, -8], [960, 70, 2.3, 16], [1100, 250, 2.0, -12], [610, 300, 1.5, 20], [190, 290, 1.4, -20]];
  const marcas = pos.map(([x, y, e, r], i) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${e})" fill="none" stroke="#fff" stroke-opacity="${i % 2 ? ".16" : ".24"}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${SIMBOLOS[lista[i % lista.length]].d}</g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mistura(c, 1.12)}"/><stop offset="1" stop-color="${mistura(c, 0.55)}"/></linearGradient><radialGradient id="l" cx=".8" cy=".1" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="400" fill="url(#g)"/><rect width="1200" height="400" fill="url(#l)"/>${marcas}</svg>`;
}
