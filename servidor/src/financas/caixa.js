// Vênus → Vyntem. Só entram vendas PAGAS e confirmadas (pedido aguardando pagamento não entra).
//   POST /financas/caixa   { itens: [{ ref, tipo: "entrada"|"estorno", valorCentavos, cliente, pedido, quando }] }  (a Vênus envia)
//   GET  /financas/caixa?desde=<seq>   → { itens: [{ seq, ref, tipo, valorCentavos, cliente, pedido, data }], proximo }  (o Vyntem busca)
// Dinheiro em CENTAVOS; `data` é AAAA-MM-DD no fuso de Brasília. Idempotente por (usuário, ref, tipo).
import { ErroId, validarSessao } from "../id/conta.js";
import { appLiberadoParaConta, MSG_SEM_ACESSO } from "../id/acesso.js";

export const ehRotaCaixa = (c) => c === "/financas/caixa";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
const MAX_ITENS = 100;
const MAX_VALOR = 100_000_000_00;
const POR_PAGINA = 200;

export const dataDeBrasilia = (ms) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const SEPARADORES = new RegExp(String.fromCharCode(8232) + "|" + String.fromCharCode(8233), "g");
const limpa = (v, max) => String(v ?? "").replace(/[\x00-\x1f]/g, " ").replace(SEPARADORES, " ").trim().slice(0, max);

/** Confere um item enviado pela Vênus. Devolve o item limpo ou null (item inválido é ignorado, não derruba o lote). */
export function limparItem(it, agora = Date.now()) {
  if (!it || typeof it !== "object") return null;
  const ref = limpa(it.ref, 60);
  if (!/^[\w:.\-]{1,60}$/.test(ref)) return null;
  const tipo = it.tipo === "estorno" ? "estorno" : it.tipo === "entrada" ? "entrada" : null;
  const valor = it.valorCentavos;
  if (!tipo || !Number.isInteger(valor) || valor <= 0 || valor > MAX_VALOR) return null;
  const quando = Number.isFinite(it.quando) ? Math.round(it.quando) : agora;
  if (quando < 1_600_000_000_000 || quando > agora + 86_400_000) return null;
  return { ref, tipo, valorCentavos: valor, cliente: limpa(it.cliente, 60), pedido: limpa(it.pedido, 20), quando };
}

export async function receberEntradas(env, usuario, itens, agora = Date.now()) {
  if (!Array.isArray(itens)) throw new ErroId(400, "itens_invalidos", "Envie a lista de vendas em \"itens\".");
  if (itens.length > MAX_ITENS) throw new ErroId(413, "muitos_itens", `Envie no máximo ${MAX_ITENS} vendas por vez.`);
  let novos = 0, repetidos = 0, ignorados = 0;
  for (const bruto of itens) {
    const it = limparItem(bruto, agora);
    if (!it) { ignorados++; continue; }
    if (it.tipo === "estorno") { // só estorna o que já entrou
      const entrou = await env.DB.prepare("SELECT 1 AS x FROM caixa_entradas WHERE usuario = ? AND ref = ? AND tipo = 'entrada'").bind(usuario, it.ref).first();
      if (!entrou) { ignorados++; continue; }
    }
    const r = await env.DB.prepare("INSERT OR IGNORE INTO caixa_entradas (usuario, ref, tipo, valor_centavos, cliente, pedido, quando, criado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(usuario, it.ref, it.tipo, it.valorCentavos, it.cliente, it.pedido, it.quando, agora).run();
    if ((r.meta?.changes ?? 0) > 0) novos++; else repetidos++;
  }
  return { ok: true, novos, repetidos, ignorados };
}

export async function listarEntradas(env, usuario, desde = 0) {
  const { results } = await env.DB.prepare("SELECT seq, ref, tipo, valor_centavos, cliente, pedido, quando FROM caixa_entradas WHERE usuario = ? AND seq > ? ORDER BY seq LIMIT ?")
    .bind(usuario, Math.max(0, Math.floor(desde) || 0), POR_PAGINA).all();
  const itens = results.map((r) => ({ seq: r.seq, ref: r.ref, tipo: r.tipo, valorCentavos: r.valor_centavos, cliente: r.cliente, pedido: r.pedido, data: dataDeBrasilia(r.quando) }));
  return { itens, proximo: itens.length ? itens[itens.length - 1].seq : Math.max(0, Math.floor(desde) || 0), maisPaginas: itens.length === POR_PAGINA };
}

export async function tratarCaixa(req, env, url) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const ctx = await validarSessao(env, req, {});
    if (req.method === "POST") {
      if (!(await appLiberadoParaConta(env, ctx.usuario, "venus"))) return json({ error: MSG_SEM_ACESSO }, 402);
      const t = await req.text();
      if (t.length > 60_000) throw new ErroId(413, "corpo_grande", "Pedido grande demais.");
      let d; try { d = JSON.parse(t || "{}"); } catch { throw new ErroId(400, "json_invalido", "O corpo precisa ser um JSON válido."); }
      return json(await receberEntradas(env, ctx.usuario.id, d?.itens));
    }
    if (req.method === "GET") return json(await listarEntradas(env, ctx.usuario.id, Number(url.searchParams.get("desde")) || 0));
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroId) return json({ error: e.message, codigo: e.codigo }, e.status);
    console.error("caixa", e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
