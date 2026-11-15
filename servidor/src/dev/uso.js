// Tráfego do Worker, uso das IAs e séries do BI do Painel Dev.
const HORA = 3_600_000;
const DIA = 24 * HORA;
const FUSO_BR = -3 * HORA;

/** Tira ids do caminho para agrupar rotas iguais (/loja/produtos/123 → /loja/produtos/:n). */
export const normalizarRota = (c) =>
  String(c || "/").replace(/\/vl_[a-f0-9]+/gi, "/:id").replace(/\/[a-f0-9]{12,}/gi, "/:id").replace(/\/\d+/g, "/:n").slice(0, 80);

export async function registrarTrafego(env, { metodo, caminho, status, ms, origem }, agora = Date.now()) {
  const c = String(caminho || "/");
  if (c === "/dev" || c.startsWith("/dev/") || c === "/saude") return; // o próprio painel e o ping não entram
  let o = "";
  try { o = origem ? new URL(origem).host.slice(0, 40) : ""; } catch { o = String(origem).slice(0, 40); }
  await env.DB.prepare("INSERT INTO dev_trafego (quando, metodo, rota, status, ms, origem) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(agora, String(metodo).slice(0, 8), normalizarRota(c), status | 0, Math.max(0, Math.round(ms)), o).run();
}

export async function limparTrafego(env, agora = Date.now()) {
  await env.DB.prepare("DELETE FROM dev_trafego WHERE quando < ?").bind(agora - 3 * DIA).run();
  await env.DB.prepare("DELETE FROM dev_uso_ia WHERE hora < ?").bind(Math.floor((agora - 120 * DIA) / HORA)).run();
}

export function percentil(valores, p) {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)];
}

export async function listarTrafego(env, { desde = 0, limite = 60 } = {}, agora = Date.now()) {
  const n = Math.min(200, Math.max(1, limite | 0));
  const { results } = desde > 0
    ? await env.DB.prepare("SELECT id, quando, metodo, rota, status, ms, origem FROM dev_trafego WHERE id > ? ORDER BY id DESC LIMIT ?").bind(desde, n).all()
    : await env.DB.prepare("SELECT id, quando, metodo, rota, status, ms, origem FROM dev_trafego ORDER BY id DESC LIMIT ?").bind(n).all();
  const { results: janela } = await env.DB.prepare("SELECT status, ms, rota FROM dev_trafego WHERE quando > ?").bind(agora - 5 * 60_000).all();
  const porRota = {};
  for (const j of janela) porRota[j.rota] = (porRota[j.rota] || 0) + 1;
  return {
    agora,
    ultimo: results.length ? results[0].id : desde,
    itens: results,
    ultimos5min: {
      total: janela.length,
      erros: janela.filter((j) => j.status >= 500).length,
      recusados: janela.filter((j) => j.status >= 400 && j.status < 500).length,
      p50: percentil(janela.map((j) => j.ms), 50),
      p95: percentil(janela.map((j) => j.ms), 95),
      rotas: Object.entries(porRota).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([rota, n]) => ({ rota, n })),
    },
  };
}

// ------------------------------------------------------------------ uso das IAs
const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);

/** Groq/DeepSeek (usage) e Gemini (usageMetadata) viram {entrada, saida}. */
export function tokensDoUso(uso) {
  if (!uso || typeof uso !== "object") return { entrada: 0, saida: 0 };
  return { entrada: num(uso.prompt_tokens ?? uso.promptTokenCount), saida: num(uso.completion_tokens ?? uso.candidatesTokenCount) };
}

export async function registrarUso(env, { provedor, tarefa, uso, erro = false, cache = false }, agora = Date.now()) {
  if (!env.DB || !provedor) return;
  const t = tokensDoUso(uso);
  await env.DB.prepare(
    "INSERT INTO dev_uso_ia (hora, provedor, tarefa, requisicoes, tokens_entrada, tokens_saida, erros, cache) VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(hora, provedor, tarefa) DO UPDATE SET requisicoes = requisicoes + excluded.requisicoes, tokens_entrada = tokens_entrada + excluded.tokens_entrada, tokens_saida = tokens_saida + excluded.tokens_saida, erros = erros + excluded.erros, cache = cache + excluded.cache",
  ).bind(Math.floor(agora / HORA), provedor, String(tarefa || "conversa").slice(0, 20), erro || cache ? 0 : 1, t.entrada, t.saida, erro ? 1 : 0, cache ? 1 : 0).run();
}

// ------------------------------------------------------------------ provedores ligados/desligados pelo painel
let memo = { ate: 0, desligados: new Set() };
export async function provedoresDesligados(env, agora = Date.now()) {
  if (!env.DB) return new Set();
  if (agora < memo.ate) return memo.desligados;
  try {
    const { results } = await env.DB.prepare("SELECT chave, valor FROM dev_config WHERE chave LIKE 'provedor:%'").all();
    memo = { ate: agora + 20_000, desligados: new Set(results.filter((r) => r.valor === "0").map((r) => r.chave.slice(9))) };
  } catch {
    memo = { ate: agora + 5_000, desligados: new Set() };
  }
  return memo.desligados;
}
export const esquecerProvedores = () => { memo = { ate: 0, desligados: new Set() }; };

// ------------------------------------------------------------------ séries do BI
export const diaBR = (ms) => new Date(ms + FUSO_BR).toISOString().slice(0, 10);

/** Lista de dias (mais antigo primeiro) terminando em hoje, no horário de Brasília. */
export function ultimosDias(n, agora = Date.now()) {
  return Array.from({ length: n }, (_, i) => diaBR(agora - (n - 1 - i) * DIA));
}

export function somarPorDia(dias, linhas, quando, valor = () => 1) {
  const idx = new Map(dias.map((d, i) => [d, i]));
  const s = dias.map(() => 0);
  for (const l of linhas) {
    const i = idx.get(diaBR(quando(l)));
    if (i !== undefined) s[i] += valor(l);
  }
  return s;
}

export async function bi(env, dias = 30, agora = Date.now()) {
  const n = Math.min(90, Math.max(7, dias | 0));
  const lista = ultimosDias(n, agora);
  const inicio = agora - (n + 1) * DIA;
  const q = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
  const [pag, lojas, users, ia, tot, pagTot] = await Promise.all([
    q("SELECT atualizado, valor_centavos FROM pagamentos WHERE status IN ('pago', 'liberado') AND atualizado > ?", inicio),
    q("SELECT criado FROM lojas WHERE criado > ? AND id IN (SELECT loja FROM usuarios WHERE loja IS NOT NULL)", inicio),
    q("SELECT criado FROM usuarios WHERE criado > ?", inicio),
    q("SELECT hora, provedor, requisicoes, tokens_entrada, tokens_saida, erros, cache FROM dev_uso_ia WHERE hora > ?", Math.floor(inicio / HORA)),
    q("SELECT COUNT(*) AS total, SUM(CASE WHEN (plano = 'trial' AND trial_fim > ?) OR ativo_ate > ? THEN 1 ELSE 0 END) AS ativas, SUM(CASE WHEN ativo_ate > ? THEN 1 ELSE 0 END) AS pagantes FROM lojas WHERE id IN (SELECT loja FROM usuarios WHERE loja IS NOT NULL)", agora, agora, agora),
    q("SELECT COUNT(*) AS n, COALESCE(SUM(valor_centavos), 0) AS soma FROM pagamentos WHERE status IN ('pago', 'liberado')"),
  ]);
  const provedores = ["groq", "deepseek", "gemini"];
  const req = {}, tokens = {}, erros = {};
  for (const p of provedores) {
    const rs = ia.filter((r) => r.provedor === p);
    req[p] = somarPorDia(lista, rs, (r) => r.hora * HORA, (r) => r.requisicoes);
    tokens[p] = somarPorDia(lista, rs, (r) => r.hora * HORA, (r) => r.tokens_entrada + r.tokens_saida);
    erros[p] = somarPorDia(lista, rs, (r) => r.hora * HORA, (r) => r.erros);
  }
  const soma = (a) => a.reduce((x, y) => x + y, 0);
  const faturamento = somarPorDia(lista, pag, (r) => r.atualizado, (r) => r.valor_centavos);
  return {
    gerado: agora,
    dias: lista,
    faturamentoCentavos: faturamento,
    novosLojistas: somarPorDia(lista, lojas, (r) => r.criado),
    novasContas: somarPorDia(lista, users, (r) => r.criado),
    requisicoesIA: req,
    tokensIA: tokens,
    errosIA: erros,
    totais: {
      lojas: tot[0].total || 0,
      lojasAtivas: tot[0].ativas || 0,
      pagantes: tot[0].pagantes || 0,
      faturamentoPeriodoCentavos: soma(faturamento),
      faturamentoTotalCentavos: pagTot[0].soma || 0,
      pagamentosTotal: pagTot[0].n || 0,
      requisicoesIA: soma(provedores.map((p) => soma(req[p]))),
      tokensIA: soma(provedores.map((p) => soma(tokens[p]))),
      respostasDoCache: soma(ia.map((r) => r.cache)),
    },
  };
}
