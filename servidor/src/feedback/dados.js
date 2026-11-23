// Feedback, relato de erro e pesquisa rápida. Só guarda o que a pessoa escreveu + app, versão e plataforma (nada de conversa, chave ou senha).
import { ErroLoja } from "../loja/lojas.js";

export const APPS = { venus: "Vênus", vindex: "Vindex", vortex: "Vortex", voxix: "Voxix", drive: "Vetorial Drive", vyntem: "Vyntem", vynx: "Vynx OS", vspace: "V-Space", velox: "Velox", vetogoshi: "Vetogoshi", painel: "Painel Dev", site: "Site" };
export const PLATAFORMAS = new Set(["android", "windows", "web", "ios", "mac", "outro"]);
export const TIPOS = new Set(["problema", "ideia", "elogio", "pesquisa"]);
export const COMO_CONHECEU = { instagram: "Instagram", amigo: "Indicação de amigo ou familiar", toni: "Direto com o Toni", google: "Pesquisa no Google", video: "Vídeo ou post nas redes", outro: "Outro" };
export const AJUDA = { muito: "Ajuda muito", pouco: "Ajuda um pouco", ainda: "Ainda não ajudou" };
export const CHAMOU = { assistente: "Assistente com IA e voz", loja: "Cuidar da loja e das vendas", agenda: "Agenda de serviços", site: "Site e logo", visual: "Visual bonito", gratis: "Ser grátis para testar", simples: "Ser simples de usar", pdf: "Ferramentas de PDF", outro: "Outra coisa" };
export const INDICARIA = { sim: "Sim", talvez: "Talvez", nao: "Não" };

const limpar = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\r/g, "").trim().slice(0, n);
const dentro = (v, mapa) => (Object.prototype.hasOwnProperty.call(mapa, v) ? v : "");

export function normalizarRelato(d, aparelho = "") {
  const app = dentro(String(d.app || ""), APPS);
  if (!app) throw new ErroLoja(400, "app_invalido", "Não reconheci de qual aplicativo vem o relato.");
  const tipo = TIPOS.has(d.tipo) ? d.tipo : "";
  if (!tipo) throw new ErroLoja(400, "tipo_invalido", "Escolha o tipo: problema, ideia, elogio ou pesquisa.");
  const plataforma = PLATAFORMAS.has(d.plataforma) ? d.plataforma : "outro";
  const versao = limpar(d.versao, 20).replace(/[^\w.\-+ ]/g, "");
  const texto = limpar(d.texto, 2000);
  const contato = limpar(d.contato, 80);
  let nota = null;
  let respostas = {};
  if (tipo === "pesquisa") {
    const n = Number(d.nota);
    nota = Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
    const r = d.respostas && typeof d.respostas === "object" ? d.respostas : {};
    respostas = {
      como_conheceu: dentro(r.como_conheceu, COMO_CONHECEU), ajuda: dentro(r.ajuda, AJUDA), indicaria: dentro(r.indicaria, INDICARIA),
      chamou: (Array.isArray(r.chamou) ? r.chamou : []).map((x) => dentro(x, CHAMOU)).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 9),
      falta: limpar(r.falta, 600), por_que: limpar(r.por_que, 600),
    };
    if (nota === null && !respostas.como_conheceu && !respostas.ajuda && !respostas.indicaria && !respostas.chamou.length && !respostas.falta && !texto) throw new ErroLoja(400, "vazio", "Responda pelo menos uma pergunta.");
  } else if (texto.length < 5) {
    throw new ErroLoja(400, "texto_curto", tipo === "problema" ? "Conte o que aconteceu, em poucas palavras." : "Escreva um pouquinho mais.");
  }
  return { app, tipo, plataforma, versao, texto, contato, nota, respostas, aparelho: limpar(aparelho, 120) };
}

const LIMITE_POR_DIA = 400;
export async function registrarRelato(env, d, aparelho, agora = Date.now()) {
  const r = normalizarRelato(d, aparelho);
  const hoje = await env.DB.prepare("SELECT COUNT(*) AS n FROM feedbacks WHERE criado > ?").bind(agora - 86_400_000).first();
  if (hoje.n >= LIMITE_POR_DIA) throw new ErroLoja(429, "limite_do_dia", "Recebemos muitos relatos hoje. Tente de novo amanhã, obrigado!");
  const res = await env.DB.prepare("INSERT INTO feedbacks (criado, app, versao, plataforma, tipo, texto, nota, respostas, contato, aparelho) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(agora, r.app, r.versao, r.plataforma, r.tipo, r.texto, r.nota, JSON.stringify(r.respostas), r.contato, r.aparelho).run();
  return { ok: true, id: res.meta?.last_row_id ?? null };
}

const linha = (r) => ({ ...r, respostas: (() => { try { return JSON.parse(r.respostas || "{}"); } catch { return {}; } })() });

/** Painel Dev: lista os relatos (mais novos primeiro) e um resumo da pesquisa. */
export async function listarRelatos(env, { status = "", app = "", tipo = "", limite = 200 } = {}) {
  const onde = [], bind = [];
  if (["novo", "visto", "resolvido"].includes(status)) { onde.push("status = ?"); bind.push(status); }
  if (APPS[app]) { onde.push("app = ?"); bind.push(app); }
  if (TIPOS.has(tipo)) { onde.push("tipo = ?"); bind.push(tipo); }
  const { results } = await env.DB.prepare(`SELECT * FROM feedbacks ${onde.length ? "WHERE " + onde.join(" AND ") : ""} ORDER BY criado DESC LIMIT ?`).bind(...bind, Math.min(500, Math.max(1, limite))).all();
  const todos = (await env.DB.prepare("SELECT tipo, status, nota, respostas FROM feedbacks ORDER BY criado DESC LIMIT 2000").all()).results;
  const contar = (f) => todos.filter(f).length;
  const pesquisas = todos.filter((x) => x.tipo === "pesquisa").map((x) => ({ nota: x.nota, ...(() => { try { return JSON.parse(x.respostas); } catch { return {}; } })() }));
  const freq = (campo, mapa) => Object.entries(mapa).map(([id, nome]) => ({ id, nome, n: pesquisas.filter((p) => (Array.isArray(p[campo]) ? p[campo].includes(id) : p[campo] === id)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const notas = pesquisas.map((p) => p.nota).filter(Boolean);
  return {
    relatos: results.map(linha), apps: APPS, rotulos: { ajuda: AJUDA, indicaria: INDICARIA, chamou: CHAMOU, como_conheceu: COMO_CONHECEU },
    resumo: {
      total: todos.length, novos: contar((x) => x.status === "novo"), problemas: contar((x) => x.tipo === "problema" && x.status !== "resolvido"), ideias: contar((x) => x.tipo === "ideia"), elogios: contar((x) => x.tipo === "elogio"),
      pesquisas: pesquisas.length, notaMedia: notas.length ? Math.round((10 * notas.reduce((s, n) => s + n, 0)) / notas.length) / 10 : null,
      comoConheceu: freq("como_conheceu", COMO_CONHECEU), ajuda: freq("ajuda", AJUDA), chamou: freq("chamou", CHAMOU), indicaria: freq("indicaria", INDICARIA),
    },
  };
}

export async function marcarRelato(env, id, { status, resposta_dev }) {
  if (!["novo", "visto", "resolvido"].includes(status)) throw new ErroLoja(400, "status_invalido", "Status inválido.");
  const r = await env.DB.prepare("UPDATE feedbacks SET status = ?, resposta_dev = ? WHERE id = ?").bind(status, limpar(resposta_dev, 500), Number(id)).run();
  if (!r.meta?.changes) throw new ErroLoja(404, "nao_encontrado", "Relato não encontrado.");
  return { ok: true };
}
