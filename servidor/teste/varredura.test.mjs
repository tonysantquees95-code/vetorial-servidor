import test from "node:test";
import assert from "node:assert/strict";
import { varredura, montarPedido, validarResposta } from "../src/vortex/varredura.js";

const corpo = { plataformas: ["ps1", "nes", "x y"], pastas: [{ pasta: "D:\\Jogos\\PS1", plataformas: {}, ambiguos: 5, amostras: ["a.bin"] }], aparelho: { cpu: "Ryzen", nucleos: 8, ram_gb: 16 } };

test("monta pedido limpo", () => {
  const p = montarPedido(corpo);
  assert.deepEqual(p.plataformas, ["ps1", "nes"]);
  assert.equal(p.pastas.length, 1);
});
test("valida: ignora pasta inventada e plataforma fora da lista", () => {
  const p = montarPedido(corpo);
  const v = validarResposta('texto {"pastas":[{"pasta":"D:\\\\Jogos\\\\PS1","plataforma":"ps1","motivo":"x"},{"pasta":"C:\\\\Inventada","plataforma":"nes"},{"pasta":"D:\\\\Jogos\\\\PS1","plataforma":"zzz"}],"perfil":"potente"}', p);
  assert.equal(v.pastas.length, 2);
  assert.equal(v.pastas[0].plataforma, "ps1");
  assert.equal(v.pastas[1].plataforma, null);
  assert.equal(v.perfil, "potente");
});
test("resposta inválida não quebra", async () => {
  const r = await varredura({}, corpo, async () => ({ texto: "oi", provedor: "groq" }));
  assert.deepEqual(r.pastas, []);
  const ok = await varredura({}, corpo, async () => ({ texto: '{"pastas":[],"perfil":"leve"}', provedor: "deepseek" }));
  assert.equal(ok.perfil, "leve");
});
