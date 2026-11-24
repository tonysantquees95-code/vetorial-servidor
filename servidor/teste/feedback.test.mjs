import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { listarRelatos, marcarRelato, normalizarRelato } from "../src/feedback/dados.js";
import { tratarFeedback } from "../src/feedback/rotas.js";
import { paginaDeFeedback } from "../src/feedback/pagina.js";

const mk = () => ({ DB: bancoDeTeste() });
const enviar = (env, corpo, cab = {}) => { const q = new Request("https://v.test/feedback", { method: "POST", headers: cab, body: JSON.stringify(corpo) }); return tratarFeedback(q, env, {}, new URL(q.url)); };

test("feedback: valida app, tipo e texto; limpa o que vem de fora", () => {
  assert.throws(() => normalizarRelato({ app: "xx", tipo: "problema", texto: "não abre" }), /aplicativo/);
  assert.throws(() => normalizarRelato({ app: "venus", tipo: "outro", texto: "não abre" }), /tipo/i);
  assert.throws(() => normalizarRelato({ app: "venus", tipo: "problema", texto: "ab" }), /Conte/);
  const r = normalizarRelato({ app: "vindex", tipo: "problema", texto: "  Travou ao abrir o PDF \u0007 ", versao: "1.200<script>", plataforma: "palm", contato: "51999990000" });
  assert.equal(r.texto, "Travou ao abrir o PDF");
  assert.equal(r.versao, "1.200script");
  assert.equal(r.plataforma, "outro");
});

test("feedback: pesquisa aceita só respostas conhecidas", () => {
  const r = normalizarRelato({ app: "venus", tipo: "pesquisa", nota: 9, respostas: { como_conheceu: "instagram", ajuda: "xis", indicaria: "sim", chamou: ["agenda", "agenda", "zzz", "site"], falta: "x".repeat(900) } });
  assert.equal(r.nota, null);
  assert.equal(r.respostas.como_conheceu, "instagram");
  assert.equal(r.respostas.ajuda, "");
  assert.deepEqual(r.respostas.chamou, ["agenda", "site"]);
  assert.equal(r.respostas.falta.length, 600);
  assert.throws(() => normalizarRelato({ app: "venus", tipo: "pesquisa", respostas: {} }), /pelo menos/);
});

test("feedback: envio, lista no painel, resumo e marcar como resolvido", async () => {
  const env = mk();
  assert.equal((await enviar(env, { app: "venus", versao: "1.210", plataforma: "android", tipo: "problema", texto: "O botão de enviar não responde" }, { "user-agent": "Android 14" })).status, 201);
  assert.equal((await enviar(env, { app: "venus", tipo: "pesquisa", nota: 5, respostas: { como_conheceu: "amigo", ajuda: "muito", indicaria: "sim", chamou: ["assistente", "gratis"] } })).status, 201);
  assert.equal((await enviar(env, { app: "venus", tipo: "pesquisa", nota: 3, respostas: { como_conheceu: "instagram", ajuda: "pouco" } })).status, 201);
  const l = await listarRelatos(env);
  assert.equal(l.relatos.length, 3);
  assert.equal(l.resumo.novos, 3);
  assert.equal(l.resumo.problemas, 1);
  assert.equal(l.resumo.notaMedia, 4);
  assert.equal(l.resumo.comoConheceu.length, 2);
  assert.equal(l.resumo.chamou[0].n, 1);
  const prob = l.relatos.find((x) => x.tipo === "problema");
  assert.equal(prob.aparelho, "Android 14");
  await marcarRelato(env, prob.id, { status: "resolvido", resposta_dev: "Corrigido na 1.211" });
  assert.equal((await listarRelatos(env, { status: "resolvido" })).relatos.length, 1);
  assert.equal((await listarRelatos(env)).resumo.problemas, 0);
  await assert.rejects(() => marcarRelato(env, 9999, { status: "visto" }), /não encontrado/i);
});

test("feedback: robô (campo escondido), JSON inválido e erros viram resposta amigável", async () => {
  const env = mk();
  const robo = await enviar(env, { app: "venus", tipo: "problema", texto: "spam spam spam", site: "http://x" });
  assert.equal(robo.status, 200);
  assert.equal((await listarRelatos(env)).relatos.length, 0);
  assert.equal((await enviar(env, { app: "xx", tipo: "ideia", texto: "olá, tudo bem" })).status, 400);
  const q = new Request("https://v.test/feedback", { method: "POST", body: "{nao" });
  assert.equal((await tratarFeedback(q, env, {}, new URL(q.url))).status, 400);
});

test("feedback: página escapa os parâmetros e usa a cor do app", async () => {
  const q = new Request('https://v.test/feedback?app=vortex&v=1.2"</script>&p=android');
  const r = await tratarFeedback(q, env0(), {}, new URL(q.url));
  const h = await r.text();
  assert.ok(h.includes("Vortex") && h.includes("#8E6CEF"));
  assert.ok(!h.includes('1.2"</script>'));
  assert.ok(r.headers.get("content-security-policy").includes("default-src 'none'"));
  assert.ok(paginaDeFeedback({ app: "nada", cor: "ZZZZZZ" }).includes("Vênus"));
});
const env0 = () => mk();

test("feedback: pesquisa de assinatura guarda decisão e motivo e entra no resumo", async () => {
  assert.throws(() => normalizarRelato({ app: "venus", tipo: "assinatura", respostas: { decisao: "xis" } }), /opções/);
  const env = mk();
  assert.equal((await enviar(env, { app: "venus", tipo: "assinatura", plataforma: "android", texto: "Atende meus clientes sozinha", respostas: { decisao: "vai", plano: "teste", dias_de_uso: 3 } })).status, 201);
  assert.equal((await enviar(env, { app: "venus", tipo: "assinatura", respostas: { decisao: "nao", motivo: "preco", dias_de_uso: 6 } })).status, 201);
  assert.equal((await enviar(env, { app: "venus", tipo: "assinatura", respostas: { decisao: "talvez", motivo: "zzz", dias_de_uso: -4 } })).status, 201);
  const l = await listarRelatos(env, { tipo: "assinatura" });
  assert.equal(l.relatos.length, 3);
  assert.equal(l.resumo.assinaturas, 3);
  assert.deepEqual(l.resumo.decisoes.map((x) => x.id).sort(), ["nao", "talvez", "vai"]);
  assert.equal(l.resumo.motivosNao[0].id, "preco");
  const vai = l.relatos.find((x) => x.respostas.decisao === "vai");
  assert.equal(vai.texto, "Atende meus clientes sozinha");
  assert.equal(vai.respostas.dias_de_uso, 3);
  assert.equal(l.relatos.find((x) => x.respostas.decisao === "talvez").respostas.dias_de_uso, null);
});
