// Assinaturas no Painel Dev: aviso quando um pagamento é confirmado e o resumo de assinantes e receita. Só lê as tabelas que a assinatura já usa.
import { PACOTES } from "../loja/assinatura.js";

const HORA = 3600000;
const DIA = 86400000;
const reais = (c) => "R$ " + (Math.round(c) / 100).toFixed(2).replace(".", ",");
const nomeDoPacote = (p) => (PACOTES[p] ? PACOTES[p].nome : "Vênus");
const diaDeBrasilia = (t) => new Date(t - 3 * HORA).toISOString().slice(0, 10);
/** Primeiro instante do mês de Brasília que contém `t`. */
export const inicioDoMes = (t) => Date.parse(diaDeBrasilia(t).slice(0, 8) + "01T00:00:00Z") + 3 * HORA;

/** Pagamentos confirmados nas últimas 2 horas viram um aviso cada (a chave é o id do pagamento: nunca repete). */
export async function verificarPagamentos(env, agora = Date.now()) {
  const { results } = await env.DB.prepare(
    "SELECT p.id, p.gateway, p.valor_centavos AS valor, p.pacote, p.atualizado, (SELECT u.email FROM usuarios u WHERE u.loja = p.loja ORDER BY u.criado LIMIT 1) AS email " +
      "FROM pagamentos p WHERE p.status IN ('pago','liberado') AND p.atualizado > ? ORDER BY p.atualizado",
  ).bind(agora - 2 * HORA).all();
  let novos = 0;
  for (const p of results || []) {
    const gravou = await env.DB.prepare("INSERT OR IGNORE INTO dev_alertas (criado, tipo, app, grupo, titulo, detalhe, chave) VALUES (?, 'pagamento', 'venus', '', ?, ?, ?)")
      .bind(p.atualizado, `Pagamento recebido: ${reais(p.valor)}`, `${String(p.email || "conta sem e-mail").slice(0, 80)} · ${nomeDoPacote(p.pacote)} · ${p.gateway === "mercadopago" ? "Mercado Pago" : "InfinitePay"}`, `pagto:${p.id}`).run();
    if (gravou.meta && gravou.meta.changes > 0) novos++;
  }
  return novos;
}

/** Quantos assinam, quantos estão no teste, quanto entrou no mês. Contas do dono e testadores não entram na conta. */
export async function resumoDeAssinaturas(env, agora = Date.now()) {
  const q = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results || [];
  const testadores = new Set((await q("SELECT email FROM testadores")).map((x) => String(x.email).toLowerCase()));
  const contas = await q("SELECT u.email, l.plano, l.pacote, l.ativo_ate AS ativoAte, l.trial_fim AS trialFim FROM usuarios u JOIN lojas l ON l.id = u.loja");
  const r = { assinantes: 0, emTeste: 0, vencendoEm7: 0, venceram: 0, semTeste: 0, testadores: 0, cortesias: 0, porPacote: {} };
  for (const c of contas) {
    if (c.plano === "dono") continue;
    if (testadores.has(String(c.email).toLowerCase())) { r.testadores++; continue; }
    // cortesia não é assinatura: conta à parte enquanto vale e, vencida, não vira "assinante que saiu"
    if (c.plano === "cortesia") { if ((c.ativoAte || 0) > agora) r.cortesias++; continue; }
    if ((c.ativoAte || 0) > agora) {
      r.assinantes++;
      r.porPacote[c.pacote] = (r.porPacote[c.pacote] || 0) + 1;
      if (c.ativoAte - agora <= 7 * DIA) r.vencendoEm7++;
    } else if ((c.trialFim || 0) > agora) r.emTeste++;
    else if (c.plano === "sem_teste") r.semTeste++;
    else if ((c.ativoAte || 0) > 0) r.venceram++;
  }
  const mes = await q("SELECT COUNT(*) AS n, COALESCE(SUM(valor_centavos), 0) AS total FROM pagamentos WHERE status IN ('pago','liberado') AND atualizado >= ?", inicioDoMes(agora));
  const recentes = await q(
    "SELECT p.id, p.gateway, p.valor_centavos AS valor, p.pacote, p.status, p.atualizado, (SELECT u.email FROM usuarios u WHERE u.loja = p.loja ORDER BY u.criado LIMIT 1) AS email FROM pagamentos p WHERE p.status IN ('pago','liberado') ORDER BY p.atualizado DESC LIMIT 15",
  );
  return {
    ...r,
    pacotes: Object.entries(r.porPacote).map(([chave, n]) => ({ chave, nome: nomeDoPacote(chave), n })).sort((a, b) => b.n - a.n),
    mes: { pagamentos: mes[0].n, centavos: mes[0].total },
    recentes: recentes.map((p) => ({ id: p.id, email: p.email || "", valor: p.valor, pacote: nomeDoPacote(p.pacote), gateway: p.gateway, quando: p.atualizado, aguardandoLiberacao: p.status === "pago" })),
  };
}

const PROBLEMAS = {
  rejected: "Pagamento recusado", cancelled: "Pagamento cancelado", charged_back: "Pagamento contestado (chargeback)", refunded: "Pagamento devolvido",
  recycling: "Cobrança da assinatura recusada", paused: "Assinatura pausada", assinatura_cancelled: "Assinatura cancelada",
};
export const ehProblemaDePagamento = (status) => Object.prototype.hasOwnProperty.call(PROBLEMAS, status);

/**
 * Avisa o Painel Dev de um problema de cobrança vindo do Mercado Pago (recusa, estorno, assinatura pausada ou cancelada).
 * `referencia` é o nosso id de pagamento (external_reference); a chave evita avisar duas vezes do mesmo fato. Nunca derruba o webhook.
 */
export async function avisarProblemaDePagamento(env, { quem, status, referencia, detalhe = "", agora = Date.now() }) {
  try {
    const titulo = PROBLEMAS[status];
    if (!titulo) return false;
    const u = await env.DB.prepare("SELECT u.email FROM pagamentos p JOIN usuarios u ON u.loja = p.loja WHERE p.id = ? ORDER BY u.criado LIMIT 1").bind(String(referencia || "")).first();
    const texto = [u && u.email ? u.email : "conta não encontrada", detalhe].filter(Boolean).join(" · ").slice(0, 160);
    const r = await env.DB.prepare("INSERT OR IGNORE INTO dev_alertas (criado, tipo, app, grupo, titulo, detalhe, chave) VALUES (?, 'cobranca', 'venus', '', ?, ?, ?)")
      .bind(agora, titulo, texto, `cobranca:${String(quem).slice(0, 80)}:${status}`).run();
    return !!(r.meta && r.meta.changes > 0);
  } catch (e) { console.error("aviso de cobrança", e); return false; }
}
