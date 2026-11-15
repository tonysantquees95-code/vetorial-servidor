// Verificação em duas etapas (TOTP, RFC 6238): o lojista cadastra o segredo num app autenticador.
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(bytes) {
  let bits = 0, valor = 0, saida = "";
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) { saida += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function deBase32(texto) {
  let bits = 0, valor = 0;
  const saida = [];
  for (const c of String(texto).toUpperCase().replace(/=+$/, "")) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error("base32");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) { saida.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(saida);
}

export const novoSegredo = () => base32(crypto.getRandomValues(new Uint8Array(20)));

export async function codigoTotp(segredo, contador, digitos = 6) {
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(contador));
  const k = await crypto.subtle.importKey("raw", deBase32(segredo), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", k, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digitos).padStart(digitos, "0");
}

/** Aceita o código da janela atual e de 1 janela antes ou depois. Devolve o contador usado (para não aceitar o mesmo código duas vezes) ou null. */
export async function conferirTotp(segredo, codigo, agora = Date.now(), ultimoContador = 0) {
  const c = String(codigo || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const atual = Math.floor(agora / 30000);
  for (const d of [0, -1, 1]) {
    const n = atual + d;
    if (n > ultimoContador && (await codigoTotp(segredo, n)) === c) return n;
  }
  return null;
}

export const uriOtp = (segredo, conta) => `otpauth://totp/${encodeURIComponent("Vênus:" + conta)}?secret=${segredo}&issuer=${encodeURIComponent("Vênus")}&digits=6&period=30`;
