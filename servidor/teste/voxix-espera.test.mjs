import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { emailValido, entrarNaEspera, LIMITE_ESPERA_DIA } from "../src/voxix/espera.js";
import { tratarVoxix } from "../src/voxix/rotas.js";

process.removeAllListeners("warning");
const T0 = 1_800_000_000_000;
const erro = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para falhar"); };
const chamar = (env, corpo, metodo = "POST") => tratarVoxix(new Request("https://v.test/voxix/espera", { method: metodo, headers: { "content-type": "application/json" }, body: metodo === "POST" ? JSON.stringify(corpo) : undefined }), env, new URL("https://v.test/voxix/espera"), "/voxix/espera");

test("e-mail: aceita os normais e recusa os quebrados", () => {
  assert.equal(emailValido("  Toni@Exemplo.COM "), "toni@exemplo.com");
  assert.equal(emailValido("a.b+voxix@mail.com.br"), "a.b+voxix@mail.com.br");
  for (const ruim of ["", "toni", "toni@", "@mail.com", "a b@mail.com", "toni@mail", "a..b@mail.com", "x".repeat(130) + "@mail.com", null, undefined, 42]) {
    assert.throws(() => emailValido(ruim), (e) => e.codigo === "email_invalido" || e.code === "email_invalido" || e.status === 400);
  }
});

test("entra na lista, sem duplicar e sem guardar mais nada além do e-mail e da data", async () => {
  const env = { DB: bancoDeTeste() };
  await entrarNaEspera(env, { email: "Ana@Mail.com" }, T0);
  await entrarNaEspera(env, { email: "ana@mail.com" }, T0 + 1000);
  const { results } = await env.DB.prepare("SELECT * FROM voxix_espera").all();
  assert.equal(results.length, 1);
  assert.deepEqual(Object.keys(results[0]).sort(), ["criado", "email"]);
  assert.equal(results[0].email, "ana@mail.com");
  assert.equal(results[0].criado, T0);
});

test("a resposta é a mesma para e-mail novo e repetido (ninguém descobre quem está na lista)", async () => {
  const env = { DB: bancoDeTeste() };
  const a = await chamar(env, { email: "x@mail.com" });
  const b = await chamar(env, { email: "x@mail.com" });
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  assert.deepEqual(await a.json(), await b.json());
});

test("campo escondido preenchido (robô) finge que deu certo e não guarda", async () => {
  const env = { DB: bancoDeTeste() };
  const r = await chamar(env, { email: "robo@mail.com", site: "http://spam" });
  assert.equal(r.status, 201);
  const { results } = await env.DB.prepare("SELECT * FROM voxix_espera").all();
  assert.equal(results.length, 0);
});

test("e-mail inválido na rota volta 400 e não guarda", async () => {
  const env = { DB: bancoDeTeste() };
  const r = await chamar(env, { email: "isso-nao-e-email" });
  assert.equal(r.status, 400);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM voxix_espera").first()).n, 0);
});

test("trava por dia e libera no dia seguinte", async () => {
  const env = { DB: bancoDeTeste() };
  for (let i = 0; i < LIMITE_ESPERA_DIA; i++) await entrarNaEspera(env, { email: `p${i}@mail.com` }, T0);
  const e = await erro(entrarNaEspera(env, { email: "extra@mail.com" }, T0));
  assert.equal(e.status, 429);
  await entrarNaEspera(env, { email: "extra@mail.com" }, T0 + 24 * 3600 * 1000);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM voxix_espera").first()).n, LIMITE_ESPERA_DIA + 1);
});

test("a rota não pede login e corpo gigante é recusado", async () => {
  const env = { DB: bancoDeTeste() };
  const r = await chamar(env, { email: "sem@login.com" });
  assert.equal(r.status, 201);
  const g = await chamar(env, { email: "a@mail.com", lixo: "x".repeat(5000) });
  assert.equal(g.status, 413);
});
