import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { tratarLogo, LIMITE_LOGOS_POR_DIA } from "../src/ferramentas/logo.js";
import { CATEGORIAS, MODELOS, especDoModelo, svgDoModelo } from "../src/meusite/modelos-logo.js";
import { FONTES, LAYOUTS, PALETAS, SIMBOLOS } from "../src/meusite/logos.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ORIGENS_PERMITIDAS: "https://app.exemplo" });
const T0 = Date.now();
async function usuario(env, email = "ana@exemplo.com") {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: "Ana", dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Navegador", plataforma: "web" } }, T0);
  const u = await env.DB.prepare("SELECT * FROM usuarios WHERE id = ?").bind(r.usuario.id).first();
  return { token: r.token, usuario: u };
}
const chamar = (env, metodo, caminho, { token, corpo } = {}) => {
  const url = new URL("https://v.test" + caminho);
  return tratarLogo(new Request(url, { method: metodo, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, url, url.pathname);
};
const livre = () => MODELOS.find((m) => m.gratis).id;
const trancado = () => MODELOS.find((m) => !m.gratis).id;

test("catálogo: 48 modelos, 12 grátis, 8 categorias de 6, ids e receitas únicos e válidos", () => {
  assert.equal(MODELOS.length, 48);
  assert.equal(MODELOS.filter((m) => m.gratis).length, 12);
  assert.equal(new Set(MODELOS.map((m) => m.id)).size, 48);
  assert.equal(new Set(MODELOS.map((m) => `${m.simbolo}|${m.layout}|${m.fonte}|${m.paleta}`)).size, 48);
  for (const c of CATEGORIAS) assert.equal(MODELOS.filter((m) => m.categoria === c.id).length, 6, c.id);
  for (const c of CATEGORIAS) assert.ok(MODELOS.some((m) => m.categoria === c.id && m.gratis), `${c.id} sem modelo grátis`);
  for (const m of MODELOS) {
    assert.ok(SIMBOLOS[m.simbolo] && LAYOUTS[m.layout] && FONTES[m.fonte] && PALETAS.some((p) => p.id === m.paleta), m.id);
    assert.ok(CATEGORIAS.some((c) => c.id === m.categoria), m.id);
  }
});

test("todo modelo desenha um SVG limpo, mesmo com nome comprido ou com caracteres perigosos", () => {
  for (const m of MODELOS) for (const nome of ["Ana", "Studio Maria Fernanda Beleza & Estética", '<script>alert(1)</script>"x']) {
    const svg = svgDoModelo(m, nome, "frase <b>");
    assert.match(svg, /^<svg[\s>]/); assert.ok(!/<script/i.test(svg), m.id); assert.ok(!svg.includes("<b>"), m.id);
  }
  assert.equal(especDoModelo(MODELOS[0], "  Ana   Lima ").nome, "Ana Lima");
});

test("vitrine pública: lista sem a receita; prévia dos bloqueados leva marca d'água e a dos livres não", async () => {
  const env = ENV();
  const lista = await (await chamar(env, "GET", "/ferramentas/logo/modelos")).json();
  assert.equal(lista.modelos.length, 48); assert.equal(lista.limite, LIMITE_LOGOS_POR_DIA);
  assert.deepEqual(Object.keys(lista.modelos[0]).sort(), ["categoria", "gratis", "id", "nome"]);
  const l = await (await chamar(env, "GET", `/ferramentas/logo/previa?modelo=${livre()}&nome=Ana`)).text();
  const t = await (await chamar(env, "GET", `/ferramentas/logo/previa?modelo=${trancado()}&nome=Ana`)).text();
  assert.ok(!l.includes("VÊNUS")); assert.ok(t.includes("VÊNUS"));
  assert.equal((await chamar(env, "GET", "/ferramentas/logo/previa?modelo=nao-existe")).status, 404);
});

test("criar exige login", async () => {
  const env = ENV();
  assert.equal((await chamar(env, "POST", "/ferramentas/logo", { corpo: { modelo: livre(), nome: "Ana" } })).status, 401);
});

test("plano grátis: cria modelo livre 2 vezes por dia, o terceiro é barrado e modelo com assinatura é 403", async () => {
  const env = ENV();
  const u = await usuario(env);
  const novo = () => chamar(env, "POST", "/ferramentas/logo", { token: u.token, corpo: { modelo: livre(), nome: "Loja da Ana" } });
  const a = await novo(); assert.equal(a.status, 200);
  const corpo = await a.json(); assert.match(corpo.svg, /^<svg/); assert.ok(!corpo.svg.includes("VÊNUS")); assert.equal(corpo.restantes, 1);
  const bloq = await chamar(env, "POST", "/ferramentas/logo", { token: u.token, corpo: { modelo: trancado(), nome: "Loja da Ana" } });
  assert.equal(bloq.status, 403); assert.equal((await bloq.json()).codigo, "assinatura");
  assert.equal((await novo()).status, 200);
  const barrado = await novo(); assert.equal(barrado.status, 429); assert.equal((await barrado.json()).codigo, "limite");
});

test("sem nome não cria e não gasta a conta", async () => {
  const env = ENV();
  const u = await usuario(env);
  assert.equal((await chamar(env, "POST", "/ferramentas/logo", { token: u.token, corpo: { modelo: livre(), nome: "  " } })).status, 400);
  const s = await (await chamar(env, "GET", "/ferramentas/logo/situacao", { token: u.token })).json();
  assert.equal(s.usados, 0);
});

test("plano pago: todos os modelos, sem limite e sem marca d'água", async () => {
  const env = ENV();
  const u = await usuario(env);
  const agora = Date.now();
  await env.DB.prepare("UPDATE lojas SET ativo_ate = ?, trial_fim = ? WHERE id = ?").bind(agora + 30 * 86_400_000, agora - 86_400_000, u.usuario.loja).run();
  for (let i = 0; i < 5; i++) {
    const r = await chamar(env, "POST", "/ferramentas/logo", { token: u.token, corpo: { modelo: trancado(), nome: "Loja da Ana" } });
    assert.equal(r.status, 200); const c = await r.json(); assert.ok(!c.svg.includes("VÊNUS"));
  }
  const s = await (await chamar(env, "GET", "/ferramentas/logo/situacao", { token: u.token })).json();
  assert.equal(s.assinante, true); assert.equal(s.restantes, null);
});
