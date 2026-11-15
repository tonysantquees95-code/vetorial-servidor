import test from "node:test";
import assert from "node:assert/strict";
import { crc16, pixCopiaECola, normalizarChavePix, matrizQr, svgQr } from "../src/loja/qr.js";

test("CRC16 do BR Code confere com o valor de referência", () => {
  assert.equal(crc16("123456789"), "29B1"); // CRC-16/CCITT-FALSE
});

test("Pix: payload bem formado, com CRC válido e valor", () => {
  const p = pixCopiaECola({ chave: "(51) 99999-0000", nome: "Maria Açaí Ltda", cidade: "Porto Alegre", valorCentavos: 4990, descricao: "Pedido 12", txid: "PED12" });
  assert.ok(p.startsWith("000201010212"));
  assert.ok(p.includes("br.gov.bcb.pix0114+5551999990000"));
  assert.ok(p.includes("540549.90"));
  assert.ok(p.includes("5802BR"));
  assert.ok(p.includes("Maria Acai Ltda"));
  assert.equal(crc16(p.slice(0, -4)), p.slice(-4));
  const estatico = pixCopiaECola({ chave: "a@b.com", nome: "X", cidade: "Y" });
  assert.ok(estatico.startsWith("000201010211"));
  assert.ok(!estatico.includes("5404"));
});

test("chaves Pix: normaliza e recusa lixo", () => {
  assert.equal(normalizarChavePix("Fulano@Mail.com"), "fulano@mail.com");
  assert.equal(normalizarChavePix("51999990000"), "+5551999990000");
  assert.equal(normalizarChavePix("123.456.789-09"), "12345678909");
  assert.equal(normalizarChavePix("123e4567-e89b-12d3-a456-426614174000"), "123e4567-e89b-12d3-a456-426614174000");
  assert.throws(() => normalizarChavePix("abc"));
});

test("QR: matriz quadrada e SVG usa a cor pedida", () => {
  const { tamanho, modulos } = matrizQr("https://vetorial.tech/loja");
  assert.equal(modulos.length, tamanho * tamanho);
  assert.ok(tamanho >= 21 && /^[01]+$/.test(modulos));
  // marcador de posição no canto superior esquerdo: 7 módulos escuros na primeira linha
  assert.equal(modulos.slice(0, 7), "1111111");
  assert.ok(svgQr("oi", { cor: "#E36BD0" }).includes("#E36BD0"));
  assert.throws(() => matrizQr(""));
});
