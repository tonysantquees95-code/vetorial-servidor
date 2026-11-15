import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { tratarCofre, ehRotaCofre } from "../src/vindex/cofre.js";

process.removeAllListeners("warning");
const T0 = Date.now();
const disp = { id: "aparelho-1-xxxxxxxx", nome: "Celular", plataforma: "android" };

async function mundo(email = "pessoa@exemplo.com") {
  const env = { DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123" };
  const c = await cadastrar(env, { email, senha: "senha-forte-1", nome: "P", dispositivo: disp }, T0);
  return { env, token: c.token };
}
const chamar = (env, token, metodo, caminho, corpo) => {
  const q = new Request("https://v.test" + caminho, { method: metodo, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return tratarCofre(q, env, new URL(q.url), new URL(q.url).pathname, T0 + 1000);
};

test("rota do cofre pessoal não confunde com o cofre de chaves do Painel Dev", () => {
  assert.equal(ehRotaCofre("/cofre"), true);
  assert.equal(ehRotaCofre("/cofre/pacote"), true);
  assert.equal(ehRotaCofre("/dev/cofre/estado"), false);
});

test("sem login não abre", async () => {
  const { env } = await mundo();
  const r = await chamar(env, "falso", "GET", "/cofre");
  assert.equal(r.status, 401);
});

test("cria, lê, atualiza e guarda a cópia anterior", async () => {
  const { env, token } = await mundo();
  assert.equal((await (await chamar(env, token, "GET", "/cofre")).json()).existe, false);
  assert.equal((await chamar(env, token, "GET", "/cofre/pacote")).status, 404);
  const a = await chamar(env, token, "PUT", "/cofre", { pacote: "pacote-A", base: 0 });
  assert.equal(a.status, 201);
  assert.equal((await a.json()).versao, 1);
  const l = await (await chamar(env, token, "GET", "/cofre/pacote")).json();
  assert.equal(l.pacote, "pacote-A");
  const b = await chamar(env, token, "PUT", "/cofre", { pacote: "pacote-B", base: 1 });
  assert.equal((await b.json()).versao, 2);
  const linha = env.DB._db.prepare("SELECT pacote, anterior, versao FROM cofre_pessoal").get();
  assert.equal(linha.pacote, "pacote-B");
  assert.equal(linha.anterior, "pacote-A");
  assert.equal(linha.versao, 2);
});

test("versão velha leva 409 e nada é sobrescrito", async () => {
  const { env, token } = await mundo();
  await chamar(env, token, "PUT", "/cofre", { pacote: "um", base: 0 });
  await chamar(env, token, "PUT", "/cofre", { pacote: "dois", base: 1 });
  const velho = await chamar(env, token, "PUT", "/cofre", { pacote: "do-outro-celular", base: 1 });
  assert.equal(velho.status, 409);
  assert.equal((await (await chamar(env, token, "GET", "/cofre/pacote")).json()).pacote, "dois");
  const novo = await chamar(env, token, "PUT", "/cofre", { pacote: "novo-de-novo", base: 0 });
  assert.equal(novo.status, 409);
});

test("recusa pacote vazio, com caracteres estranhos, grande demais ou sem base", async () => {
  const { env, token } = await mundo();
  assert.equal((await chamar(env, token, "PUT", "/cofre", { pacote: "", base: 0 })).status, 400);
  assert.equal((await chamar(env, token, "PUT", "/cofre", { pacote: "<script>", base: 0 })).status, 400);
  assert.equal((await chamar(env, token, "PUT", "/cofre", { pacote: "abc" })).status, 400);
  assert.equal((await chamar(env, token, "PUT", "/cofre", { pacote: "a".repeat(1024 * 1024 + 10), base: 0 })).status, 413);
});

test("cada conta só enxerga o próprio cofre", async () => {
  const a = await mundo("a@exemplo.com");
  await chamar(a.env, a.token, "PUT", "/cofre", { pacote: "segredo-da-a", base: 0 });
  const c = await cadastrar(a.env, { email: "b@exemplo.com", senha: "senha-forte-1", nome: "B", dispositivo: { ...disp, id: "aparelho-2-yyyyyyyy" } }, T0);
  assert.equal((await (await chamar(a.env, c.token, "GET", "/cofre")).json()).existe, false);
  assert.equal((await chamar(a.env, c.token, "GET", "/cofre/pacote")).status, 404);
});

test("assinatura vencida: ainda lê, mas não grava; apagar exige confirmação", async () => {
  const { env, token } = await mundo();
  await chamar(env, token, "PUT", "/cofre", { pacote: "um", base: 0 });
  env.DB._db.exec("UPDATE lojas SET plano = 'basico', ativo_ate = 0, trial_fim = 0");
  const g = await chamar(env, token, "PUT", "/cofre", { pacote: "dois", base: 1 });
  assert.equal(g.status, 402);
  assert.equal((await chamar(env, token, "GET", "/cofre/pacote")).status, 200);
  assert.equal((await chamar(env, token, "DELETE", "/cofre", {})).status, 400);
  assert.equal((await chamar(env, token, "DELETE", "/cofre", { confirmar: "APAGAR" })).status, 200);
  assert.equal((await (await chamar(env, token, "GET", "/cofre")).json()).existe, false);
});
