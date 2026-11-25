import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { arquivoValido, centavosDe, extrairObjeto, normalizarItens, tratarCardapio, LEITURAS_POR_DIA_GRATIS, MAX_ARQUIVOS } from "../src/catalogo/cardapio.js";
import { LIMITE_PRODUTOS_GRATIS } from "../src/catalogo/dados.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ORIGENS_PERMITIDAS: "https://app.exemplo" });
const T0 = Date.now();
async function conta(env, email = "ana@exemplo.com") {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: "Ana", dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Navegador", plataforma: "web" } }, T0);
  return r.token;
}
const JPEG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9));
const PDF = btoa("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
const chamar = (env, metodo, caminho, { token, corpo, ler } = {}) => {
  const url = new URL("https://v.test" + caminho);
  const req = new Request(url, { method: metodo, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  return tratarCardapio(req, env, url, url.pathname, { ler });
};
const IA = (itens) => async () => ({ texto: "```json\n" + JSON.stringify({ nome_do_negocio: "Cantinho do Sabor", itens }) + "\n```" });

test("preço: centavos inteiros, texto brasileiro e lixo", () => {
  assert.equal(centavosDe(1290), 1290); assert.equal(centavosDe("R$ 12,90"), 1290); assert.equal(centavosDe("12.90"), 1290); assert.equal(centavosDe("1.250,00"), 125000);
  assert.equal(centavosDe("15"), 1500); assert.equal(centavosDe(-5), 0); assert.equal(centavosDe("grátis"), 0); assert.equal(centavosDe(1e12), 0); assert.equal(centavosDe(null), 0);
});

test("arquivo: o tipo tem de bater com os bytes", () => {
  assert.ok(arquivoValido({ mime: "image/jpeg", dados: JPEG })); assert.ok(arquivoValido({ mime: "application/pdf", dados: PDF }));
  assert.equal(arquivoValido({ mime: "application/pdf", dados: JPEG }), null); assert.equal(arquivoValido({ mime: "image/png", dados: JPEG }), null);
  assert.equal(arquivoValido({ mime: "image/jpeg", dados: btoa("texto qualquer") }), null); assert.equal(arquivoValido({ mime: "image/jpeg", dados: "A".repeat(4_100_000) }), null);
});

test("extrair e normalizar: tira duplicados, corta no limite e limpa texto", () => {
  assert.equal(extrairObjeto("nada"), null); assert.deepEqual(extrairObjeto('blá ```json\n{"a":1}\n``` fim'), { a: 1 });
  const lista = [{ nome: "X-Burger", preco: "R$ 18,50", categoria: "Lanches" }, { nome: "x-burger", preco: 1850 }, { nome: "  ", preco: 5 }, { nome: "Suco\u0000 de laranja", preco: 700, descricao: "500 ml" }];
  const n = normalizarItens({ itens: lista });
  assert.equal(n.itens.length, 2); assert.equal(n.itens[0].preco, 1850); assert.equal(n.itens[1].nome, "Suco de laranja"); assert.equal(n.itens[0].categoria, "Lanches");
  const muitos = Array.from({ length: 20 }, (_, i) => ({ nome: `Item ${i}`, preco: 100 }));
  const c = normalizarItens({ itens: muitos }, { limite: LIMITE_PRODUTOS_GRATIS });
  assert.equal(c.itens.length, 12); assert.equal(c.cortados, 8); assert.equal(c.total, 20);
});

test("rota: exige login, valida arquivos e devolve itens para revisar", async () => {
  const env = ENV(); const token = await conta(env);
  assert.equal((await chamar(env, "POST", "/catalogo/cardapio/ler", { corpo: { arquivos: [{ mime: "image/jpeg", dados: JPEG }] } })).status, 401);
  assert.equal((await chamar(env, "POST", "/catalogo/cardapio/ler", { token, corpo: { arquivos: [] } })).status, 400);
  assert.equal((await chamar(env, "POST", "/catalogo/cardapio/ler", { token, corpo: { arquivos: Array(MAX_ARQUIVOS + 1).fill({ mime: "image/jpeg", dados: JPEG }) } })).status, 400);
  assert.equal((await chamar(env, "POST", "/catalogo/cardapio/ler", { token, corpo: { arquivos: [{ mime: "application/pdf", dados: JPEG }] } })).status, 400);
  assert.equal((await chamar(env, "POST", "/catalogo/cardapio/ler", { token, corpo: { arquivos: [{ mime: "application/pdf", dados: PDF }, { mime: "application/pdf", dados: PDF }] } })).status, 400);
  const r = await chamar(env, "POST", "/catalogo/cardapio/ler", { token, ler: IA([{ nome: "X-Burger", preco: 1850 }, { nome: "Suco", preco: 700 }]), corpo: { arquivos: [{ mime: "image/jpeg", dados: JPEG }] } });
  assert.equal(r.status, 200); const d = await r.json();
  assert.equal(d.itens.length, 2); assert.equal(d.nome, "Cantinho do Sabor"); assert.equal(d.usados, 1); assert.equal(d.limiteProdutos, 12);
});

test("limite diário: conta as leituras, devolve quando a IA falha ou não acha nada", async () => {
  const env = ENV(); const token = await conta(env);
  const corpo = { arquivos: [{ mime: "image/jpeg", dados: JPEG }] };
  const falha = async () => { throw new Error("ia fora do ar"); };
  const quebrou = await chamar(env, "POST", "/catalogo/cardapio/ler", { token, ler: falha, corpo });
  assert.equal(quebrou.status, 502); assert.equal((await (await chamar(env, "GET", "/catalogo/cardapio", { token })).json()).usados, 0);
  const vazio = await chamar(env, "POST", "/catalogo/cardapio/ler", { token, ler: IA([]), corpo });
  assert.equal(vazio.status, 422); assert.equal((await (await chamar(env, "GET", "/catalogo/cardapio", { token })).json()).usados, 0);
  for (let i = 0; i < LEITURAS_POR_DIA_GRATIS; i++) assert.equal((await chamar(env, "POST", "/catalogo/cardapio/ler", { token, ler: IA([{ nome: "A", preco: 100 }]), corpo })).status, 200);
  const passou = await chamar(env, "POST", "/catalogo/cardapio/ler", { token, ler: IA([{ nome: "A", preco: 100 }]), corpo });
  assert.equal(passou.status, 429); assert.equal((await passou.json()).codigo, "limite");
  const outra = await conta(env, "bia@exemplo.com");
  assert.equal((await chamar(env, "POST", "/catalogo/cardapio/ler", { token: outra, ler: IA([{ nome: "A", preco: 100 }]), corpo })).status, 200);
});

test("corpo grande demais é recusado antes de ler", async () => {
  const env = ENV(); const token = await conta(env);
  const url = new URL("https://v.test/catalogo/cardapio/ler");
  const r = await tratarCardapio(new Request(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-length": "9000000" }, body: "{}" }), env, url, url.pathname, {});
  assert.equal(r.status, 413);
});
