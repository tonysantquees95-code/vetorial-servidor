// Cofre das credenciais dos canais (AES-GCM com CHAVE_COFRE), hash de token e assinatura HMAC.
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const deHex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function sha256Hex(texto) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(texto)));
}

export async function hmacHex(segredo, texto) {
  const k = await crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(texto)));
}

/** Comparação em tempo constante de dois textos. */
export function iguais(a, b) {
  a = String(a ?? "");
  b = String(b ?? "");
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}

export function aleatorio(bytes = 24) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function chaveAes(env) {
  if (!env.CHAVE_COFRE || String(env.CHAVE_COFRE).length < 16) throw new Error("cofre_sem_chave");
  const base = await crypto.subtle.digest("SHA-256", enc.encode(`venus-cofre:${env.CHAVE_COFRE}`));
  return crypto.subtle.importKey("raw", base, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function cifrar(env, objeto) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chaveAes(env), enc.encode(JSON.stringify(objeto)));
  return `${b64(iv)}.${b64(new Uint8Array(dados))}`;
}

export async function decifrar(env, texto) {
  const [iv, dados] = String(texto).split(".");
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(iv) }, await chaveAes(env), deB64(dados));
  return JSON.parse(new TextDecoder().decode(claro));
}

/** Segredo curto que vai no endereço do webhook de um canal (só o servidor sabe refazer). */
export async function segredoDoCanal(env, canalId) {
  return (await hmacHex(`webhook:${env.CHAVE_COFRE || ""}`, canalId)).slice(0, 32);
}

export { deHex };
