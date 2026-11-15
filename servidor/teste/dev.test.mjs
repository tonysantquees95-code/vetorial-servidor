import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { entrarAdmin, criarAdmin, exigirAdmin, ehAdmin } from "../src/dev/admin.js";
import { tratarDev, progressoDasFases } from "../src/dev/rotas.js";
import { tratarId } from "../src/id/rotas.js";
import { normalizarRota, registrarTrafego, listarTrafego, registrarUso, tokensDoUso, bi, ultimosDias, diaBR, provedoresDesligados, esquecerProvedores, percentil } from "../src/dev/uso.js";
import { estimarPelaArvore, estadoGeral, apksDoProjeto, PROJETOS } from "../src/dev/github.js";
import { limparTelemetria } from "../src/dev/rotas.js";

process.removeAllListeners("warning");
const ADM = "vetorialtech.dev@gmail.com";
const ENV = (extra = {}) => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", DEV_CONVITE: "convite-secreto-1", ...extra });
const disp = (n) => ({ id: `aparelho-${n}-xxxxxxxx`, nome: `Aparelho ${n}`, plataforma: "android" });
const erro = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para falhar"); };
const rq = (token, caminho, metodo = "GET", corpo) => new Request(`https://v.test${caminho}`, { method: metodo, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
async function chamar(env, token, caminho, metodo = "GET", corpo) {
  const r = rq(token, caminho, metodo, corpo);
  const resp = await tratarDev(r, env, new URL(r.url), new URL(r.url).pathname);
  return { status: resp.status, d: await resp.json() };
}
async function admin(env) {
  return criarAdmin(env, { senha: "senha-admin-1", convite: env.DEV_CONVITE, dispositivo: disp(1) });
}

test("primeiro acesso exige o convite e só cria a conta do e-mail administrativo", async () => {
  const env = ENV();
  assert.equal((await erro(criarAdmin(env, { senha: "senha-admin-1", convite: "errado", dispositivo: disp(1) }))).codigo, "convite_invalido");
  assert.equal((await erro(criarAdmin({ ...env, DEV_CONVITE: "" }, { senha: "senha-admin-1", convite: "", dispositivo: disp(1) }))).codigo, "sem_convite");
  const r = await admin(env);
  assert.equal(r.usuario.email, ADM);
  assert.equal(r.papel, "superadmin");
  assert.equal((await erro(admin(env))).codigo, "email_em_uso"); // só uma vez
});

test("o cadastro público do Vetorial ID não pode tomar o e-mail do administrador", async () => {
  const env = ENV();
  const r = new Request("https://v.test/id/cadastrar", { method: "POST", body: JSON.stringify({ email: "VetorialTech.Dev@gmail.com", senha: "senha-forte-1", dispositivo: disp(2) }) });
  const resp = await tratarId(r, env, new URL(r.url), "/id/cadastrar");
  assert.equal(resp.status, 403);
  assert.equal((await resp.json()).codigo, "email_reservado");
});

test("login do painel: outro e-mail é barrado mesmo com senha certa", async () => {
  const env = ENV();
  await admin(env);
  await cadastrar(env, { email: "lojista@x.com", senha: "senha-forte-1", dispositivo: disp(3) });
  assert.equal((await erro(entrarAdmin(env, { email: "lojista@x.com", senha: "senha-forte-1", dispositivo: disp(3) }))).codigo, "nao_admin");
  assert.equal((await erro(entrarAdmin(env, { email: ADM, senha: "errada-errada", dispositivo: disp(1) }))).codigo, "credenciais");
  const ok = await entrarAdmin(env, { email: ADM, senha: "senha-admin-1", dispositivo: disp(1) });
  assert.equal(ok.papel, "superadmin");
  assert.ok(ok.expira > Date.now());
});

test("rotas /dev exigem o token de superadmin; token de lojista (mesmo válido) é recusado", async () => {
  const env = ENV();
  const a = await admin(env);
  const l = await cadastrar(env, { email: "lojista@x.com", senha: "senha-forte-1", dispositivo: disp(3) });
  assert.equal((await chamar(env, "", "/dev/painel")).status, 401);
  assert.equal((await chamar(env, l.token, "/dev/painel")).status, 401);
  assert.equal((await chamar(env, a.token, "/dev/eu")).d.papel, "superadmin");
  assert.equal((await chamar(env, a.token + "x", "/dev/eu")).status, 401);
  // encerrar a sessão derruba o token na hora
  assert.equal((await chamar(env, a.token, "/dev/sair", "POST")).status, 200);
  assert.equal((await chamar(env, a.token, "/dev/eu")).status, 401);
  assert.ok(ehAdmin(env, "  VETORIALTECH.DEV@gmail.com "));
});

test("painel: projetos, fases e progresso (Vortex já vem ligado ao repositório dele)", async () => {
  const env = ENV();
  const a = await admin(env);
  const { d } = await chamar(env, a.token, "/dev/painel");
  assert.deepEqual(d.projetos.map((p) => p.id), ["venus", "devcenter", "vindex", "vortex", "velox", "drive", "voxix"]);
  const venus = d.projetos[0];
  assert.ok(venus.fases.length >= 8);
  assert.equal(venus.conectado, false); // sem GITHUB_TOKEN no teste
  assert.equal(d.projetos[2].repo, "tonysantquees95-code/Vindex-");
  assert.equal(d.projetos[3].repo, "tonysantquees95-code/Vortex");
  const nova = await chamar(env, a.token, "/dev/fases", "POST", { projeto: "vindex", titulo: "Telemetria de hardware", progresso: 40 });
  assert.equal(nova.status, 201);
  assert.equal(nova.d.status, "em_andamento");
  const up = await chamar(env, a.token, `/dev/fases/${nova.d.id}`, "PUT", { progresso: 100 });
  assert.equal(up.d.status, "concluida");
  assert.equal((await chamar(env, a.token, "/dev/fases", "POST", { projeto: "nada", titulo: "x" })).status, 400);
  assert.equal((await chamar(env, a.token, `/dev/fases/${nova.d.id}`, "PUT", { progresso: 150 })).status, 400);
  assert.equal(progressoDasFases([{ progresso: 100 }, { progresso: 50 }]), 75);
  assert.equal(progressoDasFases([]), 100); // sem etapas cadastradas não mostra 0%: as etapas entram conforme ficam prontas
  assert.equal((await chamar(env, a.token, `/dev/fases/${nova.d.id}`, "DELETE")).d.ok, true);
});

test("repositório de projeto: aceita dono/repo e URL, recusa lixo", async () => {
  const env = ENV();
  const a = await admin(env);
  const ok = await chamar(env, a.token, "/dev/config", "PUT", { chave: "repo:vortex", valor: "https://github.com/tonysantquees95-code/Vortex.git" });
  assert.equal(ok.d.valor, "tonysantquees95-code/Vortex");
  assert.equal((await chamar(env, a.token, "/dev/config", "PUT", { chave: "repo:vortex", valor: "../../etc" })).status, 400);
  assert.equal((await chamar(env, a.token, "/dev/config", "PUT", { chave: "repo:venus", valor: "x/y" })).status, 400);
  assert.equal((await chamar(env, a.token, "/dev/painel")).d.projetos[3].repo, "tonysantquees95-code/Vortex");
});

test("tráfego: normaliza rotas, ignora /dev e /saude e calcula o resumo", async () => {
  assert.equal(normalizarRota("/loja/produtos/12345"), "/loja/produtos/:n");
  assert.equal(normalizarRota("/oauth/abcdef0123456789"), "/oauth/:id");
  const env = ENV();
  const T = 1_800_000_000_000;
  await registrarTrafego(env, { metodo: "GET", caminho: "/dev/painel", status: 200, ms: 5 }, T);
  await registrarTrafego(env, { metodo: "GET", caminho: "/saude", status: 200, ms: 5 }, T);
  for (const [s, ms] of [[200, 30], [200, 50], [404, 10], [500, 400]]) await registrarTrafego(env, { metodo: "POST", caminho: "/v1/chat", status: s, ms, origem: "https://localhost" }, T + 1000);
  const r = await listarTrafego(env, {}, T + 2000);
  assert.equal(r.itens.length, 4);
  assert.equal(r.ultimos5min.erros, 1);
  assert.equal(r.ultimos5min.recusados, 1);
  assert.equal(r.itens[0].origem, "localhost");
  const so = await listarTrafego(env, { desde: r.itens[1].id }, T + 2000);
  assert.equal(so.itens.length, 1);
  assert.equal(percentil([10, 20, 30, 40], 50), 20);
});

test("uso das IAs: soma por hora, tokens do Groq e do Gemini, e séries do BI", async () => {
  assert.deepEqual(tokensDoUso({ prompt_tokens: 10, completion_tokens: 5 }), { entrada: 10, saida: 5 });
  assert.deepEqual(tokensDoUso({ promptTokenCount: 7, candidatesTokenCount: 3 }), { entrada: 7, saida: 3 });
  assert.deepEqual(tokensDoUso(null), { entrada: 0, saida: 0 });
  const env = ENV();
  const T = Date.UTC(2027, 0, 15, 15, 0, 0);
  await registrarUso(env, { provedor: "groq", tarefa: "conversa", uso: { prompt_tokens: 100, completion_tokens: 50 } }, T);
  await registrarUso(env, { provedor: "groq", tarefa: "conversa", uso: { prompt_tokens: 10, completion_tokens: 5 } }, T + 60_000);
  await registrarUso(env, { provedor: "deepseek", tarefa: "bi", erro: true }, T);
  await registrarUso(env, { provedor: "groq", tarefa: "conversa", cache: true }, T);
  await env.DB.prepare("INSERT INTO lojas (id, token_hash, nome, criado, trial_fim, plano, ativo_ate) VALUES ('l1', 'h1', 'A', ?, ?, 'fundadores', ?)").bind(T - 3600_000, T + 86400_000, T + 5 * 86400_000).run();
  await env.DB.prepare("INSERT INTO usuarios (id, email, nome, senha_hash, salt, loja, criado) VALUES ('u1', 'a@teste.com', 'A', 'x', 'y', 'l1', ?)").bind(T - 3600_000).run();
  await env.DB.prepare("INSERT INTO pagamentos (id, loja, gateway, valor_centavos, status, criado, atualizado) VALUES ('p1', 'l1', 'infinitepay', 4990, 'liberado', ?, ?)").bind(T, T).run();
  await env.DB.prepare("INSERT INTO pagamentos (id, loja, gateway, valor_centavos, status, criado, atualizado) VALUES ('p2', 'l1', 'infinitepay', 4990, 'aguardando', ?, ?)").bind(T, T).run();
  const r = await bi(env, 7, T + 3600_000);
  assert.equal(r.dias.length, 7);
  assert.equal(r.dias[6], "2027-01-15");
  assert.equal(r.requisicoesIA.groq[6], 2);
  assert.equal(r.tokensIA.groq[6], 165);
  assert.equal(r.errosIA.deepseek[6], 1);
  assert.equal(r.faturamentoCentavos[6], 4990); // 'aguardando' não conta
  assert.equal(r.novosLojistas[6], 1);
  assert.equal(r.totais.pagantes, 1);
  assert.equal(r.totais.respostasDoCache, 1);
  assert.equal(r.totais.requisicoesIA, 2);
  assert.equal(diaBR(Date.UTC(2027, 0, 15, 2, 0, 0)), "2027-01-14"); // 23h de Brasília
  assert.equal(ultimosDias(3, T).length, 3);
});

test("provedores desligados pelo painel saem da fila de IA", async () => {
  const env = ENV();
  esquecerProvedores();
  const a = await admin(env);
  assert.equal((await provedoresDesligados(env, 1)).size, 0);
  await chamar(env, a.token, "/dev/config", "PUT", { chave: "provedor:groq", valor: false });
  assert.ok((await provedoresDesligados(env, Date.now() + 1)).has("groq"));
  const cfg = await chamar(env, a.token, "/dev/config");
  assert.equal(cfg.d.provedores.groq.ligado, false);
  const f = await chamar(env, a.token, "/dev/ferramentas");
  assert.equal(f.d.automacoes.find((x) => x.id === "conversa").emUso, "deepseek"); // a reserva assume
  assert.equal(f.d.automacoes.find((x) => x.id === "multimodal").executor, "gemini");
  esquecerProvedores();
});

test("dispositivos de todas as contas e encerramento remoto de sessão", async () => {
  const env = ENV();
  const a = await admin(env);
  const l = await cadastrar(env, { email: "lojista@x.com", senha: "senha-forte-1", dispositivo: disp(3) });
  const d = await chamar(env, a.token, "/dev/dispositivos");
  assert.equal(d.d.maxAtivas, 2);
  const conta = d.d.contas.find((c) => c.email === "lojista@x.com");
  assert.equal(conta.ativas, 1);
  assert.equal((await chamar(env, a.token, `/dev/sessoes/${l.sessao}/encerrar`, "POST")).d.ok, true);
  assert.equal((await chamar(env, a.token, "/dev/dispositivos")).d.contas.find((c) => c.email === "lojista@x.com").ativas, 0);
  assert.equal((await chamar(env, a.token, `/dev/sessoes/${a.sessao}/encerrar`, "POST")).status, 400);
});

test("telemetria do Vindex: só o app certo envia e os campos são limpos", async () => {
  const lixo = limparTelemetria({ bateria: { nivel: 250, carregando: 1, temperatura: "abc" }, hardware: { modelo: "x".repeat(200), ramMb: -5, extra: "descartado" } });
  assert.equal(lixo.bateria.nivel, 100);
  assert.equal(lixo.bateria.temperatura, null);
  assert.equal(lixo.hardware.modelo.length, 60);
  assert.equal(lixo.hardware.ramMb, 0);
  assert.equal("extra" in lixo.hardware, false);
  const env = ENV();
  const a = await admin(env);
  const l = await cadastrar(env, { email: "lojista@x.com", senha: "senha-forte-1", dispositivo: disp(3) });
  assert.equal((await chamar(env, l.token, "/dev/telemetria", "POST", { bateria: { nivel: 50 } })).status, 403);
  assert.equal((await chamar(env, a.token, "/dev/telemetria", "POST", { bateria: { nivel: 50, carregando: true } })).d.origem, "dev");
  const { d } = await chamar(env, a.token, "/dev/telemetria");
  assert.equal(d.itens[0].bateria.nivel, 50);
});

test("cache: sem KV avisa; estatística do cache vem do uso das IAs", async () => {
  const env = ENV();
  const a = await admin(env);
  assert.equal((await chamar(env, a.token, "/dev/cache", "DELETE")).status, 400);
  assert.equal((await chamar(env, a.token, "/dev/cache")).d.exato, false);
  const apagadas = [];
  const comKv = { ...env, CACHE: { list: async () => ({ keys: [{ name: "e:1" }, { name: "e:2" }], list_complete: false }), delete: async (k) => apagadas.push(k) } };
  const r = await chamar(comKv, a.token, "/dev/cache", "DELETE");
  assert.deepEqual(r.d, { apagadas: 2, restam: true });
  assert.deepEqual(apagadas, ["e:1", "e:2"]);
});

test("GitHub: estimativa pela árvore, estado geral dos builds e APK mais novo por projeto", () => {
  const e = estimarPelaArvore([
    { type: "blob", path: "app/Main.kt", size: 3400 },
    { type: "blob", path: "node_modules/x/index.js", size: 99999 },
    { type: "blob", path: "package-lock.json", size: 99999 },
    { type: "blob", path: "logo.png", size: 9999 },
    { type: "tree", path: "app" },
  ]);
  assert.equal(e.arquivos, 1);
  assert.equal(e.linhas, 100);
  assert.equal(e.fonte, "estimado");
  assert.equal(estadoGeral([]), "desconhecido");
  assert.equal(estadoGeral([{ estado: "completed", resultado: "success" }]), "ok");
  assert.equal(estadoGeral([{ estado: "completed", resultado: "success" }, { estado: "in_progress", resultado: null }]), "rodando");
  assert.equal(estadoGeral([{ estado: "in_progress" }, { estado: "completed", resultado: "failure" }]), "falhou");
  assert.equal(estadoGeral([{ estado: "completed", resultado: "success" }, { estado: "completed", resultado: "failure", manual: true }]), "ok", "ferramenta manual que falhou não derruba o projeto");
  assert.equal(estadoGeral([{ estado: "completed", resultado: "failure", manual: false }]), "falhou");
  const lista = [
    { tag_name: "v1.190", html_url: "u1", published_at: "2026-11-11T00:00:00Z", assets: [{ id: 1, name: "Venus.apk", size: 10 }] },
    { tag_name: "v1.191", html_url: "u2", published_at: "2026-11-12T00:00:00Z", assets: [{ id: 2, name: "Venus.apk", size: 11 }] },
    { tag_name: "win-1.5", html_url: "u3", assets: [{ id: 3, name: "Venus Setup.exe", size: 5 }] },
    { tag_name: "mac-1.3", html_url: "u6", assets: [{ id: 6, name: "Venus-Mac-1.3.0-universal.dmg", size: 9 }] },
    { tag_name: "dev-1.2", html_url: "u4", assets: [{ id: 4, name: "VenusDev.apk", size: 7 }] },
    { tag_name: "metricas", assets: [{ id: 5, name: "metricas.json" }] },
  ];
  const apks = apksDoProjeto(PROJETOS[0], lista);
  assert.equal(apks.find((x) => x.app === "venus").versao.numero, 191);
  assert.equal(apks.find((x) => x.app === "windows").versao.numero, 5);
  assert.equal(apks.find((x) => x.app === "mac").versao.numero, 3);
  assert.equal(apks.some((x) => x.app === "robo"), false);
  const dev = apksDoProjeto(PROJETOS.find((p) => p.id === "devcenter"), lista);
  assert.equal(dev.find((x) => x.app === "dev").versao.tag, "dev-1.2");
});

import { ehAtalho, responderAtalho, PAINEL_DEV } from "../src/atalhos.js";
test("atalhos curtos: /venus, /venus/android, /venus/windows e /paineldev", async () => {
  assert.equal(ehAtalho("/Venus"), true);
  assert.equal(ehAtalho("/venus/ios"), false);
  const u = new URL("https://v.test/x");
  assert.equal(responderAtalho(u, "/paineldev").headers.get("location"), PAINEL_DEV);
  assert.equal(responderAtalho(u, "/venus/windows").headers.get("location"), "https://v.test/atualizacao?app=windows&baixar=1");
  assert.equal(responderAtalho(u, "/venus/android").headers.get("location"), "https://v.test/atualizacao?app=venus&baixar=1");
  assert.match(await responderAtalho(u, "/venus").text(), /Baixar para Windows/);
  assert.equal(ehAtalho("/venus/mac"), true);
  assert.equal(ehAtalho("/vindex/mac"), false);
  assert.equal(responderAtalho(u, "/venus/mac").headers.get("location"), "https://v.test/atualizacao?app=mac&baixar=1");
  assert.match(await responderAtalho(u, "/venus").text(), /Baixar para Mac/);
  assert.doesNotMatch(await responderAtalho(u, "/vindex").text(), /Mac/);
});

test("atalho /venus/web leva à Vênus web (iPhone)", () => {
  const u = new URL("https://v.test/venus/web");
  assert.ok(ehAtalho("/venus/web"));
  assert.equal(responderAtalho(u, "/venus/web").headers.get("location"), "https://v.test/app/");
  assert.ok(!ehAtalho("/vindex/web") === false); // regex comum aos dois prefixos
});

test("atalhos do Vindex e projeto Vindex ligado ao repositório", async () => {
  const u = new URL("https://v.test/x");
  assert.equal(ehAtalho("/vindex/windows"), true);
  assert.equal(responderAtalho(u, "/vindex/android").headers.get("location"), "https://github.com/tonysantquees95-code/Vindex-/releases/latest/download/Vindex.apk");
  assert.match(await responderAtalho(u, "/vindex").text(), /<h1>Vindex<\/h1>[\s\S]*\/vindex\/windows/);
  assert.equal(ehAtalho("/vortex/android") && ehAtalho("/vortex"), true);
  assert.equal(ehAtalho("/vortex/pedidos") || ehAtalho("/vortex/fila"), false);
  assert.equal(responderAtalho(u, "/vortex/android").headers.get("location"), "https://github.com/tonysantquees95-code/Vortex/releases/latest/download/Vortex.apk");
  assert.equal(responderAtalho(u, "/vortex/windows").headers.get("location"), "https://github.com/tonysantquees95-code/Vortex/releases/latest/download/VortexSetup.exe");
  assert.match(await responderAtalho(u, "/vortex").text(), /VORTEX[\s\S]*\/vortex\/windows/);
  const p = PROJETOS.find((x) => x.id === "vindex");
  assert.equal(p.repo, "tonysantquees95-code/Vindex-");
  const apks = apksDoProjeto(p, [{ tag_name: "1.7", html_url: "u", assets: [{ id: 1, name: "Vindex.apk", size: 1 }, { id: 2, name: "VindexSetup.exe", size: 2 }] }]);
  assert.equal(apks.find((a) => a.app === "vindex-windows").versao.numero, 7);
});

test("cofre de chaves: senha forte, valores nunca voltam, trava por tentativas e só o admin entra", async () => {
  const env = ENV();
  const adm = await admin(env);
  const outro = await cadastrar(env, { email: "lojista@x.com", senha: "senha-forte-1", dispositivo: disp(3) });
  const SENHA = "CofreSeguro2026Vindex";

  // quem não é admin não passa
  assert.equal((await chamar(env, outro.token, "/dev/cofre/estado")).status, 401);
  assert.equal((await chamar(env, adm.token, "/dev/cofre/estado")).d.configurado, false);

  // senha fraca é recusada; forte é aceita uma vez só
  assert.equal((await chamar(env, adm.token, "/dev/cofre/iniciar", "POST", { senha: "curta1" })).d.codigo, "senha_fraca");
  assert.equal((await chamar(env, adm.token, "/dev/cofre/iniciar", "POST", { senha: "somenteletrasaqui" })).d.codigo, "senha_fraca");
  assert.equal((await chamar(env, adm.token, "/dev/cofre/iniciar", "POST", { senha: SENHA })).status, 201);
  assert.equal((await chamar(env, adm.token, "/dev/cofre/iniciar", "POST", { senha: SENHA })).d.codigo, "cofre_existe");
  assert.equal(env.DB._db.prepare("SELECT hash FROM cofre_acesso").get().hash.includes(SENHA), false);

  // guardar e listar: o valor nunca aparece
  const CHAVE = "gsk_ABCDEFGHIJKLMNOP12345678";
  assert.equal((await chamar(env, adm.token, "/dev/cofre/guardar", "POST", { senha: SENHA, nome: "groq_api_key", valor: CHAVE })).d.previa, "••••5678");
  assert.equal((await chamar(env, adm.token, "/dev/cofre/guardar", "POST", { senha: SENHA, nome: "x", valor: CHAVE })).d.codigo, "nome_invalido");
  assert.equal((await chamar(env, adm.token, "/dev/cofre/guardar", "POST", { senha: SENHA, nome: "ABC_KEY", valor: "com espaço dentro" })).d.codigo, "valor_invalido");
  const lista = await chamar(env, adm.token, "/dev/cofre/listar", "POST", { senha: SENHA });
  assert.equal(lista.status, 200);
  assert.equal(JSON.stringify(lista.d).includes(CHAVE), false);
  const g = lista.d.chaves.find((c) => c.nome === "GROQ_API_KEY");
  assert.deepEqual([g.noCofre, g.previa], [true, "••••5678"]);
  assert.equal(lista.d.chaves.find((c) => c.nome === "GEMINI_API_KEY").noCofre, false);
  assert.equal(env.DB._db.prepare("SELECT valor FROM cofre_chaves").get().valor.includes(CHAVE), false); // cifrado

  // o caminho de leitura do servidor devolve a chave do cofre, ou a do ambiente
  const { lerSegredo } = await import("../src/dev/cofre.js");
  assert.equal(await lerSegredo(env, "GROQ_API_KEY"), CHAVE);
  assert.equal(await lerSegredo({ ...env, GEMINI_API_KEY: "do-ambiente-123" }, "GEMINI_API_KEY"), "do-ambiente-123");

  // as rotas de IA recebem as chaves do cofre no `env` (o cofre vale mais que o ambiente; sem cofre, fica o ambiente)
  const { comChavesDoCofre, esquecerChavesGuardadas } = await import("../src/dev/cofre.js");
  esquecerChavesGuardadas();
  const comCofre = await comChavesDoCofre({ ...env, GROQ_API_KEY: "do-ambiente", TAVILY_API_KEY: "tav-ambiente" });
  assert.equal(comCofre.GROQ_API_KEY, CHAVE);
  assert.equal(comCofre.TAVILY_API_KEY, "tav-ambiente");
  assert.equal(comCofre.DB, env.DB);
  assert.equal((await comChavesDoCofre({ GROQ_API_KEY: "so-ambiente" })).GROQ_API_KEY, "so-ambiente"); // sem banco

  // trocar a chave e apagar
  await chamar(env, adm.token, "/dev/cofre/guardar", "POST", { senha: SENHA, nome: "GROQ_API_KEY", valor: "gsk_NOVA_CHAVE_9999" });
  assert.equal(await lerSegredo(env, "GROQ_API_KEY"), "gsk_NOVA_CHAVE_9999");
  assert.equal((await chamar(env, adm.token, "/dev/cofre/apagar", "POST", { senha: SENHA, nome: "GROQ_API_KEY" })).d.ok, true);

  // senha errada: avisa quantas faltam e depois tranca, até com a senha certa
  for (let i = 0; i < 4; i++) assert.equal((await chamar(env, adm.token, "/dev/cofre/listar", "POST", { senha: "Errada123456789" })).d.codigo, "cofre_senha");
  const quinta = await chamar(env, adm.token, "/dev/cofre/listar", "POST", { senha: "Errada123456789" });
  assert.equal(quinta.status, 403);
  const trancado = await chamar(env, adm.token, "/dev/cofre/listar", "POST", { senha: SENHA });
  assert.equal(trancado.status, 429);
  assert.equal(trancado.d.codigo, "cofre_bloqueado");
  assert.ok((await chamar(env, adm.token, "/dev/cofre/estado")).d.bloqueadoAte > Date.now());
  // depois do prazo, a senha certa volta a abrir
  env.DB._db.prepare("UPDATE cofre_acesso SET bloqueado_ate = 1").run();
  assert.equal((await chamar(env, adm.token, "/dev/cofre/listar", "POST", { senha: SENHA })).status, 200);

  // trocar a senha
  assert.equal((await chamar(env, adm.token, "/dev/cofre/trocar-senha", "POST", { senha: SENHA, nova: "fraca" })).d.codigo, "senha_fraca");
  assert.equal((await chamar(env, adm.token, "/dev/cofre/trocar-senha", "POST", { senha: SENHA, nova: "NovaSenhaDoCofre77" })).d.ok, true);
  assert.equal((await chamar(env, adm.token, "/dev/cofre/listar", "POST", { senha: SENHA })).d.codigo, "cofre_senha");
  assert.equal((await chamar(env, adm.token, "/dev/cofre/listar", "POST", { senha: "NovaSenhaDoCofre77" })).status, 200);

  // o histórico não tem valores de chave
  const h = JSON.stringify((await chamar(env, adm.token, "/dev/cofre/listar", "POST", { senha: "NovaSenhaDoCofre77" })).d.historico);
  assert.equal(h.includes("gsk_"), false);
  assert.ok(h.includes("senha_errada"));
});

test("cofre: importação dos segredos do GitHub com código de uso único", async () => {
  const env = ENV();
  const adm = await admin(env);
  const SENHA = "CofreSeguro2026Vindex";
  await chamar(env, adm.token, "/dev/cofre/iniciar", "POST", { senha: SENHA });
  await chamar(env, adm.token, "/dev/cofre/guardar", "POST", { senha: SENHA, nome: "GROQ_API_KEY", valor: "gsk_JA_ESTAVA_1234" });
  // sem senha do cofre não gera código
  assert.equal((await chamar(env, adm.token, "/dev/cofre/codigo", "POST", { senha: "Errada123456789" })).status, 403);
  const { codigo } = (await chamar(env, adm.token, "/dev/cofre/codigo", "POST", { senha: SENHA })).d;
  assert.match(codigo, /^vcx-/);
  // o workflow não tem login: só o código
  const segredos = { GROQ_API_KEY: "gsk_DO_GITHUB_9999", GEMINI_API_KEY: "AIza_gemini_chave_1", GITHUB_TOKEN: "ghs_nao_entra_1", "nome-ruim": "valor_qualquer_1", CURTA_KEY: "abc" };
  const r = await chamar(env, null, "/dev/cofre/importar", "POST", { codigo, segredos, origem: "Venus-core" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.d.guardados, ["GEMINI_API_KEY"]);
  assert.deepEqual(r.d.existentes, ["GROQ_API_KEY"]);
  assert.deepEqual(r.d.pulados.sort(), ["CURTA_KEY", "GITHUB_TOKEN", "nome-ruim"]);
  assert.equal(JSON.stringify(r.d).includes("gsk_"), false);
  const { lerSegredo } = await import("../src/dev/cofre.js");
  assert.equal(await lerSegredo(env, "GROQ_API_KEY"), "gsk_JA_ESTAVA_1234"); // não sobrescreveu
  assert.equal(await lerSegredo(env, "GEMINI_API_KEY"), "AIza_gemini_chave_1");
  // o código só vale uma vez
  assert.equal((await chamar(env, null, "/dev/cofre/importar", "POST", { codigo, segredos })).d.codigo, "codigo_invalido");
  assert.equal((await chamar(env, null, "/dev/cofre/importar", "POST", { codigo: "vcx-chutando", segredos })).status, 403);
  // com sobrescrever, troca
  const c2 = (await chamar(env, adm.token, "/dev/cofre/codigo", "POST", { senha: SENHA })).d.codigo;
  assert.deepEqual((await chamar(env, null, "/dev/cofre/importar", "POST", { codigo: c2, segredos: { GROQ_API_KEY: "gsk_DO_GITHUB_9999" }, sobrescrever: true })).d.guardados, ["GROQ_API_KEY"]);
  // código vencido
  const c3 = (await chamar(env, adm.token, "/dev/cofre/codigo", "POST", { senha: SENHA })).d.codigo;
  env.DB._db.prepare("UPDATE cofre_codigos SET expira = 1").run();
  assert.equal((await chamar(env, null, "/dev/cofre/importar", "POST", { codigo: c3, segredos })).d.codigo, "codigo_invalido");
});

test("progresso da compilação: passos feitos sobre o total, nunca 100% antes de acabar", async () => {
  const { percentualDosJobs } = await import("../src/dev/github.js");
  const r = percentualDosJobs([{ steps: [{ status: "completed" }, { status: "completed" }, { status: "in_progress", name: "Compilar" }, { status: "queued" }] }]);
  assert.deepEqual(r, { percentual: 50, etapa: "Compilar" });
  assert.equal(percentualDosJobs([{ steps: Array(5).fill({ status: "completed" }) }]).percentual, 99);
  assert.equal(percentualDosJobs([]).percentual, 0);
  assert.equal(percentualDosJobs([{ name: "x", status: "queued" }]).percentual, 0);
});

test("DeepSeek lê a chave do cofre (cifrada) e, sem ela, do segredo do Worker", async () => {
  const { deepseek } = await import("../src/ia/provedores.js");
  const { guardar } = await import("../src/dev/cofre.js");
  const env = ENV();
  const orig = globalThis.fetch;
  let cabecalho = "";
  globalThis.fetch = async (_u, init) => { cabecalho = init.headers.authorization; return new Response(JSON.stringify({ choices: [{ message: { content: "oi" } }], model: "m" }), { status: 200 }); };
  try {
    const p = { tarefa: "codigo", mensagens: [{ papel: "user", texto: "x" }], temperatura: 0.2, maxTokens: 10 };
    await assert.rejects(() => deepseek(env, p), /sem_chave/);
    env.DEEPSEEK_API_KEY = "chave-do-worker-123";
    await deepseek(env, p);
    assert.equal(cabecalho, "Bearer chave-do-worker-123");
    await guardar(env, { nome: "DEEPSEEK_API_KEY", valor: "sk-do-cofre-456789" });
    await deepseek(env, p);
    assert.equal(cabecalho, "Bearer sk-do-cofre-456789");
  } finally { globalThis.fetch = orig; }
});
