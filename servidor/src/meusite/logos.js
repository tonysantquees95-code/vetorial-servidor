// Logos personalizados em SVG: o nome da pessoa + um símbolo do ramo (tesoura, pente, esmalte…) + paleta + formato.
// Tudo nasce de uma "espec" pequena (JSON) que o app guarda; o SVG é sempre refeito aqui, então nunca entra SVG de fora.

export const FONTES = {
  moderna: { nome: "Moderna", familia: "'Helvetica Neue', Arial, 'Segoe UI', Roboto, sans-serif", peso: 800, estilo: "normal", caixa: false, espaco: 0, k: 0.6 },
  elegante: { nome: "Elegante", familia: "Georgia, 'Times New Roman', serif", peso: 700, estilo: "italic", caixa: false, espaco: 0, k: 0.56 },
  classica: { nome: "Clássica", familia: "'Times New Roman', Times, serif", peso: 700, estilo: "normal", caixa: true, espaco: 3, k: 0.74 },
  forte: { nome: "Forte", familia: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif", peso: 900, estilo: "normal", caixa: true, espaco: 1, k: 0.66 },
  arredondada: { nome: "Redonda", familia: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif", peso: 700, estilo: "normal", caixa: false, espaco: 0, k: 0.62 },
  cursiva: { nome: "Cursiva", familia: "'Brush Script MT', 'Snell Roundhand', 'Segoe Script', cursive", peso: 400, estilo: "italic", caixa: false, espaco: 0, k: 0.5 },
};

export const LAYOUTS = { horizontal: "Lado a lado", vertical: "Empilhado", selo: "Selo redondo", tipografico: "Só o nome" };

export const NICHOS = {
  salao: "Salão de beleza",
  barbearia: "Barbearia",
  manicure: "Manicure e unhas",
  estetica: "Estética e bem-estar",
  loja: "Loja",
  outro: "Outro negócio",
};

/** Paletas: fundo, cor principal, cor de apoio e cor do texto. `nichos` diz onde aparecem primeiro. */
export const PALETAS = [
  { id: "rose", nome: "Rosé", fundo: "#FFF1F5", principal: "#C2185B", apoio: "#F48FB1", texto: "#4A1230", nichos: ["salao", "manicure", "estetica", "loja"] },
  { id: "ouro", nome: "Preto e dourado", fundo: "#121212", principal: "#D4AF37", apoio: "#8A6D1F", texto: "#F5E9C8", nichos: ["barbearia", "salao", "loja", "outro"] },
  { id: "salvia", nome: "Verde sálvia", fundo: "#F3F7F2", principal: "#3E6B4F", apoio: "#A9C8B1", texto: "#1F3A2B", nichos: ["estetica", "salao", "outro"] },
  { id: "lavanda", nome: "Lavanda", fundo: "#F5F0FF", principal: "#6D4AFF", apoio: "#CDBBFF", texto: "#2A1C66", nichos: ["manicure", "estetica", "loja"] },
  { id: "nude", nome: "Nude", fundo: "#FAF3EC", principal: "#A9745B", apoio: "#E8CDBA", texto: "#4A2F22", nichos: ["manicure", "salao", "estetica"] },
  { id: "noite", nome: "Azul noite", fundo: "#0B1530", principal: "#36D6FF", apoio: "#7A8CFF", texto: "#EAF2FF", nichos: ["barbearia", "outro", "loja"] },
  { id: "classico", nome: "Azul e vermelho", fundo: "#F7F4EC", principal: "#B3202A", apoio: "#1D3A6E", texto: "#1B2440", nichos: ["barbearia", "outro"] },
  { id: "grafite", nome: "Grafite e laranja", fundo: "#1E1E1E", principal: "#FF7A1A", apoio: "#8C4A12", texto: "#F4F1EC", nichos: ["barbearia", "outro", "loja"] },
  { id: "marsala", nome: "Vinho e creme", fundo: "#FBF4EA", principal: "#7B1E3A", apoio: "#D9B382", texto: "#3A0F1C", nichos: ["salao", "loja", "estetica"] },
  { id: "menta", nome: "Menta", fundo: "#EEFBF7", principal: "#0E9F8E", apoio: "#8BE0D2", texto: "#0B3A34", nichos: ["manicure", "estetica", "outro"] },
];

const f = (n) => Math.round(n * 100) / 100;
const pontosEstrela = (() => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 11 : 25;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    p.push(`${f(32 + r * Math.cos(a))} ${f(34 + r * Math.sin(a))}`);
  }
  return `M${p.join(" L")} Z`;
})();
const petalas = [0, 1, 2, 3, 4].map((i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return `<circle cx="${f(32 + 14 * Math.cos(a))}" cy="${f(32 + 14 * Math.sin(a))}" r="9"/>`;
}).join("");

/** Símbolos num quadro de 64×64, traço fino arredondado (o mesmo estilo dos ícones da Vênus). `nichos`: onde combinam. */
export const SIMBOLOS = {
  tesoura: { nome: "Tesoura", nichos: ["salao", "barbearia"], d: '<path d="M24 43 L44 8 M40 43 L20 8"/><circle cx="20" cy="50" r="7"/><circle cx="44" cy="50" r="7"/>' },
  poste: { nome: "Poste de barbeiro", nichos: ["barbearia"], d: '<rect x="22" y="14" width="20" height="40" rx="4"/><rect x="19" y="8" width="26" height="8" rx="3"/><rect x="19" y="52" width="26" height="8" rx="3"/><path d="M22 28 L42 18 M22 40 L42 30 M22 52 L42 42"/>' },
  pente: { nome: "Pente", nichos: ["salao", "barbearia"], d: '<rect x="8" y="14" width="48" height="12" rx="5"/><path d="M13 26 V50 M21 26 V46 M29 26 V50 M37 26 V46 M45 26 V50 M52 26 V46"/>' },
  esmalte: { nome: "Esmalte", nichos: ["manicure", "estetica"], d: '<rect x="19" y="28" width="26" height="28" rx="7"/><rect x="27" y="19" width="10" height="9"/><rect x="29" y="5" width="6" height="14" rx="2.5"/>' },
  folha: { nome: "Folha", nichos: ["estetica", "salao", "outro"], d: '<path d="M12 52 C12 24 30 10 54 10 C54 36 38 54 12 52 Z"/><path d="M12 52 L40 24"/>' },
  coroa: { nome: "Coroa", nichos: ["barbearia", "salao", "loja", "outro"], d: '<path d="M10 46 L14 20 L26 32 L32 14 L38 32 L50 20 L54 46 Z"/><path d="M10 54 H54"/>' },
  estrela: { nome: "Estrela", nichos: ["manicure", "salao", "loja", "outro"], d: `<path d="${pontosEstrela}"/>` },
  coracao: { nome: "Coração", nichos: ["estetica", "manicure", "salao", "loja"], d: '<path d="M32 54 C10 38 8 22 18 16 C25 12 31 16 32 22 C33 16 39 12 46 16 C56 22 54 38 32 54 Z"/>' },
  diamante: { nome: "Diamante", nichos: ["manicure", "estetica", "loja"], d: '<path d="M16 18 H48 L58 28 L32 56 L6 28 Z"/><path d="M6 28 H58 M22 28 L32 56 L42 28 M26 18 L22 28 M38 18 L42 28"/>' },
  flor: { nome: "Flor", nichos: ["estetica", "salao", "manicure"], d: `<g>${petalas}</g><circle cx="32" cy="32" r="5"/>` },
  batom: { nome: "Batom", nichos: ["salao", "estetica", "loja"], d: '<rect x="22" y="32" width="20" height="24" rx="3"/><rect x="24" y="22" width="16" height="10"/><path d="M24 22 V14 Q32 6 40 14 V22"/>' },
  espelho: { nome: "Espelho", nichos: ["salao", "estetica"], d: '<circle cx="32" cy="25" r="18"/><path d="M32 43 V58"/><path d="M22 20 Q25 14 31 13"/>' },
  secador: { nome: "Secador", nichos: ["salao"], d: '<rect x="6" y="14" width="40" height="22" rx="11"/><rect x="46" y="18" width="10" height="14" rx="2"/><path d="M20 36 L18 56 H28 L30 36"/>' },
  bigode: { nome: "Bigode", nichos: ["barbearia"], d: '<path d="M32 30 C26 22 14 22 8 30 C14 30 18 34 22 38 C26 40 30 36 32 34 C34 36 38 40 42 38 C46 34 50 30 56 30 C50 22 38 22 32 30 Z"/>' },
  lua: { nome: "Lua", nichos: ["estetica", "outro", "loja"], d: '<path d="M44 8 A24 24 0 1 0 56 40 A19 19 0 0 1 44 8 Z"/>' },
  inicial: { nome: "Inicial do nome", nichos: [], d: "" },
};

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hex = (c, padrao) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c).toUpperCase() : padrao);

/** Espec válida: o que veio de fora é conferido item por item; o que faltar ganha o padrão do ramo. */
export function normalizarEspec(e = {}) {
  const nome = String(e.nome ?? "").trim().replace(/\s+/g, " ").slice(0, 32) || "Meu negócio";
  const nicho = NICHOS[e.nicho] ? e.nicho : "outro";
  const base = PALETAS.find((p) => p.id === e.paleta) || PALETAS.find((p) => p.nichos[0] === nicho) || PALETAS[0];
  const paleta = {
    id: PALETAS.some((p) => p.id === e.paleta) ? e.paleta : base.id,
    fundo: hex(e.cores?.fundo, base.fundo), principal: hex(e.cores?.principal, base.principal), apoio: hex(e.cores?.apoio, base.apoio), texto: hex(e.cores?.texto, base.texto),
  };
  return {
    nome,
    subtitulo: String(e.subtitulo ?? "").trim().replace(/\s+/g, " ").slice(0, 34),
    nicho,
    simbolo: SIMBOLOS[e.simbolo] ? e.simbolo : (Object.entries(SIMBOLOS).find(([, s]) => s.nichos[0] === nicho) || ["inicial"])[0],
    layout: LAYOUTS[e.layout] ? e.layout : "horizontal",
    fonte: FONTES[e.fonte] ? e.fonte : "moderna",
    paleta: paleta.id,
    cores: { fundo: paleta.fundo, principal: paleta.principal, apoio: paleta.apoio, texto: paleta.texto },
  };
}

function simbolo(id, nome, x, y, tam, cor, fonteId) {
  const esc2 = tam / 64;
  if (id === "inicial") {
    const letra = esc(([...String(nome).trim()][0] || "V").toUpperCase());
    const fo = FONTES[fonteId] || FONTES.moderna;
    return `<text x="${f(x + tam / 2)}" y="${f(y + tam * 0.74)}" text-anchor="middle" font-family="${esc(fo.familia)}" font-weight="900" font-size="${f(tam * 0.78)}" fill="${cor}">${letra}</text>`;
  }
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(esc2)})" fill="none" stroke="${cor}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${SIMBOLOS[id].d}</g>`;
}

/** Tamanho da letra para o texto caber na largura; se nem no mínimo couber, o SVG aperta as letras (textLength). */
function ajustar(txt, fonteId, tamMax, larguraMax, minimo = 14) {
  const fo = FONTES[fonteId];
  const texto = fo.caixa ? txt.toUpperCase() : txt;
  const por = (tam) => texto.length * (tam * fo.k + fo.espaco);
  let tam = tamMax;
  if (por(tam) > larguraMax) tam = Math.max(minimo, (tamMax * larguraMax) / por(tamMax));
  return { texto, tam: f(tam), apertar: por(tam) > larguraMax * 1.02 ? larguraMax : 0 };
}

/** Nomes compridos com espaço viram duas linhas, para as letras ficarem maiores. */
function nomeEmLinhas(nome, fonteId, tamMax, larguraMax, tamDuas) {
  if (nome.length > 15 && nome.includes(" ")) {
    const meio = nome.length / 2;
    let corte = -1;
    for (let i = 0; i < nome.length; i++) if (nome[i] === " " && (corte < 0 || Math.abs(i - meio) < Math.abs(corte - meio))) corte = i;
    const partes = [nome.slice(0, corte), nome.slice(corte + 1)].map((l) => ajustar(l, fonteId, tamDuas, larguraMax, 18));
    const tam = Math.min(...partes.map((p) => p.tam));
    return partes.map((p) => ({ ...p, tam, apertar: p.apertar }));
  }
  return [ajustar(nome, fonteId, tamMax, larguraMax)];
}

function texto(t, { x, y, tam, fonte, cor, ancora = "middle", apertar = 0, extra = "" }) {
  const fo = FONTES[fonte];
  return `<text x="${f(x)}" y="${f(y)}" text-anchor="${ancora}" font-family="${esc(fo.familia)}" font-weight="${fo.peso}" font-style="${fo.estilo}" font-size="${tam}" fill="${cor}"${fo.espaco ? ` letter-spacing="${fo.espaco}"` : ""}${apertar ? ` textLength="${apertar}" lengthAdjust="spacingAndGlyphs"` : ""}${extra}>${esc(t)}</text>`;
}
const legenda = (t, { x, y, tam, cor, ancora = "middle" }) =>
  `<text x="${f(x)}" y="${f(y)}" text-anchor="${ancora}" font-family="${esc(FONTES.moderna.familia)}" font-weight="600" font-size="${tam}" letter-spacing="3" fill="${cor}">${esc(t.toUpperCase())}</text>`;

/** O SVG do logo (viewBox próprio; vale como <img> ou arquivo .svg). `sufixo` evita choque de ids se vários logos estiverem na mesma página. */
export function logoSvg(espec, sufixo = "") {
  const e = normalizarEspec(espec);
  const { fundo, principal, apoio, texto: cTexto } = e.cores;
  const cab = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(e.nome)}">`;
  const sub = e.subtitulo;
  let corpo = "";
  let w = 520, h = 168;
  if (e.layout === "horizontal") {
    corpo += `<rect width="${w}" height="${h}" rx="26" fill="${fundo}"/><circle cx="88" cy="84" r="58" fill="${principal}" fill-opacity="0.14" stroke="${principal}" stroke-width="2.5"/>`;
    corpo += simbolo(e.simbolo, e.nome, 56, 52, 64, principal, e.fonte);
    const ls = nomeEmLinhas(e.nome, e.fonte, 48, 330, 36);
    if (ls.length === 1) {
      corpo += texto(ls[0].texto, { x: 168, y: sub ? 88 : 98, tam: ls[0].tam, fonte: e.fonte, cor: cTexto, ancora: "start", apertar: ls[0].apertar });
      corpo += `<rect x="168" y="${sub ? 102 : 112}" width="46" height="4" rx="2" fill="${apoio}"/>`;
      if (sub) corpo += legenda(sub, { x: 170, y: 126, tam: 17, cor: principal, ancora: "start" });
    } else {
      const y1 = sub ? 70 : 78;
      corpo += texto(ls[0].texto, { x: 168, y: y1, tam: ls[0].tam, fonte: e.fonte, cor: cTexto, ancora: "start", apertar: ls[0].apertar });
      corpo += texto(ls[1].texto, { x: 168, y: y1 + ls[0].tam * 1.05, tam: ls[1].tam, fonte: e.fonte, cor: cTexto, ancora: "start", apertar: ls[1].apertar });
      if (sub) corpo += legenda(sub, { x: 170, y: 140, tam: 16, cor: principal, ancora: "start" });
    }
  } else if (e.layout === "vertical") {
    w = 360; h = 360;
    corpo += `<rect width="${w}" height="${h}" rx="34" fill="${fundo}"/><circle cx="180" cy="110" r="76" fill="${principal}" fill-opacity="0.14" stroke="${principal}" stroke-width="3"/>`;
    corpo += simbolo(e.simbolo, e.nome, 140, 70, 80, principal, e.fonte);
    const ls = nomeEmLinhas(e.nome, e.fonte, 54, 300, 42);
    let y = ls.length === 1 ? 252 : 236;
    for (const l of ls) { corpo += texto(l.texto, { x: 180, y, tam: l.tam, fonte: e.fonte, cor: cTexto, apertar: l.apertar }); y += l.tam * 1.05; }
    y = ls.length === 1 ? 270 : y - 8;
    corpo += `<rect x="156" y="${f(y)}" width="48" height="4" rx="2" fill="${apoio}"/>`;
    if (sub) corpo += legenda(sub, { x: 180, y: f(y + 40), tam: 19, cor: principal });
  } else if (e.layout === "selo") {
    w = 360; h = 360;
    const idTopo = `arco-a${sufixo}`, idBase = `arco-b${sufixo}`;
    corpo += `<defs><path id="${idTopo}" d="M 56 180 A 124 124 0 0 1 304 180"/><path id="${idBase}" d="M 48 180 A 132 132 0 0 0 312 180"/></defs>`;
    corpo += `<circle cx="180" cy="180" r="172" fill="${fundo}"/><circle cx="180" cy="180" r="164" fill="none" stroke="${principal}" stroke-width="6"/><circle cx="180" cy="180" r="150" fill="none" stroke="${apoio}" stroke-width="2"/>`;
    corpo += simbolo(e.simbolo, e.nome, 130, 122, 100, principal, e.fonte);
    const a = ajustar(e.nome, e.fonte, 36, 290, 16);
    const fo = FONTES[e.fonte];
    corpo += `<text font-family="${esc(fo.familia)}" font-weight="${fo.peso}" font-style="${fo.estilo}" font-size="${a.tam}" fill="${cTexto}"${fo.espaco ? ` letter-spacing="${fo.espaco}"` : ""}><textPath href="#${idTopo}" startOffset="50%" text-anchor="middle"${a.apertar ? ` textLength="${Math.min(a.apertar, 280)}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(a.texto)}</textPath></text>`;
    if (sub) corpo += `<text font-family="${esc(FONTES.moderna.familia)}" font-weight="600" font-size="17" letter-spacing="3" fill="${principal}"><textPath href="#${idBase}" startOffset="50%" text-anchor="middle">${esc(sub.toUpperCase())}</textPath></text>`;
    else corpo += `<path d="M 160 262 H 200" stroke="${apoio}" stroke-width="4" stroke-linecap="round"/>`;
  } else {
    corpo += `<rect width="${w}" height="${h}" rx="26" fill="${fundo}"/>`;
    corpo += simbolo(e.simbolo, e.nome, 234, 8, 52, principal, e.fonte);
    const a = ajustar(e.nome, e.fonte, 50, 450);
    corpo += texto(a.texto, { x: 260, y: sub ? 110 : 118, tam: a.tam, fonte: e.fonte, cor: cTexto, apertar: a.apertar });
    corpo += `<path d="M 200 ${sub ? 124 : 134} H 320" stroke="${apoio}" stroke-width="3" stroke-linecap="round"/>`;
    if (sub) corpo += legenda(sub, { x: 260, y: 152, tam: 16, cor: principal });
  }
  return `${cab(w, h)}${corpo}</svg>`;
}

// ------------------------------------------------------------------------------------------ várias opções de uma vez
function semente(texto) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h;
}
function gerador(seed) {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const escolher = (r, lista) => lista[Math.floor(r() * lista.length)];

/**
 * Sugestões de logo para o nome e o ramo. A mesma entrada dá sempre as mesmas opções (e `variacao` pede outras).
 * Metade usa símbolos do ramo; os layouts, as fontes e as paletas se alternam para as opções não ficarem parecidas.
 */
export function gerarOpcoes({ nome, subtitulo = "", nicho = "outro", paleta = "", simbolo: fixo = "" }, { quantidade = 12, variacao = 0 } = {}) {
  const base = normalizarEspec({ nome, subtitulo, nicho });
  const r = gerador(semente(`${base.nome}|${base.nicho}|${variacao}`));
  const doRamo = Object.keys(SIMBOLOS).filter((s) => s !== "inicial" && SIMBOLOS[s].nichos.includes(base.nicho));
  const gerais = ["coroa", "estrela", "lua", "folha"].filter((s) => !doRamo.includes(s));
  const paletas = PALETAS.filter((p) => !paleta || p.id === paleta);
  const ordemPaletas = [...paletas].sort((a, b) => Number(b.nichos.includes(base.nicho)) - Number(a.nichos.includes(base.nicho)));
  const layouts = Object.keys(LAYOUTS);
  const fontes = Object.keys(FONTES);
  const vistos = new Set();
  const saida = [];
  for (let i = 0; saida.length < quantidade && i < quantidade * 12; i++) {
    const sim = SIMBOLOS[fixo] ? fixo : r() < 0.12 ? "inicial" : escolher(r, r() < 0.78 && doRamo.length ? doRamo : gerais.length ? gerais : doRamo);
    const pal = ordemPaletas[(i + Math.floor(r() * 3)) % Math.max(1, Math.min(ordemPaletas.length, 6))] || PALETAS[0];
    const espec = normalizarEspec({ nome, subtitulo, nicho, simbolo: sim, layout: layouts[i % layouts.length], fonte: escolher(r, fontes), paleta: pal.id });
    const chave = `${espec.simbolo}|${espec.layout}|${espec.fonte}|${espec.paleta}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(espec);
  }
  return saida;
}
