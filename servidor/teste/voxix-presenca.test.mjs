import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { criarPerfil, apelidoValido, tratarVoxix } from "../src/voxix/rotas.js";
import { trocarApelido, definirPresenca, jogando, definirConquistas, conquistasLimpas, perfilPublico, presencaDe, DIAS_ENTRE_TROCAS, DIAS_RESERVADO } from "../src/voxix/presenca.js";

process.removeAllListeners("warning");
const T0 = 1_800_000_000_000;
const DIA = 86_400_000;
const erro = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para falhar"); };
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123" });
async function pessoa(env, email, apelido) {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: apelido, dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Celular", plataforma: "android" } }, T0);
  await criarPerfil(env, r.usuario.id, { apelido }, apelido);
  return { id: r.usuario.id, token: r.token };
}
const conversar = (env, a, b) => env.DB.prepare("INSERT INTO voxix_mensagens (id, de, para, corpo, tipo, criado, entregue) VALUES (?, ?, ?, 'oi', 'texto', ?, 1)").bind("m" + Math.random(), a, b, T0).run();

test("trocar @: vale, guarda o antigo e só deixa trocar de novo depois de 30 dias", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  const r = await trocarApelido(env, a.id, apelidoValido("Ana_Gamer"), T0);
  assert.equal(r.apelido, "ana_gamer");
  assert.equal(r.proximaTroca, T0 + DIAS_ENTRE_TROCAS * DIA);
  assert.equal((await erro(trocarApelido(env, a.id, "outro_nome", T0 + 5 * DIA))).codigo, "troca_cedo");
  assert.equal((await trocarApelido(env, a.id, "outro_nome", T0 + 31 * DIA)).apelido, "outro_nome");
});

test("trocar @: o antigo fica reservado só para quem o largou; os outros não pegam", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  const b = await pessoa(env, "b@exemplo.com", "beto");
  await trocarApelido(env, a.id, "ana_nova", T0);
  assert.equal((await erro(trocarApelido(env, b.id, "ana", T0 + 1))).codigo, "apelido_em_uso");
  const c = await cadastrar(env, { email: "c@exemplo.com", senha: "senha-forte-1", nome: "C", dispositivo: { id: "aparelho-c-xxxxxxxxxx", nome: "Cel", plataforma: "android" } }, T0);
  assert.equal((await erro(criarPerfil(env, c.usuario.id, { apelido: "ana" }))).codigo, "apelido_em_uso");
  // passados os 60 dias a reserva expira e o @ fica livre
  assert.equal((await trocarApelido(env, b.id, "ana", T0 + (DIAS_RESERVADO + 1) * DIA)).apelido, "ana");
});

test("trocar @: a dona pode voltar ao antigo (depois dos 30 dias) e a reserva some", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  await trocarApelido(env, a.id, "ana_nova", T0);
  assert.equal((await trocarApelido(env, a.id, "ana", T0 + 31 * DIA)).apelido, "ana");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM voxix_apelidos_reservados WHERE apelido = 'ana'").first()).n, 0);
});

test("trocar @: em uso, reservado do sistema e inválido são recusados; duas trocas ao mesmo tempo só deixam uma", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  await pessoa(env, "b@exemplo.com", "beto");
  assert.equal((await erro(trocarApelido(env, a.id, "beto", T0))).codigo, "apelido_em_uso");
  for (const ruim of ["admin", "x", "com espaço", "a;drop"]) assert.throws(() => apelidoValido(ruim));
  const rs = await Promise.allSettled([trocarApelido(env, a.id, "ana_1", T0), trocarApelido(env, a.id, "ana_2", T0)]);
  assert.equal(rs.filter((x) => x.status === "fulfilled").length, 1);
});

test("jogando agora: grava, soma o tempo e some depois de 3 minutos sem aviso", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  const b = await pessoa(env, "b@exemplo.com", "beto");
  await definirPresenca(env, a.id, "todos");
  await jogando(env, a.id, { jogo: "Super Mario World", plataforma: "retro" }, T0);
  await jogando(env, a.id, { jogo: "super mario world", plataforma: "retro" }, T0 + 60_000);
  await jogando(env, a.id, { jogo: "Super Mario World", plataforma: "retro" }, T0 + 120_000);
  const p = await perfilPublico(env, b.id, "ana", T0 + 130_000);
  assert.equal(p.jogandoAgora.jogo, "Super Mario World");
  assert.equal(p.maisJogados[0].horas, 0.0 + Math.round((120 / 3600) * 10) / 10);
  assert.equal((await perfilPublico(env, b.id, "ana", T0 + 120_000 + 4 * 60_000)).jogandoAgora, null);
  await jogando(env, a.id, { jogo: "" }, T0 + 200_000);
  assert.equal((await perfilPublico(env, b.id, "ana", T0 + 201_000)).jogandoAgora, null);
});

test("privacidade: amigos (padrão) só para quem já conversou, invisível para ninguém, todos para qualquer um", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  const amigo = await pessoa(env, "b@exemplo.com", "beto");
  const estranho = await pessoa(env, "c@exemplo.com", "caio");
  await conversar(env, amigo.id, a.id);
  await jogando(env, a.id, { jogo: "Minecraft", plataforma: "windows" }, T0);
  const vê = async (quem) => (await perfilPublico(env, quem.id, "ana", T0 + 1000)).jogandoAgora;
  assert.equal((await vê(amigo)).jogo, "Minecraft");
  assert.equal(await vê(estranho), null);
  assert.equal((await presencaDe(env, estranho.id, "ana", T0 + 1000)).presenca.ana, undefined);
  assert.equal((await presencaDe(env, amigo.id, "ana,caio", T0 + 1000)).presenca.ana.jogo, "Minecraft");
  await definirPresenca(env, a.id, "todos");
  assert.equal((await vê(estranho)).jogo, "Minecraft");
  await definirPresenca(env, a.id, "invisivel"); // invisível também apaga o que já estava aparecendo
  assert.equal(await vê(amigo), null);
  assert.equal((await erro(definirPresenca(env, a.id, "qualquer"))).codigo, "presenca_invalida");
});

test("privacidade: quem me bloqueou nunca vê o que eu jogo, mesmo com 'todos'", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  const b = await pessoa(env, "b@exemplo.com", "beto");
  await definirPresenca(env, a.id, "todos");
  await jogando(env, a.id, { jogo: "Doom", plataforma: "windows" }, T0);
  await env.DB.prepare("INSERT INTO voxix_bloqueios (usuario, bloqueado, criado) VALUES (?, ?, ?)").bind(a.id, b.id, T0).run();
  assert.equal((await perfilPublico(env, b.id, "ana", T0 + 1000)).jogandoAgora, null);
});

test("jogando: nome sujo é limpo, plataforma estranha vira web e o número de jogos por pessoa tem teto", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  await definirPresenca(env, a.id, "todos");
  await jogando(env, a.id, { jogo: "<img src=x onerror=alert(1)>\u0000Jogo", plataforma: "ps5" }, T0);
  const p = await perfilPublico(env, a.id, "ana", T0 + 1);
  assert.ok(!/[<>\u0000]/.test(p.jogandoAgora.jogo));
  assert.equal(p.jogandoAgora.plataforma, "web");
  for (let i = 0; i < 130; i++) await jogando(env, a.id, { jogo: `jogo ${i}`, plataforma: "web" }, T0 + i * 100_000);
  assert.ok((await env.DB.prepare("SELECT COUNT(*) AS n FROM voxix_jogos WHERE usuario = ?").bind(a.id).first()).n <= 100);
});

test("conquistas: só id e nome limpos, sem repetidos, com teto", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  const lixo = [{ id: "ok_1", nome: "Colecionador" }, { id: "ok_1", nome: "repetido" }, { id: "ruim id", nome: "x" }, { id: "b", nome: "<b>negrito</b>" }, null, { id: "c" }];
  const r = await definirConquistas(env, a.id, lixo, T0);
  assert.deepEqual(r.itens.map((x) => x.id), ["ok_1", "b"]);
  assert.ok(!/[<>]/.test(r.itens[1].nome));
  assert.equal(conquistasLimpas(Array.from({ length: 100 }, (_, i) => ({ id: "c" + i, nome: "n" + i }))).length, 40);
  assert.equal((await erro(definirConquistas(env, a.id, "nao-lista"))).codigo, "conquistas_invalidas");
  assert.equal((await perfilPublico(env, a.id, "ana")).conquistas.length, 2);
});

test("rotas: exigem login e funcionam pela API (trocar @, privacidade, jogando, perfil)", async () => {
  const env = ENV();
  const a = await pessoa(env, "a@exemplo.com", "ana");
  const b = await pessoa(env, "b@exemplo.com", "beto");
  const chamar = (token, metodo, caminho, corpo) => tratarVoxix(new Request("https://x.test" + caminho, { method: metodo, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, new URL("https://x.test" + caminho), caminho.split("?")[0]);
  assert.equal((await chamar(null, "PUT", "/voxix/perfil/apelido", { apelido: "novo_nome" })).status, 401);
  assert.equal((await chamar(null, "GET", "/voxix/pessoas/ana")).status, 401);
  assert.equal((await chamar(a.token, "PUT", "/voxix/perfil/apelido", { apelido: "admin" })).status, 400);
  const t = await chamar(a.token, "PUT", "/voxix/perfil/apelido", { apelido: "ana_nova" });
  assert.equal(t.status, 200);
  const tarde = await chamar(a.token, "PUT", "/voxix/perfil/apelido", { apelido: "ana_outra" });
  assert.equal(tarde.status, 429);
  assert.ok((await tarde.json()).proximaTroca > Date.now());
  assert.equal((await chamar(a.token, "PUT", "/voxix/privacidade", { presenca: "todos" })).status, 200);
  assert.equal((await chamar(a.token, "PUT", "/voxix/jogando", { jogo: "Tetris", plataforma: "android" })).status, 200);
  const v = await (await chamar(b.token, "GET", "/voxix/pessoas/ANA_NOVA")).json();
  assert.equal(v.apelido, "ana_nova");
  assert.equal(v.jogandoAgora.jogo, "Tetris");
  assert.equal((await chamar(b.token, "GET", "/voxix/pessoas/ninguem_aqui")).status, 404);
  assert.equal((await (await chamar(a.token, "GET", "/voxix/perfil")).json()).presenca, "todos");
});
