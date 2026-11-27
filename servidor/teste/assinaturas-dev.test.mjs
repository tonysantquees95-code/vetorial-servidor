import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { verificarPagamentos, resumoDeAssinaturas, inicioDoMes } from "../src/dev/assinaturas.js";
import { listarAlertas } from "../src/dev/alertas.js";

const T = Date.UTC(2026, 10, 27, 15, 0, 0);
const DIA = 86400000;
async function conta(env, id, email, { plano = "fundadores", ativo = 0, trial = 0, pacote = "venus" } = {}) {
  await env.DB.prepare("INSERT INTO lojas (id, token_hash, nome, criado, trial_fim, plano, ativo_ate, pacote) VALUES (?, ?, 'L', ?, ?, ?, ?, ?)").bind(id, "h" + id, T - 30 * DIA, trial, plano, ativo, pacote).run();
  await env.DB.prepare("INSERT INTO usuarios (id, email, nome, senha_hash, salt, loja, criado) VALUES (?, ?, 'N', 'x', 'y', ?, ?)").bind("u" + id, email, id, T - 30 * DIA).run();
}
const pagto = (env, id, loja, status, quando, valor = 4990, gateway = "mercadopago", pacote = "venus") =>
  env.DB.prepare("INSERT INTO pagamentos (id, loja, gateway, valor_centavos, status, criado, atualizado, pacote) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, loja, gateway, valor, status, quando, quando, pacote).run();

test("assinaturas: pagamento confirmado vira um aviso só, e aguardando não avisa", async () => {
  const env = { DB: bancoDeTeste() };
  await conta(env, "l1", "ana@teste.com", { ativo: T + 10 * DIA });
  await pagto(env, "p1", "l1", "liberado", T - 600000, 4990, "mercadopago");
  await pagto(env, "p2", "l1", "aguardando", T - 600000);
  await pagto(env, "p3", "l1", "liberado", T - 5 * 3600000); // antigo: já passou da janela
  assert.equal(await verificarPagamentos(env, T), 1);
  assert.equal(await verificarPagamentos(env, T), 0); // não repete
  const { alertas } = await listarAlertas(env);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].tipo, "pagamento");
  assert.equal(alertas[0].titulo, "Pagamento recebido: R$ 49,90");
  assert.match(alertas[0].detalhe, /ana@teste\.com · Vênus · Mercado Pago/);
});

test("assinaturas: resumo separa assinantes, teste, vencidos, testadores e dono; receita é do mês", async () => {
  const env = { DB: bancoDeTeste() };
  await conta(env, "a", "a@x.com", { ativo: T + 20 * DIA });
  await conta(env, "b", "b@x.com", { ativo: T + 3 * DIA, pacote: "completo" });
  await conta(env, "c", "c@x.com", { plano: "trial", trial: T + 2 * DIA });
  await conta(env, "d", "d@x.com", { ativo: T - 2 * DIA });
  await conta(env, "e", "e@x.com", { plano: "sem_teste" });
  await conta(env, "f", "f@x.com", { plano: "testador", ativo: T + 999 * DIA });
  await conta(env, "g", "g@x.com", { plano: "dono", ativo: T + 999 * DIA });
  await env.DB.prepare("INSERT INTO testadores (email, criado) VALUES ('f@x.com', 1)").run();
  await pagto(env, "m1", "a", "liberado", T - 2 * DIA, 4990);
  await pagto(env, "m2", "b", "pago", T - DIA, 10000, "infinitepay", "completo");
  await pagto(env, "velho", "a", "liberado", inicioDoMes(T) - DIA, 4990); // mês passado
  const r = await resumoDeAssinaturas(env, T);
  assert.equal(r.assinantes, 2); assert.equal(r.emTeste, 1); assert.equal(r.venceram, 1); assert.equal(r.semTeste, 1); assert.equal(r.testadores, 1); assert.equal(r.vencendoEm7, 1);
  assert.deepEqual(r.mes, { pagamentos: 2, centavos: 14990 });
  assert.equal(r.recentes[0].aguardandoLiberacao, true);
  assert.equal(r.recentes[0].pacote, "Vênus + Vindex + Vortex");
  assert.equal(r.pacotes.length, 2);
});

import { tratarLoja } from "../src/loja/rotas.js";
import { hmacHex } from "../src/loja/cripto.js";

test("assinaturas: recusa, estorno e cancelamento no Mercado Pago avisam o Painel Dev (uma vez só) e não liberam acesso", async () => {
  const env = { DB: bancoDeTeste(), MERCADOPAGO_ACCESS_TOKEN: "tk", MERCADOPAGO_WEBHOOK_SECRET: "wh" };
  await conta(env, "l1", "ana@teste.com", { ativo: T + 10 * DIA });
  await pagto(env, "ref1", "l1", "aguardando", T);
  const orig = globalThis.fetch;
  let mp = {};
  globalThis.fetch = async (url) => {
    url = String(url);
    const r = (d) => new Response(JSON.stringify(d));
    if (url.includes("/v1/payments/")) return r({ id: 9, status: mp.pagamento, status_detail: "cc_rejected_insufficient_amount", external_reference: "ref1", transaction_amount: 49.9 });
    if (url.includes("/authorized_payments/")) return r({ id: 7, status: mp.cobranca, retry_attempt: 1, preapproval_id: "pre1", payment: { status: "rejected", status_detail: "cc_rejected_other_reason" }, transaction_amount: 49.9 });
    if (url.includes("/preapproval/")) return r({ id: "pre1", status: mp.assinatura, external_reference: "ref1" });
    return new Response("{}", { status: 500 });
  };
  const aviso = async (type, id) => {
    const ts = "1700000000";
    const sig = await hmacHex("wh", `id:${id};request-id:r1;ts:${ts};`);
    const req = new Request("https://x.test/assinatura/webhook/mercadopago", { method: "POST", headers: { "x-signature": `ts=${ts},v1=${sig}`, "x-request-id": "r1" }, body: JSON.stringify({ type, data: { id } }) });
    return (await tratarLoja(req, env, {}, new URL(req.url), "/assinatura/webhook/mercadopago")).status;
  };
  try {
    mp = { pagamento: "rejected" };
    assert.equal(await aviso("payment", "9"), 200); assert.equal(await aviso("payment", "9"), 200);
    mp = { cobranca: "recycling", assinatura: "authorized" };
    assert.equal(await aviso("subscription_authorized_payment", "7"), 200);
    mp = { assinatura: "cancelled" };
    assert.equal(await aviso("subscription_preapproval", "pre1"), 200);
    mp = { assinatura: "authorized" };
    assert.equal(await aviso("subscription_preapproval", "pre1"), 200); // ativa: nada a avisar
    const { alertas } = await listarAlertas(env);
    assert.deepEqual(alertas.map((a) => a.titulo).sort(), ["Assinatura cancelada", "Cobrança da assinatura recusada", "Pagamento recusado"]);
    assert.ok(alertas.every((a) => a.tipo === "cobranca" && /ana@teste\.com/.test(a.detalhe)));
    const p = env.DB._db.prepare("SELECT status FROM pagamentos WHERE id = 'ref1'").get();
    assert.equal(p.status, "aguardando"); // nenhum desses avisos libera nada
  } finally { globalThis.fetch = orig; }
});
