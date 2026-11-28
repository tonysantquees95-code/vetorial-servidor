// Velocidade: consultas do dia a dia usam índice e nenhum serviço de fora deixa o servidor esperando para sempre.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { comPrazo } from "../src/prazo.js";

const raiz = new URL("../", import.meta.url);

function banco() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(new URL("migrations/", raiz)).sort()) db.exec(readFileSync(new URL(`migrations/${f}`, raiz), "utf8"));
  return db;
}

const CONSULTAS = {
  "contas de uma loja": "SELECT email FROM usuarios WHERE loja = ? ORDER BY criado LIMIT 1",
  "aparelho com sessão ativa": "SELECT 1 AS x FROM sessoes WHERE dispositivo = ? AND encerrada = 0 AND ultimo_ping > ?",
  "comunidades de um dono": "SELECT COUNT(*) AS n FROM voxix_comunidades WHERE dono = ?",
  "link da recepção na agenda": "SELECT loja, token_geral FROM agenda_config WHERE token_geral = ?",
  "posts agendados vencidos": "SELECT id FROM fila_posts WHERE status = 'agendado' AND agendado_para IS NOT NULL AND agendado_para <= ? ORDER BY agendado_para LIMIT 10",
  "cadastros recentes": "SELECT id FROM usuarios WHERE criado > ? ORDER BY criado",
};

for (const [nome, sql] of Object.entries(CONSULTAS)) {
  test(`usa índice: ${nome}`, () => {
    const plano = banco().prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...Array((sql.match(/\?/g) || []).length).fill(1)).map((p) => p.detail);
    assert.ok(plano.every((d) => !/^SCAN (?!.*USING)/.test(d)), `lê a tabela inteira: ${plano.join(" | ")}`);
  });
}

// páginas que o servidor entrega como texto: o fetch ali roda no navegador da pessoa, não no servidor
const PAGINAS = new Set(["agenda/ui-comum.js", "loja/painel.js", "id/pagina.js", "vexperyon/painel.js"]);

test("toda chamada do servidor a um serviço de fora tem tempo limite", () => {
  const sem = [];
  for (const f of readdirSync(new URL("src/", raiz), { recursive: true })) {
    if (!f.endsWith(".js") || f.startsWith("vendor") || f === "prazo.js" || PAGINAS.has(f)) continue;
    readFileSync(new URL(`src/${f}`, raiz), "utf8").split("\n").forEach((linha, i, todas) => {
      const chama = /(?<![\w.])(fetch|buscar|f)\(\s*(`https:|"https:|`\$\{|fonte\b|link\b|url,)/.test(linha);
      if (chama && !/signal/.test(todas.slice(i, i + 6).join("\n"))) sem.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(sem, []);
});

test("o prazo corta um serviço que não responde", async () => {
  const mudo = (_u, { signal }) => new Promise((_, falha) => signal.addEventListener("abort", () => falha(new Error("cortado"))));
  await assert.rejects(comPrazo("https://exemplo.invalid", {}, 20, mudo), /cortado/);
});

test("o prazo não corta uma resposta que já começou (IA em partes)", async () => {
  let sinal;
  const rapido = async (_u, o) => { sinal = o.signal; return new Response("ok"); };
  const r = await comPrazo("https://exemplo.invalid", {}, 20, rapido);
  await new Promise((ok) => setTimeout(ok, 40));
  assert.equal(sinal.aborted, false);
  assert.equal(await r.text(), "ok");
});
