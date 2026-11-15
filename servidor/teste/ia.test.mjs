import test from "node:test";
import assert from "node:assert/strict";
import { tratarIA } from "../src/ia/rotas.js";
const worker = { fetch: tratarIA };

const SEGREDOS = { GROQ_API_KEY: "gsk_SEGREDO_GROQ", DEEPSEEK_API_KEY: "sk-SEGREDO_DEEPSEEK", GEMINI_API_KEY: "AIza_SEGREDO_GEMINI" };
const ORIGEM = "capacitor://localhost";

function kv() {
  const m = new Map();
  return { async get(k, t) { const v = m.get(k); return v === undefined ? null : t === "json" ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); }, m };
}
function vetorial() {
  const itens = [];
  const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; } return d / Math.sqrt(x * y); };
  return {
    async upsert(v) { itens.push(...v); },
    async query(vec, o) { const c = itens.filter((i) => i.namespace === o.namespace).map((i) => ({ id: i.id, score: cos(vec, i.values), metadata: i.metadata })).sort((a, b) => b.score - a.score); return { count: c.length, matches: c.slice(0, o.topK) }; },
    itens
  };
}
function criarEnv(extra = {}) {
  return { ...SEGREDOS, ORIGENS_PERMITIDAS: ORIGEM + ",http://localhost:5175", ...extra };
}
function ctx() { const p = []; return { waitUntil: (x) => p.push(x), esperar: () => Promise.all(p) }; }

let chamadas;
function mockFetch(handlers) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    chamadas.push({ u, init });
    const h = Object.entries(handlers).find(([k]) => u.includes(k))?.[1];
    return h ? h(init) : new Response("sem handler", { status: 599 });
  };
}
const ok = (texto) => new Response(JSON.stringify({ choices: [{ message: { content: texto } }], model: "m", usage: { total_tokens: 5 } }), { status: 200 });
const okGemini = (texto) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }), { status: 200 });
const post = (caminho, corpo, env, headers = {}, c = ctx()) =>
  worker.fetch(new Request("https://x.dev" + caminho, { method: "POST", headers: { "content-type": "application/json", origin: ORIGEM, ...headers }, body: JSON.stringify(corpo) }), env, c);
const msg = (t) => ({ mensagens: [{ papel: "user", texto: t }] });
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("roteamento exato por função", async () => {
  mockFetch({ "api.groq.com": () => ok("g"), "api.deepseek.com": () => ok("d"), "generativelanguage": () => okGemini("m") });
  const env = criarEnv();
  let r = await (await post("/v1/chat", msg("oi, tudo bem?"), env)).json();
  assert.equal(r.provedor, "groq");
  r = await (await post("/v1/chat", msg("escreva uma função em python para ordenar"), env)).json();
  assert.equal(r.provedor, "deepseek"); assert.equal(r.tarefa, "codigo");
  r = await (await post("/v1/chat", msg("monte o relatório de faturamento e margem"), env)).json();
  assert.equal(r.provedor, "deepseek"); assert.equal(r.tarefa, "bi");
  r = await (await post("/v1/chat", { ...msg("resolva passo a passo"), tarefa: "logica" }, env)).json();
  assert.equal(r.provedor, "deepseek");
  assert.ok(JSON.parse(chamadas.at(-1).init.body).model === "deepseek-reasoner");
  r = await (await post("/v1/chat", { ...msg("o que é isto?"), anexos: [{ mime: "image/png", dados: PNG }] }, env)).json();
  assert.equal(r.provedor, "gemini"); assert.equal(r.tarefa, "multimodal");
});

test("Gemini é estrito: sem anexo não atende, e não há reserva fora do Gemini", async () => {
  mockFetch({ "generativelanguage": () => new Response("x", { status: 500 }), "api.groq.com": () => ok("g") });
  const env = criarEnv();
  let res = await post("/v1/chat", { ...msg("leia"), tarefa: "ocr" }, env);
  assert.equal(res.status, 400);
  res = await post("/v1/chat", { ...msg("x"), tarefa: "codigo", anexos: [{ mime: "image/png", dados: PNG }] }, env);
  assert.equal(res.status, 400);
  res = await post("/v1/ocr", { anexos: [{ mime: "image/png", dados: PNG }] }, env);
  assert.equal(res.status, 502);
  assert.ok(!chamadas.some((c) => c.u.includes("groq")), "texto/ocr nunca cai no Groq");
  assert.equal(chamadas.filter((c) => c.u.includes("generativelanguage")).length, 2, "tenta modelo principal e reserva Gemini");
});

test("OCR usa Gemini com temperatura 0 e chave no cabeçalho", async () => {
  mockFetch({ "generativelanguage": () => okGemini("TEXTO LIDO") });
  const res = await post("/v1/ocr", { anexos: [{ mime: "image/png", dados: PNG }] }, criarEnv());
  const j = await res.json();
  assert.equal(j.resposta, "TEXTO LIDO"); assert.equal(j.tarefa, "ocr");
  const c = chamadas[0];
  assert.ok(!c.u.includes("AIza"), "chave fora da URL");
  assert.equal(c.init.headers["x-goog-api-key"], SEGREDOS.GEMINI_API_KEY);
  assert.equal(JSON.parse(c.init.body).generationConfig.temperature, 0);
});

test("fallback Groq -> DeepSeek (429) e DeepSeek -> Groq (503); 400 não faz fallback", async () => {
  const env = criarEnv();
  mockFetch({ "api.groq.com": () => new Response("", { status: 429 }), "api.deepseek.com": () => ok("reserva") });
  let j = await (await post("/v1/chat", msg("conte uma piada"), env)).json();
  assert.equal(j.provedor, "deepseek"); assert.equal(j.fallback, true);
  mockFetch({ "api.deepseek.com": () => new Response("", { status: 503 }), "api.groq.com": () => ok("reserva2") });
  j = await (await post("/v1/chat", msg("explique este código"), env)).json();
  assert.equal(j.provedor, "groq"); assert.equal(j.fallback, true);
  mockFetch({ "api.groq.com": () => new Response("", { status: 400 }), "api.deepseek.com": () => ok("nao deveria") });
  const res = await post("/v1/chat", msg("conte uma piada"), env);
  assert.equal(res.status, 502);
  assert.equal(chamadas.length, 1);
});

test("sem chave do provedor principal usa o reserva", async () => {
  mockFetch({ "api.deepseek.com": () => ok("d") });
  const env = criarEnv({ GROQ_API_KEY: undefined });
  const j = await (await post("/v1/chat", msg("bom dia"), env)).json();
  assert.equal(j.provedor, "deepseek");
});

test("nenhuma chave aparece em respostas nem erros", async () => {
  mockFetch({ "api.groq.com": () => new Response("gsk_SEGREDO_GROQ vazou", { status: 500 }), "api.deepseek.com": () => new Response("sk-SEGREDO_DEEPSEEK", { status: 500 }) });
  const res = await post("/v1/chat", msg("oi"), criarEnv());
  const corpo = await res.text();
  assert.equal(res.status, 502);
  for (const s of Object.values(SEGREDOS)) assert.ok(!corpo.includes(s));
});

test("CORS: preflight, origem negada, cabeçalhos", async () => {
  const env = criarEnv();
  let res = await worker.fetch(new Request("https://x.dev/v1/chat", { method: "OPTIONS", headers: { origin: ORIGEM, "access-control-request-method": "POST" } }), env, ctx());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGEM);
  assert.match(res.headers.get("access-control-allow-headers"), /authorization/);
  res = await worker.fetch(new Request("https://x.dev/v1/chat", { method: "OPTIONS", headers: { origin: "https://malvado.com" } }), env, ctx());
  assert.equal(res.status, 403);
  mockFetch({ "api.groq.com": () => ok("g") });
  res = await post("/v1/chat", msg("oi"), env, { origin: "https://malvado.com" });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  res = await post("/v1/chat", msg("oi"), env);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGEM);
  assert.equal(res.headers.get("vary"), "Origin");
});

test("autenticação por APP_TOKEN e validações", async () => {
  mockFetch({ "api.groq.com": () => ok("g") });
  const env = criarEnv({ APP_TOKEN: "segredo-do-app" });
  assert.equal((await post("/v1/chat", msg("oi"), env)).status, 401);
  assert.equal((await post("/v1/chat", msg("oi"), env, { authorization: "Bearer errado" })).status, 401);
  assert.equal((await post("/v1/chat", msg("oi"), env, { authorization: "Bearer segredo-do-app" })).status, 200);
  const e2 = criarEnv();
  assert.equal((await post("/v1/chat", { mensagens: [] }, e2)).status, 400);
  assert.equal((await post("/v1/chat", { ...msg("oi"), tarefa: "constructor" }, e2)).status, 400);
  assert.equal((await post("/v1/chat", { ...msg("oi"), anexos: [{ mime: "text/html", dados: PNG }] }, e2)).status, 400);
  assert.equal((await worker.fetch(new Request("https://x.dev/nada"), e2, ctx())).status, 404);
  const h = await (await worker.fetch(new Request("https://x.dev/saude"), e2, ctx())).json();
  assert.equal(h.ok, true);
});

test("limite de uso devolve 429", async () => {
  const env = criarEnv({ LIMITADOR: { limit: async () => ({ success: false }) } });
  assert.equal((await post("/v1/chat", msg("oi"), env)).status, 429);
});

test("cache vetorial: exato, semântico, números diferentes e tempo real", async () => {
  mockFetch({ "api.groq.com": () => ok("resposta do modelo") });
  const VEC = { "qual o horario da loja?": [1, 0, 0], "que horas a loja abre?": [0.99, 0.1, 0], "tem 10 unidades?": [0, 1, 0], "tem 100 unidades?": [0, 0.999, 0.02], "qual a cotacao hoje?": [0, 0, 1] };
  const AI = { run: async (_m, { text }) => ({ data: [VEC[text[0].replace(/\s+$/, "")] ?? [0.3, 0.3, 0.3]] }) };
  const env = criarEnv({ CACHE: kv(), VETORES: vetorial(), AI });
  const q = async (t) => { const c = ctx(); const j = await (await post("/v1/chat", msg(t), env, {}, c)).json(); await c.esperar(); return j; };

  let j = await q("Qual o horário da loja?");
  assert.equal(j.cache.acerto, false);
  const antes = chamadas.length;
  j = await q("qual o  horario da loja?  ");
  assert.equal(j.cache.acerto, "exato"); assert.equal(chamadas.length, antes);
  j = await q("Que horas a loja abre?");
  assert.equal(j.cache.acerto, "semantico"); assert.ok(j.cache.similaridade >= 0.93); assert.equal(chamadas.length, antes);

  await q("Tem 10 unidades?");
  const n = chamadas.length;
  j = await q("Tem 100 unidades?");
  assert.equal(j.cache.acerto, false, "números diferentes não reaproveitam");
  assert.equal(chamadas.length, n + 1);

  const m = chamadas.length;
  await q("Qual a cotação hoje?"); await q("Qual a cotação hoje?");
  assert.equal(chamadas.length, m + 2, "pergunta de tempo real nunca é cacheada");

  const k = chamadas.length;
  await post("/v1/chat", { ...msg("Qual o horário da loja?"), cache: false }, env);
  assert.equal(chamadas.length, k + 1, "cache:false respeita o cliente");
});

test("cache degrada sem Workers AI/Vectorize", async () => {
  mockFetch({ "api.groq.com": () => ok("g") });
  const env = criarEnv({ CACHE: kv() });
  const c = ctx(); await post("/v1/chat", msg("pergunta qualquer longa"), env, {}, c); await c.esperar();
  const j = await (await post("/v1/chat", msg("pergunta qualquer longa"), env)).json();
  assert.equal(j.cache.acerto, "exato");
  const semNada = criarEnv();
  assert.equal((await post("/v1/chat", msg("pergunta qualquer longa"), semNada)).status, 200);
});

test("/v1/transcrever manda o áudio à Groq Whisper e devolve só o texto", async () => {
  mockFetch({ "audio/transcriptions": () => new Response(JSON.stringify({ text: " abrir o bloco de notas " }), { status: 200 }) });
  const audio = new Uint8Array(2000).fill(7);
  const r = await worker.fetch(new Request("https://x.dev/v1/transcrever", { method: "POST", headers: { "content-type": "audio/webm;codecs=opus", origin: ORIGEM }, body: audio }), criarEnv(), ctx());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { texto: "abrir o bloco de notas" });
  const c = chamadas[0];
  assert.equal(c.init.headers.authorization, "Bearer gsk_SEGREDO_GROQ");
  assert.equal(c.init.body.get("language"), "pt");
  assert.equal(c.init.body.get("file").name, "fala.webm");
});

test("/v1/transcrever recusa o que não é áudio, áudio grande e sem chave", async () => {
  mockFetch({});
  const chamar = (tipo, corpo, env = criarEnv()) => worker.fetch(new Request("https://x.dev/v1/transcrever", { method: "POST", headers: { "content-type": tipo, origin: ORIGEM }, body: corpo }), env, ctx());
  assert.equal((await chamar("application/json", "{}")).status, 415);
  assert.equal((await chamar("audio/webm", new Uint8Array(7 * 1024 * 1024))).status, 413);
  assert.equal((await chamar("audio/webm", new Uint8Array(2000), criarEnv({ GROQ_API_KEY: "" }))).status, 503);
  assert.equal(chamadas.length, 0);
  const curto = await chamar("audio/webm", new Uint8Array(10));
  assert.deepEqual(await curto.json(), { texto: "" });
  assert.equal((await worker.fetch(new Request("https://x.dev/v1/transcrever", { method: "GET", headers: { origin: ORIGEM } }), criarEnv(), ctx())).status, 405);
});

import { tratarProxyIA, MODELOS } from "../src/ia/proxy.js";
test("/ia/v1: só com Vetorial ID, só modelos conhecidos, chave da Groq fica no servidor", async () => {
  const logado = async () => ({ usuario: { id: "u1" } });
  const deslogado = async () => { const e = new Error("Entre de novo."); e.status = 401; throw e; };
  const pedir = (corpo, validar, env = criarEnv(), caminho = "/ia/v1/chat/completions", metodo = "POST") =>
    tratarProxyIA(new Request("https://x.dev" + caminho, { method: metodo, headers: { "content-type": "application/json", authorization: "Bearer eyJa.b.c" }, body: metodo === "POST" ? JSON.stringify(corpo) : undefined }), env, ctx(), caminho, { validar });

  mockFetch({});
  assert.equal((await pedir({ model: MODELOS[0], messages: [{ role: "user", content: "oi" }] }, deslogado)).status, 401);
  assert.equal(chamadas.length, 0);

  assert.equal((await pedir({ model: "gpt-9000", messages: [{ role: "user", content: "oi" }] }, logado)).status, 404);
  assert.equal((await pedir({ model: MODELOS[0], messages: [] }, logado)).status, 400);
  assert.equal((await pedir({ model: MODELOS[0], messages: [{ role: "user", content: "oi" }] }, logado, criarEnv({ GROQ_API_KEY: "" }))).status, 503);

  mockFetch({ "api.groq.com/openai/v1/chat/completions": () => new Response(JSON.stringify({ choices: [{ message: { content: "oi!" } }] }), { status: 200 }) });
  const ok = await pedir({ model: MODELOS[0], messages: [{ role: "user", content: "oi" }], stream: true, max_tokens: 99999, tools: [{ type: "function", function: { name: "x" } }], intruso: "x" }, logado);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).choices[0].message.content, "oi!");
  const enviado = JSON.parse(chamadas[0].init.body);
  assert.equal(chamadas[0].init.headers.authorization, "Bearer gsk_SEGREDO_GROQ");
  assert.equal(enviado.stream, false);
  assert.equal(enviado.max_tokens, 4096);
  assert.equal(enviado.intruso, undefined);
  assert.ok(enviado.tools);

  mockFetch({ "api.groq.com": () => new Response(JSON.stringify({ error: { message: "rate" } }), { status: 429 }) });
  assert.equal((await pedir({ model: MODELOS[1], messages: [{ role: "user", content: "oi" }] }, logado)).status, 429);

  const lista = await pedir(null, logado, criarEnv(), "/ia/v1/models", "GET");
  assert.ok((await lista.json()).data.some((m) => m.id === MODELOS[0]));
});

test("/ia/gemini: Vetorial ID obrigatório, só rotas permitidas, chave do Google fica no servidor", async () => {
  const logado = async () => ({ usuario: { id: "u1" } });
  const deslogado = async () => { const e = new Error("Entre de novo."); e.status = 401; throw e; };
  const pedir = (caminho, validar, corpo = { contents: [] }, metodo = "POST", env = criarEnv()) =>
    tratarProxyIA(new Request("https://x.dev" + caminho, { method: metodo, headers: { "content-type": "application/json", authorization: "Bearer eyJa.b.c" }, body: metodo === "POST" ? JSON.stringify(corpo) : undefined }), env, ctx(), caminho, { validar });
  mockFetch({});
  assert.equal((await pedir("/ia/gemini/models/gemini-3.8-flash:generateContent", deslogado)).status, 401);
  assert.equal(chamadas.length, 0);
  assert.equal((await pedir("/ia/gemini/models/x:deleteEverything", logado)).status, 404);
  assert.equal((await pedir("/ia/gemini/files/abc", logado)).status, 404);
  assert.equal((await pedir("/ia/gemini/models/x:generateContent", logado, {}, "POST", criarEnv({ GEMINI_API_KEY: "" }))).status, 503);
  mockFetch({ "generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent": () => okGemini("oi") });
  const r = await pedir("/ia/gemini/models/gemini-3.8-flash:generateContent", logado);
  assert.equal(r.status, 200);
  assert.equal(chamadas[0].init.headers["x-goog-api-key"], "AIza_SEGREDO_GEMINI");
  assert.equal(chamadas[0].init.headers.authorization, undefined);
  mockFetch({ "v1beta/models?pageSize=200": () => new Response(JSON.stringify({ models: [] }), { status: 200 }) });
  assert.equal((await pedir("/ia/gemini/models", logado, null, "GET")).status, 200);
});

import { ordemDeTentativas } from "../src/ia/roteador.js";
import { executar } from "../src/ia/provedores.js";
test("texto: Groq e DeepSeek se revezam e o Gemini é a última reserva; anexo é só Gemini", () => {
  assert.deepEqual(ordemDeTentativas("groq"), ["groq", "deepseek", "gemini"]);
  assert.deepEqual(ordemDeTentativas("deepseek"), ["deepseek", "groq", "gemini"]);
  assert.deepEqual(ordemDeTentativas("gemini"), ["gemini"]);
});

test("limite no Groq e saldo esgotado (402) no DeepSeek caem no Gemini em vez de dar 502", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("groq.com")) return new Response("{}", { status: 429 });
    if (u.includes("deepseek.com")) return new Response("{}", { status: 402 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "olá" }] } }] }), { status: 200 });
  };
  try {
    const env = { GROQ_API_KEY: "g", DEEPSEEK_API_KEY: "d", GEMINI_API_KEY: "m" };
    const r = await executar(env, ["groq", "deepseek", "gemini"], { sistema: "", mensagens: [{ papel: "user", texto: "oi" }], temperatura: 0.5, maxTokens: 50, tarefa: "conversa" });
    assert.equal(r.provedor, "gemini");
    assert.equal(r.texto, "olá");
    assert.equal(r.fallback, true);
  } finally { globalThis.fetch = original; }
});
