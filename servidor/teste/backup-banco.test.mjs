// O fluxo de backup roda num repositório PÚBLICO: o histórico de execuções qualquer pessoa lê.
// Aqui o script do fluxo roda de verdade, com um wrangler de mentira que se comporta como o real
// (a exportação do D1 IMPRIME um link para baixar o banco sem criptografia).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, chmodSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fluxo = readFileSync(new URL("../../.github/workflows/backup-banco.yml", import.meta.url), "utf8");
const FRASE = "frase-de-teste-bem-longa-123";

function script() {
  const blocos = [...fluxo.matchAll(/^( +)run: \|\n((?:\1 .*\n|\n)+)/gm)];
  assert.equal(blocos.length, 1, "o backup tem um passo só de script");
  return blocos[0][2].replace(new RegExp(`^${blocos[0][1]}  `, "gm"), "");
}

const FALSO = `#!/usr/bin/env bash
shift 2   # --yes wrangler@4
echo "$*" >> "$REGISTRO"
case "$*" in
  "r2 bucket list"*) [ "$CASO" = sem-r2 ] && { echo "ERRO https://segredo.example/conta" >&2; exit 1; }; echo "name: venus-backups";;
  "r2 bucket create"*) [ "$CASO" = sem-r2 ] && exit 1; exit 0;;
  "r2 bucket dev-url get"*) if [ "$CASO" = publico ]; then echo "Public access is enabled at 'https://pub.r2.dev'."; else echo "Public access via the r2.dev URL is disabled."; fi;;
  "r2 bucket domain list"*) if [ "$CASO" = dominio ]; then echo "domain: arquivos.example.com"; else echo "There are no custom domains connected to this bucket."; fi;;
  "r2 bucket lifecycle list"*) echo "There are no lifecycle rules";;
  "r2 bucket lifecycle add"*) [ "$CASO" = sem-expirar ] && exit 1; exit 0;;
  "d1 export"*) echo "You can also download your export from the following URL manually: https://link-assinado.example/dump.sql?X-Amz-Signature=abc"
     echo "https://link-assinado.example/erro" >&2
     while [ $# -gt 0 ]; do [ "$1" = --output ] && echo "INSERT INTO contas VALUES('cliente@exemplo.com');" > "$2"; shift; done
     [ "$CASO" = export-falha ] && exit 1; exit 0;;
  "r2 object put"*) while [ $# -gt 0 ]; do [ "$1" = --file ] && cp "$2" "$ENVIADO"; shift; done; echo "ok";;
  *) echo "comando inesperado: $*" >&2; exit 9;;
esac
`;

function rodar(caso, frase = FRASE) {
  const dir = mkdtempSync(join(tmpdir(), "bkp-"));
  const bin = mkdtempSync(join(tmpdir(), "bkp-bin-"));
  writeFileSync(join(bin, "npx"), FALSO); chmodSync(join(bin, "npx"), 0o755);
  const registro = join(bin, "chamadas.txt"), enviado = join(bin, "enviado.gpg");
  writeFileSync(registro, "");
  const r = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script()], {
    cwd: dir, encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BACKUP_FRASE: frase, CASO: caso, REGISTRO: registro, ENVIADO: enviado, RUNNER_TEMP: dir },
  });
  return { codigo: r.status, log: r.stdout + r.stderr, chamadas: readFileSync(registro, "utf8"), sobras: readdirSync(dir), enviado };
}

const semVazamento = (r) => assert.doesNotMatch(r.log, /https?:\/\/|cliente@exemplo|frase-de-teste/);

test("backup do banco: nada de anexo no GitHub, que em repositório público qualquer um baixa", () => {
  assert.doesNotMatch(fluxo, /upload-artifact|actions\/cache|git push|gh release/);
});

test("backup do banco: envia só o arquivo criptografado ao R2 e não imprime link, dado nem frase", () => {
  const r = rodar("ok");
  assert.equal(r.codigo, 0, r.log);
  semVazamento(r);
  assert.match(r.chamadas, /r2 object put venus-backups\/venus-\S+\.sql\.gpg .*--remote/);
  assert.match(r.chamadas, /r2 bucket lifecycle add venus-backups \S+ .*--expire-days 30/);
  const aberto = execFileSync("gpg", ["--batch", "--quiet", "--passphrase", FRASE, "--pinentry-mode", "loopback", "--decrypt", r.enviado], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  assert.match(aberto, /cliente@exemplo/);
  assert.doesNotMatch(readFileSync(r.enviado, "latin1"), /cliente@exemplo/);
  assert.deepEqual(r.sobras.filter((n) => n.includes("venus")), [], "nenhuma cópia fica na máquina");
});

for (const caso of ["sem-r2", "publico", "dominio", "sem-expirar"]) {
  test(`backup do banco: falha ANTES de exportar quando o bucket não está seguro (${caso})`, () => {
    const r = rodar(caso);
    assert.notEqual(r.codigo, 0, r.log);
    assert.doesNotMatch(r.chamadas, /d1 export|object put/);
    semVazamento(r);
  });
}

test("backup do banco: exportação que falha não vaza o link e apaga o arquivo aberto", () => {
  const r = rodar("export-falha");
  assert.notEqual(r.codigo, 0);
  assert.doesNotMatch(r.chamadas, /object put/);
  semVazamento(r);
  assert.deepEqual(r.sobras.filter((n) => n.includes("venus")), []);
});

test("backup do banco: sem frase (ou frase curta) falha de propósito, sem tocar no banco", () => {
  for (const f of ["", "curta"]) {
    const r = rodar("ok", f);
    assert.notEqual(r.codigo, 0);
    assert.equal(r.chamadas, "");
  }
});
