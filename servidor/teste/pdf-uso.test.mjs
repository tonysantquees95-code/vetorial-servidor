import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { tratarPdf, registrarUso, situacao, diaDeBrasilia, LIMITE_DIARIO } from "../src/pdf/uso.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ORIGENS_PERMITIDAS: "https://app.exemplo" });
const T0 = Date.now();
async function usuario(env, email = "ana@exemplo.com") {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: "Ana", dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Navegador", plataforma: "web" } }, T0);
  return { id: r.usuario.id, token: r.token, usuario: await env.DB.prepare("SELECT * FROM usuarios WHERE id = ?").bind(r.usuario.id).first() };
}
const chamar = (env, token, metodo) => tratarPdf(new Request("https://v.test/pdf/uso", { method: metodo, headers: { authorization: `Bearer ${token}` } }), env, new URL("https://v.test/pdf/uso"), "/pdf/uso");

test("sem login não conta nada", async () => {
  const env = ENV();
  assert.equal((await chamar(env, "vazio", "POST")).status, 401);
});

test("conta grátis: 10 downloads por dia e o 11º é barrado", async () => {
  const env = ENV();
  const u = await usuario(env);
  for (let i = 1; i <= LIMITE_DIARIO; i++) {
    const r = await chamar(env, u.token, "POST");
    assert.equal(r.status, 200);
    assert.equal((await r.json()).restantes, LIMITE_DIARIO - i);
  }
  const r = await chamar(env, u.token, "POST");
  assert.equal(r.status, 429);
  const d = await r.json();
  assert.equal(d.ok, false); assert.equal(d.restantes, 0); assert.equal(d.usados, LIMITE_DIARIO);
  assert.equal((await (await chamar(env, u.token, "GET")).json()).restantes, 0);
});

test("no dia seguinte (Brasília) a conta volta a ter os 10", async () => {
  const env = ENV();
  const u = await usuario(env);
  for (let i = 0; i < LIMITE_DIARIO; i++) await registrarUso(env, u.usuario, T0);
  assert.equal((await registrarUso(env, u.usuario, T0)).ok, false);
  const amanha = T0 + 24 * 3_600_000;
  assert.notEqual(diaDeBrasilia(T0), diaDeBrasilia(amanha));
  const r = await registrarUso(env, u.usuario, amanha);
  assert.equal(r.ok, true); assert.equal(r.restantes, LIMITE_DIARIO - 1);
});

test("cada conta tem a sua contagem", async () => {
  const env = ENV();
  const a = await usuario(env, "a@exemplo.com"); const b = await usuario(env, "b@exemplo.com");
  for (let i = 0; i < LIMITE_DIARIO; i++) await registrarUso(env, a.usuario, T0);
  assert.equal((await registrarUso(env, a.usuario, T0)).ok, false);
  assert.equal((await situacao(env, b.usuario, T0)).restantes, LIMITE_DIARIO);
});

test("plano pago não tem limite", async () => {
  const env = ENV();
  const u = await usuario(env);
  const agora = Date.now();
  await env.DB.prepare("UPDATE lojas SET ativo_ate = ?, trial_fim = ? WHERE id = ?").bind(agora + 30 * 86_400_000, agora - 86_400_000, u.usuario.loja).run();
  for (let i = 0; i < LIMITE_DIARIO + 5; i++) assert.equal((await registrarUso(env, u.usuario, agora)).ok, true);
  const s = await situacao(env, u.usuario, agora);
  assert.equal(s.ilimitado, true); assert.equal(s.restantes, null);
});
