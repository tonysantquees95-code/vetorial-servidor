import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { tratarCi, verificarOidc, EMISSOR, PUBLICO } from "../src/ci/assinatura.js";

process.removeAllListeners("warning");
const b64u = (u8) => Buffer.from(u8).toString("base64url");
const par = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", par.publicKey)), kid: "k1" };
const outro = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const AGORA = 1_800_000_000;

async function token(extra = {}, chave = par.privateKey, kid = "k1") {
  const h = b64u(new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid })));
  const p = b64u(new TextEncoder().encode(JSON.stringify({ iss: EMISSOR, aud: PUBLICO, exp: AGORA + 300, repository: "tonysantquees95-code/Vindex-", ref: "refs/heads/main", event_name: "push", ...extra })));
  const s = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${b64u(s)}`;
}
const pedir = (env, metodo, t, corpo) => tratarCi(new Request("https://x/ci/assinatura", { method: metodo, headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, new URL("https://x/ci/assinatura"), "/ci/assinatura", { chaves: [jwk], agora: AGORA });

test("OIDC: só aceita repositório permitido, ramo main, destinatário certo, assinatura válida e dentro do prazo", async () => {
  assert.equal((await verificarOidc(await token(), [jwk], AGORA)).repo, "tonysantquees95-code/Vindex-");
  assert.equal((await verificarOidc(await token({ repository: "tonysantquees95-code/Velox-gaming-search" }), [jwk], AGORA)).repo, "tonysantquees95-code/velox-gaming-search", "maiúsculas no nome do repositório não importam");
  assert.equal(await verificarOidc(await token({ repository: "outro/repo" }), [jwk], AGORA), null);
  assert.equal(await verificarOidc(await token({ ref: "refs/heads/teste" }), [jwk], AGORA), null);
  assert.equal(await verificarOidc(await token({ event_name: "pull_request" }), [jwk], AGORA), null);
  assert.equal(await verificarOidc(await token({ aud: "outro" }), [jwk], AGORA), null);
  assert.equal(await verificarOidc(await token({ iss: "https://falso" }), [jwk], AGORA), null);
  assert.equal(await verificarOidc(await token({ exp: AGORA - 1 }), [jwk], AGORA), null);
  assert.equal(await verificarOidc(await token({}, outro.privateKey), [jwk], AGORA), null); // assinado por outra chave
  assert.equal(await verificarOidc(await token({}, par.privateKey, "desconhecida"), [jwk], AGORA), null);
  assert.equal(await verificarOidc("lixo", [jwk], AGORA), null);
});

test("chave de assinatura: primeira compilação guarda, as seguintes recebem a mesma; um repositório não lê a do outro", async () => {
  const env = { DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123" };
  const keystore = Buffer.alloc(200, 7).toString("base64");
  const t = await token();
  assert.deepEqual(await (await pedir(env, "GET", t)).json(), { existe: false });
  assert.equal((await pedir(env, "PUT", t, { keystore, senha: "senha-bem-longa-123" })).status, 201);
  assert.equal((await pedir(env, "PUT", t, { keystore, senha: "outra-senha-bem-longa" })).status, 409); // não troca a chave
  assert.deepEqual(await (await pedir(env, "GET", t)).json(), { existe: true, keystore, senha: "senha-bem-longa-123" });
  assert.equal((await pedir(env, "PUT", t, { keystore: "curta", senha: "senha-bem-longa-123" })).status, 400);
  // cifrada no banco
  assert.ok(!JSON.stringify(env.DB._db.prepare("SELECT dados FROM assinaturas").all()).includes(keystore));
  // outro repositório permitido começa do zero
  const t2 = await token({ repository: "tonysantquees95-code/Vortex" });
  assert.deepEqual(await (await pedir(env, "GET", t2)).json(), { existe: false });
  // sem identidade válida
  assert.equal((await pedir(env, "GET", await token({ repository: "intruso/repo" }))).status, 403);
  assert.equal((await pedir(env, "GET", "")).status, 403);
});
