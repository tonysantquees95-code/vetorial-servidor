import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { registrarLoja, lojaDoPedido, acessoLiberado, slugDe } from "../src/loja/lojas.js";
import { cifrar, decifrar, hmacHex } from "../src/loja/cripto.js";
import { tratarLoja } from "../src/loja/rotas.js";
import { aplicarPedido } from "../src/loja/estoque.js";
import { sincronizarProdutos, conectarCanal } from "../src/loja/sincronia.js";
import { nuvemshop } from "../src/canais/nuvemshop.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", NUVEMSHOP_APP_ID: "77", NUVEMSHOP_APP_SECRET: "segredo-ns", ML_APP_ID: "9", ML_APP_SECRET: "sml" });
const ORIGEM = "https://venus.test";

/** Plataformas de mentira: guardam o estoque e registram as chamadas. */
function plataformas() {
  const est = { ns: { 1: 10 }, prop: { P1: 10 } };
  const chamadas = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, op = {}) => {
    url = String(url);
    chamadas.push(`${op.method || "GET"} ${url}`);
    const r = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
    if (url.startsWith("https://api.nuvemshop.com.br/v1/55/store")) return r({ id: 55 });
    if (url.includes("/webhooks") && (op.method || "GET") === "GET") return r([]);
    if (url.includes("/webhooks")) return r({ id: 1 });
    if (url.includes("/products?")) return url.includes("page=1") ? r([{ id: 100, name: { pt: "Vela" }, published: true, variants: [{ id: 1, sku: "VELA", price: "29.90", stock: est.ns[1] }], images: [{ src: "x.jpg" }], categories: [{ name: { pt: "Velas" } }], attributes: [], }]) : r({}, 404);
    if (url.match(/\/products\/100\/variants\/1$/) && op.method === "PUT") { est.ns[1] = JSON.parse(op.body).stock; return r({}); }
    if (url.includes("https://loja.exemplo.com/produtos")) return r([{ id: "P1", sku: "VELA", nome: "Vela", preco: 29.9, estoque: est.prop.P1 }]);
    if (url.includes("https://loja.exemplo.com/estoque")) { est.prop[JSON.parse(op.body).id] = JSON.parse(op.body).estoque; return r({}); }
    if (url.includes("https://loja.exemplo.com/webhooks")) return r({});
    if (url.match(/orders\/(\d+)$/) && url.includes("nuvemshop")) return r(est.pedidoNs);
    return r({ error: "sem mock " + url }, 500);
  };
  return { est, chamadas, restaurar: () => (globalThis.fetch = orig) };
}

async function novaLoja(env) {
  const r = await registrarLoja(env, { nome: "Minha Loja" });
  return { ...r, loja: await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(r.id).first() };
}
const req = (metodo, caminho, token, corpo) =>
  new Request(`${ORIGEM}${caminho}`, { method: metodo, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
const chamar = async (env, metodo, caminho, token, corpo) => {
  const q = req(metodo, caminho, token, corpo);
  return tratarLoja(q, env, { waitUntil() {} }, new URL(q.url), new URL(q.url).pathname);
};

test("cofre cifra e decifra, e não aceita chave curta", async () => {
  const env = ENV();
  const t = await cifrar(env, { token: "abc" });
  assert.ok(!t.includes("abc"));
  assert.deepEqual(await decifrar(env, t), { token: "abc" });
  await assert.rejects(() => cifrar({ CHAVE_COFRE: "curta" }, {}));
});

test("cadastro dá 7 dias de teste e o token só vale para a própria loja", async () => {
  const env = ENV();
  const a = await novaLoja(env);
  assert.equal(a.slug, "minha-loja");
  assert.ok(acessoLiberado(a.loja));
  assert.ok(!acessoLiberado(a.loja, Date.now() + 8 * 86400000));
  const b = await registrarLoja(env, { nome: "Minha Loja" });
  assert.notEqual(b.slug, a.slug);
  const l = await lojaDoPedido(env, req("GET", "/x", a.token));
  assert.equal(l.id, a.id);
  await assert.rejects(() => lojaDoPedido(env, req("GET", "/x", "vl_" + "0".repeat(48))));
  assert.equal(slugDe("Ação & Café!"), "acao-cafe");
});

test("conecta site próprio e Nuvemshop, importa produtos e recusa endereço inseguro", async () => {
  const env = ENV();
  const p = plataformas();
  try {
    const { token } = await novaLoja(env);
    let r = await chamar(env, "POST", "/canais", token, { plataforma: "nuvemshop", loja: "55", token: "tk" });
    assert.equal(r.status, 201);
    r = await chamar(env, "POST", "/canais", token, { plataforma: "proprio", url: "https://loja.exemplo.com", chave: "chave-secreta-1" });
    assert.equal(r.status, 201);
    const prods = await (await chamar(env, "GET", "/produtos", token)).json();
    assert.equal(prods.produtos.length, 1); // mesmo SKU nos dois canais = um produto central
    assert.equal(prods.produtos[0].preco_centavos, 2990);
    r = await chamar(env, "POST", "/canais", token, { plataforma: "proprio", url: "http://localhost:3000", chave: "chave-secreta-2" });
    assert.equal(r.status, 400); // endereço inseguro
    const canais = await (await chamar(env, "GET", "/canais", token)).json();
    assert.equal(canais.canais.length, 2);
    assert.ok(!JSON.stringify(canais).includes("tk"), "credenciais não saem do servidor");
  } finally { p.restaurar(); }
});

test("sem token ou com teste vencido a loja não mexe nos canais", async () => {
  const env = ENV();
  assert.equal((await chamar(env, "GET", "/canais", null)).status, 401);
  const { token, id } = await novaLoja(env);
  await env.DB.prepare("UPDATE lojas SET trial_fim = 1 WHERE id = ?").bind(id).run();
  const r = await chamar(env, "POST", "/canais", token, { plataforma: "proprio", url: "https://loja.exemplo.com", chave: "chave-secreta-1" });
  assert.equal(r.status, 402);
});

async function cenario(env) {
  const { loja } = await novaLoja(env);
  const a = await conectarCanal(env, loja, "nuvemshop", { credenciais: { token: "tk", loja: "55" }, conta: "55" }, ORIGEM);
  const b = await conectarCanal(env, loja, "proprio", { credenciais: { url: "https://loja.exemplo.com", chave: "chave-secreta-1" }, conta: "loja.exemplo.com" }, ORIGEM);
  await sincronizarProdutos(env, a.canal);
  await sincronizarProdutos(env, b.canal);
  return { loja, ns: a.canal, prop: b.canal };
}
const pedidoNs = (status) => ({ ref: "900", status, total_centavos: 5980, taxa_centavos: 0, criado: Date.now(), itens: [{ ref: "100", variante: "1", sku: "VELA", quantidade: 2 }] });
const saldo = async (env) => (await env.DB.prepare("SELECT estoque FROM produtos WHERE sku = 'VELA'").first()).estoque;

test("venda numa plataforma baixa o saldo central e avisa a outra", async () => {
  const env = ENV(); const p = plataformas();
  try {
    const { ns } = await cenario(env);
    const r = await aplicarPedido(env, ns, pedidoNs("pago"));
    assert.equal(await saldo(env), 8);
    assert.equal(p.est.prop.P1, 8); // o site próprio foi atualizado
    assert.equal(r.envios.length, 1); // a Nuvemshop (origem) não recebe de volta
    await aplicarPedido(env, ns, pedidoNs("pago")); // o mesmo aviso de novo (webhook repetido)
    assert.equal(await saldo(env), 8);
  } finally { p.restaurar(); }
});

test("cancelamento, devolução e reembolso repõem uma vez só e atualizam todos os canais", async () => {
  for (const motivo of ["cancelado", "devolvido", "reembolsado"]) {
    const env = ENV(); const p = plataformas();
    try {
      const { ns } = await cenario(env);
      await aplicarPedido(env, ns, pedidoNs("pago"));
      assert.equal(await saldo(env), 8);
      const r = await aplicarPedido(env, ns, pedidoNs(motivo));
      assert.equal(await saldo(env), 10, motivo);
      assert.equal(p.est.prop.P1, 10, motivo);
      assert.equal(p.est.ns[1], 10, motivo); // a origem também recebe o saldo certo
      assert.equal(r.mudancas[0].tipo, "reposicao");
      await aplicarPedido(env, ns, pedidoNs(motivo));
      assert.equal(await saldo(env), 10, "segundo aviso não repõe de novo");
      const ev = await env.DB.prepare("SELECT tipo FROM eventos_estoque WHERE chave LIKE 'reposicao:%'").first();
      assert.equal(ev.tipo, { cancelado: "cancelamento", devolvido: "devolucao", reembolsado: "reembolso" }[motivo]);
    } finally { p.restaurar(); }
  }
});

test("cancelar um pedido que nunca baixou o saldo não inventa estoque", async () => {
  const env = ENV(); const p = plataformas();
  try {
    const { ns } = await cenario(env);
    await aplicarPedido(env, ns, pedidoNs("cancelado"));
    assert.equal(await saldo(env), 10);
  } finally { p.restaurar(); }
});

test("pedido histórico só guarda o evento: o saldo importado já o reflete, mas dá para repor se cancelar", async () => {
  const env = ENV(); const p = plataformas();
  try {
    const { ns } = await cenario(env);
    await aplicarPedido(env, ns, pedidoNs("pago"), { historico: true });
    assert.equal(await saldo(env), 10);
    await aplicarPedido(env, ns, pedidoNs("cancelado"));
    assert.equal(await saldo(env), 12);
  } finally { p.restaurar(); }
});

test("webhook da Nuvemshop: assinatura errada = 401, certa = reposição", async () => {
  const env = ENV(); const p = plataformas();
  try {
    const { ns } = await cenario(env);
    await aplicarPedido(env, ns, pedidoNs("pago"));
    const { segredoDoCanal } = await import("../src/loja/cripto.js");
    const url = `/webhook/nuvemshop/${ns.id}/${await segredoDoCanal(env, ns.id)}`;
    const corpo = JSON.stringify({ store_id: 55, event: "order/cancelled", id: 900 });
    p.est.pedidoNs = { id: 900, status: "cancelled", total: "59.80", created_at: new Date().toISOString(), products: [{ product_id: 100, variant_id: 1, sku: "VELA", quantity: 2 }] };
    const ruim = new Request(ORIGEM + url, { method: "POST", headers: { "x-linkedstore-hmac-sha256": "00" }, body: corpo });
    assert.equal((await tratarLoja(ruim, env, {}, new URL(ruim.url), url)).status, 401);
    const boa = new Request(ORIGEM + url, { method: "POST", headers: { "x-linkedstore-hmac-sha256": await hmacHex("segredo-ns", corpo) }, body: corpo });
    const r = await tratarLoja(boa, env, {}, new URL(boa.url), url);
    assert.equal(r.status, 200);
    assert.equal(await saldo(env), 10);
    const errado = new Request(ORIGEM + `/webhook/nuvemshop/${ns.id}/${"a".repeat(32)}`, { method: "POST", body: corpo });
    assert.equal((await tratarLoja(errado, env, {}, new URL(errado.url), new URL(errado.url).pathname)).status, 404);
  } finally { p.restaurar(); }
});

test("nuvemshop: normaliza produto com variações e pedido cancelado", () => {
  const itens = nuvemshop.normalizarProduto({ id: 1, name: { pt: "Camisa" }, published: false, variants: [{ id: 5, sku: "C-P", price: "10.00", stock: 3, values: [{ pt: "P" }] }, { id: 6, sku: "C-M", price: "10.00", stock: null, values: [{ pt: "M" }] }], images: [] });
  assert.equal(itens.length, 2);
  assert.equal(itens[0].nome, "Camisa (P)");
  assert.equal(itens[0].oculto, true);
  assert.equal(itens[1].estoque_ilimitado, true);
  assert.equal(nuvemshop.statusDoPedido({ status: "open", payment_status: "refunded" }), "reembolsado");
  assert.equal(nuvemshop.statusDoPedido({ status: "cancelled" }), "cancelado");
});
