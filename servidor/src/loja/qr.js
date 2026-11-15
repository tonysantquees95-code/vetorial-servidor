// QR Codes: matriz de módulos (o app desenha com a cor da loja), Pix copia-e-cola (BR Code) e links.
import qrcode from "../vendor/qrcode.cjs";
import { ErroLoja } from "./lojas.js";

qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

/** { tamanho, modulos: "0101…" (linha por linha) } — nível M de correção de erro. */
export function matrizQr(texto, nivel = "M") {
  if (!texto || String(texto).length > 1000) throw new ErroLoja(400, "qr_invalido", "O conteúdo do QR Code deve ter de 1 a 1000 caracteres.");
  const q = qrcode(0, nivel);
  q.addData(String(texto));
  q.make();
  const n = q.getModuleCount();
  let m = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) m += q.isDark(y, x) ? "1" : "0";
  return { tamanho: n, modulos: m };
}

export function svgQr(texto, { cor = "#000000", fundo = "#ffffff", margem = 4 } = {}) {
  const { tamanho, modulos } = matrizQr(texto);
  const total = tamanho + margem * 2;
  let d = "";
  for (let y = 0; y < tamanho; y++) for (let x = 0; x < tamanho; x++) if (modulos[y * tamanho + x] === "1") d += `M${x + margem},${y + margem}h1v1h-1z`;
  const c = /^#[0-9a-f]{6}$/i.test(cor) ? cor : "#000000";
  const f = /^#[0-9a-f]{6}$/i.test(fundo) ? fundo : "#ffffff";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${f}"/><path d="${d}" fill="${c}"/></svg>`;
}

// ------------------------------------------------------------------ Pix (BR Code estático)
export function crc16(texto) {
  let crc = 0xffff;
  for (const b of new TextEncoder().encode(texto)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const campo = (id, valor) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;
const semAcento = (t, max) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .\-]/g, "").trim().slice(0, max);

/** Chave: CPF/CNPJ (só números), celular (+55…), e-mail ou chave aleatória. */
export function normalizarChavePix(chave) {
  const c = String(chave || "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return c.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return c.toLowerCase();
  const d = c.replace(/\D/g, "");
  if (/^\+/.test(c) && d.length >= 12) return `+${d}`;
  if (d.length === 11 && /^[1-9]{2}9/.test(d) && !/^(\d)\1{10}$/.test(d)) return `+55${d}`; // celular com DDD
  if (d.length === 11 || d.length === 14) return d; // CPF ou CNPJ
  throw new ErroLoja(400, "chave_pix_invalida", "Chave Pix inválida. Use CPF, CNPJ, celular com DDD, e-mail ou chave aleatória.");
}

export function pixCopiaECola({ chave, nome, cidade, valorCentavos, descricao, txid }) {
  const k = normalizarChavePix(chave);
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", k) + (descricao ? campo("02", semAcento(descricao, 40)) : "");
  const valor = valorCentavos ? (Math.round(Number(valorCentavos)) / 100).toFixed(2) : "";
  if (valorCentavos && !(Number(valorCentavos) > 0 && Number(valorCentavos) < 1e9)) throw new ErroLoja(400, "valor_invalido", "Valor inválido.");
  const corpo =
    campo("00", "01") + campo("01", valor ? "12" : "11") + campo("26", conta) + campo("52", "0000") + campo("53", "986") +
    (valor ? campo("54", valor) : "") + campo("58", "BR") + campo("59", semAcento(nome, 25) || "LOJA") + campo("60", semAcento(cidade, 15) || "BRASIL") +
    campo("62", campo("05", semAcento(txid, 25).replace(/ /g, "") || "***")) + "6304";
  return corpo + crc16(corpo);
}
