import test from "node:test";
import assert from "node:assert/strict";
import { perfilJogo, validarAjustes } from "../src/vortex/varredura.js";

test("filtra chaves e valores fora da faixa", () => {
  assert.deepEqual(validarAjustes({ resolucao: 3, msaa: 3, vsync: true, Inventada: 1, anisotropia: "x" }), { resolucao: 3, vsync: true });
});
test("só GameCube e Wii", async () => {
  let chamou = false;
  const r = await perfilJogo({}, { titulo: "Zelda", plataforma: "ps2" }, async () => { chamou = true; return { texto: "{}" }; });
  assert.equal(chamou, false);
  assert.deepEqual(r.ajustes, {});
});
test("usa a resposta da IA validada", async () => {
  const r = await perfilJogo({}, { titulo: "Zelda", plataforma: "gamecube", aparelho: { cpu: "x", nucleos: 4, ram_gb: 8 } }, async () => ({ provedor: "groq", texto: '{"ajustes":{"resolucao":2,"X":1},"motivo":"fraco"}' }));
  assert.deepEqual(r.ajustes, { resolucao: 2 });
});
test("PSP também vale", async () => {
  const r = await perfilJogo({}, { titulo: "GTA", plataforma: "psp" }, async () => ({ provedor: "groq", texto: '{"ajustes":{"resolucao":3},"motivo":"ok"}' }));
  assert.deepEqual(r.ajustes, { resolucao: 3 });
});
