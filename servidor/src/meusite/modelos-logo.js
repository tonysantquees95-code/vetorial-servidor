// Catálogo de modelos de logo da vitrine do site: 48 combinações prontas (símbolo + layout + fonte + paleta), 12 grátis.
// Os modelos só dizem COMO o logo é desenhado; o nome e a frase vêm da pessoa e passam por normalizarEspec (nunca SVG de fora).
import { logoSvg, normalizarEspec } from "./logos.js";

export const CATEGORIAS = [
  { id: "moderno", nome: "Moderno" },
  { id: "elegante", nome: "Elegante" },
  { id: "classico", nome: "Clássico" },
  { id: "divertido", nome: "Divertido" },
  { id: "forte", nome: "Forte" },
  { id: "natural", nome: "Natural" },
  { id: "luxo", nome: "Luxo" },
  { id: "minimalista", nome: "Minimalista" },
];

// [id, nome, categoria, símbolo, layout, fonte, paleta, grátis]
const L = [
  ["mod-1", "Raio azul", "moderno", "raio", "horizontal", "moderna", "noite", 1],
  ["mod-2", "Sacola grafite", "moderno", "sacola", "vertical", "moderna", "grafite", 0],
  ["mod-3", "Estrela menta", "moderno", "estrela", "tipografico", "arredondada", "menta", 0],
  ["mod-4", "Inicial lavanda", "moderno", "inicial", "selo", "moderna", "lavanda", 0],
  ["mod-5", "Diamante rosé", "moderno", "diamante", "horizontal", "arredondada", "rose", 1],
  ["mod-6", "Lua sálvia", "moderno", "lua", "vertical", "moderna", "salvia", 0],
  ["ele-1", "Flor nude", "elegante", "flor", "vertical", "elegante", "nude", 1],
  ["ele-2", "Espelho cursivo", "elegante", "espelho", "horizontal", "cursiva", "rose", 1],
  ["ele-3", "Coração vinho", "elegante", "coracao", "tipografico", "cursiva", "marsala", 0],
  ["ele-4", "Batom rosé", "elegante", "batom", "selo", "elegante", "rose", 0],
  ["ele-5", "Diamante lavanda", "elegante", "diamante", "vertical", "elegante", "lavanda", 0],
  ["ele-6", "Inicial nude", "elegante", "inicial", "horizontal", "cursiva", "nude", 0],
  ["cla-1", "Coroa clássica", "classico", "coroa", "selo", "classica", "classico", 1],
  ["cla-2", "Poste clássico", "classico", "poste", "vertical", "classica", "classico", 0],
  ["cla-3", "Tesoura vinho", "classico", "tesoura", "horizontal", "classica", "marsala", 0],
  ["cla-4", "Pente dourado", "classico", "pente", "selo", "classica", "ouro", 0],
  ["cla-5", "Bigode grafite", "classico", "bigode", "tipografico", "classica", "grafite", 0],
  ["cla-6", "Inicial sálvia", "classico", "inicial", "vertical", "classica", "salvia", 0],
  ["div-1", "Patinha menta", "divertido", "pata", "horizontal", "arredondada", "menta", 1],
  ["div-2", "Coração rosé", "divertido", "coracao", "vertical", "arredondada", "rose", 0],
  ["div-3", "Estrela lavanda", "divertido", "estrela", "selo", "arredondada", "lavanda", 0],
  ["div-4", "Esmalte lavanda", "divertido", "esmalte", "horizontal", "arredondada", "lavanda", 1],
  ["div-5", "Xícara nude", "divertido", "xicara", "vertical", "arredondada", "nude", 0],
  ["div-6", "Sacola rosé", "divertido", "sacola", "selo", "arredondada", "rose", 0],
  ["for-1", "Poste forte", "forte", "poste", "selo", "forte", "grafite", 1],
  ["for-2", "Bigode dourado", "forte", "bigode", "horizontal", "forte", "ouro", 0],
  ["for-3", "Controle noite", "forte", "controle", "vertical", "forte", "noite", 1],
  ["for-4", "Raio laranja", "forte", "raio", "selo", "forte", "grafite", 0],
  ["for-5", "Tesoura vermelha", "forte", "tesoura", "tipografico", "forte", "classico", 0],
  ["for-6", "Coroa noite", "forte", "coroa", "horizontal", "forte", "noite", 0],
  ["nat-1", "Folha sálvia", "natural", "folha", "horizontal", "arredondada", "salvia", 1],
  ["nat-2", "Flor sálvia", "natural", "flor", "selo", "elegante", "salvia", 0],
  ["nat-3", "Folha menta", "natural", "folha", "vertical", "moderna", "menta", 0],
  ["nat-4", "Patinha sálvia", "natural", "pata", "selo", "arredondada", "salvia", 0],
  ["nat-5", "Xícara moderna", "natural", "xicara", "horizontal", "moderna", "nude", 0],
  ["nat-6", "Lua menta", "natural", "lua", "tipografico", "elegante", "menta", 0],
  ["lux-1", "Coroa dourada", "luxo", "coroa", "vertical", "elegante", "ouro", 1],
  ["lux-2", "Diamante dourado", "luxo", "diamante", "selo", "classica", "ouro", 0],
  ["lux-3", "Inicial dourada", "luxo", "inicial", "horizontal", "elegante", "ouro", 0],
  ["lux-4", "Tesoura dourada", "luxo", "tesoura", "vertical", "elegante", "ouro", 0],
  ["lux-5", "Batom vinho", "luxo", "batom", "horizontal", "classica", "marsala", 0],
  ["lux-6", "Estrela dourada", "luxo", "estrela", "tipografico", "elegante", "ouro", 0],
  ["min-1", "Só a inicial", "minimalista", "inicial", "tipografico", "moderna", "grafite", 1],
  ["min-2", "Lua simples", "minimalista", "lua", "horizontal", "moderna", "salvia", 0],
  ["min-3", "Estrela noite", "minimalista", "estrela", "tipografico", "moderna", "noite", 0],
  ["min-4", "Inicial nude", "minimalista", "inicial", "vertical", "moderna", "nude", 0],
  ["min-5", "Brilho lavanda", "minimalista", "brilho", "horizontal", "moderna", "lavanda", 0],
  ["min-6", "Folha menta", "minimalista", "folha", "tipografico", "arredondada", "menta", 0],
];

export const MODELOS = L.map(([id, nome, categoria, simbolo, layout, fonte, paleta, gratis]) => ({ id, nome, categoria, simbolo, layout, fonte, paleta, gratis: !!gratis }));
export const modeloPorId = (id) => MODELOS.find((m) => m.id === id) || null;
/** Só o que a vitrine precisa saber (sem a receita do desenho). */
export const listaPublica = () => MODELOS.map(({ id, nome, categoria, gratis }) => ({ id, nome, categoria, gratis }));

export function especDoModelo(modelo, nome, subtitulo = "") {
  return normalizarEspec({ nome, subtitulo, nicho: "outro", simbolo: modelo.simbolo, layout: modelo.layout, fonte: modelo.fonte, paleta: modelo.paleta });
}

/** Faixas diagonais “VÊNUS” por cima: a prévia dos modelos com assinatura mostra tudo, mas não serve para usar. */
export function comMarcaDagua(svg) {
  const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (!m) return svg;
  const marca = `<defs><pattern id="mdq" width="130" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)"><text x="6" y="46" font-family="Arial, sans-serif" font-weight="800" font-size="22" fill="#808080" fill-opacity="0.38">VÊNUS</text></pattern></defs><rect width="${m[1]}" height="${m[2]}" fill="url(#mdq)"/>`;
  return svg.replace(/<\/svg>\s*$/, marca + "</svg>");
}

export function svgDoModelo(modelo, nome, subtitulo, { marcaDagua = false } = {}) {
  const svg = logoSvg(especDoModelo(modelo, nome, subtitulo), `m${modelo.id.replace(/\W/g, "")}`);
  return marcaDagua ? comMarcaDagua(svg) : svg;
}
