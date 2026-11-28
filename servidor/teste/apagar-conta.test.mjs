// Apagar conta (LGPD): sai tudo da pessoa, nada de outra conta, e fica só o registro de pagamento.
import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import worker from "../src/index.js";
import { POR_USUARIO, POR_LOJA, LOJA_MANTIDAS } from "../src/id/apagar.js";

process.removeAllListeners("warning");
const B = "https://v.test";
const ctx = { waitUntil: (p) => p?.catch?.(() => {}) };
const novoAmbiente = (extra = {}) => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ...extra });
async function chamar(env, metodo, caminho, { t, corpo, ip = "1.1.1.1" } = {}) {
  const r = await worker.fetch(new Request(B + caminho, { method: metodo, headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined }), env, ctx);
  const tx = await r.text();
  let j = null; try { j = JSON.parse(tx); } catch { /* página */ }
  return { s: r.status, j, tx };
}
async function cadastrar(env, email, n) {
  const r = await chamar(env, "POST", "/id/cadastrar", { corpo: { email, senha: "senha-forte-123", nome: email, dispositivo: { id: `aparelho-${n}-xxxxxxxx`, nome: "A", plataforma: "android" } }, ip: `9.9.${n}.1` });
  assert.ok(r.j?.token, r.tx);
  const u = env.DB._db.prepare("SELECT id, loja FROM usuarios WHERE email = ?").get(email);
  return { token: r.j.token, ...u };
}
const apagar = (env, c, extra = {}) => chamar(env, "POST", "/id/apagar-conta", { t: c.token, corpo: { senha: "senha-forte-123", confirmacao: "APAGAR", ...extra } });

const tabelas = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((x) => x.name);
const colunas = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all();
/** Uma linha em cada tabela da lista, com o dono pedido; as outras colunas obrigatórias ganham um valor qualquer. */
function semear(db, tabela, coluna, dono) {
  const campos = colunas(db, tabela).filter((c) => c.name === coluna || ((c.notnull || c.pk) && c.dflt_value === null));
  const valores = campos.map((c) => (c.name === coluna ? dono : /INT|REAL/i.test(c.type) ? Math.floor(Math.random() * 1e9) : `v-${Math.random()}`));
  db.prepare(`INSERT OR IGNORE INTO ${tabela} (${campos.map((c) => c.name).join(",")}) VALUES (${campos.map(() => "?").join(",")})`).run(...valores);
}
const contar = (db, t, c, v) => db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${c} = ?`).get(v).n;

test("toda tabela com coluna de usuário ou de loja está coberta pela exclusão", () => {
  const db = bancoDeTeste()._db;
  const faltam = [];
  for (const t of tabelas(db)) {
    const nomes = colunas(db, t).map((c) => c.name);
    if (nomes.includes("usuario") && !POR_USUARIO.includes(t)) faltam.push(`${t}.usuario`);
    if (t !== "usuarios" && nomes.includes("loja") && !POR_LOJA.includes(t) && !LOJA_MANTIDAS.includes(t)) faltam.push(`${t}.loja`);
  }
  assert.deepEqual(faltam, []);
});

test("apaga tudo da pessoa e da loja, não toca em outra conta e guarda só o pagamento", async () => {
  const env = novoAmbiente();
  const a = await cadastrar(env, "sai@x.com", 1);
  const b = await cadastrar(env, "fica@x.com", 2);
  const db = env.DB._db;
  for (const c of [a, b]) {
    for (const t of POR_USUARIO) semear(db, t, "usuario", c.id);
    for (const t of [...POR_LOJA, ...LOJA_MANTIDAS]) semear(db, t, "loja", c.loja);
  }
  db.prepare("UPDATE pagamentos SET gateway = 'infinitepay' WHERE loja IN (?, ?)").run(a.loja, b.loja);
  db.prepare("UPDATE lojas SET nome = 'Loja Secreta', whatsapp = '51999998888' WHERE id = ?").run(a.loja);
  const antes = (c) => POR_USUARIO.filter((t) => contar(db, t, "usuario", c.id) > 0).length + POR_LOJA.filter((t) => contar(db, t, "loja", c.loja) > 0).length;
  const deB = antes(b);
  const r = await apagar(env, a);
  assert.equal(r.s, 200, r.tx);
  assert.equal(contar(db, "usuarios", "id", a.id), 0);
  for (const t of POR_USUARIO) assert.equal(contar(db, t, "usuario", a.id), 0, t);
  for (const t of POR_LOJA) assert.equal(contar(db, t, "loja", a.loja), 0, t);
  assert.ok(contar(db, "pagamentos", "loja", a.loja) > 0, "o pagamento fica");
  const loja = db.prepare("SELECT * FROM lojas WHERE id = ?").get(a.loja);
  assert.deepEqual([loja.nome, loja.whatsapp, loja.plano], ["", "", "sem_teste"]);
  assert.equal(antes(b), deB, "a outra conta ficou inteira");
  assert.equal(contar(db, "usuarios", "id", b.id), 1);
  assert.equal((await chamar(env, "GET", "/id/conta", { t: a.token })).s, 401, "o login antigo morre");
});

test("comunidade do Voxix: passa para o membro mais antigo; sozinha, some com as mensagens", async () => {
  const env = novoAmbiente();
  const a = await cadastrar(env, "dona@x.com", 1);
  const b = await cadastrar(env, "membro@x.com", 2);
  const db = env.DB._db;
  for (const [id, codigo] of [["com1", "c1"], ["com2", "c2"]]) {
    db.prepare("INSERT INTO voxix_comunidades (id, nome, dono, codigo, membros, criado) VALUES (?, ?, ?, ?, 2, 1)").run(id, id, a.id, codigo);
    db.prepare("INSERT INTO voxix_membros VALUES (?, ?, 'dono', 1)").run(id, a.id);
  }
  db.prepare("INSERT INTO voxix_membros VALUES ('com1', ?, 'membro', 2)").run(b.id);
  db.prepare("INSERT INTO voxix_salas (id, comunidade, nome, criado) VALUES ('s2', 'com2', 'geral', 1)").run();
  assert.equal((await apagar(env, a)).s, 200);
  assert.deepEqual({ ...db.prepare("SELECT dono, membros FROM voxix_comunidades WHERE id = 'com1'").get() }, { dono: b.id, membros: 1 });
  assert.equal(db.prepare("SELECT cargo FROM voxix_membros WHERE comunidade = 'com1' AND usuario = ?").get(b.id).cargo, "dono");
  assert.equal(contar(db, "voxix_comunidades", "id", "com2"), 0);
  assert.equal(contar(db, "voxix_salas", "comunidade", "com2"), 0);
});

test("arquivos no armazenamento: somem os da pessoa e ficam os das outras", async () => {
  const guardados = new Set();
  const env = novoAmbiente({ SAVES: {
    list: async ({ prefix }) => ({ objects: [...guardados].filter((k) => k.startsWith(prefix)).map((key) => ({ key, size: 1 })), truncated: false }),
    delete: async (k) => { guardados.delete(k); },
  } });
  const a = await cadastrar(env, "sai@x.com", 1);
  const b = await cadastrar(env, "fica@x.com", 2);
  for (const c of [a, b]) { guardados.add(`drive/${c.id}/docs/a.pdf`); guardados.add(`u/${c.id}/jogo/save.dat`); }
  assert.equal((await apagar(env, a)).s, 200);
  assert.deepEqual([...guardados].sort(), [`drive/${b.id}/docs/a.pdf`, `u/${b.id}/jogo/save.dat`].sort());
});

test("assinatura com cobrança automática: não apaga; sem resposta do Mercado Pago também não", async (t) => {
  const env = novoAmbiente({ MERCADOPAGO_ACCESS_TOKEN: "token-de-teste" });
  const a = await cadastrar(env, "assina@x.com", 1);
  env.DB._db.prepare("INSERT INTO pagamentos (id, loja, gateway, valor_centavos, status, criado, atualizado) VALUES ('ass_1', ?, 'mercadopago', 4990, 'aguardando', 1, 1)").run(a.loja);
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const responder = (corpo, status = 200) => { globalThis.fetch = async () => new Response(JSON.stringify(corpo), { status }); };
  responder({ results: [{ external_reference: "ass_1", status: "authorized" }] });
  let r = await apagar(env, a);
  assert.deepEqual([r.s, r.j.codigo], [409, "cobranca_ativa"]);
  responder({ message: "fora do ar" }, 500);
  r = await apagar(env, a);
  assert.deepEqual([r.s, r.j.codigo], [503, "cobranca_sem_resposta"]);
  assert.equal(contar(env.DB._db, "usuarios", "id", a.id), 1);
  responder({ results: [{ external_reference: "ass_1", status: "cancelled" }] });
  assert.equal((await apagar(env, a)).s, 200);
});

test("plano pago em andamento: pede para falar com a gente", async () => {
  const env = novoAmbiente();
  const a = await cadastrar(env, "paga@x.com", 1);
  env.DB._db.prepare("UPDATE lojas SET ativo_ate = ?, plano = 'fundadores' WHERE id = ?").run(Date.now() + 86_400_000, a.loja);
  const r = await apagar(env, a);
  assert.deepEqual([r.s, r.j.codigo], [409, "assinatura_ativa"]);
});
