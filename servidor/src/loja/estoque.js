// Estoque central e Reverse-Sync: venda baixa o saldo e avisa os outros canais; cancelamento, devolução ou
// reembolso repõe o saldo e atualiza todos os canais. Cada baixa ou reposição acontece uma única vez por item de pedido.
import { conector } from "../canais/index.js";
import { STATUS_DEVOLVIDOS } from "../canais/comum.js";
import { cifrar, decifrar } from "./cripto.js";

const VENDIDOS = new Set(["novo", "pago"]);

async function acharProduto(env, loja, canalId, plataforma, item) {
  const v = await env.DB.prepare("SELECT produto FROM vinculos WHERE canal = ? AND ref = ? AND variante = ?").bind(canalId, item.ref, item.variante || "").first();
  if (v) return v.produto;
  if (item.sku) {
    const p = await env.DB.prepare("SELECT id FROM produtos WHERE loja = ? AND sku = ?").bind(loja, item.sku).first();
    if (p) return p.id;
  }
  return null;
}

/** Credenciais abertas do canal, renovando o token do Mercado Livre quando preciso. */
export async function credenciais(env, canal) {
  let c = await decifrar(env, canal.credenciais);
  const con = conector(canal.plataforma);
  if (con.garantirAcesso) {
    const novo = await con.garantirAcesso(env, c);
    if (novo !== c) {
      c = novo;
      await env.DB.prepare("UPDATE canais SET credenciais = ? WHERE id = ?").bind(await cifrar(env, c), canal.id).run();
    }
  }
  return c;
}

/** Manda o saldo central do produto para os canais ligados a ele (menos o de origem, se informado). */
export async function empurrarEstoque(env, produtoId, { excluirCanal = null } = {}) {
  const p = await env.DB.prepare("SELECT id, sku, estoque FROM produtos WHERE id = ?").bind(produtoId).first();
  if (!p) return [];
  const { results } = await env.DB.prepare(
    "SELECT v.ref, v.variante, c.* FROM vinculos v JOIN canais c ON c.id = v.canal WHERE v.produto = ?"
  ).bind(produtoId).all();
  const saida = [];
  for (const l of results) {
    if (l.id === excluirCanal) continue;
    try {
      const c = await credenciais(env, l);
      await conector(l.plataforma).ajustarEstoque(c, { ref: l.ref, variante: l.variante }, p.estoque, p.sku);
      saida.push({ canal: l.id, plataforma: l.plataforma, ok: true });
    } catch (e) {
      await env.DB.prepare("UPDATE canais SET status = ? WHERE id = ?").bind(`erro: ${String(e.message || e).slice(0, 120)}`, l.id).run();
      saida.push({ canal: l.id, plataforma: l.plataforma, ok: false, erro: String(e.message || e).slice(0, 120) });
    }
  }
  return saida;
}

/**
 * Registra o pedido e aplica a baixa/reposição. Devolve o que mudou, para o app mostrar.
 * Chamado pelo webhook (tempo real) e pela sincronização (recuperação do que o webhook perdeu).
 */
export async function aplicarPedido(env, canal, pedido, { empurrar = true, agora = Date.now(), historico = false } = {}) {
  const antes = await env.DB.prepare("SELECT status FROM pedidos WHERE canal = ? AND ref = ?").bind(canal.id, pedido.ref).first();
  await env.DB.prepare(
    "INSERT INTO pedidos (loja, canal, ref, status, total_centavos, taxa_centavos, itens, criado, atualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(canal, ref) DO UPDATE SET status = excluded.status, total_centavos = excluded.total_centavos, taxa_centavos = excluded.taxa_centavos, itens = excluded.itens, atualizado = excluded.atualizado"
  ).bind(canal.loja, canal.id, pedido.ref, pedido.status, pedido.total_centavos, pedido.taxa_centavos, JSON.stringify(pedido.itens), pedido.criado, agora).run();

  const mudancas = [];
  const paraEmpurrar = new Map(); // produto → canal a excluir (null = todos)
  const devolvido = STATUS_DEVOLVIDOS.has(pedido.status);
  for (let i = 0; i < pedido.itens.length; i++) {
    const item = pedido.itens[i];
    if (!(item.quantidade > 0)) continue;
    const produto = await acharProduto(env, canal.loja, canal.id, canal.plataforma, item);
    if (!produto) continue;
    const chaveVenda = `venda:${canal.id}:${pedido.ref}:${i}`;
    const chaveRepor = `reposicao:${canal.id}:${pedido.ref}:${i}`;
    if (VENDIDOS.has(pedido.status)) {
      const r = await env.DB.prepare("INSERT OR IGNORE INTO eventos_estoque (chave, loja, canal, tipo, produto, quantidade, criado) VALUES (?, ?, ?, 'venda', ?, ?, ?)")
        .bind(chaveVenda, canal.loja, canal.id, produto, item.quantidade, agora).run();
      if (r.meta.changes === 1 && !historico) { // histórico: o saldo importado já reflete a venda; só guarda para poder repor depois
        await env.DB.prepare("UPDATE produtos SET estoque = MAX(0, estoque - ?), atualizado = ? WHERE id = ?").bind(item.quantidade, agora, produto).run();
        mudancas.push({ tipo: "baixa", produto, quantidade: item.quantidade });
        paraEmpurrar.set(produto, canal.id); // o canal de origem já baixou sozinho
      }
    } else if (devolvido) {
      const vendeu = await env.DB.prepare("SELECT 1 AS x FROM eventos_estoque WHERE chave = ?").bind(chaveVenda).first();
      if (!vendeu) continue; // a venda nunca baixou o saldo aqui: não há o que repor
      const r = await env.DB.prepare("INSERT OR IGNORE INTO eventos_estoque (chave, loja, canal, tipo, produto, quantidade, criado) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(chaveRepor, canal.loja, canal.id, pedido.status === "cancelado" ? "cancelamento" : pedido.status === "devolvido" ? "devolucao" : "reembolso", produto, item.quantidade, agora).run();
      if (r.meta.changes === 1) {
        await env.DB.prepare("UPDATE produtos SET estoque = estoque + ?, atualizado = ? WHERE id = ?").bind(item.quantidade, agora, produto).run();
        mudancas.push({ tipo: "reposicao", produto, quantidade: item.quantidade });
        paraEmpurrar.set(produto, null); // todos, inclusive a origem (que pode não ter devolvido o item)
      }
    }
  }
  const envios = [];
  if (empurrar) for (const [produto, excluir] of paraEmpurrar) envios.push(...(await empurrarEstoque(env, produto, { excluirCanal: excluir })));
  return { anterior: antes?.status || null, status: pedido.status, mudancas, envios };
}
