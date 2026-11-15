// Chave de assinatura dos APKs, guardada no servidor e entregue só para as compilações do GitHub dos repositórios permitidos.
// Como prova de identidade, usa o token OIDC que o próprio GitHub Actions emite para cada execução (nenhum segredo para cadastrar).
//   GET /ci/assinatura  → { existe: false } ou { existe: true, keystore, senha }
//   PUT /ci/assinatura  { keystore, senha } → guarda se ainda não houver (409 se já existir)
import { cifrar, decifrar } from "../loja/cripto.js";

export const ehRotaCi = (c) => c === "/ci/assinatura";
export const REPOS_PERMITIDOS = ["tonysantquees95-code/vetorial-dev-center", "tonysantquees95-code/Vindex-", "tonysantquees95-code/Vortex", "tonysantquees95-code/velox-gaming-search", "tonysantquees95-code/Vetorial-Drive", "tonysantquees95-code/voxix"];
export const EMISSOR = "https://token.actions.githubusercontent.com";
export const PUBLICO = "venus-assinatura";
const EVENTOS = ["push", "workflow_dispatch", "schedule"];

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const deB64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(s).length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const texto = (s) => new TextDecoder().decode(deB64u(s));

/** Confere um token OIDC do GitHub Actions. `chaves` é a lista de chaves públicas (JWKS) do GitHub. Devolve as informações ou null. */
export async function verificarOidc(token, chaves, agora = Date.now() / 1000) {
  try {
    const [h, p, s] = String(token).split(".");
    if (!h || !p || !s) return null;
    const cab = JSON.parse(texto(h));
    if (cab.alg !== "RS256") return null;
    const jwk = (chaves || []).find((k) => k.kid === cab.kid);
    if (!jwk) return null;
    const chave = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", chave, deB64u(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const c = JSON.parse(texto(p));
    if (c.iss !== EMISSOR || c.aud !== PUBLICO || !(c.exp > agora) || (c.nbf && c.nbf > agora + 60)) return null;
    // o GitHub não diferencia maiúsculas nos nomes de repositório (o nome pode vir como "Velox-..." ou "velox-..."): vale o nome da lista
    const permitido = REPOS_PERMITIDOS.find((r) => r.toLowerCase() === String(c.repository || "").toLowerCase());
    if (!permitido || c.ref !== "refs/heads/main" || !EVENTOS.includes(c.event_name)) return null;
    return { repo: permitido, ref: c.ref, evento: c.event_name };
  } catch {
    return null;
  }
}

let guardadas = { quando: 0, chaves: null };
async function chavesDoGithub(buscar = fetch) {
  if (guardadas.chaves && Date.now() - guardadas.quando < 3_600_000) return guardadas.chaves;
  const r = await buscar(`${EMISSOR}/.well-known/jwks`);
  if (!r.ok) throw new Error("jwks");
  const { keys } = await r.json();
  guardadas = { quando: Date.now(), chaves: keys };
  return keys;
}

export async function tratarCi(req, env, url, caminho, opcoes = {}) {
  if (!env.DB) return json({ error: "sem banco" }, 503);
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  let quem = null;
  try { quem = await verificarOidc(token, opcoes.chaves || (await chavesDoGithub()), opcoes.agora); } catch { return json({ error: "não consegui conferir a identidade agora" }, 502); }
  if (!quem) return json({ error: "identidade não aceita" }, 403);
  if (req.method === "GET") {
    const l = await env.DB.prepare("SELECT dados FROM assinaturas WHERE repo = ?").bind(quem.repo).first();
    if (!l) return json({ existe: false });
    try { return json({ existe: true, ...(await decifrar(env, l.dados)) }); } catch { return json({ error: "não consegui abrir a chave guardada" }, 500); }
  }
  if (req.method === "PUT") {
    let c;
    try { c = await req.json(); } catch { return json({ error: "corpo inválido" }, 400); }
    const keystore = String(c.keystore || ""), senha = String(c.senha || "");
    if (!/^[A-Za-z0-9+/=]{100,30000}$/.test(keystore) || senha.length < 12 || senha.length > 200) return json({ error: "chave inválida" }, 400);
    const dados = await cifrar(env, { keystore, senha });
    const r = await env.DB.prepare("INSERT OR IGNORE INTO assinaturas (repo, dados, criado) VALUES (?, ?, ?)").bind(quem.repo, dados, Date.now()).run();
    return r.meta.changes ? json({ ok: true }, 201) : json({ error: "já existe uma chave para este repositório" }, 409);
  }
  return json({ error: "método não permitido" }, 405);
}
