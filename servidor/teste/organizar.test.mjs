import test from "node:test";
import assert from "node:assert/strict";
import { tratarOrganizar, limparPedido, validarMapa, extrairJson, montarPrompt, _zerarLimites, passouDoLimite } from "../src/organizar.js";

const CATS = [{ id: "social", nome: "Social" }, { id: "jogos", nome: "Jogos" }, { id: "ferramentas", nome: "Ferramentas" }];
const APPS = [{ pacote: "com.a", nome: "A" }, { pacote: "com.b", nome: "B" }];
const pedido = (corpo, cab = {}) => new Request("https://x/organizar", { method: "POST", headers: { "content-type": "application/json", ...cab }, body: JSON.stringify(corpo) });

test("limparPedido tira lixo, repetidos e limita", () => {
  const r = limparPedido({ categorias: [...CATS, { id: "Mau Id", nome: "x" }, null], apps: [...APPS, { pacote: "com.a", nome: "dup" }, { pacote: "<x>", nome: "y" }, { pacote: "com.c", nome: "" }] });
  assert.equal(r.categorias.length, 3);
  assert.deepEqual(r.apps.map((a) => a.pacote), ["com.a", "com.b"]);
  assert.equal(limparPedido({ apps: Array.from({ length: 900 }, (_, i) => ({ pacote: `com.n${i}`, nome: "n" })) }).apps.length, 400);
});

test("validarMapa ignora número fora, categoria inventada e resposta nula", () => {
  assert.deepEqual(validarMapa({ 1: "social", 2: "inventada", 9: "jogos", x: "jogos" }, CATS, APPS), { "com.a": "social" });
  assert.deepEqual(validarMapa(null, CATS, APPS), {});
  assert.deepEqual(extrairJson('```json\n{"1":"jogos"}\n```'), { 1: "jogos" });
  assert.equal(extrairJson("sem json"), null);
});

test("prompt manda só nomes e pacotes dos apps", () => {
  const { sistema, mensagens } = montarPrompt(CATS, APPS);
  assert.match(sistema, /ferramentas/); assert.equal(mensagens[0].texto, "1|A|com.a\n2|B|com.b");
});

const OK = { validar: async () => ({ usuario: { id: "u1" } }), liberado: async () => true };
const comIa = (ia, extra = {}) => ({ ...OK, ia, ...extra });

test("rota: sem sessão do Vetorial ID dá 401 e a IA nem é chamada", async () => {
  _zerarLimites();
  let chamou = false;
  const r = await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }), {}, {}, { ia: async () => { chamou = true; return { texto: "{}" }; }, validar: async () => { const e = new Error("Entre de novo."); e.status = 401; throw e; } });
  assert.equal(r.status, 401); assert.equal(chamou, false);
});

test("rota: conta sem acesso ao app dá 402", async () => {
  _zerarLimites();
  assert.equal((await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }), {}, {}, { ...OK, liberado: async () => false, ia: async () => ({ texto: "{}" }) })).status, 402);
});

test("rota: com sessão responde o mapa validado e freia o excesso por conta", async () => {
  _zerarLimites();
  const ia = async () => ({ texto: '{"1":"jogos","2":"nao-existe"}' });
  const r = await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }), {}, {}, comIa(ia));
  assert.equal(r.status, 200); assert.deepEqual((await r.json()).mapa, { "com.a": "jogos" });
  for (let i = 0; i < 29; i++) assert.equal((await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }), {}, {}, comIa(ia))).status, 200);
  assert.equal((await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }), {}, {}, comIa(ia))).status, 429);
  const outra = await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }), {}, {}, comIa(ia, { validar: async () => ({ usuario: { id: "u2" } }) }));
  assert.equal(outra.status, 200);
});

test("rota: pedido vazio, IA fora do ar, sem chave e método errado dão o erro certo", async () => {
  _zerarLimites();
  assert.equal((await tratarOrganizar(pedido({ categorias: CATS, apps: [] }), {}, {}, comIa(async () => ({ texto: "{}" })))).status, 400);
  assert.equal((await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }), {}, {}, comIa(async () => { throw new Error("rede"); }))).status, 502);
  const semChave = async () => { const e = new Error("sem_chave"); e.status = 503; throw e; };
  assert.equal((await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }), {}, {}, comIa(semChave))).status, 503);
  assert.equal((await tratarOrganizar(new Request("https://x/organizar", { method: "GET" }), {}, {})).status, 405);
  assert.equal(passouDoLimite("k", 1, 0), false);
});
