import test from "node:test";
import assert from "node:assert/strict";
import { dataDaNota, extrairJson, validarLancamento, promptTexto, passouDoLimite, _zerarLimites, tratarFinancas } from "../src/financas/ia.js";
import { REPOS_PERMITIDOS, APELIDOS, verificarOidc, EMISSOR, PUBLICO } from "../src/ci/assinatura.js";
import { escolherVersao } from "../src/atualizacao.js";

const cats = [{ id: "c-mercado", nome: "Mercado", tipo: "despesa" }, { id: "c-salario", nome: "Salário", tipo: "receita" }];
const contas = [{ id: "a-banco", nome: "Banco", tipo: "despesa" }];

test("extrai JSON mesmo com texto ou cerca de código em volta", () => {
  assert.deepEqual(extrairJson('```json\n{"valor":4500}\n```'), { valor: 4500 });
  assert.equal(extrairJson("sem json"), null);
  assert.equal(extrairJson("{quebrado"), null);
});
test("valida o que o modelo devolve: valor inteiro positivo, data real, só ids da lista", () => {
  const v = validarLancamento({ tipo: "despesa", valor: 4500, data: "2026-11-16", nota: "mercado", categoriaId: "c-mercado", contaId: "a-banco" }, "2026-11-17", cats, contas);
  assert.deepEqual(v, { tipo: "despesa", valor: 4500, data: "2026-11-16", nota: "mercado", categoriaId: "c-mercado", contaId: "a-banco" });
  assert.equal(validarLancamento({ valor: 0 }, "2026-11-17", cats, contas), null);
  assert.equal(validarLancamento({ valor: 12.5 }, "2026-11-17", cats, contas), null);
  assert.equal(validarLancamento({ valor: -3 }, "2026-11-17", cats, contas), null);
  const f = validarLancamento({ valor: 100, data: "2026-02-30", categoriaId: "inventada", contaId: "x" }, "2026-11-17", cats, contas);
  assert.equal(f.data, "2026-11-17"); assert.equal(f.categoriaId, undefined); assert.equal(f.contaId, undefined);
});
test("o prompt leva a data de hoje, as categorias e a regra de centavos", () => {
  const p = promptTexto("gastei 45", "2026-11-17", cats, contas);
  assert.match(p.sistema, /2026-11-17/); assert.match(p.sistema, /c-mercado=Mercado/); assert.match(p.sistema, /CENTAVOS/);
});
test("limite por endereço: a foto trava antes do texto e a janela expira", () => {
  _zerarLimites();
  for (let i = 0; i < 15; i++) assert.equal(passouDoLimite("1.1.1.1", "foto", 1000), false);
  assert.equal(passouDoLimite("1.1.1.1", "foto", 1000), true);
  assert.equal(passouDoLimite("2.2.2.2", "foto", 1000), false, "outro endereço não é afetado");
  assert.equal(passouDoLimite("1.1.1.1", "texto", 1000), false, "tarefas contam separado");
  assert.equal(passouDoLimite("1.1.1.1", "foto", 1000 + 11 * 60_000), false, "passada a janela, libera");
});
const logado = { validar: async () => ({ usuario: { id: "u1", loja: "l1" } }), liberado: async () => true };
const pedido = (corpo, extra = {}) => tratarFinancas(new Request("https://x/financas/ia", { method: "POST", body: typeof corpo === "string" ? corpo : JSON.stringify(corpo), ...extra }), {}, {}, logado);
test("rota: recusa pedido inválido, tarefa desconhecida, imagem estranha e responde preflight", async () => {
  _zerarLimites();
  assert.equal((await pedido("não é json")).status, 400);
  assert.equal((await pedido({ tarefa: "x" })).status, 400);
  assert.equal((await pedido({ tarefa: "texto", texto: "  " })).status, 400);
  assert.equal((await pedido({ tarefa: "foto", imagem: "<script>" })).status, 400);
  assert.equal((await tratarFinancas(new Request("https://x/financas/ia", { method: "GET" }), {}, {}, logado)).status, 405);
  assert.equal((await tratarFinancas(new Request("https://x/financas/ia", { method: "OPTIONS" }), {}, {})).status, 204);
  const grande = await tratarFinancas(new Request("https://x/financas/ia", { method: "POST", headers: { "content-length": "9999999" }, body: "{}" }), {}, {}, logado);
  assert.equal(grande.status, 413);
});
test("sem a chave da Groq no servidor, a foto responde 503 claro (e não vaza nada)", async () => {
  _zerarLimites();
  const r = await pedido({ tarefa: "foto", imagem: "AAAA", categorias: cats });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /não está configurada/);
});
test("CI: Vyntem pode assinar e o repositório 'Vindex' usa a chave guardada em 'Vindex-'", () => {
  assert.ok(REPOS_PERMITIDOS.includes("tonysantquees95-code/Vyntem"));
  assert.equal(APELIDOS["tonysantquees95-code/vindex"], "tonysantquees95-code/Vindex-");
});
test("atualização: o servidor conhece o Vyntem", () => {
  const lista = [{ tag_name: "1.7", assets: [{ name: "Vyntem.apk" }, { name: "VyntemSetup.exe" }] }, { tag_name: "1.9", assets: [{ name: "Vyntem.apk" }, { name: "VyntemSetup.exe" }] }];
  assert.equal(escolherVersao(lista, "vyntem-android").numero, 9);
  assert.equal(escolherVersao(lista, "vyntem-windows").apk.name, "VyntemSetup.exe");
});

test("sem login a rota responde 401; sem o Vyntem no plano, 402", async () => {
  _zerarLimites();
  const req = () => new Request("https://x/financas/ia", { method: "POST", body: JSON.stringify({ tarefa: "texto", texto: "oi" }) });
  const semLogin = await tratarFinancas(req(), {}, {}, { validar: async () => { const e = new Error("Entre de novo."); e.status = 401; throw e; } });
  assert.equal(semLogin.status, 401);
  const semPlano = await tratarFinancas(req(), {}, {}, { validar: logado.validar, liberado: async () => false });
  assert.equal(semPlano.status, 402);
});
test("licença: o Vyntem entra no teste grátis, no dono e no pacote completo, e em mais nenhum", async () => {
  const { appsLiberados } = await import("../src/loja/assinatura.js");
  const agora = 1_800_000_000_000, DIA = 86_400_000;
  assert.equal(appsLiberados({ trial_fim: agora + DIA, ativo_ate: 0 }, agora).vyntem, true);
  assert.equal(appsLiberados({ plano: "dono" }, agora).vyntem, true);
  assert.equal(appsLiberados({ ativo_ate: agora + DIA, pacote: "completo" }, agora).vyntem, true);
  assert.equal(appsLiberados({ ativo_ate: agora + DIA, pacote: "venus_vindex" }, agora).vyntem, true); // grátis para qualquer conta
  assert.equal(appsLiberados({ trial_fim: 0, ativo_ate: 0 }, agora).vyntem, true);
  assert.equal(appsLiberados({ ativo_ate: agora + DIA, pacote: "venus_vindex" }, agora).vortex, true); // o Vortex é grátis para todos
  assert.equal(appsLiberados({ ativo_ate: agora + DIA, pacote: "venus_vindex" }, agora, { gratis: false }).vortex, false);
});

test("data da nota: dia/mês/ano, nunca o formato americano", () => {
  assert.equal(dataDaNota("08/11/2026"), "2026-11-08");
  assert.equal(dataDaNota("Emissão: 8-11-26 14:32"), "2026-11-08");
  assert.equal(dataDaNota("08.11.2026"), "2026-11-08");
  assert.equal(dataDaNota("31/02/2026"), null);
  assert.equal(dataDaNota("sem data"), null);
});

test("Vyntem é grátis para qualquer conta do Vetorial ID", async () => {
  const { appLiberadoParaConta } = await import("../src/id/acesso.js");
  assert.equal(await appLiberadoParaConta({ DB: {} }, { id: "u1" }, "vyntem"), true);
  assert.equal(await appLiberadoParaConta({ DB: {} }, null, "vyntem"), false);
});
