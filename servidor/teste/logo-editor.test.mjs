import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { tratarLogo, LIMITE_LOGOS_POR_DIA } from "../src/ferramentas/logo.js";
import { MODELOS } from "../src/meusite/modelos-logo.js";
import { FONTES, LAYOUTS, PALETAS, SIMBOLOS } from "../src/meusite/logos.js";

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
  return tratarLogo(new Request(url, { method: metodo, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, url, url.pathname);
};



const ESPEC = { nome: "Pizza Bella", simbolo: "pizza", layout: "horizontal", fonte: "maquina", paleta: "ouro", cores: { principal: "#ff2bd6" } };

test("opções do editor: 20+ fontes/ícones, busca por palavra e miniaturas só de traço", async () => {
  const o = await (await chamar(ENV(), "GET", "/ferramentas/logo/editor/opcoes")).json();
  assert.ok(o.fontes.length >= 15 && o.layouts.length === 4 && o.paletas.length >= 10);
  assert.ok(o.simbolos.length >= 70);
  assert.ok(o.simbolos.some((s) => s.id === "pizza" && s.palavras.includes("pizzaria")));
  for (const s of o.simbolos) assert.ok(!/<script|on\w+=/i.test(s.svg), s.id);
});

test("prévia do editor é pública, valida a espec e aplica cores, fonte e neon", async () => {
  const env = ENV();
  const r = await chamar(env, "POST", "/ferramentas/logo/editor/previa", { corpo: { espec: { ...ESPEC, neon: { ativo: true, cor: "#00ffcc" } } } });
  const c = await r.json();
  assert.equal(r.status, 200);
  assert.ok(c.svg.includes("#FF2BD6") && c.svg.includes("Courier") && c.svg.includes("<filter") && c.svg.includes("#00FFCC"));
  const lixo = await (await chamar(env, "POST", "/ferramentas/logo/editor/previa", { corpo: { espec: { nome: '<script>x</script>', simbolo: "nao-existe", fonte: "??", cores: { fundo: "red;}</style>" }, neon: { ativo: "sim" } } } })).json();
  assert.ok(!/<script/i.test(lixo.svg) && !lixo.svg.includes("filter="));
  assert.ok(lixo.espec.simbolo !== "nao-existe" && lixo.espec.neon.ativo === false);
});

test("espec de um modelo pronto abre no editor", async () => {
  const m = MODELOS.find((x) => x.gratis);
  const c = await (await chamar(ENV(), "GET", `/ferramentas/logo/editor/modelo?id=${m.id}&nome=Ana`)).json();
  assert.equal(c.espec.simbolo, m.simbolo); assert.equal(c.gratis, true);
});

test("personalizado: exige login, grátis cria 2 por dia, neon é só de assinante", async () => {
  const env = ENV();
  assert.equal((await chamar(env, "POST", "/ferramentas/logo/personalizado", { corpo: { espec: ESPEC } })).status, 401);
  const u = await usuario(env);
  const neon = await chamar(env, "POST", "/ferramentas/logo/personalizado", { token: u.token, corpo: { espec: { ...ESPEC, neon: { ativo: true } } } });
  assert.equal(neon.status, 403); assert.equal((await neon.json()).codigo, "assinatura");
  for (let i = 0; i < LIMITE_LOGOS_POR_DIA; i++) assert.equal((await chamar(env, "POST", "/ferramentas/logo/personalizado", { token: u.token, corpo: { espec: ESPEC } })).status, 200);
  assert.equal((await chamar(env, "POST", "/ferramentas/logo/personalizado", { token: u.token, corpo: { espec: ESPEC } })).status, 429);
});

test("personalizado: plano pago usa neon sem limite", async () => {
  const env = ENV();
  const u = await usuario(env);
  const agora = Date.now();
  await env.DB.prepare("UPDATE lojas SET ativo_ate = ?, trial_fim = ? WHERE id = ?").bind(agora + 30 * 86_400_000, agora - 86_400_000, u.usuario.loja).run();
  for (let i = 0; i < 4; i++) {
    const r = await chamar(env, "POST", "/ferramentas/logo/personalizado", { token: u.token, corpo: { espec: { ...ESPEC, neon: { ativo: true } } } });
    assert.equal(r.status, 200); assert.ok((await r.json()).svg.includes("<filter"));
  }
});
