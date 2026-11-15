// Rotas do Painel Dev: /dev/* (só o superadministrador, exceto entrar, primeiro acesso e telemetria do Vindex).
import { ErroId, encerrarSessao, tokenDoPedido, validarSessao, MAX_ATIVAS, MAX_DISPOSITIVOS, TTL_ATIVA_MS } from "../id/conta.js";
import { verificar } from "../id/jwt.js";
import { ErroLoja } from "../loja/lojas.js";
import { TABELA } from "../ia/roteador.js";
import { criarAdmin, emailAdmin, entrarAdmin, exigirAdmin } from "./admin.js";
import { PROJETOS, REPO_VALIDO, apksDoProjeto, buildsDoRepo, falhaDosBuilds, estadoGeral, linkDoApk, progressoDoBuild, listaDeVersoes, metricasDoRepo } from "./github.js";
import { bi, esquecerProvedores, listarTrafego } from "./uso.js";
import * as cofre from "./cofre.js";
import { lerSegredo } from "./cofre.js";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
export const ehRotaDev = (c) => c === "/dev" || c.startsWith("/dev/");

async function corpo(req) {
  const t = await req.text();
  if (t.length > 50_000) throw new ErroId(413, "corpo_grande", "Pedido grande demais.");
  try {
    const d = JSON.parse(t || "{}");
    if (!d || typeof d !== "object" || Array.isArray(d)) throw 0;
    return d;
  } catch {
    throw new ErroId(400, "json_invalido", "O corpo precisa ser um JSON válido.");
  }
}

const STATUS_FASE = new Set(["planejada", "em_andamento", "concluida", "bloqueada"]);
const CHAVES_CONFIG = /^(escuta_continua|provedor:(groq|deepseek|gemini)|repo:(vindex|vortex))$/;

async function configuracoes(env) {
  const { results } = await env.DB.prepare("SELECT chave, valor FROM dev_config").all();
  const m = Object.fromEntries(results.map((r) => [r.chave, r.valor]));
  return m;
}

export async function repoDoProjeto(env, projeto, cfg) {
  return projeto.repo || (cfg[`repo:${projeto.id}`] || "") || String(env[`REPO_${projeto.id.toUpperCase()}`] || "");
}

// ------------------------------------------------------------------ projetos
export const progressoDasFases = (fases) => (fases.length ? Math.round(fases.reduce((s, f) => s + f.progresso, 0) / fases.length) : 100);

async function painel(env) {
  const cfg = await configuracoes(env);
  const { results: todasFases } = await env.DB.prepare("SELECT id, projeto, titulo, progresso, status, ordem FROM dev_fases ORDER BY projeto, ordem, id").all();
  const comToken = !!env.GITHUB_TOKEN;
  const projetos = await Promise.all(PROJETOS.map(async (p) => {
    const repo = await repoDoProjeto(env, p, cfg);
    const fases = todasFases.filter((f) => f.projeto === p.id);
    const base = { id: p.id, nome: p.nome, descricao: p.descricao, repo: repo || null, urlRepo: repo ? `https://github.com/${repo}` : null, fases, progresso: progressoDasFases(fases), fasesConcluidas: fases.filter((f) => f.status === "concluida").length };
    if (!repo) return { ...base, conectado: false, metricas: null, builds: [], estadoBuild: "desconhecido", apks: [] };
    if (!comToken) return { ...base, conectado: false, aviso: "O Worker está sem o token de leitura do GitHub (VENUS_GITHUB_LEITURA).", metricas: null, builds: [], estadoBuild: "desconhecido", apks: [] };
    // o GitHub às vezes demora ou recusa na primeira chamada: nenhuma falha dele derruba o painel inteiro
    try {
      const [metricas, builds, versoes] = await Promise.all([metricasDoRepo(env, repo), buildsDoRepo(env, repo), listaDeVersoes(env, repo)]);
      const apks = apksDoProjeto(p, versoes).map(({ _id, ...a }) => ({ ...a, baixar: a.versao ? `/dev/apk?app=${a.app}` : null }));
      const compilando = await progressoDoBuild(env, repo, builds);
      return { ...base, conectado: true, ...(builds ? {} : { aviso: `Não consegui ler os builds do GitHub (${falhaDosBuilds.get(repo) || "sem resposta"}).` }), metricas, builds: builds || [], estadoBuild: estadoGeral(builds), apks, compilando };
    } catch (e) {
      console.error("dev painel", p.id, e && e.message ? e.message : e);
      return { ...base, conectado: true, aviso: "Não consegui ler o GitHub agora. Toque em atualizar.", metricas: null, builds: [], estadoBuild: "desconhecido", apks: [] };
    }
  }));
  return { gerado: Date.now(), admin: emailAdmin(env), projetos };
}

async function apk(env, app) {
  const cfg = await configuracoes(env);
  for (const p of PROJETOS) {
    if (!p.apks.some((a) => a.app === app)) continue;
    const repo = await repoDoProjeto(env, p, cfg);
    if (!repo || !env.GITHUB_TOKEN) throw new ErroLoja(404, "sem_repo", "Esse projeto ainda não tem repositório ligado.");
    const lista = apksDoProjeto(p, await listaDeVersoes(env, repo)).find((a) => a.app === app);
    if (!lista || !lista._id) throw new ErroLoja(404, "sem_apk", "Ainda não há APK publicado desse app.");
    const url = await linkDoApk(env, repo, lista._id);
    if (!url) throw new ErroLoja(502, "sem_link", "O GitHub não deu o link do APK agora.");
    return { app, numero: lista.versao.numero, tag: lista.versao.tag, tamanho: lista.versao.tamanho, url };
  }
  throw new ErroLoja(404, "app_desconhecido", "App desconhecido.");
}

// ------------------------------------------------------------------ fases
async function salvarFase(env, id, d, agora = Date.now()) {
  const titulo = String(d.titulo ?? "").trim().slice(0, 120);
  const atual = id ? await env.DB.prepare("SELECT * FROM dev_fases WHERE id = ?").bind(id).first() : null;
  if (id && !atual) throw new ErroLoja(404, "fase_inexistente", "Fase não encontrada.");
  const projeto = atual ? atual.projeto : String(d.projeto || "");
  if (!PROJETOS.some((p) => p.id === projeto)) throw new ErroLoja(400, "projeto_invalido", "Projeto desconhecido.");
  const t = titulo || (atual && atual.titulo);
  if (!t) throw new ErroLoja(400, "titulo_vazio", "Dê um nome para a fase.");
  const prog = d.progresso === undefined ? (atual ? atual.progresso : 0) : Math.round(Number(d.progresso));
  if (!Number.isFinite(prog) || prog < 0 || prog > 100) throw new ErroLoja(400, "progresso_invalido", "O progresso vai de 0 a 100.");
  let status = d.status ?? (atual ? atual.status : prog >= 100 ? "concluida" : prog > 0 ? "em_andamento" : "planejada");
  if (!STATUS_FASE.has(status)) throw new ErroLoja(400, "status_invalido", "Status inválido.");
  if (d.progresso !== undefined && d.status === undefined) status = prog >= 100 ? "concluida" : prog > 0 && status !== "bloqueada" ? "em_andamento" : status;
  if (atual) {
    await env.DB.prepare("UPDATE dev_fases SET titulo = ?, progresso = ?, status = ?, atualizado = ? WHERE id = ?").bind(t, prog, status, agora, id).run();
    return { id, projeto, titulo: t, progresso: prog, status };
  }
  const novo = `${projeto}-${agora.toString(36)}`;
  const ordem = ((await env.DB.prepare("SELECT MAX(ordem) AS m FROM dev_fases WHERE projeto = ?").bind(projeto).first()).m || 0) + 1;
  await env.DB.prepare("INSERT INTO dev_fases (id, projeto, titulo, progresso, status, ordem, atualizado) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(novo, projeto, t, prog, status, ordem, agora).run();
  return { id: novo, projeto, titulo: t, progresso: prog, status, ordem };
}

// ------------------------------------------------------------------ ferramentas e funções
const IAS = [
  { id: "conversa", rotulo: "Conversa, respostas rápidas, textos e traduções", executor: "groq", reserva: "deepseek", tarefas: ["conversa", "rapida", "texto", "resumo", "traducao"] },
  { id: "logica", rotulo: "Lógica pesada e código", executor: "deepseek", reserva: "groq", tarefas: ["logica", "codigo"] },
  { id: "bi", rotulo: "Relatórios e BI", executor: "deepseek", reserva: "groq", tarefas: ["bi", "relatorio"] },
  { id: "multimodal", rotulo: "Imagem, PDF, áudio e OCR", executor: "gemini", reserva: null, tarefas: ["multimodal", "ocr"] },
];
const CHAVE_DO_PROVEDOR = { groq: "GROQ_API_KEY", deepseek: "DEEPSEEK_API_KEY", gemini: "GEMINI_API_KEY" };

async function ferramentas(env, agora = Date.now()) {
  const cfg = await configuracoes(env);
  const hora = Math.floor(agora / 3_600_000);
  const { results: uso } = await env.DB.prepare("SELECT provedor, tarefa, SUM(requisicoes) AS req, SUM(erros) AS erros, MAX(hora) AS ultima FROM dev_uso_ia WHERE hora > ? GROUP BY provedor, tarefa").bind(hora - 24).all();
  const provedores = await Promise.all(Object.keys(CHAVE_DO_PROVEDOR).map(async (p) => ({
    id: p,
    chaveConfigurada: p === "deepseek" ? !!(await lerSegredo(env, CHAVE_DO_PROVEDOR[p])) : !!env[CHAVE_DO_PROVEDOR[p]],
    ligado: cfg[`provedor:${p}`] !== "0",
    requisicoes24h: uso.filter((u) => u.provedor === p).reduce((s, u) => s + u.req, 0),
    erros24h: uso.filter((u) => u.provedor === p).reduce((s, u) => s + u.erros, 0),
  })));
  const automacoes = IAS.map((a) => {
    const linhas = uso.filter((u) => a.tarefas.includes(u.tarefa));
    const exec = provedores.find((p) => p.id === a.executor);
    const res = a.reserva ? provedores.find((p) => p.id === a.reserva) : null;
    return {
      ...a,
      tipo: "ia",
      funcoes: a.tarefas.map((t) => ({ tarefa: t, provedor: TABELA[t] })),
      emUso: exec && exec.ligado ? a.executor : res && res.ligado ? a.reserva : null,
      requisicoes24h: linhas.reduce((s, u) => s + u.req, 0),
      ativaAgora: linhas.some((u) => u.ultima >= hora),
    };
  });
  const cont = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).first()).n || 0;
  const [chatHora, postsHora, avisosHora] = await Promise.all([
    cont("SELECT COUNT(*) AS n FROM dev_trafego WHERE rota = '/chat' AND quando > ?", agora - 3_600_000),
    cont("SELECT COUNT(*) AS n FROM post_log WHERE quando > ?", agora - 3_600_000),
    cont("SELECT COUNT(*) AS n FROM dev_trafego WHERE rota LIKE '/webhook/%' AND quando > ?", agora - 3_600_000),
  ]);
  const servicos = [
    { id: "chat", tipo: "servico", rotulo: "Chat com busca na web", executor: "Groq + Tavily (reserva Gemini)", configurado: !!env.GROQ_API_KEY && !!env.TAVILY_API_KEY, atividadeHora: chatHora },
    { id: "publicacao", tipo: "servico", rotulo: "Publicação automática de posts", executor: "Cron do Worker (a cada 10 min) → Instagram Graph API ou webhook", configurado: true, atividadeHora: postsHora },
    { id: "reverse", tipo: "servico", rotulo: "Reverse-sync de estoque", executor: "Webhooks da Nuvemshop e do Mercado Livre → D1", configurado: !!env.NUVEMSHOP_APP_ID || !!env.ML_APP_ID, atividadeHora: avisosHora },
    { id: "cobranca", tipo: "servico", rotulo: "Cobrança e Plano Fundadores", executor: "InfinitePay e Mercado Pago (webhooks)", configurado: !!env.INFINITEPAY_HANDLE || !!env.MERCADOPAGO_ACCESS_TOKEN, atividadeHora: null },
    { id: "id", tipo: "servico", rotulo: "Vetorial ID, sessões e sincronização", executor: "Worker + D1 (JWT HS256, regra 3/2)", configurado: !!(env.JWT_SEGREDO || env.CHAVE_COFRE), atividadeHora: null },
    { id: "cache", tipo: "servico", rotulo: "Cache vetorial das respostas", executor: "KV + Vectorize + Workers AI", configurado: !!env.CACHE, atividadeHora: null },
    { id: "limpeza", tipo: "servico", rotulo: "Limpeza diária (avisos, sessões, tráfego)", executor: "Cron do Worker (01:17 de Brasília)", configurado: true, atividadeHora: null },
  ];
  return { gerado: agora, provedores, automacoes, servicos };
}

// ------------------------------------------------------------------ dispositivos (regra 3/2 de todas as contas)
async function dispositivos(env, agora = Date.now()) {
  const q = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
  const [sessoes, contas] = await Promise.all([
    q("SELECT s.id AS sessao, s.usuario, u.email, d.nome, d.plataforma, s.criado, s.ultimo_ping AS ultimoPing FROM sessoes s JOIN usuarios u ON u.id = s.usuario JOIN dispositivos d ON d.id = s.dispositivo WHERE s.encerrada = 0 AND s.ultimo_ping > ? ORDER BY s.ultimo_ping DESC LIMIT 200", agora - TTL_ATIVA_MS),
    q("SELECT u.id AS usuario, u.email, u.nome, COUNT(d.id) AS dispositivos FROM usuarios u LEFT JOIN dispositivos d ON d.usuario = u.id GROUP BY u.id ORDER BY MAX(d.ultimo) DESC LIMIT 200"),
  ]);
  return {
    agora, maxDispositivos: MAX_DISPOSITIVOS, maxAtivas: MAX_ATIVAS, ttlMs: TTL_ATIVA_MS,
    sessoesAtivas: sessoes.length,
    contas: contas.map((c) => ({ ...c, ativas: sessoes.filter((s) => s.usuario === c.usuario).length, sessoes: sessoes.filter((s) => s.usuario === c.usuario) })),
  };
}

// ------------------------------------------------------------------ cache vetorial
async function estadoDoCache(env, agora = Date.now()) {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(cache), 0) AS acertos, COALESCE(SUM(requisicoes), 0) AS chamadas FROM dev_uso_ia WHERE hora > ?").bind(Math.floor(agora / 3_600_000) - 24).first();
  return { exato: !!env.CACHE, semantico: !!(env.VETORES && env.AI), acertos24h: r.acertos, chamadas24h: r.chamadas, taxa: r.acertos + r.chamadas ? Math.round((100 * r.acertos) / (r.acertos + r.chamadas)) : 0 };
}

async function limparCache(env) {
  if (!env.CACHE) throw new ErroLoja(400, "sem_cache", "O cache não está ligado neste servidor.");
  const lote = await env.CACHE.list({ limit: 40 });
  await Promise.all(lote.keys.map((k) => env.CACHE.delete(k.name)));
  return { apagadas: lote.keys.length, restam: !lote.list_complete };
}

// ------------------------------------------------------------------ telemetria (Vindex → painel)
const t = (v, n = 60) => String(v ?? "").slice(0, n);
const n = (v, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : null);
export function limparTelemetria(d) {
  const b = d.bateria || {}, h = d.hardware || {};
  return {
    bateria: { nivel: n(b.nivel, 0, 100), carregando: !!b.carregando, temperatura: n(b.temperatura, -20, 120) },
    hardware: { modelo: t(h.modelo), so: t(h.so, 40), ramMb: n(h.ramMb, 0, 1_000_000), nucleos: n(h.nucleos, 0, 256), armazenamentoLivreMb: n(h.armazenamentoLivreMb, 0, 100_000_000), rede: t(h.rede, 20) },
  };
}

async function receberTelemetria(env, req, agora) {
  const dados = await verificar(env, tokenDoPedido(req), agora);
  let origem;
  if (dados && dados.papel === "superadmin") { await exigirAdmin(env, req, agora); origem = "dev"; }
  else if (dados && dados.app === "vindex") { await validarSessao(env, req, { agora }); origem = "vindex"; }
  else throw new ErroId(403, "sem_permissao", "Só o Vindex ou o administrador enviam telemetria.");
  const limpo = limparTelemetria(await corpo(req));
  await env.DB.prepare("INSERT INTO dev_telemetria (origem, dados, atualizado) VALUES (?, ?, ?) ON CONFLICT(origem) DO UPDATE SET dados = excluded.dados, atualizado = excluded.atualizado").bind(origem, JSON.stringify(limpo), agora).run();
  return { ok: true, origem };
}

export async function tratarDev(req, env, url, caminho) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const agora = Date.now();
  try {
    if (caminho === "/dev/entrar" && req.method === "POST") return json(await entrarAdmin(env, await corpo(req), agora));
    if (caminho === "/dev/primeiro-acesso" && req.method === "POST") return json(await criarAdmin(env, await corpo(req), agora), 201);
    if (caminho === "/dev/telemetria" && req.method === "POST") return json(await receberTelemetria(env, req, agora));

    // importação de segredos pelo workflow do GitHub: autenticada por um código de uso único gerado no Painel
    if (caminho === "/dev/cofre/importar" && req.method === "POST") {
      const d = await corpo(req);
      return json(await cofre.importar(env, d.codigo, d.segredos, { sobrescrever: d.sobrescrever === true, origem: d.origem }, agora));
    }
    const ctx = await exigirAdmin(env, req, agora);
    if (caminho === "/dev/eu" && req.method === "GET") return json({ email: ctx.usuario.email, nome: ctx.usuario.nome, papel: "superadmin", sessao: ctx.sessao });
    if (caminho === "/dev/sair" && req.method === "POST") { await encerrarSessao(env, ctx.usuario.id, ctx.sessao, "saiu"); return json({ ok: true }); }
    if (caminho === "/dev/painel" && req.method === "GET") return json(await painel(env));
    if (caminho === "/dev/bi" && req.method === "GET") return json(await bi(env, Number(url.searchParams.get("dias")) || 30, agora));
    if (caminho === "/dev/ferramentas" && req.method === "GET") return json(await ferramentas(env, agora));
    if (caminho === "/dev/trafego" && req.method === "GET") return json(await listarTrafego(env, { desde: Number(url.searchParams.get("desde")) || 0, limite: Number(url.searchParams.get("limite")) || 60 }, agora));
    if (caminho === "/dev/dispositivos" && req.method === "GET") return json(await dispositivos(env, agora));
    if (caminho === "/dev/apk" && req.method === "GET") return json(await apk(env, url.searchParams.get("app") || ""));
    if (caminho === "/dev/cache" && req.method === "GET") return json(await estadoDoCache(env, agora));
    if (caminho === "/dev/cache" && req.method === "DELETE") return json(await limparCache(env));
    if (caminho === "/dev/telemetria" && req.method === "GET") {
      const { results } = await env.DB.prepare("SELECT origem, dados, atualizado FROM dev_telemetria").all();
      return json({ agora, itens: results.map((r) => ({ origem: r.origem, atualizado: r.atualizado, ...JSON.parse(r.dados) })) });
    }
    let m = /^\/dev\/sessoes\/([a-f0-9]{24})\/encerrar$/.exec(caminho);
    if (m && req.method === "POST") {
      const s = await env.DB.prepare("SELECT usuario FROM sessoes WHERE id = ?").bind(m[1]).first();
      if (!s) throw new ErroLoja(404, "sessao_inexistente", "Sessão não encontrada.");
      if (m[1] === ctx.sessao) throw new ErroLoja(400, "sessao_atual", "Para sair deste aparelho use Sair.");
      return json({ ok: await encerrarSessao(env, s.usuario, m[1], "encerrada_pelo_admin") });
    }
    if (caminho === "/dev/config" && req.method === "GET") {
      const cfg = await configuracoes(env);
      return json({ escutaContinua: cfg.escuta_continua === "1", provedores: Object.fromEntries(Object.keys(CHAVE_DO_PROVEDOR).map((p) => [p, { ligado: cfg[`provedor:${p}`] !== "0", chaveConfigurada: !!env[CHAVE_DO_PROVEDOR[p]] }])), repos: { vindex: cfg["repo:vindex"] || "", vortex: cfg["repo:vortex"] || "" } });
    }
    if (caminho === "/dev/config" && req.method === "PUT") {
      const d = await corpo(req);
      if (!CHAVES_CONFIG.test(String(d.chave))) throw new ErroLoja(400, "chave_invalida", "Essa configuração não existe.");
      let v = d.valor;
      if (String(d.chave).startsWith("repo:")) {
        v = String(v || "").trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
        if (v && !REPO_VALIDO.test(v)) throw new ErroLoja(400, "repo_invalido", "Use o formato dono/repositório.");
      } else v = v === true || v === "1" || v === 1 ? "1" : "0";
      await env.DB.prepare("INSERT INTO dev_config (chave, valor, atualizado) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado = excluded.atualizado").bind(d.chave, v, agora).run();
      esquecerProvedores();
      return json({ ok: true, chave: d.chave, valor: v });
    }
    // cofre de chaves: além do JWT de superadmin, toda operação pede a senha do cofre (menos ver se ela já existe)
    if (caminho === "/dev/cofre/estado" && req.method === "GET") return json({ ...(await cofre.estado(env, agora)), sugeridas: cofre.CHAVES_SUGERIDAS });
    if (caminho === "/dev/cofre/iniciar" && req.method === "POST") return json(await cofre.iniciar(env, (await corpo(req)).senha, agora), 201);
    if (caminho.startsWith("/dev/cofre/") && req.method === "POST") {
      const d = await corpo(req);
      await cofre.conferir(env, d.senha, agora);
      if (caminho === "/dev/cofre/listar") return json({ chaves: await cofre.listar(env, agora), historico: await cofre.historico(env, 20) });
      if (caminho === "/dev/cofre/guardar") return json(await cofre.guardar(env, d, agora));
      if (caminho === "/dev/cofre/codigo") return json(await cofre.gerarCodigo(env, agora));
      if (caminho === "/dev/cofre/apagar") return json(await cofre.apagar(env, d.nome, agora));
      if (caminho === "/dev/cofre/trocar-senha") return json(await cofre.trocarSenha(env, d.nova, agora));
    }
    if (caminho === "/dev/fases" && req.method === "POST") return json(await salvarFase(env, null, await corpo(req), agora), 201);
    m = /^\/dev\/fases\/([a-z0-9-]{3,40})$/.exec(caminho);
    if (m && req.method === "PUT") return json(await salvarFase(env, m[1], await corpo(req), agora));
    if (m && req.method === "DELETE") return json({ ok: (await env.DB.prepare("DELETE FROM dev_fases WHERE id = ?").bind(m[1]).run()).meta.changes > 0 });
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroLoja) return json({ error: e.message, codigo: e.codigo, ...(e.dados || {}) }, e.status);
    console.error("dev", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
