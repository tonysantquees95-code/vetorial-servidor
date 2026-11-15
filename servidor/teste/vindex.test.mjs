import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { tratarVindex, pedir, buscar, responder, consultar, VALIDADE_MS } from "../src/vindex/rotas.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ORIGENS_PERMITIDAS: "https://app.exemplo" });
const T0 = 1_800_000_000_000;
const erro = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para falhar"); };
async function usuario(env, email = "toni@exemplo.com") {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: "Toni", dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Celular", plataforma: "android" } }, T0);
  return { id: r.usuario.id, token: r.token };
}
const chamar = (env, token, metodo, caminho, corpo) => tratarVindex(new Request(`https://v.test${caminho}`, { method: metodo, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, new URL(`https://v.test${caminho}`), caminho.split("?")[0]);

test("a Vênus só pede ao Vindex quando ele está aberto e só ações da lista", async () => {
  const env = ENV();
  const u = await usuario(env);
  assert.equal((await erro(pedir(env, u.id, "otimizar", T0))).codigo, "vindex_fechado");
  await buscar(env, u.id, "windows", T0);
  assert.equal((await erro(pedir(env, u.id, "apagar_tudo", T0))).codigo, "acao_invalida");
  const p = await pedir(env, u.id, "otimizar", T0 + 1000);
  assert.equal(p.plataforma, "windows");
  // passa de 20s sem o Vindex perguntar: considerado fechado
  assert.equal((await erro(pedir(env, u.id, "otimizar", T0 + 60_000))).codigo, "vindex_fechado");
});

test("ciclo completo: pede, o Vindex busca, responde e a Vênus lê o resultado", async () => {
  const env = ENV();
  const u = await usuario(env);
  await buscar(env, u.id, "android", T0);
  const p = await pedir(env, u.id, "otimizar", T0 + 1);
  assert.equal((await consultar(env, u.id, p.id, T0 + 2)).status, "pendente");
  const fila = await buscar(env, u.id, "android", T0 + 3);
  assert.deepEqual(fila.map((x) => x.id), [p.id]);
  assert.equal((await buscar(env, u.id, "android", T0 + 4)).length, 0); // já entregue uma vez
  await responder(env, u.id, p.id, { ok: true, resumo: "12 arquivos, 30 MB liberados", dados: { liberado: 30 } }, T0 + 5);
  const r = await consultar(env, u.id, p.id, T0 + 6);
  assert.equal(r.status, "concluido");
  assert.equal(r.resumo, "12 arquivos, 30 MB liberados");
  assert.deepEqual(r.dados, { liberado: 30 });
});

test("pedido que ninguém executa expira; e um usuário não vê pedidos de outro", async () => {
  const env = ENV();
  const a = await usuario(env, "a@exemplo.com");
  const b = await usuario(env, "b@exemplo.com");
  await buscar(env, a.id, "windows", T0);
  const p = await pedir(env, a.id, "diagnostico", T0 + 1);
  assert.equal((await consultar(env, a.id, p.id, T0 + VALIDADE_MS + 10)).status, "expirado");
  assert.equal((await erro(consultar(env, b.id, p.id, T0))).codigo, "pedido_inexistente");
  assert.equal((await erro(responder(env, b.id, p.id, { ok: true }, T0))).codigo, "pedido_inexistente");
});

test("rotas HTTP exigem login e funcionam de ponta a ponta", async () => {
  const env = ENV();
  const u = await usuario(env);
  const sem = await tratarVindex(new Request("https://v.test/vindex/fila"), env, new URL("https://v.test/vindex/fila"), "/vindex/fila");
  assert.equal(sem.status, 401);
  assert.equal((await chamar(env, u.token, "GET", "/vindex/fila?plataforma=windows")).status, 200);
  const pedido = await chamar(env, u.token, "POST", "/vindex/pedidos", { comando: "otimizar" });
  assert.equal(pedido.status, 201);
  const { id } = await pedido.json();
  const ok = await chamar(env, u.token, "POST", `/vindex/pedidos/${id}/resultado`, { ok: true, resumo: "pronto" });
  assert.equal(ok.status, 200);
  assert.equal((await (await chamar(env, u.token, "GET", `/vindex/pedidos/${id}`)).json()).resumo, "pronto");
});
