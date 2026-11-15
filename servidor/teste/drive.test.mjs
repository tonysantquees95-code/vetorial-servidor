import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { tratarDrive, lerRange, nomeValido, pastaValida } from "../src/drive/drive.js";

process.removeAllListeners("warning");
const T0 = Date.now();
const disp = { id: "aparelho-1-xxxxxxxx", nome: "Celular", plataforma: "android" };

function r2() {
  const m = new Map(), envios = new Map();
  const junta = (partes) => { const t = partes.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(t); let i = 0; for (const p of partes) { o.set(p, i); i += p.length; } return o; };
  return {
    m, envios,
    async createMultipartUpload(k) { const id = "up" + envios.size; envios.set(id, { k, partes: new Map() }); return { uploadId: id }; },
    resumeMultipartUpload(k, id) {
      const e = envios.get(id);
      return {
        async uploadPart(n, v) { e.partes.set(n, new Uint8Array(v)); return { partNumber: n, etag: "e" + n }; },
        async complete(ps) { const d = junta(ps.map((p) => e.partes.get(p.partNumber))); m.set(k, { dados: d, uploaded: new Date() }); envios.delete(id); return { size: d.length }; },
        async abort() { envios.delete(id); },
      };
    },
    async get(k, o) { const x = m.get(k); if (!x) return null; const d = o?.range ? x.dados.slice(o.range.offset, o.range.offset + o.range.length) : x.dados; return { body: d }; },
    async head(k) { const x = m.get(k); return x ? { size: x.dados.length } : null; },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { truncated: false, objects: [...m].filter(([k]) => k.startsWith(prefix)).map(([key, o]) => ({ key, size: o.dados.length, uploaded: o.uploaded })) }; },
  };
}
async function mundo(extra = {}, d1 = false) {
  const env = { DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", DRIVE_PUBLICO: "1", ...(d1 ? {} : { SAVES: r2() }), ...extra };
  const c = await cadastrar(env, { email: "jogador@exemplo.com", senha: "senha-forte-1", nome: "J", dispositivo: disp }, T0);
  return { env, token: c.token };
}
const chamar = (env, token, metodo, caminho, corpo, cab = {}) => {
  const q = new Request("https://v.test" + caminho, { method: metodo, headers: { authorization: `Bearer ${token}`, ...cab }, body: corpo });
  return tratarDrive(q, env, new URL(q.url), new URL(q.url).pathname, T0 + 1000);
};
async function enviar(env, token, pasta, nome, bytes) {
  const a = await chamar(env, token, "POST", "/drive/enviar", JSON.stringify({ pasta, nome, tamanho: bytes.length }));
  if (a.status !== 201) return a;
  const { envio, parte } = await a.json();
  const t = env.SAVES ? 2 : parte;
  const partes = [];
  for (let n = 1; (n - 1) * t < bytes.length; n++) {
    const r = await (await chamar(env, token, "PUT", `/drive/parte?pasta=${pasta}&nome=${nome}&envio=${envio}&n=${n}`, bytes.slice((n - 1) * t, n * t))).json();
    partes.push({ n: r.n, etag: r.etag });
  }
  return chamar(env, token, "POST", "/drive/concluir", JSON.stringify({ pasta, nome, envio, partes }));
}

for (const d1 of [false, true]) {
const rot = d1 ? " [D1]" : " [R2]";
test("envia em partes, lista, baixa inteiro e com Range, apaga" + rot, async () => {
  const { env, token } = await mundo({}, d1);
  const c = await enviar(env, token, "roms/gba", "jogo.gba", new Uint8Array([1, 2, 3, 4, 5]));
  assert.equal((await c.json()).bytes, 5);
  const l = await (await chamar(env, token, "GET", "/drive/arquivos")).json();
  assert.equal(l.arquivos.length, 1);
  assert.equal(l.usado, 5);
  assert.equal(l.arquivos[0].pasta, "roms/gba");
  const g = await chamar(env, token, "GET", "/drive/arquivo/roms%2Fgba%2Fjogo.gba");
  assert.deepEqual([...new Uint8Array(await g.arrayBuffer())], [1, 2, 3, 4, 5]);
  const rg = await chamar(env, token, "GET", "/drive/arquivo/roms/gba/jogo.gba", undefined, { range: "bytes=1-2" });
  assert.equal(rg.status, 206);
  assert.equal(rg.headers.get("content-range"), "bytes 1-2/5");
  assert.deepEqual([...new Uint8Array(await rg.arrayBuffer())], [2, 3]);
  assert.equal((await chamar(env, token, "GET", "/drive/arquivo/roms/gba/jogo.gba", undefined, { range: "bytes=9-" })).status, 416);
  await chamar(env, token, "DELETE", "/drive/arquivo/roms/gba/jogo.gba");
  assert.equal((await (await chamar(env, token, "GET", "/drive/arquivos")).json()).arquivos.length, 0);
});

test("limite por arquivo, cota e nomes inválidos" + rot, async () => {
  const { env, token } = await mundo({ DRIVE_COTA_BYTES: "10", DRIVE_ARQUIVO_MAX: "8" }, d1);
  const ab = (t, pasta = "docs", nome = "a.txt") => chamar(env, token, "POST", "/drive/enviar", JSON.stringify({ pasta, nome, tamanho: t }));
  assert.equal((await ab(9)).status, 413);
  assert.equal((await ab(0)).status, 400);
  assert.equal((await ab(5, "../x")).status, 400);
  assert.equal((await ab(5, "docs", "../a")).status, 400);
  assert.equal((await ab(5, "docs", ".oculto")).status, 400);
  assert.equal((await enviar(env, token, "docs", "a.txt", new Uint8Array(6))).status, 200);
  const sem = await ab(6, "docs", "b.txt");
  assert.equal(sem.status, 413);
  assert.equal((await sem.json()).codigo, "sem_espaco");
  assert.equal((await ab(6, "docs", "a.txt")).status, 201); // substituir o mesmo arquivo cabe
});

test("sem sessão, sem Vortex e contas separadas" + rot, async () => {
  const { env, token } = await mundo({}, d1);
  assert.notEqual((await chamar(env, "falso", "GET", "/drive/arquivos")).status, 200);
  const outra = await cadastrar(env, { email: "o@exemplo.com", senha: "senha-forte-1", nome: "O", dispositivo: { id: "aparelho-2-xxxxxxxx", nome: "B", plataforma: "android" } }, T0);
  await enviar(env, token, "docs", "a.txt", new Uint8Array([1]));
  assert.equal((await (await chamar(env, outra.token, "GET", "/drive/arquivos")).json()).arquivos.length, 0);
  assert.equal((await chamar(env, outra.token, "GET", "/drive/arquivo/docs/a.txt")).status, 404);
  await env.DB.prepare("UPDATE lojas SET trial_fim = 1, ativo_ate = 0, plano = 'fundadores'").run();
  assert.equal((await chamar(env, token, "GET", "/drive/arquivos")).status, 402);
});

test("cancelar descarta o envio; helpers" + rot, async () => {
  const { env, token } = await mundo({}, d1);
  const { envio } = await (await chamar(env, token, "POST", "/drive/enviar", JSON.stringify({ pasta: "docs", nome: "a.txt", tamanho: 3 }))).json();
  const abertos = async () => env.SAVES ? env.SAVES.envios.size : (await env.DB.prepare("SELECT COUNT(*) AS c FROM drive_envios").first()).c;
  assert.equal(await abertos(), 1);
  await chamar(env, token, "POST", "/drive/cancelar", JSON.stringify({ pasta: "docs", nome: "a.txt", envio }));
  assert.equal(await abertos(), 0);
  assert.deepEqual(lerRange("bytes=-2", 10), { offset: 8, length: 2 });
  assert.deepEqual(lerRange("bytes=3-", 10), { offset: 3, length: 7 });
  assert.equal(lerRange("lixo", 10), null);
  assert.ok(nomeValido("Zelda (BR).gba") && !nomeValido("a/b") && pastaValida("roms/snes") && !pastaValida("a/b/c"));
});
}

test("[D1] arquivo de mais de uma parte: Range atravessa pedaços e partes", async () => {
  const { env, token } = await mundo({}, true);
  const n = 4 * 1024 * 1024 + 300_000;
  const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 7 + (i >> 8)) & 255;
  assert.equal((await enviar(env, token, "roms/gba", "grande.gba", b)).status, 200);
  const g = new Uint8Array(await (await chamar(env, token, "GET", "/drive/arquivo/roms/gba/grande.gba")).arrayBuffer());
  assert.equal(g.length, n);
  assert.ok(g.every((x, i) => x === b[i]));
  const ini = 4 * 1024 * 1024 - 100;
  const r = await chamar(env, token, "GET", "/drive/arquivo/roms/gba/grande.gba", undefined, { range: `bytes=${ini}-${ini + 400}` });
  assert.equal(r.status, 206);
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [...b.slice(ini, ini + 401)]);
  // trocar o arquivo pelo mesmo nome apaga os pedaços antigos
  await enviar(env, token, "roms/gba", "grande.gba", new Uint8Array([1, 2, 3]));
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS c FROM drive_pedacos").first()).c, 1);
  await chamar(env, token, "DELETE", "/drive/arquivo/roms/gba/grande.gba");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS c FROM drive_pedacos").first()).c, 0);
});

test("[D1] envio com parte faltando não conclui; limpeza apaga envios velhos", async () => {
  const { env, token } = await mundo({}, true);
  const { envio } = await (await chamar(env, token, "POST", "/drive/enviar", JSON.stringify({ pasta: "docs", nome: "a.txt", tamanho: 5_000_000 }))).json();
  await chamar(env, token, "PUT", `/drive/parte?pasta=docs&nome=a.txt&envio=${envio}&n=1`, new Uint8Array(4 * 1024 * 1024));
  const c = await chamar(env, token, "POST", "/drive/concluir", JSON.stringify({ pasta: "docs", nome: "a.txt", envio, partes: [{ n: 1, etag: "d1" }] }));
  assert.equal(c.status, 409);
  await env.DB.prepare("UPDATE drive_envios SET criado = 1").run();
  const { limparDrive } = await import("../src/drive/drive.js");
  await limparDrive(env);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS c FROM drive_pedacos").first()).c, 0);
});

test("só o dono usa o Drive por enquanto (DRIVE_PUBLICO abre para todos)", async () => {
  const { env, token } = await mundo({ DRIVE_PUBLICO: undefined }, true);
  assert.equal((await chamar(env, token, "GET", "/drive/arquivos")).status, 402);
  await env.DB.prepare("UPDATE lojas SET plano = 'dono'").run();
  assert.equal((await chamar(env, token, "GET", "/drive/arquivos")).status, 200);
});
