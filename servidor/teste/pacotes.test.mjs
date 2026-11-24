import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { registrarLoja } from "../src/loja/lojas.js";
import { ANUAL, PACOTES, PROMO, appsLiberados, estadoDaAssinatura, iniciarCobranca, confirmarPagamento, pacoteDe, precoDoPacote } from "../src/loja/assinatura.js";

process.removeAllListeners("warning");
const DIA = 86_400_000;
const mk = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", MERCADOPAGO_ACCESS_TOKEN: "TEST-x" });

test("preços dos pacotes e pacote desconhecido vira Vênus", () => {
  assert.equal(PACOTES.venus.centavos, 4990);
  assert.equal(PACOTES.venus_vindex.centavos, 7000);
  assert.equal(PACOTES.venus_vortex.centavos, 7000);
  assert.equal(PACOTES.completo.centavos, 10000);
  assert.equal(pacoteDe("inventado"), "venus");
  assert.equal(pacoteDe("__proto__"), "venus");
});

test("teste grátis libera Vindex e Vortex; depois vale só o pacote pago", () => {
  const agora = 1_800_000_000_000;
  assert.deepEqual(appsLiberados({ trial_fim: agora + DIA, ativo_ate: 0 }, agora), { vindex: true, vortex: true, vyntem: true });
  assert.deepEqual(appsLiberados({ trial_fim: agora - DIA, ativo_ate: 0 }, agora), { vindex: false, vortex: false, vyntem: true });
  assert.deepEqual(appsLiberados({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "venus" }, agora), { vindex: false, vortex: false, vyntem: true });
  assert.deepEqual(appsLiberados({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "venus_vindex" }, agora), { vindex: true, vortex: false, vyntem: true });
  assert.deepEqual(appsLiberados({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "completo" }, agora), { vindex: true, vortex: true, vyntem: true });
  assert.deepEqual(appsLiberados({ plano: "dono", trial_fim: 0, ativo_ate: 0 }, agora), { vindex: true, vortex: true, vyntem: true });
});

test("cobrança recorrente usa o valor do pacote e guarda o pacote no pagamento", async () => {
  const env = mk();
  env.PROMO_FIM = "2020-01-01T00:00:00Z"; // promoção encerrada: valem os preços normais
  const l = await registrarLoja(env, { nome: "Loja" });
  const antes = globalThis.fetch;
  const corpos = [];
  globalThis.fetch = async (url, op) => { corpos.push(JSON.parse(op.body)); return new Response(JSON.stringify({ init_point: "https://mp.exemplo/assinar" }), { status: 201 }); };
  try {
    const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(l.id).first();
    const c = await iniciarCobranca(env, loja, "mercadopago", "https://v.test", Date.now(), "completo");
    assert.equal(corpos[0].auto_recurring.transaction_amount, 100);
    assert.equal(c.valorCentavos, 10000);
    assert.equal(c.pacote, "completo");
    const p = await env.DB.prepare("SELECT pacote, valor_centavos FROM pagamentos WHERE id = ?").bind(c.id).first();
    assert.equal(p.pacote, "completo");
    // pagamento menor que o do pacote não vale
    assert.equal(await confirmarPagamento(env, c.id, 4990, "x1"), false);
    const padrao = await iniciarCobranca(env, loja, "mercadopago", "https://v.test");
    assert.equal(padrao.pacote, "venus");
    assert.equal(corpos[1].auto_recurring.transaction_amount, 49.9);
  } finally { globalThis.fetch = antes; }
  const e = await estadoDaAssinatura(env, await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(l.id).first());
  assert.equal(e.pacotes.length, 7);
  assert.deepEqual(e.apps, { vindex: true, vortex: true, vyntem: true });
});

test("plano anual: R$ 499 por 365 dias, só para a Vênus, sem renovar sozinho", async () => {
  const env = mk();
  const l = await registrarLoja(env, { nome: "Loja anual" });
  const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(l.id).first();
  const antes = globalThis.fetch;
  const corpos = [];
  globalThis.fetch = async (url, op) => { corpos.push({ url, corpo: JSON.parse(op.body) }); return new Response(JSON.stringify({ init_point: "https://mp.exemplo/pagar" }), { status: 201 }); };
  try {
    assert.equal(ANUAL.centavos, 49900);
    await assert.rejects(() => iniciarCobranca(env, loja, "mercadopago", "https://v.test", Date.now(), "completo", "", "anual"), /só para a Vênus/);
    const c = await iniciarCobranca(env, loja, "mercadopago", "https://v.test", Date.now(), "venus", "", "anual");
    assert.ok(c.id.startsWith("anu_"));
    assert.equal(c.valorCentavos, 49900);
    // pagamento único (preferência), sem cartão de crédito e sem recorrência
    assert.equal(corpos[0].url, "https://api.mercadopago.com/checkout/preferences");
    assert.equal(corpos[0].corpo.items[0].unit_price, 499);
    assert.match(corpos[0].corpo.items[0].title, /365 dias/);
    assert.ok(corpos[0].corpo.payment_methods.excluded_payment_types.some((t) => t.id === "credit_card"));
    // menos do que R$ 499 não vale
    assert.equal(await confirmarPagamento(env, c.id, 4990, "a1"), false);
    // quem já teve o acesso liberado antes (2FA feito) ganha 365 dias na hora, somados ao que restava
    const agora = Date.now();
    await env.DB.prepare("UPDATE lojas SET ativo_ate = ? WHERE id = ?").bind(agora + 10 * DIA, l.id).run();
    assert.equal(await confirmarPagamento(env, c.id, 49900, "a2", agora), true);
    const depois = await env.DB.prepare("SELECT ativo_ate FROM lojas WHERE id = ?").bind(l.id).first();
    assert.equal(depois.ativo_ate, agora + 375 * DIA);
    const e = await estadoDaAssinatura(env, await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(l.id).first());
    assert.equal(e.anual.precoCentavos, 49900);
    assert.equal(e.anual.economiaCentavos, 9980);
  } finally { globalThis.fetch = antes; }
});

import { escolherVersao } from "../src/atualizacao.js";
test("atualização: escolhe a maior versão certa de cada app", () => {
  const lista = [
    { tag_name: "1.10", assets: [{ name: "Vindex.apk" }, { name: "VindexSetup.exe" }] },
    { tag_name: "1.12", assets: [{ name: "Vindex.apk" }, { name: "VindexSetup.exe" }] },
    { tag_name: "1.13", draft: true, assets: [{ name: "Vindex.apk" }] },
    { tag_name: "1.11", assets: [{ name: "Vindex.apk" }] },
    { tag_name: "win-1.7", assets: [{ name: "VenusSetup.exe" }] },
    { tag_name: "robo-1.3", assets: [{ name: "VenusRobo.apk" }] },
  ];
  assert.equal(escolherVersao(lista, "vindex-android").numero, 12);
  assert.equal(escolherVersao(lista, "vindex-windows").numero, 12);
  assert.equal(escolherVersao(lista, "windows").numero, 7);
  assert.equal(escolherVersao(lista, "robo").numero, 3);
  assert.equal(escolherVersao(lista, "venus").numero, 12); // 1.N sem filtro de arquivo extra: pega o APK
  assert.equal(escolherVersao(lista, "inexistente"), null);
  assert.equal(escolherVersao(lista, "__proto__"), null);
});

import { acessoLiberado } from "../src/loja/lojas.js";
test("Vortex e Vindex vendidos sozinhos: liberam só o app, não a Vênus", () => {
  const agora = 1_800_000_000_000;
  assert.equal(PACOTES.vortex.centavos, 2490);
  assert.equal(PACOTES.vindex_vortex.centavos, 5000);
  assert.deepEqual(appsLiberados({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "vortex" }, agora), { vindex: false, vortex: true, vyntem: true });
  assert.deepEqual(appsLiberados({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "vindex_vortex" }, agora), { vindex: true, vortex: true, vyntem: true });
  assert.equal(acessoLiberado({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "vortex" }, agora), false);
  assert.equal(acessoLiberado({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "venus_vortex" }, agora), true);
  assert.equal(acessoLiberado({ trial_fim: agora + DIA, ativo_ate: 0, pacote: "vortex" }, agora), true);
});

test("Mercado Pago: erro de conta de teste misturada com real vira explicação clara", async () => {
  const env = mk();
  const l = await registrarLoja(env, { nome: "Loja" });
  const antes = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Both payer and collector must be real or test users" }), { status: 400 });
  try {
    const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(l.id).first();
    await assert.rejects(() => iniciarCobranca(env, loja, "mercadopago", "https://v.test"), (e) => e.codigo === "mp_teste_e_real" || /PRODUÇÃO/.test(e.message));
  } finally { globalThis.fetch = antes; }
});

test("Pix/débito avulso: cria preferência só com Pix e débito; a 1ª vez espera o 2FA e as seguintes somam 30 dias sozinhas", async () => {
  const env = mk();
  env.PROMO_FIM = "2020-01-01T00:00:00Z";
  const l = await registrarLoja(env, { nome: "Loja" });
  const antes = globalThis.fetch;
  const pedidos = [];
  globalThis.fetch = async (url, op) => { pedidos.push({ url, corpo: JSON.parse(op.body) }); return new Response(JSON.stringify({ init_point: "https://mp.exemplo/pagar" }), { status: 201 }); };
  try {
    const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(l.id).first();
    const c = await iniciarCobranca(env, loja, "mercadopago", "https://v.test", Date.now(), "completo", "a@b.com", "avulso");
    assert.match(c.id, /^avu_/);
    assert.equal(c.forma, "avulso");
    assert.match(pedidos[0].url, /checkout\/preferences$/);
    assert.equal(pedidos[0].corpo.items[0].unit_price, 100);
    const excluidos = pedidos[0].corpo.payment_methods.excluded_payment_types.map((x) => x.id);
    assert.ok(excluidos.includes("credit_card") && !excluidos.includes("pix"));
    // primeira vez: fica "pago" esperando a liberação com o 2FA
    assert.equal(await confirmarPagamento(env, c.id, 10000, "p1"), true);
    assert.equal((await env.DB.prepare("SELECT status FROM pagamentos WHERE id = ?").bind(c.id).first()).status, "pago");
    // já liberada antes (ativo_ate): o próximo avulso soma 30 dias sozinho
    const agora = Date.now();
    await env.DB.prepare("UPDATE lojas SET ativo_ate = ? WHERE id = ?").bind(agora + 86_400_000, l.id).run();
    const loja2 = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(l.id).first();
    const c2 = await iniciarCobranca(env, loja2, "mercadopago", "https://v.test", agora, "venus", "a@b.com", "avulso");
    assert.equal(await confirmarPagamento(env, c2.id, 4990, "p2", agora), true);
    const depois = await env.DB.prepare("SELECT ativo_ate, pacote FROM lojas WHERE id = ?").bind(l.id).first();
    assert.equal(depois.ativo_ate, agora + 86_400_000 + 30 * 86_400_000);
    assert.equal((await env.DB.prepare("SELECT status FROM pagamentos WHERE id = ?").bind(c2.id).first()).status, "liberado");
    // o mesmo aviso de novo não soma duas vezes
    assert.equal(await confirmarPagamento(env, c2.id, 4990, "p2", agora), true);
    assert.equal((await env.DB.prepare("SELECT ativo_ate FROM lojas WHERE id = ?").bind(l.id).first()).ativo_ate, depois.ativo_ate);
  } finally { globalThis.fetch = antes; }
});

test("promoção de lançamento: suíte a R$ 49,90 com 6 cobranças, preço travado por 6 meses para quem assinou, normal depois", async () => {
  const env = mk();
  const fim = Date.parse("2026-12-16T23:59:59-03:00");
  const dentro = fim - 10 * DIA;
  const l = await registrarLoja(env, { nome: "Loja" });
  const outra = await registrarLoja(env, { nome: "Outra" });
  const antes = globalThis.fetch;
  const corpos = [];
  globalThis.fetch = async (url, op) => { corpos.push(JSON.parse(op.body)); return new Response(JSON.stringify({ init_point: "https://mp.exemplo/x" }), { status: 201 }); };
  try {
    const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(l.id).first();
    // dentro da promoção: o completo custa 49,90, os outros pacotes seguem normais
    assert.deepEqual((({ centavos, promo }) => ({ centavos, promo }))(await precoDoPacote(env, loja, "completo", dentro)), { centavos: 4990, promo: true });
    assert.equal((await precoDoPacote(env, loja, "venus_vindex", dentro)).centavos, 7000);
    const c = await iniciarCobranca(env, loja, "mercadopago", "https://v.test", dentro, "completo", "a@b.com");
    assert.equal(corpos[0].auto_recurring.transaction_amount, 49.9);
    assert.equal(corpos[0].auto_recurring.repetitions, PROMO.meses);
    assert.equal(c.valorCentavos, 4990);
    // o estado mostra o preço de promoção e o preço cheio
    const e = await estadoDaAssinatura(env, loja, dentro);
    assert.equal(e.promocao.meses, 6);
    assert.deepEqual(e.pacotes.find((p) => p.chave === "completo"), { chave: "completo", nome: "Vênus + Vindex + Vortex", precoCentavos: 4990, precoCheioCentavos: 10000, promocao: true });
    // pagou durante a promoção: depois do fim, o preço continua 49,90 por 6 meses
    await confirmarPagamento(env, c.id, 4990, "m1", dentro);
    const depois = fim + 20 * DIA;
    assert.equal((await precoDoPacote(env, loja, "completo", depois)).centavos, 4990);
    assert.equal((await precoDoPacote(env, loja, "completo", depois)).promo, true);
    // passados os 6 meses do primeiro pagamento: preço normal
    assert.equal((await precoDoPacote(env, loja, "completo", dentro + 200 * DIA)).centavos, 10000);
    // quem nunca assinou na promoção paga o preço normal depois do fim
    const lojaOutra = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(outra.id).first();
    assert.equal((await precoDoPacote(env, lojaOutra, "completo", depois)).centavos, 10000);
    assert.equal((await estadoDaAssinatura(env, lojaOutra, depois)).promocao, null);
  } finally { globalThis.fetch = antes; }
});
