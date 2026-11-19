// Categorias inteligentes do V-Space: a IA (DeepSeek) coloca cada app numa categoria.
//   POST /organizar  { categorias: [{id, nome}], apps: [{pacote, nome}] }  → { mapa: { "<pacote>": "<idCategoria>" } }
// Só recebe NOMES de apps e de categorias: nada de dados pessoais, uso do aparelho ou conteúdo. A chave fica aqui no servidor.
// Só responde para quem entrou com o Vetorial ID (padrão da suíte); ainda assim é limitada por tamanho e por pedidos por hora de cada conta.
import { deepseek, gemini } from "./ia/provedores.js";
import { validarSessao } from "./id/conta.js";
import { appLiberadoParaConta, MSG_SEM_ACESSO } from "./id/acesso.js";

export const ehRotaOrganizar = (c) => c === "/organizar";

const CABECALHOS = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: CABECALHOS });
const MAX_CORPO = 80_000;
const MAX_APPS = 400;
const MAX_CATEGORIAS = 14;
const JANELA_MS = 60 * 60_000;
const LIMITE_POR_CONTA = 30;
const TAM_LOTE = 40;

const contagem = new Map();
export function passouDoLimite(chave, limite, agora = Date.now()) {
  const l = (contagem.get(chave) ?? []).filter((t) => agora - t < JANELA_MS);
  if (l.length >= limite) { contagem.set(chave, l); return true; }
  l.push(agora);
  contagem.set(chave, l);
  if (contagem.size > 5000) for (const [k, v] of contagem) if (!v.some((t) => agora - t < JANELA_MS)) contagem.delete(k);
  return false;
}
export const _zerarLimites = () => contagem.clear();

const texto = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max) : "");

export function limparPedido(p) {
  const categorias = (Array.isArray(p?.categorias) ? p.categorias : []).slice(0, MAX_CATEGORIAS)
    .map((c) => ({ id: texto(c?.id, 30), nome: texto(c?.nome, 30) })).filter((c) => /^[a-z0-9_-]{1,30}$/.test(c.id) && c.nome);
  const vistos = new Set();
  const apps = (Array.isArray(p?.apps) ? p.apps : []).slice(0, MAX_APPS)
    .map((a) => ({ pacote: typeof a?.pacote === "string" ? a.pacote.slice(0, 200) : "", nome: texto(a?.nome, 40) }))
    .filter((a) => /^[A-Za-z0-9_.]{1,200}$/.test(a.pacote) && a.nome && !vistos.has(a.pacote) && vistos.add(a.pacote));
  return { categorias, apps };
}

export function extrairJson(t) {
  const s = String(t ?? "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { const o = JSON.parse(s.slice(i, j + 1)); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch { return null; }
}

export function montarPrompt(categorias, apps) {
  const reserva = categorias.find((c) => c.id === "ferramentas") ?? categorias[0];
  return {
    sistema: `Você organiza os aplicativos de um celular Android brasileiro em categorias. Use SOMENTE estes ids: ${categorias.map((c) => `${c.id} (${c.nome})`).join("; ")}. ` +
      `Cada app tem um número. Responda SOMENTE com um objeto JSON {"<número>":"<id da categoria>"} com TODOS os números. Na dúvida, use "${reserva.id}". Navegadores, e-mail e mensagens ficam em social; bancos e carteiras em finanças; apps de governo e de trabalho em produtividade.`,
    mensagens: [{ papel: "user", texto: apps.map((a, i) => `${i + 1}|${a.nome}|${a.pacote}`).join("\n") }]
  };
}

/** Transforma a resposta do modelo em { pacote: categoria }: ignora número que não existe e categoria inventada. */
export function validarMapa(o, categorias, apps) {
  const ids = new Set(categorias.map((c) => c.id));
  const mapa = {};
  if (!o) return mapa;
  for (const [n, id] of Object.entries(o)) {
    const i = Number(n) - 1;
    if (Number.isInteger(i) && i >= 0 && i < apps.length && typeof id === "string" && ids.has(id)) mapa[apps[i].pacote] = id;
  }
  return mapa;
}

export async function tratarOrganizar(req, env, ctx, opcoes = {}) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CABECALHOS, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, authorization" } });
  if (req.method !== "POST") return json({ error: "método não permitido" }, 405);
  let quem;
  try { quem = await (opcoes.validar ?? validarSessao)(env, req); } catch (e) { return json({ error: e?.message || "Entre de novo com o seu Vetorial ID." }, e?.status === 409 ? 409 : 401); }
  if (!(await (opcoes.liberado ?? appLiberadoParaConta)(env, quem.usuario, "vspace"))) return json({ error: MSG_SEM_ACESSO }, 402);
  const tam = Number(req.headers.get("content-length") ?? 0);
  if (tam > MAX_CORPO) return json({ error: "pedido grande demais" }, 413);
  let p;
  try { const bruto = await req.text(); if (bruto.length > MAX_CORPO) return json({ error: "pedido grande demais" }, 413); p = JSON.parse(bruto); } catch { return json({ error: "pedido inválido" }, 400); }
  const { categorias, apps } = limparPedido(p);
  if (categorias.length < 2 || !apps.length) return json({ error: "pedido vazio" }, 400);

  const chave = `id:${quem.usuario?.id ?? "?"}`;
  const limite = LIMITE_POR_CONTA;
  if (passouDoLimite(chave, limite, opcoes.agora)) return json({ error: "muitos pedidos; tente de novo mais tarde" }, 429);

  try {
    // Lotes pequenos em paralelo: a resposta de cada um é curta (rápida) e uma falha não derruba os outros.
    const lotes = [];
    for (let i = 0; i < apps.length; i += TAM_LOTE) lotes.push(apps.slice(i, i + TAM_LOTE));
    const principal = opcoes.ia ?? deepseek;
    const reserva = opcoes.ia ? null : gemini;
    const resultados = await Promise.allSettled(lotes.map(async (lote) => {
      const { sistema, mensagens } = montarPrompt(categorias, lote);
      const pedido = { tarefa: "texto", sistema, mensagens, maxTokens: 200 + lote.length * 14, temperatura: 0, tempo: 20_000 };
      let r;
      try { r = await principal(env, pedido); } catch (e) { if (!reserva) throw e; console.error("organizar principal", e?.message); try { r = await reserva(env, pedido); } catch (g) { throw Object.assign(new Error(`${e?.message} > ${g?.message}`), { provedor: "ia", status: g?.status ?? e?.status }); } }
      return validarMapa(extrairJson(r.texto), categorias, lote);
    }));
    const mapa = {};
    let falhas = 0, semChave = false;
    const motivos = [];
    for (const r of resultados) {
      if (r.status === "fulfilled") Object.assign(mapa, r.value);
      else { falhas++; motivos.push(`${r.reason?.provedor ?? "ia"}:${r.reason?.status ?? 0}:${String(r.reason?.message ?? "").slice(0, 90)}`); if (r.reason?.status === 503 || /sem_chave/.test(String(r.reason?.message))) semChave = true; console.error("organizar lote", r.reason?.message); }
    }
    if (falhas === lotes.length) {
      if (semChave) return json({ error: "a IA ainda não está configurada no servidor" }, 503);
      return json({ error: "a IA não respondeu agora", detalhe: [...new Set(motivos)].slice(0, 3).join(" | ") }, 502);
    }
    return json({ mapa });
  } catch (e) {
    if (e?.status === 503 || /sem_chave/.test(String(e?.message))) return json({ error: "a IA ainda não está configurada no servidor" }, 503);
    console.error("organizar", e?.message);
    return json({ error: "a IA não respondeu agora" }, 502);
  }
}
