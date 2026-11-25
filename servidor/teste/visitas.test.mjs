import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { paginaLimpa, registrarVisita, registrarDownload, resumoDeVisitas, nomeDoDownload, verificarCadastros, verificarDownloads, diaDeBrasilia } from "../src/dev/visitas.js";
import { listarAlertas, marcarAlerta } from "../src/dev/alertas.js";

const mk = () => ({ DB: bancoDeTeste() });
const pedido = (ip, ua = "Mozilla/5.0 (Linux; Android 14) Chrome/120") => ({ headers: new Map([["cf-connecting-ip", ip], ["user-agent", ua]]) });
const req = (ip, ua) => { const r = pedido(ip, ua); return { headers: { get: (k) => r.headers.get(k.toLowerCase()) ?? null } }; };
const AGORA = Date.UTC(2026, 10, 25, 15, 0, 0);

test("visitas: página limpa só aceita endereço simples", () => {
  assert.equal(paginaLimpa("/vortex.html?x=1"), "vortex.html");
  assert.equal(paginaLimpa(""), "inicio");
  assert.equal(paginaLimpa("pdf/"), "pdf/");
  assert.equal(paginaLimpa("<script>"), "");
  assert.equal(paginaLimpa("a".repeat(80)), "");
});

test("visitas: a mesma pessoa no mesmo dia conta uma vez, robô não conta", async () => {
  const env = mk();
  assert.ok(await registrarVisita(env, req("1.1.1.1"), "vortex.html", AGORA));
  await registrarVisita(env, req("1.1.1.1"), "vortex.html", AGORA + 1000);
  await registrarVisita(env, req("2.2.2.2"), "vortex.html", AGORA);
  await registrarVisita(env, req("2.2.2.2"), "inicio", AGORA);
  assert.equal(await registrarVisita(env, req("3.3.3.3", "Googlebot/2.1"), "inicio", AGORA), false);
  assert.equal(await registrarVisita(env, req("4.4.4.4"), "<x>", AGORA), false);
  const r = await resumoDeVisitas(env, 7, AGORA);
  assert.equal(r.hoje, 2);
  assert.equal(r.paginas[0].pagina, "vortex.html");
  assert.equal(r.paginas[0].visitas, 2);
  assert.equal(r.serie.length, 7);
  const l = JSON.stringify(env.DB._db.prepare("SELECT * FROM site_visitas").all());
  assert.ok(!l.includes("1.1.1.1") && !l.includes("Mozilla")); // nada de IP nem navegador guardado
});

test("visitas: o código do visitante muda de um dia para o outro", async () => {
  const env = mk();
  await registrarVisita(env, req("1.1.1.1"), "inicio", AGORA);
  await registrarVisita(env, req("1.1.1.1"), "inicio", AGORA + 86400000);
  const v = env.DB._db.prepare("SELECT DISTINCT visitante FROM site_visitas").all();
  assert.equal(v.length, 2);
  assert.equal((await resumoDeVisitas(env, 7, AGORA + 86400000)).ultimos7, 2);
});

test("downloads: um por pessoa/app/dia e nomes legíveis", async () => {
  const env = mk();
  await registrarDownload(env, req("1.1.1.1"), "vortex-android", AGORA);
  await registrarDownload(env, req("1.1.1.1"), "vortex-android", AGORA + 5);
  await registrarDownload(env, req("2.2.2.2"), "vortex-android", AGORA);
  await registrarDownload(env, req("2.2.2.2"), "vindex-windows", AGORA);
  assert.equal(await registrarDownload(env, req("2.2.2.2"), "../x", AGORA), false);
  const r = await resumoDeVisitas(env, 7, AGORA);
  assert.equal(r.downloads.find((d) => d.app === "vortex-android").total, 2);
  assert.equal(nomeDoDownload("vortex-android"), "Vortex (Android)");
  assert.equal(nomeDoDownload("vindex-windows"), "Vindex (Windows)");
});

test("avisos: cadastro novo avisa uma vez com o app, download agrupa e volta a ficar novo", async () => {
  const env = mk();
  const db = env.DB._db;
  db.prepare("INSERT INTO usuarios (id, email, nome, senha_hash, salt, loja, criado) VALUES ('u1', 'ana@exemplo.com', 'Ana', 'x', 'y', 'l1', ?)").run(AGORA - 60000);
  db.prepare("INSERT INTO sessoes (id, usuario, dispositivo, criado, ultimo_ping, app) VALUES ('s1', 'u1', 'd1', ?, ?, 'vortex')").run(AGORA - 59000, AGORA - 59000);
  db.prepare("INSERT INTO usuarios (id, email, nome, senha_hash, salt, loja, criado) VALUES ('u0', 'velho@exemplo.com', '', 'x', 'y', 'l0', ?)").run(AGORA - 5 * 3600000);
  assert.equal(await verificarCadastros(env, AGORA), 1);
  assert.equal(await verificarCadastros(env, AGORA), 0);
  let l = await listarAlertas(env);
  assert.equal(l.alertas.length, 1);
  assert.equal(l.alertas[0].tipo, "cadastro");
  assert.match(l.alertas[0].titulo, /Vortex/);
  assert.equal(l.alertas[0].detalhe, "ana@exemplo.com");

  await registrarDownload(env, req("1.1.1.1"), "vortex-android", AGORA);
  await verificarDownloads(env, AGORA);
  l = await listarAlertas(env);
  const d = l.alertas.find((a) => a.tipo === "download");
  assert.match(d.titulo, /Vortex \(Android\)/);
  assert.match(d.detalhe, /^1 pessoa baixou/);
  await marcarAlerta(env, 0, { todos: true });
  await verificarDownloads(env, AGORA + 1000); // nada mudou: continua visto
  assert.equal((await listarAlertas(env)).novos, 0);
  await registrarDownload(env, req("2.2.2.2"), "vortex-android", AGORA + 2000);
  await verificarDownloads(env, AGORA + 3000);
  l = await listarAlertas(env);
  assert.equal(l.novos, 1);
  assert.match(l.alertas.find((a) => a.tipo === "download").detalhe, /^2 pessoas baixaram/);
  assert.equal(diaDeBrasilia(Date.UTC(2026, 10, 25, 2, 0, 0)), "2026-11-24"); // 23h em Brasília ainda é o dia anterior
});
