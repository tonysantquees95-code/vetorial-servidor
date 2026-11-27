import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cifrar, decifrar } from "../src/loja/cripto.js";
import { gerarBackup, restaurarBackup, abrirBackup, situacaoDoBackup, anotarBackup } from "../src/dev/backup.js";

const KS = "A".repeat(200);
const novoEnv = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-mestra-de-teste-1234567890" });
async function guardar(env, repo, senha = "senha-da-chave-1234") {
  await env.DB.prepare("INSERT INTO assinaturas (repo, dados, criado) VALUES (?, ?, 1)").bind(repo, await cifrar(env, { keystore: KS, senha })).run();
}

test("backup: gera arquivo criptografado, que não deixa a chave nem a senha à vista", async () => {
  const env = novoEnv();
  await guardar(env, "dono/app-a");
  await guardar(env, "dono/app-b");
  const arq = await gerarBackup(env, "frase-do-backup-2026");
  assert.deepEqual(arq.repositorios, ["dono/app-a", "dono/app-b"]);
  const texto = JSON.stringify(arq);
  assert.ok(!texto.includes(KS) && !texto.includes("senha-da-chave"));
  assert.equal((await abrirBackup(arq, "frase-do-backup-2026")).length, 2);
});

test("backup: frase errada não abre; frase fraca nem gera; sem chaves avisa", async () => {
  const env = novoEnv();
  await assert.rejects(() => gerarBackup(env, "frase-do-backup-2026"), /Ainda não há chave/);
  await guardar(env, "dono/app-a");
  await assert.rejects(() => gerarBackup(env, "curta"), /pelo menos 12/);
  const arq = await gerarBackup(env, "frase-do-backup-2026");
  await assert.rejects(() => abrirBackup(arq, "outra-frase-qualquer-99"), /Frase errada/);
  await assert.rejects(() => abrirBackup({ formato: "outro", v: 1 }, "x"), /não é um backup/);
  arq.dados = arq.dados.slice(0, -8) + "AAAAAAAA"; // arquivo adulterado
  await assert.rejects(() => abrirBackup(arq, "frase-do-backup-2026"), /Frase errada ou arquivo danificado/);
});

test("backup: restaura num banco vazio (com outra chave-mestra), sem sobrescrever o que já existe", async () => {
  const origem = novoEnv();
  await guardar(origem, "dono/app-a", "senha-da-chave-AAAA");
  const arq = await gerarBackup(origem, "frase-do-backup-2026");
  const destino = { DB: bancoDeTeste(), CHAVE_COFRE: "outra-chave-mestra-0987654321" };
  assert.deepEqual(await restaurarBackup(destino, arq, "frase-do-backup-2026"), { restauradas: 1, jaExistiam: 0, invalidas: 0 });
  const l = await destino.DB.prepare("SELECT dados FROM assinaturas WHERE repo = 'dono/app-a'").first();
  assert.equal((await decifrar(destino, l.dados)).senha, "senha-da-chave-AAAA");
  assert.deepEqual(await restaurarBackup(destino, arq, "frase-do-backup-2026"), { restauradas: 0, jaExistiam: 1, invalidas: 0 });
});

test("backup: lembra a data da última cópia", async () => {
  const env = novoEnv();
  await guardar(env, "dono/app-a");
  assert.equal((await situacaoDoBackup(env)).ultimoBackup, 0);
  await anotarBackup(env, 12345);
  const s = await situacaoDoBackup(env);
  assert.equal(s.ultimoBackup, 12345);
  assert.deepEqual(s.repositorios, ["dono/app-a"]);
});
