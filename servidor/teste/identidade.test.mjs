import test from "node:test";
import assert from "node:assert/strict";
import { lerIdentidade, siteSeguro, corDoSite } from "../src/loja/identidade.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const falso = (mapa) => async (url) => {
  const r = mapa[url];
  if (!r) return new Response("", { status: 404 });
  return new Response(r.corpo, { status: 200, headers: { "content-type": r.tipo || "text/html" } });
};

test("endereços inseguros são recusados", () => {
  for (const x of ["", "localhost", "http://127.0.0.1/x", "10.0.0.1", "meu.local", "https://[::1]/"]) assert.throws(() => siteSeguro(x), (e) => e.codigo === "site_invalido", x);
  assert.equal(siteSeguro("minhaloja.com.br/x#a").toString(), "https://minhaloja.com.br/x");
});

test("lê nome, cor do tema e logo do site", async () => {
  const html = `<html><head><title>Desejo de Intimidade | Sex shop</title><meta name="description" content="Moda &amp; prazer"><meta name="theme-color" content="#b4235a">
    <link rel="icon" sizes="32x32" href="/f.png"><link rel="apple-touch-icon" sizes="180x180" href="/logo.png"></head></html>`;
  const f = falso({ "https://desejo.com.br/": { corpo: html }, "https://desejo.com.br/logo.png": { corpo: PNG, tipo: "image/png" }, "https://desejo.com.br/f.png": { corpo: PNG, tipo: "image/png" } });
  const r = await lerIdentidade("desejo.com.br", f);
  assert.equal(r.nome, "Desejo de Intimidade");
  assert.equal(r.descricao, "Moda & prazer");
  assert.equal(r.cor, "#b4235a");
  assert.match(r.logo, /^data:image\/png;base64,/);
  assert.equal(r.site, "https://desejo.com.br");
});

test("sem tema, pega a cor viva mais usada; ignora cinzas; logo gigante é descartado", async () => {
  assert.equal(corDoSite("<p style='color:#111111;background:#ffffff'>", ".a{color:#2563eb}.b{color:#2563eb}.c{color:#e11d48}"), "#2563eb");
  assert.equal(corDoSite("", ":root{--primary:#10b981;--x:#2563eb}"), "#10b981");
  assert.equal(corDoSite("", ".a{color:#eeeeee}"), "");
  const grande = new Uint8Array(200_000);
  const f = falso({ "https://l.com.br/": { corpo: '<link rel="icon" href="/g.png">' }, "https://l.com.br/g.png": { corpo: grande, tipo: "image/png" } });
  assert.equal((await lerIdentidade("l.com.br", f)).logo, "");
});

test("site fora do ar vira erro amigável", async () => {
  await assert.rejects(() => lerIdentidade("fora.com.br", falso({})), (e) => e.codigo === "site_fora");
});
