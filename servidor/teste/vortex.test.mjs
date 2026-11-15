import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { tratarVortex } from "../src/vortex/saves.js";

process.removeAllListeners("warning");
const T0 = Date.now();
const disp = { id: "aparelho-1-xxxxxxxx", nome: "Celular", plataforma: "android" };

function r2() {
  const m = new Map();
  return {
    async put(k, v, o) { m.set(k, { dados: new Uint8Array(v), meta: o?.customMetadata || {}, uploaded: new Date() }); },
    async get(k) { const o = m.get(k); return o ? { body: o.dados, customMetadata: o.meta } : null; },
    async head(k) { const o = m.get(k); return o ? { customMetadata: o.meta, uploaded: o.uploaded, size: o.dados.length } : null; },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { truncated: false, objects: [...m].filter(([k]) => k.startsWith(prefix)).map(([key, o]) => ({ key, size: o.dados.length, uploaded: o.uploaded, customMetadata: o.meta })) }; },
  };
}
async function mundo() {
  const env = { DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", SAVES: r2() };
  const c = await cadastrar(env, { email: "jogador@exemplo.com", senha: "senha-forte-1", nome: "J", dispositivo: disp }, T0);
  return { env, token: c.token };
}
const chamar = (env, token, metodo, caminho, corpo, cab = {}) => {
  const q = new Request("https://v.test" + caminho, { method: metodo, headers: { authorization: `Bearer ${token}`, ...cab }, body: corpo });
  return tratarVortex(q, env, new URL(q.url), new URL(q.url).pathname, T0 + 1000);
};

test("conta em teste grátis tem o Vortex liberado; envia, lista e baixa um save", async () => {
  const { env, token } = await mundo();
  assert.equal((await (await chamar(env, token, "GET", "/vortex/licenca")).json()).vortex, true);
  const p = await chamar(env, token, "PUT", "/vortex/saves/zelda/jogo.srm", new Uint8Array([1, 2, 3]), { "x-base": "0" });
  assert.equal((await p.json()).versao, 1);
  const l = await (await chamar(env, token, "GET", "/vortex/saves")).json();
  assert.equal(l.saves.length, 1);
  assert.equal(l.saves[0].jogo, "zelda");
  const g = await chamar(env, token, "GET", "/vortex/saves/zelda/jogo.srm");
  assert.deepEqual([...new Uint8Array(await g.arrayBuffer())], [1, 2, 3]);
});

test("conflito: aparelho com versão velha recebe 409 e a nuvem não muda", async () => {
  const { env, token } = await mundo();
  await chamar(env, token, "PUT", "/vortex/saves/a/x.srm", new Uint8Array([1]), { "x-base": "0" });
  await chamar(env, token, "PUT", "/vortex/saves/a/x.srm", new Uint8Array([2]), { "x-base": "1" });
  const c = await chamar(env, token, "PUT", "/vortex/saves/a/x.srm", new Uint8Array([9]), { "x-base": "1" });
  assert.equal(c.status, 409);
  assert.equal((await c.json()).versao, 2);
});

test("nomes perigosos, tamanho e sem sessão são recusados", async () => {
  const { env, token } = await mundo();
  assert.equal((await chamar(env, token, "PUT", "/vortex/saves/a/..%2Fx", new Uint8Array([1]))).status, 400);
  assert.equal((await chamar(env, token, "PUT", "/vortex/saves/a/vazio.srm", new Uint8Array([]))).status, 413);
  assert.notEqual((await chamar(env, "token-falso", "GET", "/vortex/saves")).status, 200);
});

test("sem liberação do Vortex (teste vencido) devolve 402", async () => {
  const { env, token } = await mundo();
  await env.DB.prepare("UPDATE lojas SET trial_fim = 1, ativo_ate = 0, plano = 'fundadores'").run();
  const r = await chamar(env, token, "GET", "/vortex/saves");
  assert.equal(r.status, 402);
  assert.equal((await (await chamar(env, token, "GET", "/vortex/licenca")).json()).vortex, false);
});

test("saves de uma conta não aparecem para outra", async () => {
  const { env, token } = await mundo();
  const outra = await cadastrar(env, { email: "outro@exemplo.com", senha: "senha-forte-1", nome: "O", dispositivo: { id: "aparelho-2-xxxxxxxx", nome: "B", plataforma: "android" } }, T0);
  await chamar(env, token, "PUT", "/vortex/saves/a/x.srm", new Uint8Array([1]), { "x-base": "0" });
  assert.equal((await (await chamar(env, outra.token, "GET", "/vortex/saves")).json()).saves.length, 0);
});

test("ponte de voz: Vênus pede, Vortex busca e responde; Vortex fechado avisa", async () => {
  const { env, token } = await mundo();
  const j = async (r) => ({ status: r.status, ...(await r.json()) });
  const fechado = await j(await chamar(env, token, "POST", "/vortex/pedidos", JSON.stringify({ comando: "abrir_jogo", argumento: "Zelda" })));
  assert.equal(fechado.status, 409);
  assert.equal(fechado.codigo, "vortex_fechado");
  await chamar(env, token, "GET", "/vortex/fila?plataforma=windows"); // o Vortex aparece
  assert.equal((await j(await chamar(env, token, "POST", "/vortex/pedidos", JSON.stringify({ comando: "apagar_tudo" })))).status, 400);
  assert.equal((await j(await chamar(env, token, "POST", "/vortex/pedidos", JSON.stringify({ comando: "abrir_jogo", argumento: " " })))).status, 400);
  const p = await j(await chamar(env, token, "POST", "/vortex/pedidos", JSON.stringify({ comando: "abrir_jogo", argumento: "Zelda" })));
  assert.equal(p.status, 201);
  const fila = await j(await chamar(env, token, "GET", "/vortex/fila?plataforma=windows"));
  assert.equal(fila.pedidos.length, 1);
  assert.equal(fila.pedidos[0].argumento, "Zelda");
  assert.equal((await j(await chamar(env, token, "GET", "/vortex/fila?plataforma=windows"))).pedidos.length, 0); // já foi entregue
  await chamar(env, token, "POST", `/vortex/pedidos/${p.id}/resultado`, JSON.stringify({ ok: true, resumo: "Abri The Legend of Zelda." }));
  const s = await j(await chamar(env, token, "GET", `/vortex/pedidos/${p.id}`));
  assert.equal(s.status, "concluido");
  assert.equal(s.resumo, "Abri The Legend of Zelda.");
});

test("Steam: login confere com a Steam, guarda a conta e lista os jogos (perfil público)", async () => {
  const { env, token } = await mundo();
  const chamadas = [];
  env.fetchSteam = async (u, o) => {
    chamadas.push(String(u));
    if (o?.method === "POST") return new Response("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n");
    return new Response(`<gamesList><games><game><appID>620</appID><name><![CDATA[Portal 2]]></name><hoursOnRecord>1.5</hoursOnRecord></game><game><appID>730</appID><name>Counter-Strike 2</name></game></games></gamesList>`);
  };
  assert.equal((await (await chamar(env, token, "GET", "/vortex/steam")).json()).ligado, false);
  const ini = await (await chamar(env, token, "POST", "/vortex/steam/iniciar")).json();
  const ret = new URL(ini.url).searchParams.get("openid.return_to");
  assert.match(ret, /^https:\/\/v\.test\/vortex\/steam\/retorno\?n=[a-f0-9]{24}$/);
  const volta = new URL(ret);
  const p = { "openid.ns": "http://specs.openid.net/auth/2.0", "openid.mode": "id_res", "openid.return_to": ret, "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000000001", "openid.sig": "x" };
  for (const [k, v] of Object.entries(p)) volta.searchParams.set(k, v);
  const rr = await tratarVortex(new Request(volta), env, volta, volta.pathname, T0 + 2000);
  assert.match(await rr.text(), /Steam ligada/);
  assert.equal((await (await chamar(env, token, "GET", "/vortex/steam")).json()).steamid, "76561198000000001");
  const j = await (await chamar(env, token, "GET", "/vortex/steam/jogos")).json();
  assert.deepEqual(j.jogos.map((x) => [x.appid, x.nome, x.minutos]), [[730, "Counter-Strike 2", 0], [620, "Portal 2", 90]].sort((a, b) => a[1].localeCompare(b[1])));
  // o mesmo link não vale duas vezes
  const de_novo = await tratarVortex(new Request(volta), env, volta, volta.pathname, T0 + 3000);
  assert.match(await de_novo.text(), /vencido/);
});

test("Steam: resposta falsa (a Steam diz que não é válida) não liga a conta; perfil privado explica", async () => {
  const { env, token } = await mundo();
  env.fetchSteam = async () => new Response("is_valid:false\n");
  const ini = await (await chamar(env, token, "POST", "/vortex/steam/iniciar")).json();
  const ret = new URL(ini.url).searchParams.get("openid.return_to");
  const volta = new URL(ret);
  volta.searchParams.set("openid.mode", "id_res");
  volta.searchParams.set("openid.return_to", ret);
  volta.searchParams.set("openid.claimed_id", "https://steamcommunity.com/openid/id/76561198000000009");
  assert.match(await (await tratarVortex(new Request(volta), env, volta, volta.pathname, T0 + 2000)).text(), /Não deu certo/);
  assert.equal((await (await chamar(env, token, "GET", "/vortex/steam")).json()).ligado, false);
  const sem = await chamar(env, token, "GET", "/vortex/steam/jogos");
  assert.equal(sem.status, 409);
});
