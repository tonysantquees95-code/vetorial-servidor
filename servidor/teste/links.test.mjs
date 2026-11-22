import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { tratarLinks, validarDestino, criarLink, novoCodigo, LIMITE_LINKS_POR_DIA } from "../src/ferramentas/links.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ORIGENS_PERMITIDAS: "https://app.exemplo" });
const T0 = Date.now();
async function usuario(env, email = "ana@exemplo.com") {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: "Ana", dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Navegador", plataforma: "web" } }, T0);
  return { id: r.usuario.id, token: r.token, usuario: await env.DB.prepare("SELECT * FROM usuarios WHERE id = ?").bind(r.usuario.id).first() };
}
const chamar = (env, metodo, caminho, { token, corpo } = {}) => {
  const url = new URL("https://v.test" + caminho);
  return tratarLinks(new Request(url, { method: metodo, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, url, url.pathname);
};

test("validarDestino: normaliza e barra o que é perigoso", () => {
  assert.deepEqual(validarDestino("minhaloja.com.br/oferta"), { ok: true, url: "https://minhaloja.com.br/oferta" });
  assert.equal(validarDestino("http://exemplo.com").ok, true);
  for (const ruim of ["", "   ", "javascript:alert(1)", "ftp://x.com/a", "https://localhost/a", "http://192.168.0.1/x", "https://user:senha@site.com", "https://semponto", "https://site.local/a", "data:text/html,oi", "https://bit.ly/abc", "https://wa.me/5551999990000", "https://" + "a".repeat(2100) + ".com"]) {
    assert.equal(validarDestino(ruim).ok, false, ruim);
  }
  assert.equal(validarDestino("https://v.test/l/abc123", ["v.test"]).ok, false); // link curto da própria Vetorial
  assert.equal(validarDestino("https://v.test/outra-coisa", ["v.test"]).ok, true);
});

test("código: 6 caracteres sem letras que se confundem", () => {
  for (let i = 0; i < 200; i++) assert.match(novoCodigo(), /^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/);
});

test("sem login não cria, não lista e não apaga", async () => {
  const env = ENV();
  assert.equal((await chamar(env, "POST", "/links", { corpo: { destino: "https://exemplo.com" } })).status, 401);
  assert.equal((await chamar(env, "GET", "/links")).status, 401);
  assert.equal((await chamar(env, "DELETE", "/links/abc234", { token: "vazio" })).status, 401);
});

test("cria, redireciona, conta clique e lista com a contagem", async () => {
  const env = ENV();
  const u = await usuario(env);
  const r = await chamar(env, "POST", "/links", { token: u.token, corpo: { destino: "minhaloja.com.br/oferta?x=1" } });
  assert.equal(r.status, 201);
  const { link } = await r.json();
  assert.equal(link.destino, "https://minhaloja.com.br/oferta?x=1");
  assert.equal(link.curto, `https://v.test/l/${link.codigo}`);
  for (let i = 0; i < 3; i++) {
    const g = await chamar(env, "GET", `/l/${link.codigo}`);
    assert.equal(g.status, 302);
    assert.equal(g.headers.get("location"), "https://minhaloja.com.br/oferta?x=1");
  }
  const lista = await (await chamar(env, "GET", "/links", { token: u.token })).json();
  assert.equal(lista.links.length, 1);
  assert.equal(lista.links[0].cliques, 3);
  assert.equal(lista.limite, LIMITE_LINKS_POR_DIA);
});

test("link inexistente ou desativado dá 404 e não conta", async () => {
  const env = ENV();
  assert.equal((await chamar(env, "GET", "/l/abcdef")).status, 404);
  const u = await usuario(env);
  const r = await criarLink(env, u.usuario, "https://exemplo.com", T0);
  await env.DB.prepare("UPDATE links_curtos SET ativo = 0 WHERE codigo = ?").bind(r.link.codigo).run();
  assert.equal((await chamar(env, "GET", `/l/${r.link.codigo}`)).status, 404);
});

test("destino inválido volta 400 com mensagem", async () => {
  const env = ENV();
  const u = await usuario(env);
  const r = await chamar(env, "POST", "/links", { token: u.token, corpo: { destino: "https://bit.ly/x" } });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).codigo, "destino_invalido");
});

test("conta grátis: 20 por dia, o 21º é barrado; um dia depois volta", async () => {
  const env = ENV();
  const u = await usuario(env);
  for (let i = 0; i < LIMITE_LINKS_POR_DIA; i++) assert.equal((await criarLink(env, u.usuario, `https://exemplo.com/${i}`, T0)).ok, true);
  const r = await criarLink(env, u.usuario, "https://exemplo.com/x", T0);
  assert.deepEqual([r.ok, r.motivo], [false, "limite"]);
  const via = await chamar(env, "POST", "/links", { token: u.token, corpo: { destino: "https://exemplo.com/y" } });
  assert.equal(via.status, 429);
  assert.equal((await criarLink(env, u.usuario, "https://exemplo.com/z", T0 + 25 * 3_600_000)).ok, true);
});

test("cada conta tem a sua cota e só vê e apaga os próprios links", async () => {
  const env = ENV();
  const a = await usuario(env, "a@exemplo.com"); const b = await usuario(env, "b@exemplo.com");
  for (let i = 0; i < LIMITE_LINKS_POR_DIA; i++) await criarLink(env, a.usuario, `https://exemplo.com/${i}`, T0);
  const rb = await criarLink(env, b.usuario, "https://exemplo.com/b", T0);
  assert.equal(rb.ok, true);
  assert.equal((await (await chamar(env, "GET", "/links", { token: a.token })).json()).links.length, LIMITE_LINKS_POR_DIA);
  assert.equal((await chamar(env, "DELETE", `/links/${rb.link.codigo}`, { token: a.token })).status, 404);
  assert.equal((await chamar(env, "DELETE", `/links/${rb.link.codigo}`, { token: b.token })).status, 200);
  assert.equal((await chamar(env, "GET", `/l/${rb.link.codigo}`)).status, 404);
});

test("plano pago não tem limite", async () => {
  const env = ENV();
  const u = await usuario(env);
  const agora = Date.now();
  await env.DB.prepare("UPDATE lojas SET ativo_ate = ?, trial_fim = ? WHERE id = ?").bind(agora + 30 * 86_400_000, agora - 86_400_000, u.usuario.loja).run();
  for (let i = 0; i < LIMITE_LINKS_POR_DIA + 5; i++) assert.equal((await criarLink(env, u.usuario, `https://exemplo.com/${i}`, agora)).ok, true);
});

test("QR code: grátis, sem login, devolve SVG e recusa vazio ou enorme", async () => {
  const env = ENV();
  const r = await chamar(env, "GET", "/ferramentas/qr?texto=" + encodeURIComponent("https://minhaloja.com.br"));
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /image\/svg\+xml/);
  const svg = await r.text();
  assert.match(svg, /^<svg /);
  assert.equal((await chamar(env, "GET", "/ferramentas/qr?texto=")).status, 400);
  assert.equal((await chamar(env, "GET", "/ferramentas/qr?texto=" + "a".repeat(1001))).status, 400);
  const cor = await (await chamar(env, "GET", "/ferramentas/qr?texto=oi&cor=%23c2185b&fundo=%23ffffff")).text();
  assert.ok(cor.includes("#c2185b"));
  assert.ok(!(await (await chamar(env, "GET", "/ferramentas/qr?texto=oi&cor=%22%3E%3Cscript%3E")).text()).includes("script"));
});
