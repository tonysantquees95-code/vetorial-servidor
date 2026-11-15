import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { registrarLoja } from "../src/loja/lojas.js";
import { PACOTES, appsLiberados, estadoDaAssinatura, iniciarCobranca, confirmarPagamento, pacoteDe } from "../src/loja/assinatura.js";

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
  assert.deepEqual(appsLiberados({ trial_fim: agora + DIA, ativo_ate: 0 }, agora), { vindex: true, vortex: true });
  assert.deepEqual(appsLiberados({ trial_fim: agora - DIA, ativo_ate: 0 }, agora), { vindex: false, vortex: false });
  assert.deepEqual(appsLiberados({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "venus" }, agora), { vindex: false, vortex: false });
  assert.deepEqual(appsLiberados({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "venus_vindex" }, agora), { vindex: true, vortex: false });
  assert.deepEqual(appsLiberados({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "completo" }, agora), { vindex: true, vortex: true });
  assert.deepEqual(appsLiberados({ plano: "dono", trial_fim: 0, ativo_ate: 0 }, agora), { vindex: true, vortex: true });
});

test("cobrança recorrente usa o valor do pacote e guarda o pacote no pagamento", async () => {
  const env = mk();
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
  assert.deepEqual(e.apps, { vindex: true, vortex: true });
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
  assert.deepEqual(appsLiberados({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "vortex" }, agora), { vindex: false, vortex: true });
  assert.deepEqual(appsLiberados({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "vindex_vortex" }, agora), { vindex: true, vortex: true });
  assert.equal(acessoLiberado({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "vortex" }, agora), false);
  assert.equal(acessoLiberado({ trial_fim: 0, ativo_ate: agora + DIA, pacote: "venus_vortex" }, agora), true);
  assert.equal(acessoLiberado({ trial_fim: agora + DIA, ativo_ate: 0, pacote: "vortex" }, agora), true);
});
