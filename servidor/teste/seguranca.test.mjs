// Testes de segurança: simulam um atacante contra o servidor inteiro (Worker + banco de teste).
// Rodam na publicação junto com os outros: se uma brecha voltar, a publicação para.
// Regra: brecha nova encontrada = um teste novo aqui, com o ataque que a explorava.
import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import worker from "../src/index.js";

process.removeAllListeners("warning");
const B = "https://v.test";
const ctx = { waitUntil: (p) => p?.catch?.(() => {}) };
const disp = (n) => ({ id: `aparelho-${n}-xxxxxxxx`, nome: `A${n}`, plataforma: "android" });
const XSS = `<script>alert(1)</script>"><img src=x onerror=alert(1)>`;

function novoAmbiente(extra = {}) {
  return { DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ORIGENS_PERMITIDAS: "https://app.exemplo", ...extra };
}
async function chamar(env, metodo, caminho, { t, corpo, raw, ip = "1.1.1.1", h = {} } = {}) {
  const r = await worker.fetch(new Request(B + caminho, {
    method: metodo,
    headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(t ? { authorization: `Bearer ${t}` } : {}), ...h },
    body: raw ?? (corpo ? JSON.stringify(corpo) : undefined),
  }), env, ctx);
  const tx = await r.text();
  let j = null; try { j = JSON.parse(tx); } catch { /* página, não JSON */ }
  return { s: r.status, j, tx, r };
}
async function cadastrar(env, email, n) {
  const r = await chamar(env, "POST", "/id/cadastrar", { corpo: { email, senha: "senha-forte-123", nome: email, dispositivo: disp(n) }, ip: `9.9.${n}.1` });
  assert.ok(r.j?.token, "cadastro de teste falhou");
  return r.j.token;
}
async function duasContas() {
  const env = novoAmbiente();
  return { env, vitima: await cadastrar(env, "vitima@x.com", 1), atacante: await cadastrar(env, "atacante@x.com", 2) };
}
const barrado = (s) => s === 401 || s === 403 || s === 404;

test("áreas de administração: sem login e com conta comum são barradas", async () => {
  const { env, atacante } = await duasContas();
  for (const p of ["/dev/usuarios", "/dev/alertas", "/dev/feedback", "/dev/visitas?dias=7", "/dev/assinaturas", "/dev/cofre", "/dev/fases", "/id/github"]) {
    assert.ok(barrado((await chamar(env, "GET", p)).s), `${p} sem login`);
    assert.ok(barrado((await chamar(env, "GET", p, { t: atacante })).s), `${p} com conta comum`);
  }
  assert.ok(barrado((await chamar(env, "DELETE", "/dev/fases/1", { t: atacante })).s));
});

test("token falso nunca vale: alg none, assinatura trocada, lixo e dono trocado", async () => {
  const { env, vitima, atacante } = await duasContas();
  const [cab, corpo, ass] = atacante.split(".");
  const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." + corpo + ".";
  const sub = JSON.parse(Buffer.from(vitima.split(".")[1], "base64url")).sub;
  const outro = { ...JSON.parse(Buffer.from(corpo, "base64url")), sub };
  const forjado = `${cab}.${Buffer.from(JSON.stringify(outro)).toString("base64url")}.${ass}`;
  for (const t of [none, `${cab}.${corpo}.AAAA`, "abc", forjado, "", "Bearer"]) {
    assert.equal((await chamar(env, "GET", "/vortex/saves", { t })).s, 401, `token ${t.slice(0, 20)}`);
    assert.equal((await chamar(env, "GET", "/links", { t })).s, 401);
  }
});

test("senhas: força bruta numa conta e em muitos e-mails pela mesma rede são barradas", async () => {
  const { env } = await duasContas();
  let bloqueou = false;
  for (let i = 0; i < 15 && !bloqueou; i++) bloqueou = (await chamar(env, "POST", "/id/entrar", { corpo: { email: "vitima@x.com", senha: `errada${i}`, dispositivo: disp(5) }, ip: "7.7.7.7" })).s === 429;
  assert.ok(bloqueou, "uma conta");
  bloqueou = false;
  for (let i = 0; i < 60 && !bloqueou; i++) bloqueou = (await chamar(env, "POST", "/id/entrar", { corpo: { email: `alvo${i}@x.com`, senha: "qualquer-123", dispositivo: disp(6) }, ip: "8.8.8.8" })).s === 429;
  assert.ok(bloqueou, "muitos e-mails, mesma rede");
});

test("login não revela se o e-mail existe", async () => {
  const env = novoAmbiente();
  await cadastrar(env, "real@x.com", 1);
  const a = await chamar(env, "POST", "/id/entrar", { corpo: { email: "naoexiste@x.com", senha: "errada-1234", dispositivo: disp(7) }, ip: "2.2.2.2" });
  const b = await chamar(env, "POST", "/id/entrar", { corpo: { email: "real@x.com", senha: "errada-1234", dispositivo: disp(7) }, ip: "3.3.3.3" });
  assert.equal(a.s, b.s);
  assert.deepEqual(a.j, b.j);
});

test("injeção de SQL e JSON quebrado dão erro 4xx, nunca 500", async () => {
  const { env, atacante } = await duasContas();
  const sql = `x' OR '1'='1`;
  const l = await chamar(env, "POST", "/id/entrar", { corpo: { email: sql, senha: sql, dispositivo: disp(8) }, ip: "5.5.5.5" });
  assert.ok(l.s >= 400 && l.s < 500);
  assert.ok((await chamar(env, "GET", `/links?x=${encodeURIComponent(sql)}`, { t: atacante })).s < 500);
  const q = await chamar(env, "POST", "/id/entrar", { raw: "{quebrado", ip: "4.4.4.4" });
  assert.ok(q.s >= 400 && q.s < 500);
  assert.ok((await chamar(env, "POST", "/links", { t: atacante, raw: "[[[" })).s < 500);
});

test("links curtos recusam destinos perigosos", async () => {
  const { env, atacante } = await duasContas();
  for (const d of ["javascript:alert(1)", "http://localhost/x", "http://169.254.169.254/latest", "http://127.0.0.1", "http://[::1]/", "file:///etc/passwd", "data:text/html,<script>1</script>", "https://u:p@exemplo.com", "http://10.0.0.1/x"]) {
    assert.equal((await chamar(env, "POST", "/links", { t: atacante, corpo: { destino: d } })).s, 400, d);
  }
});

test("uma conta não mexe nos dados da outra (links)", async () => {
  const { env, vitima, atacante } = await duasContas();
  const cod = (await chamar(env, "POST", "/links", { t: vitima, corpo: { destino: "https://exemplo.com.br/a" } })).j?.link?.codigo;
  assert.ok(cod);
  assert.equal((await chamar(env, "DELETE", `/links/${cod}`, { t: atacante })).s, 404);
  assert.ok(!JSON.stringify((await chamar(env, "GET", "/links", { t: atacante })).j).includes(cod));
  assert.ok((await chamar(env, "GET", "/links", { t: vitima })).tx.includes(cod), "a vítima ainda vê o dela");
});

test("cofre pessoal: cada conta só enxerga o seu", async () => {
  const { env, vitima, atacante } = await duasContas();
  await chamar(env, "PUT", "/cofre", { t: vitima, corpo: { pacote: "SEGREDO_DA_VITIMA", base: 0 } });
  const meu = await chamar(env, "GET", "/cofre/pacote", { t: atacante });
  assert.ok(!meu.tx.includes("SEGREDO_DA_VITIMA"));
  assert.equal((await chamar(env, "GET", "/cofre")).s, 401);
});

test("Drive e saves do Vortex: nomes com ../ nunca chegam ao armazenamento", async () => {
  const chaves = [];
  const SAVES = {
    list: async (o) => { chaves.push(o?.prefix); return { objects: [], truncated: false }; },
    get: async (k) => { chaves.push(k); return null; }, head: async (k) => { chaves.push(k); return null; },
    put: async (k) => { chaves.push(k); return {}; }, delete: async (k) => { chaves.push(k); },
    createMultipartUpload: async (k) => { chaves.push(k); return { uploadId: "x" }; },
    resumeMultipartUpload: (k) => { chaves.push(k); return { uploadPart: async () => ({}), complete: async () => ({}), abort: async () => {} }; },
  };
  const env = novoAmbiente({ SAVES });
  const t = await cadastrar(env, "atacante@x.com", 2);
  for (const [p, n] of [["../outra", "a.txt"], ["docs", "../../x"], ["docs/../..", "x"], ["docs", "a/b"], ["docs", ".."], ["/etc", "passwd"]]) {
    await chamar(env, "POST", "/drive/arquivos", { t, corpo: { pasta: p, nome: n, tamanho: 10 } });
    await chamar(env, "DELETE", `/drive/arquivos?pasta=${encodeURIComponent(p)}&nome=${encodeURIComponent(n)}`, { t });
  }
  for (const [j, a] of [["..", "x.sav"], ["jogo", "..%2f..%2fx"], ["a%2fb", "x.sav"], ["jogo", "%2e%2e"]]) {
    await chamar(env, "GET", `/vortex/saves/${j}/${a}`, { t });
    await chamar(env, "PUT", `/vortex/saves/${j}/${a}`, { t, raw: "dados" });
    await chamar(env, "DELETE", `/vortex/saves/${j}/${a}`, { t });
  }
  const ruins = chaves.filter((k) => typeof k === "string" && (/\.\./.test(k) || /\/\//.test(k.replace(/^.*?:\/\//, ""))));
  assert.deepEqual(ruins, [], "chave suspeita chegou ao armazenamento");
});

test("Voxix exige perfil antes de conversar", async () => {
  const { env, atacante } = await duasContas();
  assert.ok((await chamar(env, "POST", "/voxix/mensagens", { t: atacante, corpo: { para: "vitima", corpo: "oi" } })).s >= 400);
  assert.equal((await chamar(env, "POST", "/voxix/mensagens", { corpo: { para: "vitima", corpo: "oi" } })).s, 401);
});

test("chat público: tem limite por rede e não quebra com corpo gigante", async () => {
  let usos = 0;
  const env = novoAmbiente({ LIMITADOR: { limit: async () => ({ success: ++usos <= 3 }) } });
  const msg = { corpo: { messages: [{ role: "user", content: "oi" }] } };
  const status = [];
  for (let i = 0; i < 5; i++) status.push((await chamar(env, "POST", "/chat", msg)).s);
  assert.deepEqual(status.slice(3), [429, 429], "depois do limite devolve 429");
  const env2 = novoAmbiente();
  const grande = await chamar(env2, "POST", "/chat", { corpo: { messages: Array.from({ length: 2000 }, () => ({ role: "user", content: "x".repeat(9000) })) } });
  assert.ok(grande.s !== 500 && grande.s !== 200 || grande.s === 200);
});

test("login e recuperação: limite por rede está ligado nas duas rotas", async () => {
  const env = novoAmbiente();
  let bloqueou = false;
  for (let i = 0; i < 60 && !bloqueou; i++) bloqueou = (await chamar(env, "POST", "/id/recuperar/confirmar", { corpo: { email: `a${i}@x.com`, codigo: "000000", novaSenha: "nova-senha-123" }, ip: "3.3.3.3" })).s === 429;
  assert.ok(bloqueou, "recuperação por rede");
});

test("webhooks de pagamento falsos não liberam nada", async () => {
  const { env } = await duasContas();
  const antes = env.DB._db.prepare("SELECT COUNT(*) AS n FROM lojas WHERE ativo_ate IS NOT NULL").get().n;
  for (const p of ["/webhook/infinitepay", "/loja/webhook/mercadopago"]) {
    const r = await chamar(env, "POST", p, { corpo: { type: "payment", data: { id: "123" }, status: "paid", order_nsu: "x", transaction_nsu: "y" } });
    assert.ok(r.s !== 200 || /ignor|ok/i.test(r.tx), p);
  }
  assert.equal(env.DB._db.prepare("SELECT COUNT(*) AS n FROM lojas WHERE ativo_ate IS NOT NULL").get().n, antes, "nenhuma loja ganhou acesso");
});

test("aviso de cobrança já confirmado não é sobrescrito", async () => {
  const env = novoAmbiente();
  await chamar(env, "POST", "/cobranca/aviso", { corpo: { order_nsu: "pedido-12345678", invoice_slug: "s1", transaction_nsu: "t1" } });
  await chamar(env, "POST", "/cobranca/aviso", { corpo: { order_nsu: "pedido-12345678", invoice_slug: "FALSO", transaction_nsu: "FALSO" } });
  assert.deepEqual({ ...env.DB._db.prepare("SELECT slug, transaction_nsu FROM cobranca_avisos WHERE order_nsu = ?").get("pedido-12345678") }, { slug: "s1", transaction_nsu: "t1" });
});

test("páginas públicas escapam script nos textos (catálogo e site)", async () => {
  const env = novoAmbiente();
  const pv = await chamar(env, "POST", "/catalogo/previa", { corpo: { nome: XSS, whats: "51999999999", descricao: XSS, produtos: [{ nome: XSS, preco: 100 }] } });
  assert.ok(pv.s < 500);
  assert.ok(!/<script>alert|<img src=x/i.test(pv.tx), "catálogo");
  const sv = await chamar(env, "POST", "/sitev/previa", { corpo: { nome: XSS, slogan: XSS, sobre: XSS, whats: "51999999999", instagram: `"><script>1</script>`, endereco: XSS, horario: XSS } });
  assert.ok(sv.s < 500);
  assert.ok(!/<script>(alert|1)/i.test(sv.tx) && !/<img src=x/i.test(sv.tx), "site");
});

test("arquivos sensíveis do projeto não são servidos", async () => {
  const env = novoAmbiente();
  for (const p of ["/.env", "/.git/config", "/wrangler.toml", "/servidor/src/index.js", "/migrations/0001_init.sql", "/package.json"]) {
    const r = await chamar(env, "GET", p);
    assert.ok(!(r.s === 200 && /(database_id|CLOUDFLARE_API_TOKEN|CHAVE_COFRE|GITHUB_TOKEN)/i.test(r.tx)), p);
  }
});

test("baixar pelo site exige o Vetorial ID: sem token, token falso e app inválido não entregam arquivo", async () => {
  const env = novoAmbiente();
  assert.equal((await chamar(env, "POST", "/baixar?app=vortex-android")).s, 401);
  assert.equal((await chamar(env, "POST", "/baixar?app=vortex-android", { t: "lixo.lixo.lixo" })).s, 401);
  const alg = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const corpo = Buffer.from(JSON.stringify({ sub: "1", exp: 9999999999 })).toString("base64url");
  assert.equal((await chamar(env, "POST", "/baixar?app=vortex-android", { t: `${alg}.${corpo}.` })).s, 401);
  const conta = await cadastrar(env, "baixa@x.com", 5);
  assert.equal((await chamar(env, "POST", "/baixar?app=../../etc", { t: conta })).s, 400);
  assert.equal((await chamar(env, "GET", "/baixar?app=vortex-android", { t: conta })).s, 404);
});
