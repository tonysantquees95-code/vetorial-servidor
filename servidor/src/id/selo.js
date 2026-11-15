// Selo de licença: um recibo assinado (Ed25519) que o aplicativo confere SEM internet, com a chave pública
// embutida. Sem selo válido e com acesso liberado o aplicativo não abre; editar o recibo invalida a assinatura.
// A chave privada nunca sai do servidor: é derivada dos segredos do Worker.
const enc = new TextEncoder();
const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const PKCS8 = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);

/** Validade do selo sem falar com o servidor: tempo máximo que o app aceita ficar offline. */
export const VALIDADE_SELO_MS = 3 * 86_400_000;

async function semente(env) {
  const segredo = env.SELO_SEGREDO || env.JWT_SEGREDO || env.CHAVE_COFRE;
  if (!segredo || String(segredo).length < 16) throw new Error("segredo do selo ausente");
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`vetorial-selo-v1:${segredo}`)));
}
async function par(env) {
  const s = await semente(env);
  const pk = new Uint8Array(PKCS8.length + 32); pk.set(PKCS8); pk.set(s, PKCS8.length);
  const priv = await crypto.subtle.importKey("pkcs8", pk, { name: "Ed25519" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", priv);
  const pub = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, { name: "Ed25519" }, true, ["verify"]);
  return { priv, pub, x: jwk.x };
}

/** Chave pública (base64url, 32 bytes) que vai embutida nos aplicativos. */
export async function chavePublicaDoSelo(env) { return (await par(env)).x; }

/** `usuario`: { id, email }; `e`: resultado de estadoDaAssinatura. O selo diz só o necessário. */
export async function emitirSelo(env, usuario, e, agora = Date.now(), dispositivo = "") {
  const exp = agora + (e.acesso ? VALIDADE_SELO_MS : 6 * 3_600_000);
  const corpo = { v: 1, u: usuario.id, em: usuario.email, d: dispositivo, ac: !!e.acesso, teste: !!e.emTeste, fim: e.fimDoAcesso || 0, iat: agora, exp };
  const p = b64u(enc.encode(JSON.stringify(corpo)));
  const assin = await crypto.subtle.sign({ name: "Ed25519" }, (await par(env)).priv, enc.encode(p));
  return `${p}.${b64u(assin)}`;
}

/** Só para testes e para o servidor; o aplicativo faz esta conferência com a chave embutida. */
export async function conferirSelo(env, selo, agora = Date.now()) {
  const [p, a] = String(selo || "").split(".");
  if (!p || !a) return null;
  try {
    if (!(await crypto.subtle.verify({ name: "Ed25519" }, (await par(env)).pub, deB64u(a), enc.encode(p)))) return null;
    const c = JSON.parse(new TextDecoder().decode(deB64u(p)));
    return c.exp > agora ? c : null;
  } catch { return null; }
}
