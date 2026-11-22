import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { tratarPanfleto, LIMITE_PANFLETOS_POR_DIA } from "../src/panfleto/uso.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ORIGENS_PERMITIDAS: "https://app.exemplo" });
const T0 = Date.now();
async function usuario(env, email = "ana@exemplo.com") {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: "Ana", dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Navegador", plataforma: "web" } }, T0);
  return { id: r.usuario.id, token: r.token };
}
const chamar = (env, metodo, { token } = {}) => {
  const url = new URL("https://v.test/panfleto/uso");
  return tratarPanfleto(new Request(url, { method: metodo, headers: token ? { authorization: `Bearer ${token}` } : {} }), env, url, url.pathname);
};

test("sem login não conta nem mostra", async () => {
  const env = ENV();
  assert.equal((await chamar(env, "GET")).status, 401);
  assert.equal((await chamar(env, "POST")).status, 401);
});

test("limite de 2 por dia no plano grátis; o terceiro é barrado", async () => {
  const env = ENV();
  const u = await usuario(env);
  let r = await (await chamar(env, "GET", u)).json();
  assert.deepEqual([r.ilimitado, r.limite, r.usados, r.restantes], [false, 2, 0, 2]);
  assert.equal(LIMITE_PANFLETOS_POR_DIA, 2);
  for (const esperado of [1, 2]) {
    const x = await chamar(env, "POST", u);
    assert.equal(x.status, 200);
    assert.equal((await x.json()).usados, esperado);
  }
  const barrado = await chamar(env, "POST", u);
  assert.equal(barrado.status, 429);
  const c = await barrado.json();
  assert.equal(c.usados, 2); assert.equal(c.restantes, 0);
});

test("contas diferentes têm contagens separadas", async () => {
  const env = ENV();
  const a = await usuario(env, "a@exemplo.com"), b = await usuario(env, "b@exemplo.com");
  await chamar(env, "POST", a); await chamar(env, "POST", a);
  assert.equal((await chamar(env, "POST", a)).status, 429);
  assert.equal((await chamar(env, "POST", b)).status, 200);
});
