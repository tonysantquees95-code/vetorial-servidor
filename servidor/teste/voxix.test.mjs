import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { apelidoValido, criarPerfil, enviar, bloquear, desbloquear, listarBloqueios, denunciar, transcrever, gastar, tratarVoxix, LIMITE_DIARIO, MAX_TEXTO } from "../src/voxix/rotas.js";
import { CaixaVoxix, MAX_FILA, VALIDADE_MS } from "../src/voxix/caixa.js";

process.removeAllListeners("warning");
const T0 = 1_800_000_000_000;
const erro = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para falhar"); };

// Durable Object de mentira: um armazenamento em memória por usuário, com a mesma classe de verdade.
function caixasDeTeste() {
  const caixas = new Map();
  const get = (nome) => {
    if (!caixas.has(nome)) {
      const dados = new Map();
      const sockets = [];
      const state = {
        storage: {
          list: async ({ prefix, limit }) => new Map([...dados].filter(([k]) => k.startsWith(prefix)).sort().slice(0, limit)),
          put: async (k, v) => { dados.set(k, v); },
          delete: async (k) => { for (const x of Array.isArray(k) ? k : [k]) dados.delete(x); },
        },
        getWebSockets: () => sockets,
        acceptWebSocket: (ws) => sockets.push(ws),
      };
      caixas.set(nome, { obj: new CaixaVoxix(state, {}), dados, sockets });
    }
    return caixas.get(nome);
  };
  return { caixas, get, ns: { idFromName: (n) => n, get: (n) => ({ fetch: (url, init) => get(n).obj.fetch(new Request(url, init)) }) } };
}
const ENV = () => { const c = caixasDeTeste(); return { DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", VOXIX_CAIXA: c.ns, _c: c }; };
async function pessoa(env, email, apelido) {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: apelido, dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Celular", plataforma: "android" } }, T0);
  const perfil = apelido ? await criarPerfil(env, r.usuario.id, { apelido }, apelido) : null;
  return { id: r.usuario.id, token: r.token, perfil };
}

test("apelido: só minúsculas, números e _; reservados não valem", () => {
  assert.equal(apelidoValido("  Toni_95 "), "toni_95");
  for (const ruim of ["ab", "com espaço", "açaí", "a".repeat(21), "admin", "Voxix", ""]) assert.throws(() => apelidoValido(ruim));
});

test("perfil: apelido único (sem diferenciar maiúsculas) e não muda depois", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "toni");
  assert.equal(a.perfil.apelido, "toni");
  const b = await cadastrar(env, { email: "b@exemplo.com", senha: "senha-forte-1", nome: "B", dispositivo: { id: "aparelho-b-xxxxxxxxxx", nome: "Cel", plataforma: "android" } }, T0);
  assert.equal((await erro(criarPerfil(env, b.usuario.id, { apelido: "TONI" }))).codigo, "apelido_em_uso");
  assert.equal((await erro(criarPerfil(env, a.id, { apelido: "outro_nome" }))).codigo, "perfil_existe");
});

test("mensagem: chega na caixa de quem recebe com o apelido de quem mandou", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  const b = await pessoa(env, "b@exemplo.com", "beto");
  const r = await enviar(env, a.id, { para: "Beto", corpo: "  oi, bora jogar?  ", idLocal: "x1" }, T0);
  assert.equal(r.ok, true);
  assert.equal(r.idLocal, "x1");
  const fila = await env._c.get(b.id).obj.fila(T0 + 1);
  assert.equal(fila.length, 1);
  assert.equal(fila[0].de, "ana");
  assert.equal(fila[0].corpo, "oi, bora jogar?");
  assert.equal((await env._c.get(a.id).obj.fila(T0)).length, 0);
});

test("mensagem: vazia, grande, para si mesmo, pessoa inexistente e sem perfil são recusadas", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  await pessoa(env, "b@exemplo.com", "beto");
  const sem = await cadastrar(env, { email: "c@exemplo.com", senha: "senha-forte-1", nome: "C", dispositivo: { id: "aparelho-c-xxxxxxxxxx", nome: "Cel", plataforma: "android" } }, T0);
  assert.equal((await erro(enviar(env, a.id, { para: "beto", corpo: "   " }, T0))).codigo, "mensagem_vazia");
  assert.equal((await erro(enviar(env, a.id, { para: "beto", corpo: "x".repeat(MAX_TEXTO + 1) }, T0))).codigo, "mensagem_grande");
  assert.equal((await erro(enviar(env, a.id, { para: "ana", corpo: "oi" }, T0))).codigo, "para_si");
  assert.equal((await erro(enviar(env, a.id, { para: "fulano", corpo: "oi" }, T0))).codigo, "pessoa_inexistente");
  assert.equal((await erro(enviar(env, sem.usuario.id, { para: "beto", corpo: "oi" }, T0))).codigo, "sem_perfil");
});

test("bloqueio: quem foi bloqueado não consegue entregar e não percebe; desbloquear volta ao normal", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  const b = await pessoa(env, "b@exemplo.com", "beto");
  await bloquear(env, b.id, "ana", T0);
  assert.deepEqual((await listarBloqueios(env, b.id)).bloqueios.map((x) => x.apelido), ["ana"]);
  const r = await enviar(env, a.id, { para: "beto", corpo: "oi?" }, T0);
  assert.equal(r.ok, true); // do lado dela parece enviado
  assert.equal((await env._c.get(b.id).obj.fila(T0)).length, 0);
  await desbloquear(env, b.id, "ana");
  await enviar(env, a.id, { para: "beto", corpo: "voltei" }, T0 + 10);
  assert.equal((await env._c.get(b.id).obj.fila(T0 + 20)).length, 1);
  assert.equal((await erro(bloquear(env, b.id, "beto", T0))).codigo, "para_si");
});

test("caixa: ao vivo entrega no WebSocket, ack apaga, vencida some e fila cheia recusa", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  const b = await pessoa(env, "b@exemplo.com", "beto");
  const cx = env._c.get(b.id);
  const recebidas = [];
  cx.sockets.push({ send: (t) => recebidas.push(JSON.parse(t)) });
  await enviar(env, a.id, { para: "beto", corpo: "ao vivo" }, T0);
  assert.equal(recebidas[0].t, "msg");
  assert.equal(recebidas[0].mensagem.corpo, "ao vivo");
  const id = recebidas[0].mensagem.id;
  await cx.obj.webSocketMessage({ send() {} }, JSON.stringify({ t: "ack", ids: [id, "../apagar-tudo"] }));
  assert.equal((await cx.obj.fila(T0)).length, 0);
  await cx.obj.entregar({ id: "antigaantiga", de: "ana", deNome: "Ana", conversa: "ana", corpo: "velha", criado: T0 - VALIDADE_MS - 1 }, T0);
  assert.equal((await cx.obj.fila(T0)).length, 0);
  for (let i = 0; i < MAX_FILA; i++) cx.dados.set(`m:cheia${i}`, { id: `cheia${i}`, criado: T0 });
  assert.equal((await cx.obj.entregar({ id: "maisuma12345", de: "ana", corpo: "x" }, T0)).codigo, "caixa_cheia");
});

test("denúncia grava com o trecho; limite diário vale para denúncia, mensagem e ditado", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  const b = await pessoa(env, "b@exemplo.com", "beto");
  assert.equal((await erro(denunciar(env, a.id, { apelido: "beto", motivo: "" }, T0))).codigo, "motivo_vazio");
  const r = await denunciar(env, a.id, { apelido: "beto", motivo: "ofensa", trecho: "xingou" }, T0);
  const linha = await env.DB.prepare("SELECT * FROM voxix_denuncias WHERE id = ?").bind(r.id).first();
  assert.equal(linha.alvo, b.id);
  assert.equal(linha.trecho, "xingou");
  for (let i = 1; i < LIMITE_DIARIO.denuncia; i++) await gastar(env, a.id, "denuncia", T0);
  assert.equal((await erro(denunciar(env, a.id, { apelido: "beto", motivo: "de novo" }, T0))).codigo, "limite_diario");
  assert.equal((await denunciar(env, a.id, { apelido: "beto", motivo: "amanhã" }, T0 + 86_400_000)).ok, true);
});

test("ditado: precisa do serviço ligado, áudio vazio ou longo demais é recusado e devolve o texto", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  assert.equal((await erro(transcrever(env, a.id, new ArrayBuffer(10), "audio/webm", T0))).codigo, "ditado_indisponivel");
  env.AI = { run: async (modelo, entrada) => { assert.match(modelo, /whisper/); assert.ok(entrada.audio.length > 0); return { text: " oi pessoal " }; } };
  assert.equal((await erro(transcrever(env, a.id, new ArrayBuffer(0), "audio/webm", T0))).codigo, "audio_vazio");
  assert.equal((await erro(transcrever(env, a.id, new ArrayBuffer(1_000_001), "audio/webm", T0))).codigo, "audio_grande");
  assert.equal((await transcrever(env, a.id, new Uint8Array([1, 2, 3]).buffer, "audio/webm", T0)).texto, "oi pessoal");
});

test("rotas: exigem login, e o perfil/busca/mensagem funcionam pela API", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", null);
  const b = await pessoa(env, "b@exemplo.com", "beto");
  const chamar = (token, metodo, caminho, corpo) => tratarVoxix(new Request(`https://v.test${caminho}`, { method: metodo, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, new URL(`https://v.test${caminho}`), caminho.split("?")[0]);
  assert.equal((await chamar(null, "GET", "/voxix/perfil")).status, 401);
  assert.equal((await (await chamar(a.token, "GET", "/voxix/perfil")).json()).apelido, null);
  assert.equal((await chamar(a.token, "PUT", "/voxix/perfil", { apelido: "ana_gamer" })).status, 201);
  assert.equal((await (await chamar(a.token, "GET", "/voxix/buscar?apelido=BETO")).json()).apelido, "beto");
  assert.equal((await chamar(a.token, "GET", "/voxix/buscar?apelido=ninguem")).status, 404);
  assert.equal((await chamar(a.token, "POST", "/voxix/mensagens", { para: "beto", corpo: "e aí" })).status, 201);
  assert.equal((await env._c.get(b.id).obj.fila(Date.now())).length, 1);
  const c = await pessoa(env, "c@exemplo.com", null);
  assert.equal((await chamar(c.token, "GET", "/voxix/ws")).status, 409); // sem perfil não abre o chat ao vivo
  assert.equal((await chamar(b.token, "GET", "/voxix/ws")).status, 426); // com perfil mas sem pedido de WebSocket, a caixa recusa
});
