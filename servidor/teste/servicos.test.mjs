import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { registrarLoja } from "../src/loja/lojas.js";
import { tratarLoja } from "../src/loja/rotas.js";
import { codigoTotp, conferirTotp, base32, deBase32 } from "../src/loja/totp.js";
import { auditar, financeiro } from "../src/loja/bi.js";
import { lerSugestao, candidatos, limparHashtags } from "../src/loja/marketing.js";
import { hmacHex } from "../src/loja/cripto.js";

process.removeAllListeners("warning");
const ORIGEM = "https://venus.test";
const mk = (extra = {}) => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ...extra });
const chamar = async (env, metodo, caminho, token, corpo, cab = {}) => {
  const q = new Request(ORIGEM + caminho, { method: metodo, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...cab }, body: corpo ? JSON.stringify(corpo) : undefined });
  const u = new URL(q.url);
  return tratarLoja(q, env, { waitUntil() {} }, u, u.pathname);
};
const prod = (env, loja, sku, nome, preco, est, promo = null, oculto = 0) =>
  env.DB.prepare("INSERT INTO produtos (loja, sku, nome, preco_centavos, estoque, oculto, atualizado, promocao_centavos, categoria, atributos) VALUES (?,?,?,?,?,?,?,?, 'Velas', '{\"Cor\":\"Rosa\"}')").bind(loja, sku, nome, preco, est, oculto, Date.now(), promo).run();

test("TOTP bate com os vetores da RFC 6238 (SHA-1)", async () => {
  const segredo = base32(new TextEncoder().encode("12345678901234567890"));
  assert.equal(await codigoTotp(segredo, Math.floor(59 / 30), 8), "94287082");
  assert.equal(await codigoTotp(segredo, Math.floor(1111111109 / 30), 8), "07081804");
  assert.deepEqual([...deBase32(segredo)], [...new TextEncoder().encode("12345678901234567890")]);
});

test("TOTP aceita janela vizinha e não aceita o mesmo código duas vezes", async () => {
  const seg = "JBSWY3DPEHPK3PXP";
  const agora = 1_700_000_000_000;
  const n = Math.floor(agora / 30000);
  const cod = await codigoTotp(seg, n);
  const usado = await conferirTotp(seg, cod, agora, 0);
  assert.equal(usado, n);
  assert.equal(await conferirTotp(seg, cod, agora, usado), null);
  assert.equal(await conferirTotp(seg, await codigoTotp(seg, n - 1), agora, 0), n - 1);
  assert.equal(await conferirTotp(seg, await codigoTotp(seg, n - 5), agora, 0), null);
  assert.equal(await conferirTotp(seg, "abc", agora, 0), null);
});

test("um teste grátis por celular", async () => {
  const env = mk();
  const a = await registrarLoja(env, { nome: "A", dispositivo: "aparelho-1" });
  const b = await registrarLoja(env, { nome: "B", dispositivo: "aparelho-1" });
  const c = await registrarLoja(env, { nome: "C", dispositivo: "aparelho-2" });
  assert.equal(a.testeGratisUsado, false);
  assert.equal(b.testeGratisUsado, true);
  assert.ok(b.trialFim <= Date.now());
  assert.equal(c.testeGratisUsado, false);
});

test("marketing: lê JSON da IA em qualquer embalagem e limpa hashtags", () => {
  const s = lerSugestao('Claro!\n```json\n{"legenda":"Vela linda","copy":"Só hoje","hashtags":["promoção","#Vela","vela","oi oi"]}\n```');
  assert.equal(s.legenda, "Vela linda");
  assert.deepEqual(s.hashtags, ["#promoção", "#Vela", "#oioi"]);
  assert.equal(lerSugestao("sem json"), null);
  assert.deepEqual(limparHashtags("#a, b  #a"), ["#a", "#b"]);
  const c = candidatos([{ id: 1, estoque: 5, preco_centavos: 100 }, { id: 2, estoque: 1, preco_centavos: 100, promocao_centavos: 50 }, { id: 3, estoque: 0, preco_centavos: 100 }, { id: 4, estoque: 9, preco_centavos: 100, oculto: true }]);
  assert.deepEqual(c.map((p) => p.id), [2, 1]); // promoção primeiro; sem estoque e ocultos ficam de fora
});

test("marketing: preenche a fila (IA e modelo de reserva), regenera, agenda e limpa", async () => {
  let chamadas = 0;
  const env = mk({ GERADOR_DE_TESTE: async () => { chamadas++; if (chamadas === 2) throw new Error("groq fora"); return { texto: '{"legenda":"Legenda IA","copy":"Copy IA","hashtags":["vela"]}' }; } });
  const l = await registrarLoja(env, { nome: "Loja" });
  await prod(env, l.id, "V1", "Vela", 5000, 4, 3500);
  await prod(env, l.id, "V2", "Óleo", 8000, 10);
  let r = await chamar(env, "POST", "/marketing/sugestoes", l.token, { quantidade: 5 });
  assert.equal(r.status, 201);
  let fila = (await (await chamar(env, "GET", "/marketing/fila", l.token)).json()).fila;
  assert.equal(fila.length, 2);
  assert.deepEqual(fila.map((f) => f.origem).sort(), ["ia", "modelo"]); // o 2º usou o texto de reserva
  assert.ok(fila.every((f) => f.legenda.length > 5 && f.hashtags.length));
  const outra = (await chamar(env, "POST", "/marketing/sugestoes", l.token, {}));
  assert.equal((await outra.json()).criados.length, 0, "não repete produto que já está na fila");
  const id = fila[0].id;
  assert.equal((await (await chamar(env, "POST", `/marketing/fila/${id}`, l.token)).json()).regenerados, 1);
  assert.equal((await (await chamar(env, "POST", "/marketing/regenerar", l.token, { todos: true })).json()).regenerados, 2);
  assert.equal((await chamar(env, "PATCH", `/marketing/fila/${id}`, l.token, { agendarPara: Date.now() + 3600000 })).status, 200);
  assert.equal((await chamar(env, "PATCH", `/marketing/fila/${id}`, l.token, { agendarPara: 5 })).status, 400);
  assert.equal((await chamar(env, "POST", `/marketing/fila/${id}/agendar`, l.token, { agendarPara: Date.now() + 7200000 })).status, 200);
  assert.equal((await (await chamar(env, "POST", "/marketing/limpar", l.token, { status: "agendado" })).json()).removidos, 1);
  fila = (await (await chamar(env, "GET", "/marketing/fila", l.token)).json()).fila;
  assert.equal(fila.length, 1);
  // outra loja não enxerga nem mexe
  const outraLoja = await registrarLoja(env, { nome: "Outra" });
  assert.equal((await chamar(env, "PATCH", `/marketing/fila/${fila[0].id}`, outraLoja.token, { agendarPara: Date.now() + 3600000 })).status, 404);
});

test("auditoria acha ocultos, sem preço, sem foto e mapeia características", async () => {
  const env = mk();
  const l = await registrarLoja(env, { nome: "Loja" });
  await prod(env, l.id, "A", "Normal", 1000, 2);
  await prod(env, l.id, "B", "Sem preço", null, 2);
  await prod(env, l.id, "C", "Oculto", 1000, 5, null, 1);
  const a = await (await chamar(env, "GET", "/bi/auditoria", l.token)).json();
  assert.equal(a.resumo.total, 3);
  assert.equal(a.resumo.ocultos, 1);
  assert.equal(a.resumo.sem_preco, 1);
  assert.equal(a.escondidos_com_estoque[0].sku, "C");
  assert.deepEqual(a.caracteristicas, [{ nome: "Cor", produtos: 3 }]);
  assert.equal(a.problemas, 1 + 3 + 1); // sem preço + sem foto + oculto com estoque
  assert.equal(auditar([], [], []).resumo.total, 0);
});

test("financeiro: bruto × taxas, taxa estimada, e cancelados fora do faturamento", () => {
  const agora = Date.UTC(2026, 10, 10, 15);
  const canais = [{ id: "c1", plataforma: "mercadolivre", nome: "ML", config: '{"taxa_percentual":12}' }, { id: "c2", plataforma: "proprio", nome: "Site", config: "{}" }];
  const pedidos = [
    { canal: "c1", status: "pago", total_centavos: 10000, taxa_centavos: 0, criado: agora - 3600000 },
    { canal: "c1", status: "pago", total_centavos: 5000, taxa_centavos: 700, criado: agora - 7200000 },
    { canal: "c2", status: "pago", total_centavos: 2000, taxa_centavos: 0, criado: agora - 86400000 },
    { canal: "c2", status: "cancelado", total_centavos: 9999, taxa_centavos: 0, criado: agora - 3600000 },
    { canal: "c2", status: "novo", total_centavos: 3000, taxa_centavos: 0, criado: agora - 3600000 },
    { canal: "c2", status: "pago", total_centavos: 7777, taxa_centavos: 0, criado: agora - 40 * 86400000 },
  ];
  const f = financeiro(pedidos, canais, 30, agora);
  assert.equal(f.totais.bruto, 17000);
  assert.equal(f.totais.taxas, 1200 + 700);
  assert.equal(f.totais.liquido, 17000 - 1900);
  assert.equal(f.totais.perdido, 9999);
  assert.equal(f.totais.pendente, 3000);
  assert.equal(f.canais[0].taxas_estimadas, 1200);
  assert.equal(f.serie.length, 30);
  assert.equal(f.serie.reduce((s, d) => s + d.bruto, 0), 17000);
});

test("QR e Pix pela API; link http é recusado", async () => {
  const env = mk();
  const l = await registrarLoja(env, { nome: "Maria" });
  let r = await (await chamar(env, "POST", "/qr", l.token, { tipo: "pix", chave: "maria@x.com", cidade: "Porto Alegre", valorCentavos: 1000 })).json();
  assert.ok(r.texto.includes("540510.00"));
  assert.equal(r.modulos.length, r.tamanho ** 2);
  assert.equal((await chamar(env, "POST", "/qr", l.token, { tipo: "link", texto: "http://x.com" })).status, 400);
  assert.equal((await chamar(env, "POST", "/qr", l.token, { tipo: "rede", texto: "https://instagram.com/loja", svg: true, cor: "#E36BD0" })).status, 200);
});

test("assinatura: webhook confirma, mas o acesso só sai com 2FA; pagamento repetido não soma duas vezes", async () => {
  const env = mk({ INFINITEPAY_HANDLE: "$minha", MERCADOPAGO_ACCESS_TOKEN: "tk", MERCADOPAGO_WEBHOOK_SECRET: "wh" });
  const l = await registrarLoja(env, { nome: "Loja" });
  const orig = globalThis.fetch;
  let pagoMP = true;
  globalThis.fetch = async (url, op = {}) => {
    url = String(url);
    const r = (d) => new Response(JSON.stringify(d));
    if (url.endsWith("/preapproval")) { env.__ref = JSON.parse(op.body).external_reference; return r({ init_point: "https://mp.test/pagar" }); }
    if (url.includes("/v1/payments/")) return r({ id: 555, status: pagoMP ? "approved" : "pending", external_reference: env.__ref, transaction_amount: 49.9 });
    if (url.endsWith("/links")) { env.__ref = JSON.parse(op.body).order_nsu; return r({ url: "https://ip.test/pagar" }); }
    if (url.endsWith("/payment_check")) return r({ paid: true, paid_amount: 4990 });
    return new Response("{}", { status: 500 });
  };
  try {
    let e = await (await chamar(env, "GET", "/assinatura", l.token)).json();
    assert.equal(e.emTeste, true);
    assert.equal(e.precoCentavos, 4990);
    const c = await (await chamar(env, "POST", "/assinatura/cobrar", l.token, { gateway: "mercadopago" })).json();
    assert.equal(c.url, "https://mp.test/pagar");
    // webhook sem assinatura válida
    const ruim = new Request(ORIGEM + "/assinatura/webhook/mercadopago", { method: "POST", headers: { "x-signature": "ts=1,v1=00", "x-request-id": "r1" }, body: JSON.stringify({ type: "payment", data: { id: "555" } }) });
    assert.equal((await tratarLoja(ruim, env, {}, new URL(ruim.url), "/assinatura/webhook/mercadopago")).status, 401);
    const ts = "1700000000";
    const sig = await hmacHex("wh", `id:555;request-id:r1;ts:${ts};`);
    const mk2 = () => new Request(ORIGEM + "/assinatura/webhook/mercadopago", { method: "POST", headers: { "x-signature": `ts=${ts},v1=${sig}`, "x-request-id": "r1" }, body: JSON.stringify({ type: "payment", data: { id: "555" } }) });
    for (let i = 0; i < 2; i++) assert.equal((await tratarLoja(mk2(), env, {}, new URL(ORIGEM + "/assinatura/webhook/mercadopago"), "/assinatura/webhook/mercadopago")).status, 200);
    e = await (await chamar(env, "GET", "/assinatura", l.token)).json();
    assert.equal(e.pagamentoAguardandoLiberacao, true);
    // liberar sem 2FA ativo
    let r = await chamar(env, "POST", "/assinatura/liberar", l.token, { codigo: "123456" });
    assert.equal(r.status, 409);
    const dois = await (await chamar(env, "POST", "/seguranca/2fa/iniciar", l.token)).json();
    assert.ok(dois.otpauth.startsWith("otpauth://totp/"));
    const agora = Date.now();
    const cod = await codigoTotp(dois.segredo, Math.floor(agora / 30000));
    assert.equal((await chamar(env, "POST", "/seguranca/2fa/confirmar", l.token, { codigo: "000000" })).status, 401);
    assert.equal((await chamar(env, "POST", "/seguranca/2fa/confirmar", l.token, { codigo: cod })).status, 200);
    // o mesmo código não serve de novo; precisa do código seguinte
    assert.equal((await chamar(env, "POST", "/assinatura/liberar", l.token, { codigo: cod })).status, 401);
    const prox = await codigoTotp(dois.segredo, Math.floor(agora / 30000) + 1);
    r = await chamar(env, "POST", "/assinatura/liberar", l.token, { codigo: prox });
    assert.equal(r.status, 200);
    e = await (await chamar(env, "GET", "/assinatura", l.token)).json();
    assert.equal(e.plano, "fundadores");
    assert.ok(e.diasPagosRestantes >= 29);
    assert.equal(e.pagamentoAguardandoLiberacao, false);
    // InfinitePay
    const c2 = await (await chamar(env, "POST", "/assinatura/cobrar", l.token, { gateway: "infinitepay" })).json();
    assert.equal(c2.url, "https://ip.test/pagar");
    const ip = new Request(ORIGEM + "/assinatura/webhook/infinitepay", { method: "POST", body: JSON.stringify({ order_nsu: c2.id, transaction_nsu: "t1", invoice_slug: "s1" }) });
    assert.equal((await tratarLoja(ip, env, {}, new URL(ip.url), "/assinatura/webhook/infinitepay")).status, 200);
    assert.equal((await (await chamar(env, "GET", "/assinatura", l.token)).json()).pagamentoAguardandoLiberacao, true);
  } finally { globalThis.fetch = orig; }
});

test("pagamento com valor menor que o plano não vale", async () => {
  const env = mk({ MERCADOPAGO_ACCESS_TOKEN: "tk" });
  const l = await registrarLoja(env, { nome: "Loja" });
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, op = {}) => {
    url = String(url);
    if (url.endsWith("/preapproval")) { env.__ref = JSON.parse(op.body).external_reference; return new Response(JSON.stringify({ init_point: "https://mp.test" })); }
    return new Response(JSON.stringify({ id: 9, status: "approved", external_reference: env.__ref, transaction_amount: 1 }));
  };
  try {
    await chamar(env, "POST", "/assinatura/cobrar", l.token, { gateway: "mercadopago" });
    const q = new Request(ORIGEM + "/assinatura/webhook/mercadopago", { method: "POST", body: JSON.stringify({ type: "payment", data: { id: "9" } }) });
    await tratarLoja(q, env, {}, new URL(q.url), "/assinatura/webhook/mercadopago");
    assert.equal((await (await chamar(env, "GET", "/assinatura", l.token)).json()).pagamentoAguardandoLiberacao, false);
  } finally { globalThis.fetch = orig; }
});

test("painel é público mas sem dados: tudo vem pela API com token", async () => {
  const env = mk();
  const q = new Request(ORIGEM + "/painel");
  const r = await tratarLoja(q, env, {}, new URL(q.url), "/painel");
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes("VÊNUS · PAINEL"));
  assert.ok(r.headers.get("content-security-policy").includes("default-src 'none'"));
  assert.equal((await chamar(env, "GET", "/bi/financeiro", null)).status, 401);
});
