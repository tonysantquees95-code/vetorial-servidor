import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { falhasDeBuild, avisosDeRelatos, verificarBuilds, verificarRelatos, listarAlertas, marcarAlerta } from "../src/dev/alertas.js";
import { PROJETOS } from "../src/dev/github.js";

const mk = () => ({ DB: bancoDeTeste() });
const P = PROJETOS.find((p) => p.id === "vortex");
const b = (o) => ({ id: 1, workflow: "App (interface e Windows)", estado: "completed", resultado: "failure", numero: 98, commit: "84e0088", ...o });

test("alertas: só build concluído com falha vira aviso (cancelado e em andamento não)", () => {
  const r = falhasDeBuild(P, [b({}), b({ id: 2, resultado: "cancelled" }), b({ id: 3, estado: "in_progress", resultado: null }), b({ id: 4, resultado: "success" })]);
  assert.equal(r.length, 1);
  assert.match(r[0].titulo, /Build falhou: Vortex/);
  assert.match(r[0].detalhe, /#98/);
});

test("alertas: build falho avisa uma vez só e some quando um build verde vem depois", async () => {
  const env = mk();
  assert.equal(await verificarBuilds(env, 1000, async () => [b({})]), PROJETOS.filter((p) => p.repo).length);
  assert.equal(await verificarBuilds(env, 2000, async () => [b({})]), 0); // mesmo build: não repete
  let l = await listarAlertas(env);
  assert.equal(l.novos, PROJETOS.filter((p) => p.repo).length);
  await verificarBuilds(env, 3000, async () => [b({ id: 9, resultado: "success", numero: 99 })]);
  l = await listarAlertas(env);
  assert.equal(l.alertas.length, 0);
});

test("alertas: cada relato de problema avisa e 3 na mesma hora viram erro em alta", () => {
  const agora = 10 * 3600000;
  const rel = [1, 2, 3].map((i) => ({ id: i, app: "venus", texto: "travou " + i, criado: agora - i * 60000 }));
  const r = avisosDeRelatos(rel, agora);
  assert.equal(r.filter((x) => x.tipo === "relato").length, 3);
  assert.equal(r.filter((x) => x.tipo === "alta").length, 1);
  assert.equal(avisosDeRelatos(rel.slice(0, 2), agora).filter((x) => x.tipo === "alta").length, 0);
});

test("alertas: lê os relatos do banco, marca como visto e resolvido", async () => {
  const env = mk(); const agora = Date.now();
  for (let i = 0; i < 3; i++) await env.DB.prepare("INSERT INTO feedbacks (criado, app, versao, plataforma, tipo, texto) VALUES (?, 'velox', '1.1', 'android', 'problema', ?)").bind(agora - i * 1000, "não abre " + i).run();
  await env.DB.prepare("INSERT INTO feedbacks (criado, app, versao, plataforma, tipo, texto) VALUES (?, 'velox', '1.1', 'android', 'elogio', 'bom')").bind(agora).run();
  assert.equal(await verificarRelatos(env, agora), 4); // 3 relatos + 1 erro em alta; elogio não avisa
  assert.equal(await verificarRelatos(env, agora), 0);
  let l = await listarAlertas(env);
  assert.equal(l.novos, 4);
  await marcarAlerta(env, 0, { todos: true });
  l = await listarAlertas(env);
  assert.equal(l.novos, 0);
  await marcarAlerta(env, l.alertas[0].id, { status: "resolvido" });
  assert.equal((await listarAlertas(env)).alertas.length, 3);
});
