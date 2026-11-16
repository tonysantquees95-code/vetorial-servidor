import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { criarPerfil, gastar } from "../src/voxix/rotas.js";
import { criarComunidade, minhas, publicas, detalhes, previaDoConvite, entrarPorConvite, entrarNaPublica, sair, apagar, trocarCodigo, listarMembros, expulsar, criarSala, apagarSala, codigoDoConvite, novoCodigo, MAX_SALAS } from "../src/voxix/comunidades.js";
import { SalaVoxix, HISTORICO_MAX, JANELA_MAX } from "../src/voxix/sala.js";

process.removeAllListeners("warning");
const T0 = 1_800_000_000_000;
const erro = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para falhar"); };
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123" });
async function pessoa(env, email, apelido) {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: apelido, dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Celular", plataforma: "android" } }, T0);
  await criarPerfil(env, r.usuario.id, { apelido }, apelido);
  return r.usuario.id;
}
const nova = (env, u, d = {}) => criarComunidade(env, u, { nome: "Os Parças", ...d }, gastar, T0);

test("código de convite: aceita solto, com espaço/hífen, em minúsculas e dentro de um link", () => {
  const c = novoCodigo();
  assert.match(c, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(codigoDoConvite("abcd-2345"), "ABCD2345");
  assert.equal(codigoDoConvite("https://venus-servidor.x.workers.dev/voxix/entrar/ABCD2345"), "ABCD2345");
  assert.equal(codigoDoConvite("voxix://entrar/abcd2345"), "ABCD2345");
  for (const ruim of ["", "curto", "ABCD234O", "ABCD23456"]) assert.throws(() => codigoDoConvite(ruim));
});

test("criar: quem cria é o dono, ganha a sala geral e só o dono vê o código", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@x.com", "ana");
  const b = await pessoa(env, "b@x.com", "beto");
  const c = await nova(env, a, { icone: "jogo", publica: true });
  assert.equal(c.cargo, "dono");
  assert.equal(c.icone, "jogo");
  assert.deepEqual(c.salas.map((s) => s.nome), ["geral"]);
  assert.match(c.codigo, /^[A-Z2-9]{8}$/);
  const entrou = await entrarNaPublica(env, b, c.id, T0);
  assert.equal(entrou.cargo, "membro");
  assert.equal(entrou.codigo, undefined);
  assert.equal(entrou.membros, 2);
});

test("criar: exige perfil, nome e respeita o limite por pessoa; ícone inválido vira o padrão", async () => {
  const env = ENV();
  const r = await cadastrar(env, { email: "z@x.com", senha: "senha-forte-1", nome: "Z", dispositivo: { id: "aparelho-z-xxxxxxxxxx", nome: "Cel", plataforma: "android" } }, T0);
  assert.equal((await erro(nova(env, r.usuario.id))).codigo, "sem_perfil");
  const a = await pessoa(env, "a@x.com", "ana");
  assert.equal((await erro(criarComunidade(env, a, { nome: "ab" }, gastar, T0))).codigo, "nome_curto");
  assert.equal((await nova(env, a, { icone: "<script>" })).icone, "grupo");
});

test("privada: não entra pelo id, só por convite (link ou código); prévia mostra o nome", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@x.com", "ana");
  const b = await pessoa(env, "b@x.com", "beto");
  const c = await nova(env, a);
  assert.equal((await erro(entrarNaPublica(env, b, c.id, T0))).codigo, "comunidade_privada");
  assert.equal((await erro(detalhes(env, b, c.id))).codigo, "nao_e_membro");
  assert.equal((await previaDoConvite(env, `https://x/voxix/entrar/${c.codigo}`)).nome, "Os Parças");
  const por = await entrarPorConvite(env, b, { codigo: c.codigo.toLowerCase() }, T0);
  assert.equal(por.id, c.id);
  assert.equal((await entrarPorConvite(env, b, { codigo: c.codigo }, T0)).membros, 2); // entrar de novo não duplica
  assert.equal((await erro(entrarPorConvite(env, b, { codigo: "AAAAAAAA" }, T0))).codigo, "convite_invalido");
});

test("trocar o código: o antigo para de valer; só o dono troca", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@x.com", "ana");
  const b = await pessoa(env, "b@x.com", "beto");
  const c = await nova(env, a);
  assert.equal((await erro(trocarCodigo(env, b, c.id))).codigo, "so_o_dono");
  const { codigo } = await trocarCodigo(env, a, c.id);
  assert.notEqual(codigo, c.codigo);
  assert.equal((await erro(entrarPorConvite(env, b, { codigo: c.codigo }, T0))).codigo, "convite_invalido");
  assert.equal((await entrarPorConvite(env, b, { codigo }, T0)).id, c.id);
});

test("lista: as minhas e as públicas (com busca); privadas não aparecem na lista pública", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@x.com", "ana");
  const b = await pessoa(env, "b@x.com", "beto");
  await nova(env, a, { nome: "Valorant BR", publica: true });
  await nova(env, a, { nome: "Segredo" });
  assert.deepEqual((await publicas(env, "")).comunidades.map((c) => c.nome), ["Valorant BR"]);
  assert.equal((await publicas(env, "valor")).comunidades.length, 1);
  assert.equal((await publicas(env, "zzz")).comunidades.length, 0);
  assert.equal((await minhas(env, a)).comunidades.length, 2);
  assert.equal((await minhas(env, b)).comunidades.length, 0);
});

test("sair, expulsar e apagar", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@x.com", "ana");
  const b = await pessoa(env, "b@x.com", "beto");
  const d = await pessoa(env, "d@x.com", "dani");
  const c = await nova(env, a, { publica: true });
  await entrarNaPublica(env, b, c.id, T0);
  await entrarNaPublica(env, d, c.id, T0);
  assert.equal((await erro(sair(env, a, c.id))).codigo, "dono_nao_sai");
  await sair(env, b, c.id);
  assert.equal((await detalhes(env, a, c.id)).membros, 2);
  assert.equal((await erro(expulsar(env, d, c.id, "ana"))).codigo, "so_o_dono");
  await expulsar(env, a, c.id, "dani", T0);
  assert.deepEqual((await listarMembros(env, a, c.id)).membros.map((m) => m.apelido), ["ana"]);
  assert.equal((await erro(entrarNaPublica(env, d, c.id, T0))).codigo, "expulso"); // quem foi expulso não volta sozinho
  assert.equal((await erro(apagar(env, b, c.id))).codigo, "so_o_dono");
  await apagar(env, a, c.id);
  assert.equal((await erro(detalhes(env, a, c.id))).codigo, "comunidade_inexistente");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM voxix_salas").first()).n, 0);
});

test("salas: só o dono cria; nome único; limite; não apaga a última", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@x.com", "ana");
  const b = await pessoa(env, "b@x.com", "beto");
  const c = await nova(env, a, { publica: true });
  await entrarNaPublica(env, b, c.id, T0);
  assert.equal((await erro(criarSala(env, b, c.id, { nome: "mapas" }))).codigo, "so_o_dono");
  const s = await criarSala(env, a, c.id, { nome: "Dicas De Jogo" }, T0);
  assert.equal(s.nome, "dicas-de-jogo");
  assert.equal((await erro(criarSala(env, a, c.id, { nome: "dicas de jogo" }))).codigo, "sala_existe");
  for (let i = 0; i < MAX_SALAS - 2; i++) await criarSala(env, a, c.id, { nome: `sala${i}` }, T0 + i);
  assert.equal((await erro(criarSala(env, a, c.id, { nome: "demais" }))).codigo, "muitas_salas");
  await apagarSala(env, a, c.id, s.id);
  const solo = await nova(env, a, { nome: "Solo" });
  assert.equal((await erro(apagarSala(env, a, solo.id, solo.salas[0].id))).codigo, "ultima_sala");
});

// ---- sala ao vivo ----
function ws() {
  const w = { enviadas: [], fechada: null, anexo: null, send(t) { this.enviadas.push(JSON.parse(t)); }, close(c) { this.fechada = c; }, serializeAttachment(a) { this.anexo = a; }, deserializeAttachment() { return this.anexo; } };
  return w;
}
function sala() {
  const dados = new Map();
  const conexoes = [];
  const state = {
    storage: {
      list: async ({ prefix, limit }) => new Map([...dados].filter(([k]) => k.startsWith(prefix)).sort().slice(0, limit)),
      put: async (k, v) => { dados.set(k, v); },
      delete: async (k) => { for (const x of Array.isArray(k) ? k : [k]) dados.delete(x); },
      deleteAll: async () => dados.clear(),
    },
    getWebSockets: () => conexoes.filter((c) => !c.fechada),
    acceptWebSocket: (w) => conexoes.push(w),
  };
  return { obj: new SalaVoxix(state, {}), dados, conexoes };
}
const eu = (usuario, apelido) => ({ usuario, apelido, nome: apelido });

test("sala: quem entra recebe o histórico e a lista de online; os outros veem a chegada", async () => {
  const s = sala();
  const a = ws(), b = ws();
  await s.obj.entrar(a, eu("u1", "ana"));
  assert.deepEqual(a.enviadas[0].online.map((p) => p.apelido), ["ana"]);
  await s.obj.entrar(b, eu("u2", "beto"));
  assert.deepEqual(b.enviadas[0].online.map((p) => p.apelido), ["ana", "beto"]);
  assert.deepEqual(a.enviadas.at(-1), { t: "entrou", pessoa: { apelido: "beto", nome: "beto" } });
});

test("sala: mensagem vai para todos, quem mandou recebe a confirmação, e o histórico chega a quem abre depois", async () => {
  const s = sala();
  const a = ws(), b = ws();
  await s.obj.entrar(a, eu("u1", "ana"));
  await s.obj.entrar(b, eu("u2", "beto"));
  await s.obj.receber(a, { t: "msg", corpo: "  bora?  ", idLocal: "l1" }, T0);
  assert.equal(b.enviadas.at(-1).mensagem.corpo, "bora?");
  assert.equal(b.enviadas.at(-1).mensagem.de, "ana");
  const conf = a.enviadas.find((e) => e.t === "confirmada");
  assert.equal(conf.idLocal, "l1");
  const c = ws();
  await s.obj.entrar(c, eu("u3", "caio"));
  assert.deepEqual(c.enviadas[0].mensagens.map((m) => m.corpo), ["bora?"]);
});

test("sala: vazia, grande e rápido demais são recusadas; o histórico tem teto", async () => {
  const s = sala();
  const a = ws();
  await s.obj.entrar(a, eu("u1", "ana"));
  await s.obj.receber(a, { t: "msg", corpo: "   ", idLocal: "v" }, T0);
  await s.obj.receber(a, { t: "msg", corpo: "x".repeat(2001), idLocal: "g" }, T0);
  assert.deepEqual(a.enviadas.filter((e) => e.t === "recusada").map((e) => e.codigo), ["mensagem_vazia", "mensagem_grande"]);
  for (let i = 0; i < JANELA_MAX; i++) await s.obj.receber(a, { t: "msg", corpo: `m${i}` }, T0 + i);
  await s.obj.receber(a, { t: "msg", corpo: "demais", idLocal: "r" }, T0 + 100);
  assert.equal(a.enviadas.at(-1).codigo, "devagar");
  // passada a janela, pode de novo; e o histórico guarda no máximo HISTORICO_MAX
  const s2 = sala();
  const b = ws();
  await s2.obj.entrar(b, eu("u9", "zeca"));
  for (let i = 0; i < HISTORICO_MAX + 30; i++) await s2.obj.receber(b, { t: "msg", corpo: `m${i}` }, T0 + i * 60_000);
  assert.equal((await s2.obj.historico(T0 + (HISTORICO_MAX + 30) * 60_000)).length, HISTORICO_MAX);
});

test("sala: dois aparelhos da mesma pessoa contam uma vez; a saída só aparece quando o último sai", async () => {
  const s = sala();
  const a = ws(), b1 = ws(), b2 = ws();
  await s.obj.entrar(a, eu("u1", "ana"));
  await s.obj.entrar(b1, eu("u2", "beto"));
  await s.obj.entrar(b2, eu("u2", "beto"));
  assert.equal(s.obj.online().length, 2);
  assert.equal(a.enviadas.filter((e) => e.t === "entrou").length, 1);
  b1.fechada = 1000; s.obj.saiu(b1);
  assert.equal(a.enviadas.some((e) => e.t === "saiu"), false);
  b2.fechada = 1000; s.obj.saiu(b2);
  assert.deepEqual(a.enviadas.at(-1), { t: "saiu", pessoa: { apelido: "beto", nome: "beto" } });
});

test("sala: expulsar derruba as conexões da pessoa; encerrar fecha todo mundo e apaga o histórico", async () => {
  const s = sala();
  const a = ws(), b = ws();
  await s.obj.entrar(a, eu("u1", "ana"));
  await s.obj.entrar(b, eu("u2", "beto"));
  await s.obj.receber(a, { t: "msg", corpo: "oi" }, T0);
  s.obj.expulsar("u2");
  assert.equal(b.fechada, 4001);
  assert.equal(b.enviadas.at(-1).t, "removido");
  await s.obj.encerrar();
  assert.equal(a.fechada, 4002);
  assert.equal(s.dados.size, 0);
});
