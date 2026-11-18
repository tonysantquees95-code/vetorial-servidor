// Teste visual do SITE: abre as páginas em 7 tamanhos de tela e confere se cabem, não estouram para o lado,
// se todo botão dá para alcançar, se não há erro no console e se as partes interativas (simulador dos apps,
// janelinha do Android, escolha de preço) funcionam. Fotos em teste-visual/fotos/ (a publicação guarda como artefato).
// Rodar (na raiz do repositório): npm i --no-save playwright-core && node teste-visual/telas.mjs
// Variáveis: CHROME=/caminho/do/chrome, TAMANHO=celular, TELA=home
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";
import config from "./config.mjs";

const SITE = fileURLToPath(new URL("../site/", import.meta.url));
const FOTOS = fileURLToPath(new URL("./fotos/", import.meta.url));
mkdirSync(FOTOS, { recursive: true });
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const servidor = createServer((q, r) => {
  let c = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (c === "/icone/venus.png") c = "/icone-venus.png";
  if (c.endsWith("/")) c += "index.html";
  const arq = join(SITE, c);
  if (!arq.startsWith(SITE) || !existsSync(arq) || !statSync(arq).isFile()) { r.writeHead(404); return r.end("não achei"); }
  r.writeHead(200, { "content-type": TIPOS[extname(arq)] || "application/octet-stream" }); r.end(readFileSync(arq));
});
await new Promise((ok) => servidor.listen(config.porta, ok));

const TAMANHOS = [["celular-pequeno", 320, 568], ["celular", 360, 640], ["celular-grande", 412, 915], ["celular-deitado", 740, 360], ["tablet", 768, 1024], ["janela-pequena", 800, 500], ["janela-windows", 1280, 720]];

function conferir() {
  const vw = innerWidth, vh = innerHeight, problemas = [], avisos = [];
  const visivel = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const nome = (e) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
  const rolX = (e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1; };
  if (document.documentElement.scrollWidth > vw + 1) {
    const culpado = [...document.querySelectorAll("body *")].find((e) => { const r = e.getBoundingClientRect(); return r.right > vw + 1 && visivel(e) && !(function () { for (let p = e.parentElement; p; p = p.parentElement) if (rolX(p) || getComputedStyle(p).overflowX === "hidden") return true; return false; })(); });
    problemas.push(`a página estoura para o lado (${document.documentElement.scrollWidth}px > ${vw}px)${culpado ? ` por causa de <${culpado.tagName.toLowerCase()} class="${String(culpado.className).slice(0, 50)}">` : ""}`);
  }
  for (const b of document.querySelectorAll("button, a[href], input, summary")) {
    if (!visivel(b)) continue;
    const r = b.getBoundingClientRect();
    if (r.left >= -1 && r.right <= vw + 1) continue;
    let p = b.parentElement, dentro = false;
    while (p) { if (rolX(p)) { dentro = true; break; } p = p.parentElement; }
    if (!dentro) problemas.push(`o item "${nome(b)}" fica cortado para o lado`);
  }
  for (const e of document.querySelectorAll("button, a, p, span, li, label")) {
    if (!visivel(e) || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (parseFloat(getComputedStyle(e).fontSize) < 9.5) { problemas.push(`texto pequeno demais ("${nome(e)}")`); break; }
  }
  const janela = [...document.querySelectorAll("[role=dialog]")].find(visivel);
  if (janela) for (const cartao of [...janela.children].filter((c) => visivel(c) && getComputedStyle(c).position !== "absolute")) {
    const r = cartao.getBoundingClientRect();
    if (r.bottom > vh + 1 || r.top < -1) problemas.push(`a janelinha passa da altura da tela (${Math.round(r.top)}→${Math.round(r.bottom)} de ${vh}px)`);
    if (r.right > vw + 1 || r.left < -1) problemas.push("a janelinha passa da largura da tela");
    for (const b of cartao.querySelectorAll("button, a[href]")) { if (!visivel(b)) continue; let p = b.parentElement, rol = false; while (p && p !== cartao.parentElement) { if (p.scrollHeight > p.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) { rol = true; break; } p = p.parentElement; } const rb = b.getBoundingClientRect(); if (!rol && (rb.bottom > vh + 1 || rb.top < -1)) problemas.push(`o botão "${nome(b)}" fica fora da tela`); }
  }
  if (vw <= 768) {
    const peq = [...document.querySelectorAll("button, a[href], summary")].filter((b) => { if (!visivel(b)) return false; const r = b.getBoundingClientRect(); if (r.right <= 1 || r.left >= vw - 1) return false; if (b.closest("p, li") && b.tagName === "A" && getComputedStyle(b).display === "inline") return false; return r.height < 32 && r.width < 44 || r.height < 24; });
    if (peq.length) avisos.push(`${peq.length} botão(ões) pequeno(s) para o dedo, ex.: "${nome(peq[0])}"`);
  }
  return { problemas: [...new Set(problemas)], avisos };
}

const cromo = process.env.CHROME || ["/usr/bin/google-chrome", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(existsSync);
let falhas = 0, total = 0;
const avisosTotal = new Map();
try {
  const browser = await chromium.launch(cromo ? { executablePath: cromo } : { channel: "chrome" });
  for (const [tam, w, h] of TAMANHOS.filter(([n]) => !process.env.TAMANHO || n === process.env.TAMANHO)) {
    for (const [nome, caminho, passos] of config.cenarios.filter(([n]) => !process.env.TELA || n === process.env.TELA)) {
      total++;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await ctx.route(/^https?:\/\/(?!localhost)/, (rota) => rota.abort()); // nada de internet de verdade
      const p = await ctx.newPage(), erros = [];
      p.on("pageerror", (e) => erros.push(`erro na página: ${e.message}`));
      p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_FAILED|ERR_BLOCKED/.test(m.text())) erros.push(`erro no console: ${m.text().slice(0, 120)}`); });
      let problemas = [], avisos = [];
      try {
        await p.goto(`http://localhost:${config.porta}/${caminho}`);
        await p.waitForTimeout(500);
        await passos(p);
        await p.waitForTimeout(200);
        ({ problemas, avisos } = await p.evaluate(conferir));
      } catch (e) { problemas = [`não consegui: ${String(e.message).split("\n")[0]}`]; }
      problemas.push(...erros);
      for (const av of avisos) { const k = `${nome}: ${av.replace(/\d+ botão/, "N botão")}`; if (!avisosTotal.has(k)) avisosTotal.set(k, []); avisosTotal.get(k).push(tam); }
      await p.screenshot({ path: `${FOTOS}${nome}__${tam}.png` });
      if (problemas.length) { falhas++; console.log(`✗ ${nome} em ${tam} (${w}x${h}): ${problemas.join("; ")}`); } else console.log(`✓ ${nome} em ${tam}`);
      await ctx.close();
    }
  }
  await browser.close();
} finally { servidor.close(); }
if (avisosTotal.size) { console.log("\nAvisos (não reprovam):"); for (const [k, v] of avisosTotal) console.log(`⚠ ${k} — em ${v.length} tamanho(s)`); }
console.log(`\n${total - falhas}/${total} telas ok`);
process.exit(falhas ? 1 : 0);
