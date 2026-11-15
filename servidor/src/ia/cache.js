// Cache vetorial (semântico) em duas camadas:
//   1) exato:      KV, chave = hash do texto normalizado (sem custo de embedding)
//   2) semântico:  Workers AI (embedding) + Vectorize, aceito só com similaridade alta
//                  e os MESMOS números (evita "10 unidades" servir resposta de "100 unidades").
// Tudo opcional: sem os bindings CACHE/VETORES/AI, o cache simplesmente não atua.
import { normalizar } from "./roteador.js";

const RE_TEMPO_REAL = /\b(hoje|agora|neste momento|atual|atuais|ultim[oa]s?|esta semana|este mes|cotacao|noticias?|placar|clima|tempo em)\b/;

export async function sha(texto, tamanho = 40) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, tamanho);
}

export const numeros = (norm) => (norm.match(/\d+(?:[.,]\d+)?/g) ?? []).join("|");

/** Só vale a pena (e é seguro) cachear pergunta curta, de um turno, sem anexo e que não dependa de "agora". */
export function cacheViavel({ texto, turnosUsuario, temAnexos }) {
  if (temAnexos || turnosUsuario !== 1) return false;
  const n = normalizar(texto);
  return n.length >= 8 && n.length <= 2000 && !RE_TEMPO_REAL.test(n);
}

async function embutir(env, norm) {
  if (!env.AI) return null;
  try {
    const r = await env.AI.run(env.MODELO_EMBEDDING || "@cf/baai/bge-m3", { text: [norm.slice(0, 2000)] });
    const v = r?.data?.[0];
    return Array.isArray(v) && v.length ? v : null;
  } catch {
    return null;
  }
}

/** @returns {{acerto: null | {valor:object, tipo:"exato"|"semantico", similaridade:number}, ctx:object}} */
export async function buscarNoCache(env, { escopo, tarefa, sistema, texto }) {
  const norm = normalizar(texto);
  const ctx = { ns: await sha(`${escopo}|${tarefa}|${sistema ?? ""}`, 32), id: await sha(norm), norm, vetor: null };
  if (!env.CACHE) return { acerto: null, ctx };

  const exato = await env.CACHE.get(`e:${ctx.ns}:${ctx.id}`, "json");
  if (exato) return { acerto: { valor: exato, tipo: "exato", similaridade: 1 }, ctx };

  if (!env.VETORES) return { acerto: null, ctx };
  ctx.vetor = await embutir(env, norm);
  if (!ctx.vetor) return { acerto: null, ctx };

  const limiar = Number(env.CACHE_LIMIAR ?? 0.93);
  try {
    const r = await env.VETORES.query(ctx.vetor, { topK: 1, namespace: ctx.ns, returnMetadata: "all" });
    const m = r?.matches?.[0];
    if (m && m.score >= limiar && m.metadata?.nums === numeros(norm)) {
      const valor = await env.CACHE.get(`e:${ctx.ns}:${m.id}`, "json");
      if (valor) return { acerto: { valor, tipo: "semantico", similaridade: m.score }, ctx };
    }
  } catch {
    /* Vectorize indisponível: segue sem cache semântico */
  }
  return { acerto: null, ctx };
}

export async function gravarNoCache(env, ctx, valor) {
  if (!env.CACHE || !valor?.resposta || valor.resposta.length > 20_000) return;
  const ttl = Math.max(60, Number(env.CACHE_TTL_SEGUNDOS ?? 86400));
  await env.CACHE.put(`e:${ctx.ns}:${ctx.id}`, JSON.stringify(valor), { expirationTtl: ttl });
  if (env.VETORES && ctx.vetor) {
    await env.VETORES.upsert([{ id: ctx.id, namespace: ctx.ns, values: ctx.vetor, metadata: { nums: numeros(ctx.norm) } }]);
  }
}
