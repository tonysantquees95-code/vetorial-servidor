import test from "node:test";
import assert from "node:assert/strict";
import { manualDoRepo, resumirCommit } from "../src/dev/manual.js";

const commit = (sha, msg, data) => ({ sha, html_url: `https://github.com/x/y/commit/${sha}`, commit: { message: msg, author: { name: "Toni", date: data } } });

function falsoGithub(rotas) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    for (const [trecho, resp] of rotas) if (u.includes(trecho)) return resp();
    return new Response("{}", { status: 404 });
  };
  return () => { globalThis.fetch = original; };
}

test("manual: resumirCommit pega a primeira linha, a data e só aceita link do GitHub", () => {
  const r = resumirCommit(commit("abcdef1234", "Caixa: link\n\ncorpo longo", "2026-11-27T10:00:00Z"));
  assert.equal(r.sha, "abcdef1");
  assert.equal(r.mensagem, "Caixa: link");
  assert.equal(r.quando, Date.UTC(2026, 10, 27, 10));
  assert.equal(resumirCommit({ sha: "a", html_url: "http://mal.com/x", commit: { message: "m", author: {} } }).url, null);
});

test("manual: devolve o texto, as movimentações e quando o manual mudou", async () => {
  const volta = falsoGithub([
    ["/contents/MANUAL.md", () => new Response("# Manual\n\ntexto", { status: 200 })],
    ["path=MANUAL.md", () => new Response(JSON.stringify([commit("m1", "Manual", "2026-11-26T09:00:00Z")]), { status: 200 })],
    ["/commits?per_page=20", () => new Response(JSON.stringify([commit("c1", "um", "2026-11-27T10:00:00Z"), commit("c2", "dois", "2026-11-26T10:00:00Z")]), { status: 200 })],
  ]);
  try {
    const r = await manualDoRepo({ GITHUB_TOKEN: "t" }, "tonysantquees95-code/vyntem");
    assert.equal(r.texto, "# Manual\n\ntexto");
    assert.equal(r.falha, null);
    assert.equal(r.movimentacoes.length, 2);
    assert.equal(r.movimentacoes[0].mensagem, "um");
    assert.equal(r.atualizado, Date.UTC(2026, 10, 26, 9));
  } finally { volta(); }
});

test("manual: repositório sem MANUAL.md avisa, mas ainda mostra as movimentações; sem token não chama o GitHub", async () => {
  const volta = falsoGithub([
    ["/contents/MANUAL.md", () => new Response("nao", { status: 404 })],
    ["/commits?per_page=20", () => new Response(JSON.stringify([commit("c1", "um", "2026-11-27T10:00:00Z")]), { status: 200 })],
  ]);
  try {
    const r = await manualDoRepo({ GITHUB_TOKEN: "t" }, "a/b");
    assert.equal(r.texto, null);
    assert.match(r.falha, /ainda não tem o MANUAL/);
    assert.equal(r.movimentacoes.length, 1);
    let chamou = false;
    globalThis.fetch = async () => { chamou = true; return new Response("{}"); };
    const sem = await manualDoRepo({}, "a/b");
    assert.equal(chamou, false);
    assert.match(sem.falha, /token/);
  } finally { volta(); }
});
