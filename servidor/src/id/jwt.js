// JWT HS256 com WebCrypto (sem dependências). O segredo vem de JWT_SEGREDO (ou CHAVE_COFRE).
const enc = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const txt = (o) => b64u(enc.encode(JSON.stringify(o)));

async function chave(env) {
  const segredo = env.JWT_SEGREDO || env.CHAVE_COFRE;
  if (!segredo || String(segredo).length < 16) throw new Error("JWT_SEGREDO ausente");
  return crypto.subtle.importKey("raw", enc.encode(`vetorial-id:${segredo}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function assinar(env, dados, { validadeMs = 30 * 86_400_000, agora = Date.now() } = {}) {
  const corpo = `${txt({ alg: "HS256", typ: "JWT" })}.${txt({ ...dados, iat: Math.floor(agora / 1000), exp: Math.floor((agora + validadeMs) / 1000) })}`;
  return `${corpo}.${b64u(await crypto.subtle.sign("HMAC", await chave(env), enc.encode(corpo)))}`;
}

/** Devolve o conteúdo ou null (assinatura errada, formato errado, vencido). */
export async function verificar(env, token, agora = Date.now()) {
  const partes = String(token || "").split(".");
  if (partes.length !== 3) return null;
  try {
    const cab = JSON.parse(new TextDecoder().decode(deB64u(partes[0])));
    if (cab.alg !== "HS256") return null;
    const ok = await crypto.subtle.verify("HMAC", await chave(env), deB64u(partes[2]), enc.encode(`${partes[0]}.${partes[1]}`));
    if (!ok) return null;
    const d = JSON.parse(new TextDecoder().decode(deB64u(partes[1])));
    return d.exp * 1000 > agora ? d : null;
  } catch {
    return null;
  }
}

const ITERACOES = 100_000; // limite do Workers para PBKDF2
export async function hashSenha(senha, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const k = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERACOES }, k, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
