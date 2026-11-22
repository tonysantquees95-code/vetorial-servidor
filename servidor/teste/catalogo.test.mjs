import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { tratarCatalogo } from "../src/catalogo/rotas.js";
import { CORES, LIMITE_PRODUTOS_GRATIS, LIMITE_PRODUTOS_PAGO, TEMAS, brl, fotoValida, normalizarCatalogo, numeroWhats, renderizarCatalogo, slugDe } from "../src/catalogo/dados.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ORIGENS_PERMITIDAS: "https://app.exemplo" });
const T0 = Date.now();
async function usuario(env, email = "ana@exemplo.com") {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: "Ana", dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Navegador", plataforma: "web" } }, T0);
  const u = await env.DB.prepare("SELECT * FROM usuarios WHERE id = ?").bind(r.usuario.id).first();
  return { token: r.token, usuario: u };
}
const chamar = (env, metodo, caminho, { token, corpo } = {}) => {
  const url = new URL("https://v.test" + caminho);
  return tratarCatalogo(new Request(url, { method: metodo, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, url, url.pathname);
};
const JPEG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9));
const base = (extra = {}) => ({ nome: "Loja da Ana", whats: "(51) 99999-8888", descricao: "Moda e presentes", tema: "claro", cor: CORES[0], produtos: [{ nome: "Vestido azul", preco: 12990, desc: "Tamanhos P ao G" }, { nome: "Bolsa", preco: 4990 }], ...extra });

test("ajudantes: dinheiro, WhatsApp, endereço, foto", () => {
  assert.equal(brl(12990), "R$ 129,90");
  assert.equal(numeroWhats("(51) 99999-8888"), "5551999998888"); assert.equal(numeroWhats("+55 51 99999-8888"), "5551999998888"); assert.equal(numeroWhats("123"), "");
  assert.equal(slugDe("Loja da Ana & Cia!"), "loja-da-ana-cia"); assert.equal(slugDe("  "), "");
  assert.ok(fotoValida(JPEG)); assert.equal(fotoValida(btoa("não sou imagem")), null); assert.equal(fotoValida("A".repeat(400_000)), null); assert.equal(fotoValida(""), null);
  assert.equal(TEMAS.filter((t) => t.gratis).length, 2); assert.ok(TEMAS.length >= 6);
});

test("normalizar: confere item por item e respeita o limite do plano", () => {
  assert.equal(normalizarCatalogo({}).erros.length >= 3, true);
  const ok = normalizarCatalogo(base({ tema: "inventado", cor: "#123456" }));
  assert.deepEqual(ok.erros, []); assert.equal(ok.valor.tema, "claro"); assert.equal(ok.valor.cor, CORES[0]); assert.equal(ok.valor.whats, "5551999998888");
  const muitos = Array.from({ length: LIMITE_PRODUTOS_GRATIS + 1 }, (_, i) => ({ nome: `P${i}`, preco: 100 }));
  assert.match(normalizarCatalogo(base({ produtos: muitos })).erros[0], /até 12 produtos/);
  assert.deepEqual(normalizarCatalogo(base({ produtos: muitos }), { limiteProdutos: LIMITE_PRODUTOS_PAGO }).erros, []);
  assert.equal(normalizarCatalogo(base({ produtos: [{ nome: "X", preco: -5 }, { nome: "  " }] })).valor.produtos[0].preco, 0);
  assert.match(normalizarCatalogo(base({ produtos: [{ nome: "Foto ruim", fotoNova: btoa("texto") }] })).erros[0], /foto/);
});

test("a página nunca deixa o que a pessoa digitou virar HTML", () => {
  const n = normalizarCatalogo(base({ nome: '<script>alert(1)</script>"x', descricao: "<img src=x onerror=alert(1)>", produtos: [{ nome: "<b>negrito</b>", desc: '"><svg onload=1>', preco: 100 }] })).valor;
  const html = renderizarCatalogo(n, { fotoUrl: () => "" });
  assert.ok(!/<script>alert|<img src=x|<svg onload|<b>negrito/.test(html));
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(html.includes("wa.me/5551999998888"));
});

test("sem login não salva nem lista; vitrine e prévia são públicas", async () => {
  const env = ENV();
  assert.equal((await chamar(env, "POST", "/catalogo", { corpo: base() })).status, 401);
  assert.equal((await chamar(env, "GET", "/catalogo")).status, 401);
  const m = await (await chamar(env, "GET", "/catalogo/modelos")).json();
  assert.equal(m.limiteGratis, 12); assert.equal(m.temas.filter((t) => t.gratis).length, 2);
  const p = await (await chamar(env, "POST", "/catalogo/previa", { corpo: base({ produtos: [{ nome: "Com foto", preco: 100, fotoNova: JPEG }] }) })).json();
  assert.ok(p.html.includes("data:image/jpeg;base64,") && p.html.includes("Com foto"));
  assert.equal((await (await chamar(env, "POST", "/catalogo/previa", { corpo: { nome: "x" } })).json()).html, "");
});

test("publicar: cria, mostra a página pública, conta visita, serve a foto e atualiza no mesmo endereço", async () => {
  const env = ENV();
  const u = await usuario(env);
  const r = await chamar(env, "POST", "/catalogo", { token: u.token, corpo: base({ produtos: [{ nome: "Vestido azul", preco: 12990, fotoNova: JPEG }, { nome: "Bolsa", preco: 4990 }] }) });
  assert.equal(r.status, 200);
  const c = (await r.json()).catalogo;
  assert.equal(c.slug, "loja-da-ana"); assert.equal(c.link, "https://v.test/c/loja-da-ana"); assert.ok(c.produtos[0].foto);
  const pag = await chamar(env, "GET", "/c/loja-da-ana");
  assert.equal(pag.status, 200); assert.match(pag.headers.get("content-security-policy"), /script-src 'self'/);
  const html = await pag.text();
  assert.ok(html.includes("Vestido azul") && html.includes("Vênus Vitrine</a>") && html.includes(`/c/loja-da-ana/f/${c.produtos[0].foto}`));
  const foto = await chamar(env, "GET", `/c/loja-da-ana/f/${c.produtos[0].foto}`);
  assert.equal(foto.status, 200); assert.equal(foto.headers.get("content-type"), "image/jpeg");
  assert.equal((await chamar(env, "GET", "/c/nao-existe-mesmo")).status, 404);
  const meu = await (await chamar(env, "GET", "/catalogo", { token: u.token })).json();
  assert.equal(meu.catalogo.visitas, 1); assert.equal(meu.assinante, false);
  // atualizar: mesmo endereço, mantém a foto pelo id, tira a que saiu
  const r2 = await (await chamar(env, "POST", "/catalogo", { token: u.token, corpo: base({ nome: "Outro nome", produtos: [{ nome: "Bolsa", preco: 5990 }, { nome: "Vestido", preco: 100, foto: c.produtos[0].foto }] }) })).json();
  assert.equal(r2.catalogo.slug, "loja-da-ana"); assert.equal(r2.catalogo.nome, "Outro nome"); assert.equal(r2.catalogo.produtos[1].foto, c.produtos[0].foto);
  const r3 = await (await chamar(env, "POST", "/catalogo", { token: u.token, corpo: base({ produtos: [{ nome: "Só um", preco: 100 }] }) })).json();
  assert.equal(r3.catalogo.produtos[0].foto, "");
  assert.equal((await chamar(env, "GET", `/c/loja-da-ana/f/${c.produtos[0].foto}`)).status, 404);
});

test("foto de outro catálogo não pode ser usada", async () => {
  const env = ENV();
  const a = await usuario(env, "a@exemplo.com"), b = await usuario(env, "b@exemplo.com");
  const ca = (await (await chamar(env, "POST", "/catalogo", { token: a.token, corpo: base({ produtos: [{ nome: "A", preco: 1, fotoNova: JPEG }] }) })).json()).catalogo;
  const cb = (await (await chamar(env, "POST", "/catalogo", { token: b.token, corpo: base({ nome: "Loja da Bia", produtos: [{ nome: "B", preco: 1, foto: ca.produtos[0].foto }] }) })).json()).catalogo;
  assert.equal(cb.produtos[0].foto, ""); assert.equal(cb.slug, "loja-da-bia");
});

test("endereço repetido ganha um sufixo; tema com assinatura é 403; limite de produtos do plano grátis", async () => {
  const env = ENV();
  const a = await usuario(env, "a@exemplo.com"), b = await usuario(env, "b@exemplo.com");
  await chamar(env, "POST", "/catalogo", { token: a.token, corpo: base() });
  const cb = (await (await chamar(env, "POST", "/catalogo", { token: b.token, corpo: base() })).json()).catalogo;
  assert.match(cb.slug, /^loja-da-ana-[a-z0-9]{3}$/);
  const trancado = TEMAS.find((t) => !t.gratis).id;
  const bloq = await chamar(env, "POST", "/catalogo", { token: a.token, corpo: base({ tema: trancado }) });
  assert.equal(bloq.status, 403); assert.equal((await bloq.json()).codigo, "assinatura");
  const muitos = Array.from({ length: 13 }, (_, i) => ({ nome: `P${i}`, preco: 100 }));
  assert.equal((await chamar(env, "POST", "/catalogo", { token: a.token, corpo: base({ produtos: muitos }) })).status, 400);
});

test("plano pago: temas bloqueados, até 60 produtos e sem a marca da Vênus", async () => {
  const env = ENV();
  const u = await usuario(env);
  const agora = Date.now();
  await env.DB.prepare("UPDATE lojas SET ativo_ate = ?, trial_fim = ? WHERE id = ?").bind(agora + 30 * 86_400_000, agora - 86_400_000, u.usuario.loja).run();
  const muitos = Array.from({ length: 30 }, (_, i) => ({ nome: `P${i}`, preco: 100 }));
  const r = await chamar(env, "POST", "/catalogo", { token: u.token, corpo: base({ tema: "boutique", produtos: muitos }) });
  assert.equal(r.status, 200);
  const j = await r.json(); assert.equal(j.assinante, true); assert.equal(j.catalogo.produtos.length, 30);
  assert.ok(!(await (await chamar(env, "GET", `/c/${j.catalogo.slug}`)).text()).includes("Vênus Vitrine</a>"));
});
