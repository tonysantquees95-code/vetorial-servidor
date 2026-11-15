// CORS: só origens da lista ORIGENS_PERMITIDAS (separadas por vírgula). "*" libera tudo (não recomendado).
const METODOS = "GET, POST, OPTIONS";
const CABECALHOS = "content-type, authorization, x-venus-escopo";
const EXPOSTOS = "x-venus-provedor, x-venus-cache";

export const origensPermitidas = (env) =>
  String(env.ORIGENS_PERMITIDAS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Sem cabeçalho Origin (chamada de servidor, curl) passa; o navegador sempre envia. */
export function origemOk(origem, env) {
  if (!origem) return true;
  const lista = origensPermitidas(env);
  return lista.includes("*") || lista.includes(origem);
}

function cabecalhosCors(origem, env) {
  const h = { vary: "Origin" };
  if (origem && origemOk(origem, env)) {
    h["access-control-allow-origin"] = origensPermitidas(env).includes("*") ? "*" : origem;
    h["access-control-expose-headers"] = EXPOSTOS;
  }
  return h;
}

export function preflight(origem, env) {
  if (!origem || !origemOk(origem, env)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...cabecalhosCors(origem, env),
      "access-control-allow-methods": METODOS,
      "access-control-allow-headers": CABECALHOS,
      "access-control-max-age": "86400"
    }
  });
}

export function comCors(resposta, origem, env) {
  const r = new Response(resposta.body, resposta); // copia com cabeçalhos mutáveis
  for (const [k, v] of Object.entries(cabecalhosCors(origem, env))) r.headers.set(k, v);
  return r;
}
