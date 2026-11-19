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

test("rota: responde o mapa validado, sem sessão, e freia o excesso", async () => {
  _zerarLimites();
  const ia = async () => ({ texto: '{"1":"jogos","2":"nao-existe"}' });
  const r = await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }, { "cf-connecting-ip": "1.1.1.1" }), {}, {}, { ia });
  assert.equal(r.status, 200); assert.deepEqual((await r.json()).mapa, { "com.a": "jogos" });
  for (let i = 0; i < 5; i++) await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }, { "cf-connecting-ip": "1.1.1.1" }), {}, {}, { ia });
  const r7 = await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }, { "cf-connecting-ip": "1.1.1.1" }), {}, {}, { ia });
  assert.equal(r7.status, 429);
  const outro = await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }, { "cf-connecting-ip": "2.2.2.2" }), {}, {}, { ia });
  assert.equal(outro.status, 200);
});

test("rota: sessão válida tem limite maior; pedido vazio, IA fora do ar e sem chave dão erro certo", async () => {
  _zerarLimites();
  const ia = async () => ({ texto: "{}" });
  const validar = async () => ({ usuario: { id: "u1" } });
  for (let i = 0; i < 10; i++) assert.equal((await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }, { authorization: "Bearer x", "cf-connecting-ip": "3.3.3.3" }), {}, {}, { ia, validar })).status, 200);
  assert.equal((await tratarOrganizar(pedido({ categorias: CATS, apps: [] }), {}, {}, { ia })).status, 400);
  const quebra = async () => { throw new Error("rede"); };
  assert.equal((await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }, { "cf-connecting-ip": "4.4.4.4" }), {}, {}, { ia: quebra })).status, 502);
  const semChave = async () => { const e = new Error("sem_chave"); e.status = 503; throw e; };
  assert.equal((await tratarOrganizar(pedido({ categorias: CATS, apps: APPS }, { "cf-connecting-ip": "5.5.5.5" }), {}, {}, { ia: semChave })).status, 503);
  assert.equal((await tratarOrganizar(new Request("https://x/organizar", { method: "GET" }), {}, {})).status, 405);
  assert.equal(passouDoLimite("k", 1, 0), false);
});
