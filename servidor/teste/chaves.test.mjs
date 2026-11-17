import test from "node:test";
import assert from "node:assert/strict";
import { chavesGemini, trocaDeChave } from "../src/ia/chaves.js";

test("chaves do Gemini em ordem, sem vazias", () => {
  assert.deepEqual(chavesGemini({ GEMINI_API_KEY: "a", GEMINI_API_KEY_2: "b" }), ["a", "b"]);
  assert.deepEqual(chavesGemini({ GEMINI_API_KEY_2: "b" }), ["b"]);
  assert.deepEqual(chavesGemini({}), []);
});
test("troca de chave só em limite, chave ruim ou queda", () => {
  for (const s of [429, 401, 403, 500, 503]) assert.ok(trocaDeChave(s));
  for (const s of [200, 400, 404]) assert.ok(!trocaDeChave(s));
});
