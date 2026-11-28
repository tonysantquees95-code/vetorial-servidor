// Cortesia de 60 dias: só o administrador dá, vale para uma conta, não conta como venda e acaba sozinha.
import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import worker from "../src/index.js";
import { criarAdmin } from "../src/dev/admin.js";
import { darCortesia, DIAS_DE_CORTESIA } from "../src/dev/cortesia.js";
import { resumoDeAssinaturas } from "../src/dev/assinaturas.js";
import { comPrivilegios, acessoLiberado } from "../src/loja/lojas.js";
import { confirmarPagamento } from "../src/loja/assinatura.js";
import { semLimite } from "../src/pdf/uso.js";
import { verificarAcompanhamentos, mensagensDe, dataBR } from "../src/dev/acompanhamento.js";

process.removeAllListeners("warning");
const B = "https://v.test", DIA = 86_400_000;
const ctx = { waitUntil: (p) => p?.catch?.(() => {}) };
const ambiente = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", DEV_CONVITE: "convite-secreto-1" });
async function chamar(env, metodo, caminho, { t, corpo, ip = "1.1.1.1" } = {}) {
  const r = await worker.fetch(new Request(B + caminho, { method: metodo, headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined }), env, ctx);
  const tx = await r.text(); let j = null; try { j = JSON.parse(tx); } catch { /* página */ }
  return { s: r.status, j, tx };
}
async function conta(env, email, n) {
  const r = await chamar(env, "POST", "/id/cadastrar", { corpo: { email, senha: "senha-forte-123", nome: email, dispositivo: { id: `aparelho-${n}-xxxxxxxx`, nome: "A", plataforma: "android" } }, ip: `9.9.${n}.1` });
  assert.ok(r.j?.token, r.tx);
  return { token: r.j.token, ...env.DB._db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email) };
}
const lojaDe = (env, c) => comPrivilegios(env, env.DB._db.prepare("SELECT * FROM lojas WHERE id = ?").get(c.loja));
async function preparo() {
  const env = ambiente();
  const adm = await criarAdmin(env, { senha: "senha-admin-1", convite: env.DEV_CONVITE, dispositivo: { id: "aparelho-adm-xxxxxxxx", nome: "Adm", plataforma: "android" } });
  const lojista = await conta(env, "lojista@x.com", 1), outro = await conta(env, "outro@x.com", 2);
  // os dois já gastaram o teste grátis: assim só a cortesia abre o acesso
  env.DB._db.prepare("UPDATE lojas SET trial_fim = 0 WHERE id IN (?, ?)").run(lojista.loja, outro.loja);
  return { env, adm: adm.token, lojista, outro };
}
const usuariosDoPainel = async (env, adm) => (await chamar(env, "GET", "/dev/usuarios", { t: adm })).j;

test("ataque: sem ser o administrador ninguém dá cortesia, nem para si, nem para outro", async () => {
  const { env, lojista, outro } = await preparo();
  for (const [t, alvo] of [[undefined, lojista], [lojista.token, lojista], [lojista.token, outro], [outro.token, lojista]]) {
    const r = await chamar(env, "POST", `/dev/usuarios/${alvo.id}/cortesia`, { t });
    assert.ok(r.s === 401 || r.s === 403, r.tx);
  }
  assert.equal(acessoLiberado(await lojaDe(env, lojista)), false);
  assert.equal(env.DB._db.prepare("SELECT COUNT(*) AS n FROM cortesias").get().n, 0);
});

test("o administrador libera só a conta escolhida, por 60 dias, sem contar como venda", async () => {
  const { env, adm, lojista, outro } = await preparo();
  const antes = Date.now();
  const r = await chamar(env, "POST", `/dev/usuarios/${lojista.id}/cortesia`, { t: adm });
  assert.equal(r.s, 200, r.tx);
  assert.equal(DIAS_DE_CORTESIA, 60);
  assert.ok(r.j.fim >= antes + 60 * DIA && r.j.fim <= Date.now() + 60 * DIA);
  assert.equal(acessoLiberado(await lojaDe(env, lojista)), true);
  assert.equal(acessoLiberado(await lojaDe(env, outro)), false);
  assert.equal(await semLimite(env, lojista), true);
  assert.equal(await semLimite(env, outro), false);
  const u = await usuariosDoPainel(env, adm);
  const eu = u.usuarios.find((x) => x.email === "lojista@x.com");
  assert.equal(eu.situacao, "cortesia"); assert.equal(eu.pagante, false); assert.equal(eu.ativoAte, r.j.fim); assert.equal(u.pagantes, 0);
  const res = await resumoDeAssinaturas(env);
  assert.equal(res.assinantes, 0); assert.equal(res.cortesias, 1); assert.equal(res.mes.centavos, 0); assert.equal(res.vencendoEm7, 0);
});

test("quando o prazo acaba o acesso fecha sozinho, não vira vendido nem cancelado, e não dá para repetir", async () => {
  const { env, adm, lojista } = await preparo();
  const { j } = await chamar(env, "POST", `/dev/usuarios/${lojista.id}/cortesia`, { t: adm });
  const depois = j.fim + 1000, loja = await lojaDe(env, lojista);
  assert.equal(acessoLiberado(loja, j.fim - 1000), true);
  assert.equal(acessoLiberado(loja, depois), false);
  const res = await resumoDeAssinaturas(env, depois);
  assert.equal(res.assinantes, 0); assert.equal(res.venceram, 0); assert.equal(res.cortesias, 0);
  const de_novo = await darCortesia(env, lojista, "adm", depois).then(() => null, (e) => e);
  assert.equal(de_novo.codigo, "cortesia_ja_usada");
});

test("dois toques ao mesmo tempo dão uma cortesia só", async () => {
  const { env, lojista } = await preparo();
  const r = await Promise.allSettled([darCortesia(env, lojista, "adm"), darCortesia(env, lojista, "adm")]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(env.DB._db.prepare("SELECT COUNT(*) AS n FROM cortesias").get().n, 1);
});

test("conta que paga, testador e administrador não recebem cortesia", async () => {
  const { env, adm, lojista, outro } = await preparo();
  const fim = Date.now() + 10 * DIA;
  env.DB._db.prepare("UPDATE lojas SET ativo_ate = ?, plano = 'fundadores' WHERE id = ?").run(fim, lojista.loja);
  assert.equal((await chamar(env, "POST", `/dev/usuarios/${lojista.id}/cortesia`, { t: adm })).j.codigo, "ja_tem_plano");
  assert.equal((await chamar(env, "DELETE", `/dev/usuarios/${lojista.id}/cortesia`, { t: adm })).s, 404);
  assert.equal((await lojaDe(env, lojista)).ativo_ate, fim);
  env.DB._db.prepare("INSERT INTO testadores (email, criado) VALUES ('outro@x.com', 1)").run();
  assert.equal((await chamar(env, "POST", `/dev/usuarios/${outro.id}/cortesia`, { t: adm })).j.codigo, "ja_e_testador");
  const eu = env.DB._db.prepare("SELECT id FROM usuarios WHERE email = 'vetorialtech.dev@gmail.com'").get();
  assert.equal((await chamar(env, "POST", `/dev/usuarios/${eu.id}/cortesia`, { t: adm })).s, 400);
});

test("cortesia dada por engano pode ser retirada e dada de novo", async () => {
  const { env, adm, lojista } = await preparo();
  const url = `/dev/usuarios/${lojista.id}/cortesia`;
  await chamar(env, "POST", url, { t: adm });
  assert.ok([401, 403].includes((await chamar(env, "DELETE", url, { t: lojista.token })).s));
  assert.equal((await chamar(env, "DELETE", url, { t: adm })).s, 200);
  assert.equal(acessoLiberado(await lojaDe(env, lojista)), false);
  assert.equal((await chamar(env, "POST", url, { t: adm })).s, 200);
});

test("o primeiro pagamento depois da cortesia não pula a verificação em duas etapas", async () => {
  const { env, adm, lojista } = await preparo();
  await chamar(env, "POST", `/dev/usuarios/${lojista.id}/cortesia`, { t: adm });
  env.DB._db.prepare("INSERT INTO pagamentos (id, loja, gateway, valor_centavos, status, criado, atualizado, pacote) VALUES ('avu_1', ?, 'mercadopago', 4990, 'aguardando', 1, 1, 'venus')").run(lojista.loja);
  assert.equal(await confirmarPagamento(env, "avu_1", 4990, "ref-1"), true);
  assert.equal(env.DB._db.prepare("SELECT status FROM pagamentos WHERE id = 'avu_1'").get().status, "pago");
});

test("quem está em cortesia pode apagar a própria conta, e o registro some junto", async () => {
  const { env, adm, lojista } = await preparo();
  await chamar(env, "POST", `/dev/usuarios/${lojista.id}/cortesia`, { t: adm });
  const r = await chamar(env, "POST", "/id/apagar-conta", { t: lojista.token, corpo: { senha: "senha-forte-123", confirmacao: "APAGAR" } });
  assert.equal(r.s, 200, r.tx);
  assert.equal(env.DB._db.prepare("SELECT COUNT(*) AS n FROM cortesias").get().n, 0);
});

test("depois dos 2 meses o site e o catálogo continuam no ar e dá para editar dentro dos limites grátis", async () => {
  const { env, adm, lojista } = await preparo();
  await chamar(env, "POST", `/dev/usuarios/${lojista.id}/cortesia`, { t: adm });
  const cat = (n) => ({ nome: "Loja da Ana", whats: "51999998888", descricao: "Roupas", cor: "#7a1f5c", tema: "claro", produtos: Array.from({ length: n }, (_, i) => ({ nome: `Item ${i}`, preco: 1000 })) });
  const site = { nome: "Loja da Ana", whats: "51999998888", nicho: "moda", tema: "claro", layout: "banner" };
  const c = await chamar(env, "POST", "/catalogo", { t: lojista.token, corpo: cat(12) });
  const s = await chamar(env, "POST", "/sitev", { t: lojista.token, corpo: site });
  assert.ok(c.j?.catalogo?.slug, c.tx); assert.ok(s.s < 300, s.tx);
  env.DB._db.prepare("UPDATE lojas SET ativo_ate = ? WHERE id = ?").run(Date.now() - DIA, lojista.loja);
  assert.equal(await semLimite(env, lojista), false);
  const slugSite = env.DB._db.prepare("SELECT slug FROM sites_vitrine").get().slug;
  for (const caminho of [`/c/${c.j.catalogo.slug}`, `/w/${slugSite}`]) {
    const r = await chamar(env, "GET", caminho);
    assert.equal(r.s, 200, caminho); assert.match(r.tx, /Loja da Ana/);
  }
  assert.equal((await chamar(env, "POST", "/catalogo", { t: lojista.token, corpo: cat(12) })).s, 200);
  assert.equal((await chamar(env, "POST", "/sitev", { t: lojista.token, corpo: site })).s, 200);
  const treze = await chamar(env, "POST", "/catalogo", { t: lojista.token, corpo: cat(13) });
  console.log("# 13 produtos depois do prazo:", treze.s, JSON.stringify(treze.j).slice(0, 200));
});

const avisos = (env) => env.DB._db.prepare("SELECT * FROM dev_alertas WHERE tipo = 'acompanhamento' ORDER BY id").all();

test("o painel mostra quando assinou e avisa na hora de cada mensagem, uma vez só", async () => {
  const { env, adm, lojista, outro } = await preparo();
  const { j } = await chamar(env, "POST", `/dev/usuarios/${lojista.id}/cortesia`, { t: adm });
  const u = await usuariosDoPainel(env, adm);
  const lib = u.usuarios.find((x) => x.id === lojista.id).liberacao;
  assert.equal(u.usuarios.find((x) => x.id === outro.id).liberacao, null);
  assert.equal(lib.fim, j.fim);
  assert.deepEqual(lib.mensagens.map((m) => m.dia), [1, 7, 50]);
  assert.ok(lib.mensagens[2].texto.includes(dataBR(j.fim)));
  assert.equal(await verificarAcompanhamentos(env, lib.inicio), 0); // no dia da venda não há aviso
  let total = 0;
  for (const m of lib.mensagens) {
    assert.equal(await verificarAcompanhamentos(env, m.quando - 60_000), 0);
    total += await verificarAcompanhamentos(env, m.quando);
    assert.equal(await verificarAcompanhamentos(env, m.quando + 600_000), 0);
  }
  assert.equal(total, 3);
  assert.ok(avisos(env).every((a) => a.detalhe.includes("lojista@x.com") && a.detalhe.includes(`assinou em ${dataBR(lib.inicio)}`)));
});

test("horário das mensagens: 9h de Brasília, também quando a venda é tarde da noite", () => {
  const inicio = Date.parse("2026-11-30T23:30:00-03:00");
  const m = mensagensDe(inicio, inicio + 60 * DIA);
  assert.equal(m[0].quando, Date.parse("2026-12-01T09:00:00-03:00"));
  assert.equal(m[1].quando, Date.parse("2026-12-07T09:00:00-03:00"));
  assert.equal(dataBR(inicio), "30/11/2026");
});

test("quem já pagou não recebe a pergunta do dia 50; retirar a cortesia encerra os lembretes", async () => {
  const { env, adm, lojista, outro } = await preparo();
  for (const c of [lojista, outro]) await chamar(env, "POST", `/dev/usuarios/${c.id}/cortesia`, { t: adm });
  const inicio = env.DB._db.prepare("SELECT inicio FROM cortesias WHERE usuario = ?").get(lojista.id).inicio;
  const m = mensagensDe(inicio, inicio + 60 * DIA);
  assert.equal(await verificarAcompanhamentos(env, m[0].quando), 2);
  await chamar(env, "DELETE", `/dev/usuarios/${outro.id}/cortesia`, { t: adm });
  const abertos = avisos(env).filter((a) => a.status !== "resolvido");
  assert.equal(abertos.length, 1);
  assert.ok(abertos[0].detalhe.includes("lojista@x.com"));
  env.DB._db.prepare("INSERT INTO pagamentos (id, loja, gateway, valor_centavos, status, criado, atualizado, pacote) VALUES ('avu_x', ?, 'mercadopago', 4990, 'pago', ?, ?, 'venus')").run(lojista.loja, inicio + DIA, inicio + DIA);
  assert.equal(await verificarAcompanhamentos(env, m[2].quando), 0);
});

test("apagar a conta leva junto os avisos que têm o e-mail", async () => {
  const { env, adm, lojista } = await preparo();
  await chamar(env, "POST", `/dev/usuarios/${lojista.id}/cortesia`, { t: adm });
  const inicio = env.DB._db.prepare("SELECT inicio FROM cortesias").get().inicio;
  await verificarAcompanhamentos(env, mensagensDe(inicio, inicio)[0].quando);
  assert.equal(avisos(env).length, 1);
  const r = await chamar(env, "DELETE", `/dev/usuarios/${lojista.id}`, { t: adm });
  assert.equal(r.s, 200, r.tx);
  assert.equal(avisos(env).length, 0);
});
