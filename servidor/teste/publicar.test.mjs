import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { registrarLoja } from "../src/loja/lojas.js";
import { guardarDestino, publicarVencidos, publicarAgora, textoDoPost, destinos, logDaLoja } from "../src/loja/publicar.js";
import { tratarLoja } from "../src/loja/rotas.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123" });
const T0 = 1_800_000_000_000;

async function cenario() {
  const env = ENV();
  const r = await registrarLoja(env, { nome: "Loja" }, T0);
  const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(r.id).first();
  const novo = (extra = {}) => env.DB.prepare("INSERT INTO fila_posts (loja, legenda, copy, hashtags, status, agendado_para, criado, atualizado, imagem, canal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(loja.id, "Vela linda", "Leve a sua", JSON.stringify(["vela", "#casa"]), extra.status || "agendado", extra.quando ?? T0 + 1000, T0, T0, extra.imagem ?? "https://img.exemplo/v.jpg", extra.canal || "instagram").run().then((x) => x.meta.last_row_id);
  return { env, loja, r, novo };
}
const falso = (resp) => { const chamadas = []; const f = async (url, init) => { chamadas.push({ url: String(url), corpo: init && init.body ? JSON.parse(init.body) : null, init }); return resp(String(url), chamadas.length); }; f.chamadas = chamadas; return f; };
const ok = (d) => new Response(JSON.stringify(d), { status: 200 });

test("monta o texto com legenda, copy e hashtags", () => {
  assert.equal(textoDoPost({ legenda: "A", copy: "B", hashtags: '["x","#y"]' }), "A\n\nB\n\n#x #y");
});

test("Instagram: cria a mídia e publica; registra no log", async () => {
  const { env, loja, novo } = await cenario();
  await guardarDestino(env, loja, "instagram", { igUserId: "1784140000", token: "t".repeat(30) }, T0);
  const id = await novo();
  const f = falso((u) => ok(u.endsWith("/media") ? { id: "criacao1" } : { id: "midia9" }));
  const s = await publicarVencidos(env, { agora: T0 + 2000, f });
  assert.equal(s.length, 1);
  assert.equal(s[0].ok, true);
  assert.match(f.chamadas[0].url, /\/1784140000\/media$/);
  assert.equal(f.chamadas[0].corpo.image_url, "https://img.exemplo/v.jpg");
  assert.match(f.chamadas[0].corpo.caption, /#vela #casa/);
  assert.equal(f.chamadas[1].corpo.creation_id, "criacao1");
  const p = await env.DB.prepare("SELECT status, publicado_em FROM fila_posts WHERE id = ?").bind(id).first();
  assert.equal(p.status, "publicado");
  assert.equal((await logDaLoja(env, loja))[0].status, "publicado");
  assert.equal((await publicarVencidos(env, { agora: T0 + 3000, f })).length, 0); // não publica duas vezes
});

test("post ainda no futuro não sai; erro tenta de novo e na 3ª vez fica como erro", async () => {
  const { env, loja, novo } = await cenario();
  await guardarDestino(env, loja, "instagram", { igUserId: "1784140000", token: "t".repeat(30) }, T0);
  const id = await novo({ quando: T0 + 60_000 });
  const ruim = falso(() => new Response(JSON.stringify({ error: { message: "token vencido" } }), { status: 400 }));
  assert.equal((await publicarVencidos(env, { agora: T0, f: ruim })).length, 0);
  let agora = T0 + 60_000;
  for (let i = 1; i <= 3; i++) {
    const s = await publicarVencidos(env, { agora, f: ruim });
    assert.equal(s[0].ok, false);
    assert.equal(s[0].definitivo, i === 3);
    agora += 40 * 60_000;
  }
  const p = await env.DB.prepare("SELECT status, tentativas, erro FROM fila_posts WHERE id = ?").bind(id).first();
  assert.deepEqual([p.status, p.tentativas, p.erro], ["erro", 3, "token vencido"]);
  assert.equal((await publicarVencidos(env, { agora, f: ruim })).length, 0);
  const log = await logDaLoja(env, loja);
  assert.deepEqual(log.map((l) => l.status).reverse(), ["tentando_de_novo", "tentando_de_novo", "erro"]);
});

test("sem destino conectado ou sem imagem: erro claro", async () => {
  const { env, loja, novo } = await cenario();
  const id = await novo();
  const r = await publicarAgora(env, loja, id, { agora: T0 + 5, f: falso(() => ok({})) });
  assert.match(r.erro, /Conecte o destino/);
  await guardarDestino(env, loja, "instagram", { igUserId: "1784140000", token: "t".repeat(30) }, T0);
  const sem = await novo({ imagem: "" });
  assert.match((await publicarAgora(env, loja, sem, { agora: T0 + 6, f: falso(() => ok({})) })).erro, /imagem pública/);
});

test("webhook: entrega assinada (HMAC) e publicar agora", async () => {
  const { env, loja, novo } = await cenario();
  const d = await guardarDestino(env, loja, "webhook", { url: "https://robo.exemplo/hook" }, T0);
  assert.ok(d.segredo);
  assert.equal((await destinos(env, loja)).find((x) => x.tipo === "webhook").conectado, true);
  const id = await novo({ status: "sugerido", canal: "webhook", quando: null });
  const f = falso(() => ok({}));
  const r = await publicarAgora(env, loja, id, { agora: T0 + 10, f });
  assert.equal(r.ok, true);
  assert.equal(f.chamadas[0].corpo.evento, "post");
  assert.match(f.chamadas[0].init.headers["x-venus-assinatura"], /^[a-f0-9]{64}$/);
  await assert.rejects(publicarAgora(env, loja, id, { agora: T0 + 11, f })); // já publicado
});

test("rotas: editar texto sem mexer no agendamento, excluir em lote, destinos", async () => {
  const { env, loja, r, novo } = await cenario();
  const a = await novo(), b = await novo(), c = await novo({ status: "sugerido", quando: null });
  const chama = (metodo, caminho, corpo) => tratarLoja(new Request(`https://v.test${caminho}`, { method: metodo, headers: { authorization: `Bearer ${r.token}`, "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, { waitUntil() {} }, new URL(`https://v.test${caminho}`), caminho);
  let res = await chama("POST", `/marketing/fila/${a}/editar`, { legenda: "Nova", hashtags: ["Oferta", "#Vela", "oferta"] });
  assert.equal(res.status, 200);
  const p = await env.DB.prepare("SELECT * FROM fila_posts WHERE id = ?").bind(a).first();
  assert.equal(p.legenda, "Nova");
  assert.equal(p.status, "agendado");
  assert.equal(p.agendado_para, T0 + 1000);
  assert.deepEqual(JSON.parse(p.hashtags).length, 2);
  res = await chama("POST", "/marketing/excluir", { ids: [a, b] });
  assert.equal((await res.json()).removidos, 2);
  res = await chama("PUT", "/marketing/destinos/webhook", { url: "http://inseguro" });
  assert.equal(res.status, 400);
  res = await chama("PUT", "/marketing/destinos/webhook", { url: "https://robo.exemplo/h" });
  assert.equal(res.status, 200);
  res = await chama("GET", "/marketing/destinos");
  assert.equal((await res.json()).destinos.find((x) => x.tipo === "webhook").conectado, true);
  res = await chama("GET", "/marketing/log");
  assert.equal(res.status, 200);
  assert.ok(c);
});
