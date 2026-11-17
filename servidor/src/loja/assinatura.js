// Plano Fundadores: R$ 49,90 por mês, 7 dias grátis. Cobrança recorrente no Mercado Pago do dono (assinatura mensal) ou InfinitePay, confirmado pelo webhook
// (e conferido na própria API do gateway). O acesso pago só é liberado depois da verificação em duas etapas (2FA).
import { aleatorio, cifrar, decifrar, hmacHex, iguais } from "./cripto.js";
import { ErroLoja, acessoLiberado } from "./lojas.js";
import { lerSegredo } from "../dev/cofre.js";
import { conferirTotp, novoSegredo, uriOtp } from "./totp.js";

export const PRECO_CENTAVOS = 4990;
export const DIAS_DO_PLANO = 30;
const DIA = 86_400_000;
const titulo = "Vênus — Plano Fundadores (mensal)";

/** Pacotes mensais. O teste grátis de 7 dias libera Vênus, Vindex e Vortex; depois, vale o pacote assinado. */
export const PACOTES = {
  venus: { nome: "Vênus", centavos: 4990, apps: { vindex: false, vortex: false, vyntem: false } },
  venus_vindex: { nome: "Vênus + Vindex", centavos: 7000, apps: { vindex: true, vortex: false, vyntem: false } },
  venus_vortex: { nome: "Vênus + Vortex", centavos: 7000, apps: { vindex: false, vortex: true, vyntem: false } },
  completo: { nome: "Vênus + Vindex + Vortex", centavos: 10000, apps: { vindex: true, vortex: true, vyntem: true } },
  // vendidos sozinhos, sem a Vênus
  vortex: { nome: "Vortex", centavos: 2490, apps: { vindex: false, vortex: true, vyntem: false } },
  vindex: { nome: "Vindex", centavos: 3490, apps: { vindex: true, vortex: false, vyntem: false } },
  vindex_vortex: { nome: "Vindex + Vortex", centavos: 5000, apps: { vindex: true, vortex: true, vyntem: false } },
};
/**
 * Promoção de lançamento: a suíte completa (Vênus + Vindex + Vortex) a R$ 49,90 por mês para quem assinar até o fim da promoção;
 * quem assina nesse período mantém os R$ 49,90 por 6 meses (no cartão, a assinatura tem 6 cobranças; no Pix/débito, o preço fica travado).
 * Depois disso valem os preços normais. A data do fim pode ser mudada pela variável PROMO_FIM (ex.: 2026-12-16T23:59:59-03:00).
 */
export const PROMO = { pacote: "completo", centavos: 4990, meses: 6 };
const PROMO_FIM_PADRAO = Date.parse("2026-12-16T23:59:59-03:00");
export const promocaoFim = (env) => { const t = Date.parse(String(env?.PROMO_FIM || "")); return Number.isFinite(t) ? t : PROMO_FIM_PADRAO; };

function maisMeses(t, n) { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime(); }

/** Preço mensal deste pacote para esta loja agora: o da promoção (aberta ou travada por 6 meses) ou o normal. */
export async function precoDoPacote(env, loja, pacote, agora = Date.now()) {
  const cheio = PACOTES[pacote].centavos;
  if (pacote !== PROMO.pacote) return { centavos: cheio, promo: false, cheio };
  if (agora <= promocaoFim(env)) return { centavos: PROMO.centavos, promo: true, cheio };
  const r = await env.DB.prepare("SELECT MIN(atualizado) AS t FROM pagamentos WHERE loja = ? AND pacote = ? AND valor_centavos = ? AND status IN ('pago','liberado') AND criado <= ?")
    .bind(loja.id, PROMO.pacote, PROMO.centavos, promocaoFim(env)).first();
  if (r && r.t && agora < maisMeses(r.t, PROMO.meses)) return { centavos: PROMO.centavos, promo: true, cheio, travadoAte: maisMeses(r.t, PROMO.meses) };
  return { centavos: cheio, promo: false, cheio };
}

export const pacoteDe = (chave) => (Object.prototype.hasOwnProperty.call(PACOTES, chave) ? chave : "venus");
const tituloDo = (pacote) => (pacote === "venus" ? titulo : `${PACOTES[pacote].nome} — Plano mensal`);

/** Quais apps estão liberados agora: no teste grátis, todos; pago, os do pacote; o dono, todos. O Vyntem é gratuito para qualquer conta do Vetorial ID. */
export function appsLiberados(loja, agora = Date.now()) {
  if (loja.plano === "dono") return { vindex: true, vortex: true, vyntem: true };
  const pago = agora < (loja.ativo_ate || 0);
  if (pago) return { ...PACOTES[pacoteDe(loja.pacote)].apps, vyntem: true };
  const teste = agora < (loja.trial_fim || 0);
  return { vindex: teste, vortex: teste, vyntem: true };
}

async function http(url, op) {
  const r = await fetch(url, { ...op, signal: AbortSignal.timeout(15000) });
  const t = await r.text();
  let d = {};
  try { d = t ? JSON.parse(t) : {}; } catch (e) {}
  if (!r.ok) {
    // o motivo que o próprio gateway deu (as respostas de erro dele não trazem chaves): ajuda a achar o que está errado no pedido
    const causa = Array.isArray(d.cause) && d.cause[0] ? (d.cause[0].description || d.cause[0].code) : "";
    const motivo = [d.message, causa].filter((x) => typeof x === "string" && x).join(" — ").slice(0, 240);
    // regra do Mercado Pago: token de teste só aceita pagador de teste, e token de produção só aceita pagador real
    if (/real or test users/i.test(motivo)) throw new ErroLoja(502, "mp_teste_e_real", "O Mercado Pago recusou: quem paga e quem recebe precisam ser os dois contas reais ou os dois contas de teste. Para cobrar de verdade, o dono precisa guardar o token de PRODUÇÃO (Painel Dev › Cofre) e pagar com um e-mail diferente do da conta que recebe.");
    throw new ErroLoja(502, "gateway_erro", `O gateway respondeu ${r.status}.${motivo ? ` Motivo: ${motivo}` : ""}`);
  }
  return d;
}

/** Token do Mercado Pago: o que foi guardado no Cofre do Painel Dev vale; sem ele, a variável do Worker. */
export const tokenMercadoPago = (env) => lerSegredo(env, "MERCADOPAGO_ACCESS_TOKEN");

/**
 * forma "recorrente": assinatura mensal no cartão de crédito (renova sozinha).
 * forma "avulso": paga 30 dias por Pix ou cartão de débito, sem renovação automática: vencendo, a pessoa paga mais 30 dias quando puder.
 */
export async function iniciarCobranca(env, loja, gateway, origem, agora = Date.now(), pacoteEscolhido = "venus", emailPagador = "", forma = "recorrente") {
  const pacote = pacoteDe(pacoteEscolhido);
  const { centavos: preco, promo } = await precoDoPacote(env, loja, pacote, agora);
  const titulo = tituloDo(pacote);
  if (!["infinitepay", "mercadopago"].includes(gateway)) throw new ErroLoja(400, "gateway_invalido", "Use infinitepay ou mercadopago.");
  const avulso = forma === "avulso";
  const id = `${avulso ? "avu" : "ass"}_${loja.id}_${aleatorio(4)}`;
  let url;
  if (gateway === "infinitepay") {
    if (!env.INFINITEPAY_HANDLE) throw new ErroLoja(503, "gateway_desligado", "A InfinitePay ainda não foi configurada neste servidor.");
    const d = await http("https://api.checkout.infinitepay.io/links", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle: String(env.INFINITEPAY_HANDLE).replace(/^\$/, ""), order_nsu: id, items: [{ quantity: 1, price: preco, description: titulo }], webhook_url: `${origem}/assinatura/webhook/infinitepay` }),
    });
    url = d.url || d.checkout_url || d.link;
  } else {
    const tokenMP = await tokenMercadoPago(env);
    if (!tokenMP) throw new ErroLoja(503, "gateway_desligado", "O Mercado Pago da Vênus ainda não foi ligado neste servidor. O dono precisa enviar o token (veja o aviso nos Ajustes).");
    if (avulso) {
      // pagamento único de 30 dias: só Pix e débito (sem cartão de crédito e sem boleto); o aviso do pagamento chega pelo mesmo webhook
      const pref = await http("https://api.mercadopago.com/checkout/preferences", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tokenMP}` },
        body: JSON.stringify({
          items: [{ id: pacote, title: `${tituloDo(pacote)} · 30 dias`, quantity: 1, currency_id: "BRL", unit_price: preco / 100 }],
          external_reference: id, notification_url: `${origem}/assinatura/webhook/mercadopago`,
          back_urls: { success: origem, failure: origem, pending: origem }, auto_return: "approved",
          payment_methods: { excluded_payment_types: [{ id: "credit_card" }, { id: "ticket" }, { id: "atm" }] },
        }),
      });
      url = pref.init_point;
      if (!url) throw new ErroLoja(502, "gateway_sem_link", "O gateway não devolveu o link de pagamento.");
      await env.DB.prepare("INSERT INTO pagamentos (id, loja, gateway, valor_centavos, status, criado, atualizado, pacote) VALUES (?, ?, ?, ?, 'aguardando', ?, ?, ?)").bind(id, loja.id, gateway, preco, agora, agora, pacote).run();
      return { id, url, valorCentavos: preco, pacote, forma };
    }
    // assinatura mensal recorrente: a primeira cobrança só acontece quando os 7 dias grátis acabam
    const recorrente = { frequency: 1, frequency_type: "months", transaction_amount: preco / 100, currency_id: "BRL" };
    if (promo) recorrente.repetitions = PROMO.meses; // preço de promoção: 6 cobranças; depois a pessoa assina de novo pelo preço normal
    if ((loja.trial_fim || 0) > agora + 3_600_000) recorrente.start_date = new Date(loja.trial_fim).toISOString();
    const corpo = { reason: titulo, external_reference: id, back_url: origem, notification_url: `${origem}/assinatura/webhook/mercadopago`, auto_recurring: recorrente, status: "pending" };
    // o Mercado Pago exige o e-mail de quem paga: o da loja ou, sem ele, o da conta (Vetorial ID) que pediu o link
    let pagador = loja.email || emailPagador;
    if (!pagador) { try { pagador = (await env.DB.prepare("SELECT email FROM usuarios WHERE loja = ? ORDER BY criado LIMIT 1").bind(loja.id).first())?.email || ""; } catch { /* sem tabela: segue sem e-mail */ } }
    if (pagador) corpo.payer_email = pagador;
    const d = await http("https://api.mercadopago.com/preapproval", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tokenMP}` },
      body: JSON.stringify(corpo),
    });
    url = d.init_point;
  }
  if (!url) throw new ErroLoja(502, "gateway_sem_link", "O gateway não devolveu o link de pagamento.");
  await env.DB.prepare("INSERT INTO pagamentos (id, loja, gateway, valor_centavos, status, criado, atualizado, pacote) VALUES (?, ?, ?, ?, 'aguardando', ?, ?, ?)").bind(id, loja.id, gateway, preco, agora, agora, pacote).run();
  return { id, url, valorCentavos: preco, pacote, forma };
}

/** Marca o pagamento como pago (uma vez só) e deixa a liberação esperando o 2FA. */
export async function confirmarPagamento(env, id, valorCentavos, refGateway, agora = Date.now()) {
  const p = await env.DB.prepare("SELECT * FROM pagamentos WHERE id = ?").bind(id).first();
  if (!p || valorCentavos < p.valor_centavos) return false;
  const r = await env.DB.prepare("INSERT OR IGNORE INTO avisos_gateway (chave, criado) VALUES (?, ?)").bind(`${p.gateway}:${refGateway || id}`, agora).run();
  if (r.meta.changes !== 1) return true; // já processado
  // mensalidade seguinte de uma assinatura já liberada: soma mais 30 dias sozinha (o 2FA foi feito na primeira)
  if (p.status === "liberado") {
    const loja = await env.DB.prepare("SELECT ativo_ate FROM lojas WHERE id = ?").bind(p.loja).first();
    const ate = Math.max(agora, (loja && loja.ativo_ate) || 0) + DIAS_DO_PLANO * DIA;
    await env.DB.prepare("UPDATE lojas SET ativo_ate = ?, plano = 'fundadores', pacote = ? WHERE id = ?").bind(ate, pacoteDe(p.pacote), p.loja).run();
    return true;
  }
  // Pix/débito avulso de quem já teve o acesso liberado uma vez (2FA feito): soma mais 30 dias na hora, sem pedir o código de novo
  if (String(p.id).startsWith("avu_") && p.status === "aguardando") {
    const loja = await env.DB.prepare("SELECT ativo_ate FROM lojas WHERE id = ?").bind(p.loja).first();
    if (loja && (loja.ativo_ate || 0) > 0) {
      const ate = Math.max(agora, loja.ativo_ate) + DIAS_DO_PLANO * DIA;
      await env.DB.batch([
        env.DB.prepare("UPDATE lojas SET ativo_ate = ?, plano = 'fundadores', pacote = ? WHERE id = ?").bind(ate, pacoteDe(p.pacote), p.loja),
        env.DB.prepare("UPDATE pagamentos SET status = 'liberado', ref_gateway = ?, atualizado = ? WHERE id = ?").bind(String(refGateway || ""), agora, p.id),
      ]);
      return true;
    }
  }
  await env.DB.prepare("UPDATE pagamentos SET status = 'pago', ref_gateway = ?, atualizado = ? WHERE id = ? AND status = 'aguardando'").bind(String(refGateway || ""), agora, id).run();
  return true;
}

export async function webhookInfinitePay(env, corpo) {
  const id = String(corpo.order_nsu || "");
  const p = await env.DB.prepare("SELECT * FROM pagamentos WHERE id = ? AND gateway = 'infinitepay'").bind(id).first();
  if (!p || !corpo.transaction_nsu || !(corpo.invoice_slug || corpo.slug)) return { ignorado: true };
  // não confia no corpo do webhook: pergunta à InfinitePay se o pagamento existe
  const d = await http("https://api.checkout.infinitepay.io/payment_check", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle: String(env.INFINITEPAY_HANDLE || "").replace(/^\$/, ""), order_nsu: id, transaction_nsu: corpo.transaction_nsu, slug: corpo.invoice_slug || corpo.slug }),
  });
  if (d.paid !== true) return { pago: false };
  const valor = Number(d.paid_amount ?? d.amount);
  const ok = await confirmarPagamento(env, id, Number.isFinite(valor) ? valor : 0, corpo.transaction_nsu);
  return { pago: ok };
}

export async function assinaturaMercadoPagoValida(env, req, dataId) {
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) return true; // sem segredo configurado, a conferência na API (abaixo) é a garantia
  const partes = Object.fromEntries((req.headers.get("x-signature") || "").split(",").map((s) => s.trim().split("=")));
  if (!partes.ts || !partes.v1) return false;
  const manifesto = `id:${String(dataId).toLowerCase()};request-id:${req.headers.get("x-request-id") || ""};ts:${partes.ts};`;
  return iguais(partes.v1, await hmacHex(env.MERCADOPAGO_WEBHOOK_SECRET, manifesto));
}

export async function webhookMercadoPago(env, req, corpo, url) {
  const dataId = corpo?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id");
  const tipo = corpo?.type || corpo?.topic || url.searchParams.get("type") || url.searchParams.get("topic");
  if (!dataId || !["payment", "subscription_authorized_payment"].includes(tipo)) return { ignorado: true };
  if (!(await assinaturaMercadoPagoValida(env, req, dataId))) throw new ErroLoja(401, "assinatura", "Assinatura inválida.");
  const cab = { headers: { authorization: `Bearer ${await tokenMercadoPago(env)}` } };
  if (tipo === "subscription_authorized_payment") {
    // cobrança de uma assinatura: confere na API do Mercado Pago, não no corpo do aviso
    const ap = await http(`https://api.mercadopago.com/authorized_payments/${encodeURIComponent(dataId)}`, cab);
    const aprovado = ap.status === "processed" || (ap.payment && ap.payment.status === "approved");
    if (!aprovado || !ap.preapproval_id) return { pago: false };
    const pre = await http(`https://api.mercadopago.com/preapproval/${encodeURIComponent(ap.preapproval_id)}`, cab);
    if (!pre.external_reference) return { pago: false };
    return { pago: await confirmarPagamento(env, String(pre.external_reference), Math.round(Number(ap.transaction_amount) * 100), `ap${ap.id || dataId}`) };
  }
  const d = await http(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, cab);
  if (d.status !== "approved" || !d.external_reference) return { pago: false };
  const ok = await confirmarPagamento(env, String(d.external_reference), Math.round(Number(d.transaction_amount) * 100), String(d.id));
  return { pago: ok };
}

// ------------------------------------------------------------------ 2FA e liberação
export async function iniciar2fa(env, loja) {
  if (loja.totp_ativo) throw new ErroLoja(409, "2fa_ja_ativo", "A verificação em duas etapas já está ativa.");
  const segredo = loja.totp_segredo ? (await decifrar(env, loja.totp_segredo)).s : novoSegredo();
  if (!loja.totp_segredo) await env.DB.prepare("UPDATE lojas SET totp_segredo = ? WHERE id = ?").bind(await cifrar(env, { s: segredo }), loja.id).run();
  return { segredo, otpauth: uriOtp(segredo, loja.nome || loja.slug || loja.id) };
}

async function conferirCodigo(env, loja, codigo, agora) {
  if (!loja.totp_segredo) throw new ErroLoja(409, "sem_2fa", "Ative a verificação em duas etapas primeiro.");
  const { s } = await decifrar(env, loja.totp_segredo);
  const n = await conferirTotp(s, codigo, agora, loja.totp_ultimo);
  if (n === null) throw new ErroLoja(401, "codigo_invalido", "Código incorreto ou já usado. Espere o próximo código do aplicativo.");
  await env.DB.prepare("UPDATE lojas SET totp_ultimo = ? WHERE id = ?").bind(n, loja.id).run();
}

export async function confirmar2fa(env, loja, codigo, agora = Date.now()) {
  await conferirCodigo(env, loja, codigo, agora);
  await env.DB.prepare("UPDATE lojas SET totp_ativo = 1 WHERE id = ?").bind(loja.id).run();
}

/** Com um pagamento confirmado e o código 2FA certo, o acesso de 30 dias é liberado (soma ao tempo que ainda restava). */
export async function liberarAcesso(env, loja, codigo, agora = Date.now()) {
  const pago = await env.DB.prepare("SELECT * FROM pagamentos WHERE loja = ? AND status = 'pago' ORDER BY criado LIMIT 1").bind(loja.id).first();
  if (!pago) throw new ErroLoja(402, "sem_pagamento", "Nenhum pagamento confirmado para liberar.");
  if (!loja.totp_ativo) throw new ErroLoja(409, "sem_2fa", "Ative a verificação em duas etapas para liberar o acesso.");
  await conferirCodigo(env, loja, codigo, agora);
  const base = Math.max(agora, loja.ativo_ate || 0);
  const ate = base + DIAS_DO_PLANO * DIA;
  await env.DB.batch([
    env.DB.prepare("UPDATE pagamentos SET status = 'liberado', atualizado = ? WHERE id = ? AND status = 'pago'").bind(agora, pago.id),
    env.DB.prepare("UPDATE lojas SET ativo_ate = ?, plano = 'fundadores', pacote = ? WHERE id = ?").bind(ate, pacoteDe(pago.pacote), loja.id),
  ]);
  return { ativoAte: ate };
}

export async function estadoDaAssinatura(env, loja, agora = Date.now()) {
  const pend = await env.DB.prepare("SELECT COUNT(*) AS n FROM pagamentos WHERE loja = ? AND status = 'pago'").bind(loja.id).first();
  const trialRestante = Math.max(0, Math.ceil(((loja.trial_fim || 0) - agora) / DIA));
  const pagoRestante = Math.max(0, Math.ceil(((loja.ativo_ate || 0) - agora) / DIA));
  return {
    plano: loja.plano, precoCentavos: PRECO_CENTAVOS, diasDeTeste: 7,
    pacote: pacoteDe(loja.pacote), apps: appsLiberados(loja, agora),
    pacotes: await Promise.all(Object.entries(PACOTES).map(async ([chave, p]) => { const pr = await precoDoPacote(env, loja, chave, agora); return { chave, nome: p.nome, precoCentavos: pr.centavos, precoCheioCentavos: p.centavos, promocao: pr.promo }; })),
    promocao: agora <= promocaoFim(env) ? { fim: promocaoFim(env), meses: PROMO.meses, pacote: PROMO.pacote, precoCentavos: PROMO.centavos } : null,
    emTeste: agora < loja.trial_fim && agora >= (loja.ativo_ate || 0), diasDeTesteRestantes: trialRestante, diasPagosRestantes: pagoRestante,
    fimDoAcesso: Math.max(loja.trial_fim || 0, loja.ativo_ate || 0),
    acesso: agora < Math.max(loja.trial_fim || 0, loja.ativo_ate || 0), // conta ativa (vale para o Vindex e o Vortex)
    venus: acessoLiberado(loja, agora), // a Vênus em si: pacotes sem ela não abrem a loja
    pagamentoAguardandoLiberacao: pend.n > 0, doisFatores: !!loja.totp_ativo,
  };
}
