import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar, entrar, validarSessao, reativar, encerrarSessao, listarDispositivos, gravarSync, lerSync, renovarToken, TTL_ATIVA_MS, limpezaDeSessoes } from "../src/id/conta.js";
import { verificar } from "../src/id/jwt.js";
import { tratarId } from "../src/id/rotas.js";
import { lojaDoPedido } from "../src/loja/lojas.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ORIGENS_PERMITIDAS: "https://app.exemplo" });
const disp = (n, plataforma = "android") => ({ id: `aparelho-${n}-xxxxxxxx`, nome: `Aparelho ${n}`, plataforma });
const req = (token, url = "https://v.test/id/ping", init = {}) => new Request(url, { method: "POST", ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
const erro = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para falhar"); };
const T0 = 1_800_000_000_000;

async function conta(env) {
  return cadastrar(env, { email: "Toni@Exemplo.com", senha: "senha-forte-1", nome: "Toni", dispositivo: disp(1) }, T0);
}

test("cadastra, cria a loja com teste grátis e devolve um JWT válido", async () => {
  const env = ENV();
  const r = await conta(env);
  const d = await verificar(env, r.token, T0);
  assert.equal(d.sub, r.usuario.id);
  assert.equal(r.usuario.email, "toni@exemplo.com");
  const u = await env.DB.prepare("SELECT loja FROM usuarios").first();
  assert.ok(u.loja);
  assert.equal((await erro(cadastrar(env, { email: "toni@exemplo.com", senha: "outra-senha-1", dispositivo: disp(2) }, T0))).codigo, "email_em_uso");
  assert.equal((await erro(cadastrar(env, { email: "x@y.com", senha: "curta", dispositivo: disp(2) }, T0))).codigo, "senha_curta");
});

test("JWT adulterado ou vencido é recusado; o mesmo token vale como token da loja", async () => {
  const env = ENV();
  const r = await conta(env);
  assert.equal(await verificar(env, r.token + "x", T0), null);
  assert.equal(await verificar(env, r.token, T0 + 31 * 86_400_000), null);
  const loja = await lojaDoPedido(env, req(r.token), T0);
  assert.ok(loja.id);
});

test("senha errada: erro genérico e limite de tentativas", async () => {
  const env = ENV();
  await conta(env);
  for (let i = 0; i < 8; i++) assert.equal((await erro(entrar(env, { email: "toni@exemplo.com", senha: "errada-errada", dispositivo: disp(1) }, T0 + i))).codigo, "credenciais");
  assert.equal((await erro(entrar(env, { email: "toni@exemplo.com", senha: "senha-forte-1", dispositivo: disp(1) }, T0 + 10))).codigo, "muitas_tentativas");
  assert.equal((await erro(entrar(env, { email: "ninguem@exemplo.com", senha: "qualquer-uma-1", dispositivo: disp(1) }, T0))).codigo, "credenciais");
});

test("no máximo 3 aparelhos vinculados: o 4º precisa remover um", async () => {
  const env = ENV();
  await conta(env);
  const login = (n, extra = {}, t = T0 + n) => entrar(env, { email: "toni@exemplo.com", senha: "senha-forte-1", dispositivo: disp(n), ...extra }, t);
  await login(2, {}, T0 + 400_000); // o 1º fica inativo, assim a regra de 2 ativas não atrapalha este teste
  await login(3, {}, T0 + 800_000);
  const e = await erro(login(4, {}, T0 + 1_200_000));
  assert.equal(e.codigo, "limite_dispositivos");
  assert.equal(e.dados.dispositivos.length, 3);
  const ok = await login(4, { remover: e.dados.dispositivos[2].id }, T0 + 1_200_000);
  assert.ok(ok.token);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM dispositivos").first();
  assert.equal(n.n, 3);
});

test("no máximo 2 sessões ativas: o 3º aparelho recebe o aviso e pode encerrar uma", async () => {
  const env = ENV();
  const a = await conta(env);
  const login = (n, extra = {}, t = T0 + 1000) => entrar(env, { email: "toni@exemplo.com", senha: "senha-forte-1", dispositivo: disp(n), ...extra }, t);
  const b = await login(2);
  const e = await erro(login(3));
  assert.equal(e.codigo, "limite_simultaneo");
  assert.deepEqual(e.dados.opcoes, ["encerrar_sessao", "cancelar"]);
  assert.equal(e.dados.ativas.length, 2);
  const c = await login(3, { encerrar: b.sessao });
  assert.ok(c.token);
  // a sessão encerrada remotamente é recusada em qualquer pedido
  assert.equal((await erro(validarSessao(env, req(b.token), { agora: T0 + 2000 }))).codigo, "sessao_encerrada");
  assert.ok(await validarSessao(env, req(a.token), { agora: T0 + 2000 }));
});

test("sessão sem ping por 5 minutos deixa de contar e libera a vaga", async () => {
  const env = ENV();
  const a = await conta(env);
  await entrar(env, { email: "toni@exemplo.com", senha: "senha-forte-1", dispositivo: disp(2) }, T0 + 1000);
  const depois = T0 + TTL_ATIVA_MS + 60_000;
  // o aparelho 2 continua dando ping; o 1 sumiu
  const b = await env.DB.prepare("SELECT id FROM sessoes WHERE dispositivo != (SELECT dispositivo FROM sessoes WHERE id = ?)").bind(a.sessao).first();
  await env.DB.prepare("UPDATE sessoes SET ultimo_ping = ? WHERE id = ?").bind(depois - 1000, b.id).run();
  const c = await entrar(env, { email: "toni@exemplo.com", senha: "senha-forte-1", dispositivo: disp(3) }, depois);
  assert.ok(c.token);
  // o aparelho 1, ao acordar, encontra 2 sessões ativas: recebe o aviso (não volta sozinho)
  const e = await erro(validarSessao(env, req(a.token), { agora: depois + 1000 }));
  assert.equal(e.codigo, "limite_simultaneo");
  // aceitando encerrar o aparelho 3, volta
  await reativar(env, a.token, c.sessao, depois + 2000);
  assert.ok(await validarSessao(env, req(a.token), { agora: depois + 3000 }));
});

test("pedido normal faz o batimento (ping) da sessão", async () => {
  const env = ENV();
  const a = await conta(env);
  await validarSessao(env, req(a.token), { agora: T0 + 60_000 });
  const s = await env.DB.prepare("SELECT ultimo_ping FROM sessoes WHERE id = ?").bind(a.sessao).first();
  assert.equal(s.ultimo_ping, T0 + 60_000);
});

test("sair, renovar e listar dispositivos", async () => {
  const env = ENV();
  const a = await conta(env);
  const ctx = await validarSessao(env, req(a.token), { agora: T0 + 1000 });
  const r = await renovarToken(env, ctx, T0 + 1000);
  assert.ok(await verificar(env, r.token, T0 + 1000));
  const lista = await listarDispositivos(env, ctx, T0 + 1000);
  assert.equal(lista.dispositivos.length, 1);
  assert.ok(lista.dispositivos[0].atual && lista.dispositivos[0].ativo);
  await encerrarSessao(env, ctx.usuario.id, ctx.sessao, "saiu");
  assert.equal((await erro(validarSessao(env, req(a.token), { agora: T0 + 2000 }))).codigo, "sessao_encerrada");
});

test("sincronização: versão, conflito e leitura incremental", async () => {
  const env = ENV();
  const a = await conta(env);
  const ctx = await validarSessao(env, req(a.token), { agora: T0 + 1000 });
  const g = await gravarSync(env, ctx, "tema", { modelo: "cristal" }, 0, T0 + 1000);
  assert.equal(g.versao, 1);
  assert.equal((await erro(gravarSync(env, ctx, "tema", { modelo: "pulso" }, 0, T0 + 2000))).codigo, "versao_antiga");
  assert.equal((await gravarSync(env, ctx, "tema", { modelo: "pulso" }, 1, T0 + 3000)).versao, 2);
  assert.equal((await erro(gravarSync(env, ctx, "senha", "x", 0))).codigo, "chave_invalida");
  const l = await lerSync(env, ctx, T0 + 2500);
  assert.equal(l.docs.length, 1);
  assert.equal(l.docs[0].valor.modelo, "pulso");
});

test("rotas HTTP: login, aviso 409 com opções, tela de login e CORS", async () => {
  const env = ENV();
  const post = (c, corpo, token) => tratarId(new Request(`https://v.test${c}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(corpo) }), env, new URL(`https://v.test${c}`), c);
  const r1 = await post("/id/cadastrar", { email: "a@b.co", senha: "12345678", telefone: "51955554444", dispositivo: disp(1) });
  assert.equal(r1.status, 201);
  const t = (await r1.json()).token;
  await post("/id/entrar", { email: "a@b.co", senha: "12345678", dispositivo: disp(2) });
  const r3 = await post("/id/entrar", { email: "a@b.co", senha: "12345678", dispositivo: disp(3) });
  assert.equal(r3.status, 409);
  const j = await r3.json();
  assert.equal(j.codigo, "limite_simultaneo");
  assert.equal(j.ativas.length, 2);
  const eu = await tratarId(req(t, "https://v.test/id/eu", { method: "GET" }), env, new URL("https://v.test/id/eu"), "/id/eu");
  assert.equal(eu.status, 200);
  const ping = await post("/id/ping", {}, t);
  assert.equal((await ping.json()).ok, true);
  const pg = await tratarId(new Request("https://v.test/id"), env, new URL("https://v.test/id"), "/id");
  assert.match(await pg.text(), /Vetorial ID/);
  assert.match(pg.headers.get("content-security-policy"), /default-src 'none'/);
  const op = await tratarId(new Request("https://v.test/id/entrar", { method: "OPTIONS" }), env, new URL("https://v.test/id/entrar"), "/id/entrar");
  assert.equal(op.status, 204);
  await limpezaDeSessoes(env, T0);
});

test("loja ligada à conta: o token antigo (vl_) deixa de valer, só o login do Vetorial ID", async () => {
  const env = ENV();
  const { registrarLoja } = await import("../src/loja/lojas.js");
  const r = await registrarLoja(env, { nome: "Antiga" }, T0);
  const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(r.id).first();
  const vl = new Request("https://v.test/x", { headers: { authorization: `Bearer ${r.token}` } });
  assert.equal((await lojaDoPedido(env, vl)).id, r.id); // antes de ligar, funciona
  const s = await cadastrar(env, { email: "velho@loja.com", senha: "senha-forte-1", dispositivo: disp(1), lojaExistente: loja }, T0);
  assert.equal((await erro(lojaDoPedido(env, vl))).codigo, "exige_vetorial_id");
  assert.equal((await lojaDoPedido(env, req(s.token))).id, r.id);
  assert.equal((await erro(cadastrar(env, { email: "outro@loja.com", senha: "senha-forte-1", dispositivo: disp(2), lojaExistente: loja }, T0))).codigo, "loja_ja_vinculada");
});

test("perfil: nome e foto editáveis, versão sobe e valida a foto", async () => {
  const env = ENV();
  const a = await conta(env);
  const ctx = await validarSessao(env, req(a.token), { agora: T0 + 1000 });
  const { salvarPerfil, fotoValida } = await import("../src/id/conta.js");
  const p = await salvarPerfil(env, ctx, { nome: "Toni Marques", foto: "https://img.exemplo/t.jpg" }, T0 + 5000);
  assert.deepEqual([p.nome, p.foto, p.atualizado], ["Toni Marques", "https://img.exemplo/t.jpg", T0 + 5000]);
  assert.equal((await erro(salvarPerfil(env, ctx, { foto: "javascript:alert(1)" }))).codigo, "foto_invalida");
  assert.equal(fotoValida("data:image/png;base64,iVBORw0KGgo="), true);
  assert.equal(fotoValida("data:text/html;base64,AAAA"), false);
  assert.equal(fotoValida("http://inseguro.com/a.png"), false);
  // o ping avisa os outros apps de que o perfil mudou
  const r = await tratarId(req(a.token, "https://v.test/id/ping"), env, new URL("https://v.test/id/ping"), "/id/ping");
  assert.equal((await r.json()).perfil, T0 + 5000);
  const c = await tratarId(req(a.token, "https://v.test/id/conta", { method: "GET" }), env, new URL("https://v.test/id/conta"), "/id/conta");
  const j = await c.json();
  assert.equal(j.usuario.nome, "Toni Marques");
  assert.ok("acesso" in j.licenca);
});

test("token de app da suíte: mesma sessão do aparelho, não ocupa outra vaga; sair derruba todos", async () => {
  const env = ENV();
  const a = await conta(env);
  const ctx = await validarSessao(env, req(a.token), { agora: T0 + 1000 });
  const { tokenDeApp } = await import("../src/id/conta.js");
  const t = await tokenDeApp(env, ctx, "vindex", T0 + 1000);
  const d = await verificar(env, t.token, T0 + 1000);
  assert.deepEqual([d.app, d.sid], ["vindex", a.sessao]);
  assert.equal((await erro(tokenDeApp(env, ctx, "malware"))).codigo, "app_invalido");
  const ok = await validarSessao(env, req(t.token), { agora: T0 + 2000 });
  assert.equal(ok.sessao, a.sessao);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessoes").first();
  assert.equal(n.n, 1);
  await encerrarSessao(env, ctx.usuario.id, ctx.sessao, "saiu");
  assert.equal((await erro(validarSessao(env, req(t.token), { agora: T0 + 3000 }))).codigo, "sessao_encerrada");
  const r = await tratarId(new Request("https://v.test/id/sso?app=vindex&voltar=https://vindex.vetorial.tech/"), env, new URL("https://v.test/id/sso"), "/id/sso");
  assert.match(await r.text(), /app-token/);
});

test("o dono (administrador) entra em quantos aparelhos e sessões quiser", async () => {
  const env = ENV();
  env.ADMIN_EMAIL = "dono@exemplo.com";
  await cadastrar(env, { email: "dono@exemplo.com", senha: "senha-forte-1", nome: "Dono", dispositivo: disp(1) }, T0);
  for (let n = 2; n <= 6; n++) await entrar(env, { email: "dono@exemplo.com", senha: "senha-forte-1", dispositivo: disp(n) }, T0 + n);
  const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM dispositivos").all();
  assert.equal(results[0].n, 6);
  // um usuário comum continua com o limite
  await cadastrar(env, { email: "comum@exemplo.com", senha: "senha-forte-1", nome: "C", dispositivo: disp(11) }, T0);
  for (let n = 12; n <= 13; n++) await entrar(env, { email: "comum@exemplo.com", senha: "senha-forte-1", dispositivo: disp(n), encerrar: undefined }, T0 + n).catch(() => {});
  assert.equal((await erro(entrar(env, { email: "comum@exemplo.com", senha: "senha-forte-1", dispositivo: disp(14) }, T0 + 20))).codigo.startsWith("limite"), true);
});

// ---------------------------------------------------------------- trava: selo, telefone, recuperação
import { conferirSelo, chavePublicaDoSelo } from "../src/id/selo.js";
import { telefoneLimpo } from "../src/id/conta.js";
const cadastrarConta = cadastrar, entrarConta = entrar, bd = bancoDeTeste;

const D = (n) => ({ id: `aparelho-${n}-xxxxxxxx`, nome: "Cel", plataforma: "android" });
const mundo2 = () => ({ DB: bd(), CHAVE_COFRE: "chave-de-teste-bem-longa-123" });
const chamarId = async (env, metodo, caminho, corpo, token) => {
  const q = new Request("https://v.test" + caminho, { method: metodo, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const r = await tratarId(q, env, new URL(q.url), new URL(q.url).pathname);
  return { status: r.status, ...(await r.json()) };
};

test("telefone: aceita formatos comuns de celular BR e recusa o resto", () => {
  assert.equal(telefoneLimpo("(51) 99999-9999"), "+5551999999999");
  assert.equal(telefoneLimpo("+55 51 99999-9999"), "+5551999999999");
  assert.equal(telefoneLimpo("5199999"), "");
  assert.equal(telefoneLimpo("5133334444"), ""); // fixo
});

test("cadastro exige celular e devolve selo assinado que só vale com a chave certa", async () => {
  const env = mundo2();
  assert.equal((await chamarId(env, "POST", "/id/cadastrar", { email: "a@b.com", senha: "senha-forte-1", dispositivo: D(1) })).codigo, "telefone_invalido");
  const r = await chamarId(env, "POST", "/id/cadastrar", { email: "a@b.com", senha: "senha-forte-1", telefone: "51999999999", dispositivo: D(1) });
  assert.equal(r.status, 201);
  const c = await conferirSelo(env, r.selo);
  assert.equal(c.ac, true);
  assert.equal(c.teste, true);
  // adulterar o recibo (ex.: estender o fim do teste) invalida a assinatura
  const [p, a] = r.selo.split(".");
  const falso = JSON.parse(Buffer.from(p, "base64url").toString());
  falso.fim += 999999999999;
  assert.equal(await conferirSelo(env, `${Buffer.from(JSON.stringify(falso)).toString("base64url")}.${a}`), null);
  // outro servidor (outro segredo) não assina um selo aceito por este
  assert.notEqual(await chavePublicaDoSelo({ CHAVE_COFRE: "outra-chave-bem-longa-9999" }), await chavePublicaDoSelo(env));
});

test("depois dos 7 dias o selo vem com acesso falso", async () => {
  const env = mundo2();
  const T = Date.now();
  await cadastrarConta(env, { email: "t@b.com", senha: "senha-forte-1", telefone: "51988887777", dispositivo: D(2) }, T - 8 * 86_400_000);
  const e = await entrarConta(env, { email: "t@b.com", senha: "senha-forte-1", dispositivo: D(2) }, T);
  const l = await chamarId(env, "GET", "/id/licenca", null, e.token);
  assert.equal(l.acesso, false);
  assert.equal((await conferirSelo(env, l.selo)).ac, false);
});

test("o mesmo celular em outra conta não ganha outro teste grátis", async () => {
  const env = mundo2();
  await chamarId(env, "POST", "/id/cadastrar", { email: "um@b.com", senha: "senha-forte-1", telefone: "51977776666", dispositivo: D(3) });
  const r = await chamarId(env, "POST", "/id/cadastrar", { email: "dois@b.com", senha: "senha-forte-1", telefone: "(51) 97777-6666", dispositivo: D(4) });
  assert.equal(r.licenca.acesso, false);
});

test("recuperação: código por e-mail/SMS, 5 tentativas, troca a senha e derruba as sessões", async () => {
  const env = mundo2();
  const enviados = [];
  env.RESEND_API_KEY = "re_x"; env.TWILIO_SID = "AC"; env.TWILIO_TOKEN = "t"; env.TWILIO_DE = "+15550000";
  env.fetchEnvio = async (u, o) => { enviados.push({ u: String(u), corpo: String(o.body) }); return new Response("{}"); };
  const c = await chamarId(env, "POST", "/id/cadastrar", { email: "r@b.com", senha: "senha-forte-1", telefone: "51966665555", dispositivo: D(5) });
  // conta que não existe recebe a mesma resposta e nada é enviado
  assert.equal((await chamarId(env, "POST", "/id/recuperar/pedir", { email: "naoexiste@b.com", canal: "email" })).ok, true);
  assert.equal(enviados.length, 0);
  assert.equal((await chamarId(env, "POST", "/id/recuperar/pedir", { email: "r@b.com", canal: "sms" })).ok, true);
  assert.match(enviados[0].u, /twilio/);
  assert.match(decodeURIComponent(enviados[0].corpo), /To=\+5551966665555/);
  const codigo = /código do Vetorial ID: (\d{6})/.exec(decodeURIComponent(enviados[0].corpo).replace(/\+/g, " "))[1];
  assert.equal((await chamarId(env, "POST", "/id/recuperar/confirmar", { email: "r@b.com", codigo: "000000", novaSenha: "nova-senha-9" })).codigo, "codigo_invalido");
  assert.equal((await chamarId(env, "POST", "/id/recuperar/confirmar", { email: "r@b.com", codigo, novaSenha: "curta" })).codigo, "senha_curta");
  assert.equal((await chamarId(env, "POST", "/id/recuperar/confirmar", { email: "r@b.com", codigo, novaSenha: "nova-senha-9" })).ok, true);
  assert.equal((await chamarId(env, "GET", "/id/eu", null, c.token)).status, 401); // sessão antiga caiu
  assert.equal((await chamarId(env, "POST", "/id/entrar", { email: "r@b.com", senha: "senha-forte-1", dispositivo: D(5) })).codigo, "credenciais");
  assert.ok((await chamarId(env, "POST", "/id/entrar", { email: "r@b.com", senha: "nova-senha-9", dispositivo: D(5) })).token);
  // o código só vale uma vez
  assert.equal((await chamarId(env, "POST", "/id/recuperar/confirmar", { email: "r@b.com", codigo, novaSenha: "outra-senha-9" })).codigo, "codigo_invalido");
});

test("recuperação sem provedor configurado avisa em vez de fingir", async () => {
  const env = mundo2();
  assert.equal((await chamarId(env, "POST", "/id/recuperar/pedir", { email: "x@b.com", canal: "sms" })).codigo, "canal_indisponivel");
});

test("trava no servidor: com o teste vencido, sincronização e IA respondem 402; o login e a licença continuam", async () => {
  const env = mundo2();
  const T = Date.now();
  await cadastrarConta(env, { email: "v@b.com", senha: "senha-forte-1", telefone: "51944443333", dispositivo: D(9) }, T - 9 * 86_400_000);
  const e = await entrarConta(env, { email: "v@b.com", senha: "senha-forte-1", dispositivo: D(9) }, T);
  assert.equal((await chamarId(env, "GET", "/id/sync", null, e.token)).status, 402);
  assert.equal((await chamarId(env, "PUT", "/id/sync/tema", { valor: {}, versao: 0 }, e.token)).codigo, "teste_acabou");
  assert.equal((await chamarId(env, "GET", "/id/licenca", null, e.token)).acesso, false);
  const { tratarProxyIA } = await import("../src/ia/proxy.js");
  const q = new Request("https://v.test/ia/v1/models", { headers: { authorization: `Bearer ${e.token}` } });
  assert.equal((await tratarProxyIA(q, env, {}, "/ia/v1/models")).status, 402);
});

test("teste grátis: fora da janela promocional, ou a 3ª conta da mesma rede, ou o mesmo aparelho já nascem pedindo pagamento", async () => {
  const env = mundo2();
  const T = Date.now();
  const cad = (n, extra = {}, ip = "200.1.1.1") => cadastrar(env, { email: `c${n}@b.com`, senha: "senha-forte-1", telefone: `5198000${String(n).padStart(4, "0")}`, dispositivo: D(100 + n), ip, ...extra }, T);
  const acesso = async (n) => (await chamarId(env, "GET", "/id/licenca", null, (await entrarConta(env, { email: `c${n}@b.com`, senha: "senha-forte-1", dispositivo: D(100 + n) }, T)).token)).acesso;
  await cad(1); await cad(2);
  assert.equal(await acesso(1), true);
  assert.equal(await acesso(2), true);
  await cad(3); // 3ª da mesma rede
  assert.equal(await acesso(3), false);
  await cad(4, {}, "200.9.9.9"); // outra rede
  assert.equal(await acesso(4), true);
  // fora da janela
  env.TESTE_GRATIS_ATE = String(T - 1000);
  await cad(5, {}, "200.7.7.7");
  assert.equal(await acesso(5), false);
  // IP vazio (sem cabeçalho) não derruba o teste de quem tem janela aberta
  env.TESTE_GRATIS_ATE = String(T + 86_400_000);
  await cad(6, {}, "");
  assert.equal(await acesso(6), true);
});

test("limites por aplicativo: Vênus, Vindex e Vortex contam separados; o Velox não tem limite", async () => {
  const env = ENV();
  await conta(env);
  // cada login acontece 10 minutos depois do anterior, para não bater no limite de uso simultâneo
  const logar = (n, app) => entrar(env, { email: "toni@exemplo.com", senha: "senha-forte-1", dispositivo: disp(n), app }, T0 + n * 600_000);
  for (const n of [11, 12, 13]) await logar(n, "vindex"); // 3 aparelhos no Vindex não ocupam vaga da Vênus (que já tem o aparelho 1)
  assert.equal((await erro(logar(14, "vindex"))).codigo, "limite_dispositivos");
  await logar(2, "venus");
  await logar(3, "venus");
  assert.equal((await erro(logar(4, "venus"))).codigo, "limite_dispositivos");
  await logar(21, "vortex"); // o Vortex tem a sua própria lista
  for (const n of [31, 32, 33, 34, 35]) await logar(n, "velox"); // Velox: sem limite nenhum
  assert.equal((await erro(logar(1, "windows-xyz"))).codigo, "app_invalido");
});

test("limite de uso simultâneo vale por aplicativo", async () => {
  const env = ENV();
  await conta(env);
  const logar = (n, app, extra = {}) => entrar(env, { email: "toni@exemplo.com", senha: "senha-forte-1", dispositivo: disp(n), app, ...extra }, T0 + 10);
  await logar(1, "venus"); // já existia (cadastro) — reentra no mesmo aparelho
  await logar(2, "venus");
  assert.equal((await erro(logar(3, "venus"))).codigo, "limite_simultaneo");
  // Vindex tem as suas 2 vagas livres, apesar de a Vênus estar cheia
  await logar(3, "vindex");
  await logar(4, "vindex");
  assert.equal((await erro(logar(5, "vindex"))).codigo, "limite_simultaneo");
});

test("sync aceita as chaves do Velox com hífen (tema e senhas)", async () => {
  const { CHAVES_SYNC } = await import("../src/id/conta.js");
  assert.ok(CHAVES_SYNC.has("velox-tema") && CHAVES_SYNC.has("velox-senhas"));
  assert.match("/id/sync/velox-senhas", /^\/id\/sync\/([a-z-]{3,20})$/);
});
