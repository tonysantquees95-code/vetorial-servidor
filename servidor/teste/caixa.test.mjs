import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { receberEntradas, listarEntradas, limparItem, dataDeBrasilia, tratarCaixa } from "../src/financas/caixa.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ORIGENS_PERMITIDAS: "https://app.exemplo" });
const AGORA = Date.now();
async function usuario(env, email = "loja@exemplo.com") {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: "Loja", dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Celular", plataforma: "android" } }, AGORA);
  return { id: r.usuario.id, token: r.token };
}
const venda = (n, extra = {}) => ({ ref: `venus:${n}`, tipo: "entrada", valorCentavos: 18990, cliente: "Maria Souza", pedido: String(n), quando: AGORA - 1000, ...extra });

test("cada venda paga entra uma única vez, mesmo reenviada", async () => {
  const env = ENV(); const u = await usuario(env);
  assert.deepEqual(await receberEntradas(env, u.id, [venda(1), venda(2)], AGORA), { ok: true, novos: 2, repetidos: 0, ignorados: 0 });
  const de_novo = await receberEntradas(env, u.id, [venda(1), venda(2), venda(3)], AGORA);
  assert.equal(de_novo.novos, 1); assert.equal(de_novo.repetidos, 2);
  const l = await listarEntradas(env, u.id, 0);
  assert.equal(l.itens.length, 3);
  assert.deepEqual(l.itens[0], { seq: l.itens[0].seq, ref: "venus:1", tipo: "entrada", valorCentavos: 18990, cliente: "Maria Souza", pedido: "1", data: dataDeBrasilia(AGORA - 1000) });
});

test("o Vyntem busca só o que ainda não viu (cursor)", async () => {
  const env = ENV(); const u = await usuario(env);
  await receberEntradas(env, u.id, [venda(1), venda(2)], AGORA);
  const a = await listarEntradas(env, u.id, 0);
  assert.equal((await listarEntradas(env, u.id, a.proximo)).itens.length, 0);
  await receberEntradas(env, u.id, [venda(3)], AGORA);
  const b = await listarEntradas(env, u.id, a.proximo);
  assert.deepEqual(b.itens.map((x) => x.ref), ["venus:3"]);
});

test("estorno só existe para venda que já entrou, e uma vez só", async () => {
  const env = ENV(); const u = await usuario(env);
  assert.equal((await receberEntradas(env, u.id, [venda(9, { tipo: "estorno" })], AGORA)).ignorados, 1);
  await receberEntradas(env, u.id, [venda(9)], AGORA);
  assert.equal((await receberEntradas(env, u.id, [venda(9, { tipo: "estorno" })], AGORA)).novos, 1);
  assert.equal((await receberEntradas(env, u.id, [venda(9, { tipo: "estorno" })], AGORA)).repetidos, 1);
  const l = await listarEntradas(env, u.id, 0);
  assert.deepEqual(l.itens.map((x) => x.tipo), ["entrada", "estorno"]);
});

test("cada conta vê só as suas vendas", async () => {
  const env = ENV(); const a = await usuario(env, "a@exemplo.com"); const b = await usuario(env, "b@exemplo.com");
  await receberEntradas(env, a.id, [venda(1)], AGORA);
  assert.equal((await listarEntradas(env, b.id, 0)).itens.length, 0);
});

test("item inválido é ignorado e não derruba o lote", async () => {
  assert.equal(limparItem({ ...venda(1), valorCentavos: 12.5 }), null);
  assert.equal(limparItem({ ...venda(1), valorCentavos: 0 }), null);
  assert.equal(limparItem({ ...venda(1), valorCentavos: -5 }), null);
  assert.equal(limparItem({ ...venda(1), ref: "../x y" }), null);
  assert.equal(limparItem({ ...venda(1), tipo: "pix" }), null);
  assert.equal(limparItem({ ...venda(1), quando: AGORA + 10 * 86_400_000 }, AGORA), null);
  const env = ENV(); const u = await usuario(env);
  const r = await receberEntradas(env, u.id, [venda(1), { lixo: true }, null, venda(2, { valorCentavos: 1.5 })], AGORA);
  assert.deepEqual([r.novos, r.ignorados], [1, 3]);
});

test("o endereço exige login e limita o tamanho do lote", async () => {
  const env = ENV(); const u = await usuario(env);
  const pedir = (token, metodo, corpo, q = "") => tratarCaixa(new Request(`https://v.test/financas/caixa${q}`, { method: metodo, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, new URL(`https://v.test/financas/caixa${q}`));
  assert.equal((await pedir("lixo", "GET")).status, 401);
  const grande = Array.from({ length: 101 }, (_, i) => venda(i + 1));
  assert.equal((await pedir(u.token, "POST", { itens: grande })).status, 413);
  assert.equal((await pedir(u.token, "POST", { itens: "x" })).status, 400);
  const ok = await pedir(u.token, "POST", { itens: [venda(1)] });
  assert.equal(ok.status, 200);
  assert.equal((await (await pedir(u.token, "GET", null, "?desde=0")).json()).itens.length, 1);
});

test("a data do lançamento é a de Brasília, não a de Greenwich", () => {
  assert.equal(dataDeBrasilia(Date.UTC(2026, 10, 22, 1, 30)), "2026-11-21"); // 22h30 do dia 21 em Brasília
  assert.equal(dataDeBrasilia(Date.UTC(2026, 10, 22, 12, 0)), "2026-11-22");
});
