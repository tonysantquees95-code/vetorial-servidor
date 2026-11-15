import test from "node:test";
import assert from "node:assert/strict";
import { faxina } from "../src/vortex/varredura.js";

const it = (id, titulo, bytes = 1000) => ({ id, titulo, plataforma: "nes", bytes, arquivo: titulo + ".nes" });
const corpo = { parecidos: [[it("a", "Contra"), it("b", "Contra (BR)")]], suspeitos: [it("c", "Mario", 10)] };

test("aceita só ids pedidos", async () => {
  const r = await faxina({}, corpo, async () => ({ provedor: "groq", texto: JSON.stringify({ duplicados: [{ manter: "a", remover: ["b", "x"], motivo: "mesmo" }, { manter: "z", remover: ["a"] }], corrompidos: [{ id: "c" }, { id: "q" }] }) }));
  assert.deepEqual(r.duplicados, [{ manter: "a", remover: ["b"], motivo: "mesmo" }]);
  assert.deepEqual(r.corrompidos.map((c) => c.id), ["c"]);
});
test("resposta ruim vira vazio", async () => {
  const r = await faxina({}, corpo, async () => ({ provedor: "groq", texto: "nada" }));
  assert.deepEqual(r.duplicados, []);
});
