import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { tratarVexperyon, listarRodadas, lerArquivo, REGRAS_OIDC, MAX_ARQUIVO } from "../src/vexperyon/resultados.js";
import { verificarOidc, EMISSOR, PUBLICO } from "../src/ci/assinatura.js";

process.removeAllListeners("warning");
const b64u = (u8) => Buffer.from(u8).toString("base64url");
const par = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", par.publicKey)), kid: "k1" };
const AGORA = 1_800_000_000;
async function token(extra = {}) {
  const h = b64u(new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid: "k1" })));
  const p = b64u(new TextEncoder().encode(JSON.stringify({ iss: EMISSOR, aud: "vexperyon-resultados", exp: AGORA + 300, repository: "tonysantquees95-code/vexperyon", ref: "refs/heads/main", event_name: "push", ...extra })));
  const s = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", par.privateKey, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${b64u(s)}`;
}
const enviar = async (env, query, corpo = "x", t) => {
  const url = new URL(`https://x/vexperyon/envio?${query}`);
  return (await tratarVexperyon(new Request(url, { method: "POST", headers: { authorization: `Bearer ${t ?? (await token())}` }, body: corpo }), env, url, url.pathname, { chaves: [jwk], agora: AGORA })).status;
};

test("vexperyon: só o laboratório envia, e o token dele não serve para a chave dos APKs", async () => {
  const env = { DB: bancoDeTeste() };
  const q = "rodada=1&app=vindex&arquivo=01.png";
  for (const ruim of [{ aud: PUBLICO }, { repository: "tonysantquees95-code/Vortex" }, { ref: "refs/heads/outro" }, { event_name: "pull_request" }])
    assert.equal(await enviar(env, q, "x", await token(ruim)), 403);
  assert.equal(await enviar(env, q, "x", "lixo"), 403);
  assert.equal(await verificarOidc(await token(), [jwk], AGORA), null);
  assert.equal(await verificarOidc(await token({ aud: PUBLICO }), [jwk], AGORA), null);
  assert.ok(await verificarOidc(await token(), [jwk], AGORA, REGRAS_OIDC));
});

test("vexperyon: guarda os bytes, recusa nome e tamanho errados e mantém 3 rodadas por app", async () => {
  const env = { DB: bancoDeTeste() };
  for (const nome of ["../x", "a.exe", "situacao.txt", ""]) assert.equal(await enviar(env, `rodada=1&app=vindex&arquivo=${encodeURIComponent(nome)}`), 400);
  assert.equal(await enviar(env, "rodada=1&app=vindex&arquivo=01.png", new Uint8Array(MAX_ARQUIVO + 1)), 413);
  assert.equal(await enviar(env, "rodada=1&app=vindex&fim=success"), 400, "não encerra rodada que não existe");
  for (let r = 1; r <= 5; r++) {
    assert.equal(await enviar(env, `rodada=${r}&app=vindex&arquivo=01.png`, new Uint8Array([137, 80, r])), 201);
    assert.equal(await enviar(env, `rodada=${r}&app=vindex&fim=success`), 200);
  }
  assert.equal(await enviar(env, "rodada=5&app=vortex&arquivo=01.png"), 409);
  const { rodadas } = await listarRodadas(env);
  assert.deepEqual(rodadas.map((r) => r.id), [5, 4, 3]);
  assert.equal(env.DB._db.prepare("SELECT COUNT(*) AS n FROM vexperyon_arquivos").get().n, 3);
  const arq = await lerArquivo(env, 5, "01.png");
  assert.equal(arq.headers.get("content-type"), "image/png");
  assert.deepEqual([...new Uint8Array(await arq.arrayBuffer())], [137, 80, 5]);
  assert.equal(await lerArquivo(env, 1, "01.png"), null);
});
