// Categorias inteligentes do V-Space: a IA (DeepSeek) coloca cada app numa categoria.
//   POST /organizar  { categorias: [{id, nome}], apps: [{pacote, nome}] }  → { mapa: { "<pacote>": "<idCategoria>" } }
// Só recebe NOMES de apps e de categorias: nada de dados pessoais, uso do aparelho ou conteúdo. A chave fica aqui no servidor.
// O V-Space não tem login, então o freio é por endereço (poucos pedidos por hora) e por tamanho; quem tiver sessão do Vetorial ID tem limite maior.
import { deepseek } from "./ia/provedores.js";
import { validarSessao } from "./id/conta.js";

export const ehRotaOrganizar = (c) => c === "/organizar";

const CABECALHOS = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: CABECALHOS });
const MAX_CORPO = 80_000;
const MAX_APPS = 400;
const MAX_CATEGORIAS = 14;
const JANELA_MS = 60 * 60_000;
const LIMITE_ANONIMO = 6;
const LIMITE_COM_ID = 30;

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
  const tam = Number(req.headers.get("content-length") ?? 0);
  if (tam > MAX_CORPO) return json({ error: "pedido grande demais" }, 413);
  let p;
  try { const bruto = await req.text(); if (bruto.length > MAX_CORPO) return json({ error: "pedido grande demais" }, 413); p = JSON.parse(bruto); } catch { return json({ error: "pedido inválido" }, 400); }
  const { categorias, apps } = limparPedido(p);
  if (categorias.length < 2 || !apps.length) return json({ error: "pedido vazio" }, 400);

  let chave = req.headers.get("cf-connecting-ip") ?? "anonimo";
  let limite = LIMITE_ANONIMO;
  if (req.headers.get("authorization")) {
    try { const q = await (opcoes.validar ?? validarSessao)(env, req); chave = `id:${q.usuario?.id ?? "?"}`; limite = LIMITE_COM_ID; } catch { /* sessão ruim: vale como anônimo */ }
  }
  if (passouDoLimite(chave, limite, opcoes.agora)) return json({ error: "muitos pedidos; tente de novo mais tarde" }, 429);

  try {
    const { sistema, mensagens } = montarPrompt(categorias, apps);
    const r = await (opcoes.ia ?? deepseek)(env, { tarefa: "texto", sistema, mensagens, maxTokens: Math.min(6000, 200 + apps.length * 14), temperatura: 0 });
    return json({ mapa: validarMapa(extrairJson(r.texto), categorias, apps) });
  } catch (e) {
    if (e?.status === 503 || /sem_chave/.test(String(e?.message))) return json({ error: "a IA ainda não está configurada no servidor" }, 503);
    console.error("organizar", e?.message);
    return json({ error: "a IA não respondeu agora" }, 502);
  }
}
