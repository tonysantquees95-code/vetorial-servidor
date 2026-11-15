import test from "node:test";
import assert from "node:assert/strict";
import { ehRotaIcone, tratarIcone } from "../src/icone.js";

const url = (c) => new URL("https://v.test" + c);
test("só as três rotas de ícone", () => {
  assert.equal(ehRotaIcone("/icone/vindex.png"), true);
  assert.equal(ehRotaIcone("/icone/outro.png"), false);
  assert.equal(ehRotaIcone("/icone/../x.png"), false);
});
test("pega a imagem do repositório do app", async () => {
  const antes = globalThis.fetch;
  let pedido = "";
  globalThis.fetch = async (u) => { pedido = String(u); return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }); };
  try {
    const r = await tratarIcone(new Request(url("/icone/vortex.png")), url("/icone/vortex.png"), "/icone/vortex.png");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.match(pedido, /Vortex\/main\/app\/assets\/icon-only\.png$/);
  } finally { globalThis.fetch = antes; }
});
test("se o GitHub falha, cai no arquivo do site", async () => {
  const antes = globalThis.fetch;
  globalThis.fetch = async () => new Response("não achei", { status: 404, headers: { "content-type": "text/plain" } });
  try {
    const r = await tratarIcone(new Request(url("/icone/vindex.png")), url("/icone/vindex.png"), "/icone/vindex.png");
    assert.equal(r.status, 302);
    assert.match(r.headers.get("location"), /\/icone-vindex\.png$/);
  } finally { globalThis.fetch = antes; }
  globalThis.fetch = async () => { throw new Error("sem rede"); };
  try {
    const r = await tratarIcone(new Request(url("/icone/vindex.png")), url("/icone/vindex.png"), "/icone/vindex.png");
    assert.equal(r.status, 302);
  } finally { globalThis.fetch = antes; }
  const v = await tratarIcone(new Request(url("/icone/venus.png")), url("/icone/venus.png"), "/icone/venus.png");
  assert.equal(v.status, 302);
});
