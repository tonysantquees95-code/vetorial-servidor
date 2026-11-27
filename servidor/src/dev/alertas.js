// Avisos do Painel Dev: build quebrado, relato de erro novo e erro em alta. Roda no cron de 10 em 10 minutos.
import { PROJETOS, buildsDoRepo } from "./github.js";
import { APPS } from "../feedback/dados.js";
import { verificarCadastros, verificarDownloads, limparVisitas } from "./visitas.js";
import { verificarPagamentos } from "./assinaturas.js";
import { tokenMercadoPago } from "../loja/assinatura.js";

export const LIMITE_ERRO_EM_ALTA = 3; // relatos de problema do mesmo app na última hora
const HORA = 3600000;

/** Dos builds mais recentes de cada fluxo, quais falharam (puro, testado). Cancelado não é falha. */
export function falhasDeBuild(projeto, builds) {
  return (builds || [])
    .filter((b) => b && b.estado === "completed" && b.resultado === "failure")
    .map((b) => ({
      tipo: "build", app: projeto.id, grupo: `${projeto.id}|${b.workflow}`,
      titulo: `Build falhou: ${projeto.nome.split(" · ")[0]}`,
      detalhe: `${b.workflow} #${b.numero} · commit ${b.commit}`,
      chave: `build:${projeto.id}:${b.id}`,
    }));
}

/** Relatos de problema → um aviso por relato e, se passou do limite na hora, um aviso de erro em alta (puro, testado). */
export function avisosDeRelatos(relatos, agora) {
  const out = [];
  const porApp = new Map();
  for (const r of relatos) {
    const nome = APPS[r.app] || r.app;
    out.push({ tipo: "relato", app: r.app, grupo: "", titulo: `Erro relatado no ${nome}`, detalhe: String(r.texto || "").slice(0, 160), chave: `relato:${r.id}` });
    if (agora - r.criado <= HORA) porApp.set(r.app, (porApp.get(r.app) || 0) + 1);
  }
  for (const [app, n] of porApp) {
    if (n >= LIMITE_ERRO_EM_ALTA) out.push({ tipo: "alta", app, grupo: "", titulo: `Erro em alta no ${APPS[app] || app}`, detalhe: `${n} relatos de problema na última hora`, chave: `alta:${app}:${Math.floor(agora / HORA)}` });
  }
  return out;
}

async function gravar(env, a, agora) {
  const r = await env.DB.prepare("INSERT OR IGNORE INTO dev_alertas (criado, tipo, app, grupo, titulo, detalhe, chave) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(agora, a.tipo, a.app, a.grupo, a.titulo, a.detalhe, a.chave).run();
  return (r.meta && r.meta.changes) > 0;
}

export async function verificarBuilds(env, agora = Date.now(), buscar = buildsDoRepo) {
  let novos = 0;
  for (const p of PROJETOS.filter((x) => x.repo)) {
    let builds;
    try { builds = await buscar(env, p.repo); } catch (e) { console.error("alertas builds", p.id, e && e.message); continue; }
    if (!builds) continue;
    for (const a of falhasDeBuild(p, builds)) if (await gravar(env, a, agora)) novos++;
    for (const b of builds) { // um build verde mais novo resolve o aviso do mesmo fluxo
      if (b.estado === "completed" && b.resultado === "success") {
        await env.DB.prepare("UPDATE dev_alertas SET status = 'resolvido', resolvido_em = ? WHERE tipo = 'build' AND grupo = ? AND status != 'resolvido'").bind(agora, `${p.id}|${b.workflow}`).run();
      }
    }
  }
  return novos;
}

export async function verificarRelatos(env, agora = Date.now()) {
  const { results } = await env.DB.prepare("SELECT id, criado, app, texto FROM feedbacks WHERE tipo = 'problema' AND criado > ? ORDER BY id").bind(agora - 2 * HORA).all();
  let novos = 0;
  for (const a of avisosDeRelatos(results || [], agora)) if (await gravar(env, a, agora)) novos++;
  return novos;
}

/** Aviso de configuração: Mercado Pago ligado mas sem o segredo que confere a assinatura dos webhooks. Some sozinho quando o segredo entra. */
export async function verificarConfiguracao(env, agora = Date.now()) {
  const chave = "config:mp-webhook-secret";
  const ligado = !!(await tokenMercadoPago(env).catch(() => null));
  if (ligado && !env.MERCADOPAGO_WEBHOOK_SECRET) {
    const r = await env.DB.prepare("INSERT OR IGNORE INTO dev_alertas (criado, tipo, app, grupo, titulo, detalhe, chave) VALUES (?, 'cobranca', 'servidor', '', ?, ?, ?)")
      .bind(agora, "Mercado Pago sem segredo de webhook", "Sem o segredo, o servidor só confia na conferência na API do Mercado Pago. Cadastre MERCADOPAGO_WEBHOOK_SECRET (Mercado Pago › Webhooks › chave secreta) nos Secrets do servidor.", chave).run();
    return r.meta.changes ? 1 : 0;
  }
  await env.DB.prepare("UPDATE dev_alertas SET status = 'resolvido', resolvido_em = ? WHERE chave = ? AND status != 'resolvido'").bind(agora, chave).run();
  return 0;
}

export async function verificarAlertas(env, agora = Date.now()) {
  let n = 0;
  try { if (env.GITHUB_TOKEN) n += await verificarBuilds(env, agora); } catch (e) { console.error("alertas builds", e); }
  try { n += await verificarRelatos(env, agora); } catch (e) { console.error("alertas relatos", e); }
  try { n += await verificarCadastros(env, agora); } catch (e) { console.error("alertas cadastros", e); }
  try { n += await verificarDownloads(env, agora); } catch (e) { console.error("alertas downloads", e); }
  try { n += await verificarPagamentos(env, agora); } catch (e) { console.error("alertas pagamentos", e); }
  try { n += await verificarConfiguracao(env, agora); } catch (e) { console.error("alertas configuracao", e); }
  try { await limparVisitas(env, agora); } catch (e) { console.error("limpar visitas", e); }
  await env.DB.prepare("DELETE FROM dev_alertas WHERE criado < ?").bind(agora - 30 * 86400000).run();
  return n;
}

export async function listarAlertas(env, { status = "" } = {}) {
  const filtro = ["novo", "visto", "resolvido"].includes(status) ? status : "";
  const { results } = await env.DB.prepare(`SELECT id, criado, tipo, app, titulo, detalhe, status FROM dev_alertas ${filtro ? "WHERE status = ?" : "WHERE status != 'resolvido'"} ORDER BY id DESC LIMIT 60`).bind(...(filtro ? [filtro] : [])).all();
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM dev_alertas WHERE status = 'novo'").first();
  return { alertas: results || [], novos: (n && n.n) || 0 };
}

export async function marcarAlerta(env, id, d) {
  if (d && d.todos === true) { await env.DB.prepare("UPDATE dev_alertas SET status = 'visto' WHERE status = 'novo'").run(); return { ok: true }; }
  const status = ["visto", "resolvido", "novo"].includes(d && d.status) ? d.status : "visto";
  await env.DB.prepare("UPDATE dev_alertas SET status = ?, resolvido_em = ? WHERE id = ?").bind(status, status === "resolvido" ? Date.now() : null, id).run();
  return { ok: true };
}
