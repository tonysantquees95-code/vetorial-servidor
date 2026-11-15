// Site próprio do lojista: qualquer loja que siga este contrato simples (REST + chave) conecta sem código novo.
//   GET  {url}/produtos            → [{id, sku, nome, preco, estoque, oculto?, categoria?, atributos?, imagem?, promocao?}]
//   GET  {url}/pedidos?desde=<ms>  → [{id, status, total, taxa?, criado, itens:[{id, sku, quantidade}]}]
//   GET  {url}/pedidos/{id}
//   POST {url}/estoque             → {id, sku, estoque}
//   POST {url}/webhooks            → {url}   (opcional: a loja passa a avisar o servidor)
// Autenticação: cabeçalho "Authorization: Bearer <chave>". Webhook de volta: "x-venus-assinatura" = HMAC-SHA256 do corpo com a chave.
import { centavos, ErroCanal, pedir } from "./comum.js";
import { hmacHex, iguais } from "../loja/cripto.js";

const cab = (c) => ({ Authorization: `Bearer ${c.chave}`, "Content-Type": "application/json", "User-Agent": "Venus (venus-servidor)" });
const base = (c) => c.url.replace(/\/+$/, "");
const STATUS = { new: "novo", novo: "novo", paid: "pago", pago: "pago", cancelled: "cancelado", canceled: "cancelado", cancelado: "cancelado",
  returned: "devolvido", devolvido: "devolvido", refunded: "reembolsado", reembolsado: "reembolsado" };

export function urlValida(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return false;
    const h = x.hostname;
    if (h === "localhost" || /^(\d+\.){3}\d+$/.test(h) || h.endsWith(".local") || h.endsWith(".internal") || h.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}

export const proprio = {
  id: "proprio",
  nome: "Site próprio",

  async conectarDireto(_env, { url, chave }) {
    if (!urlValida(url)) throw new ErroCanal("url_invalida", "Informe o endereço https do seu site.", 400);
    if (!chave || String(chave).length < 8) throw new ErroCanal("dados_faltando", "Informe a chave de acesso (mínimo 8 caracteres).", 400);
    const c = { url: String(url), chave: String(chave) };
    await pedir(`${base(c)}/produtos?limite=1`, { headers: cab(c) });
    return { credenciais: c, conta: new URL(c.url).hostname };
  },

  async buscarProdutos(c) {
    const r = await pedir(`${base(c)}/produtos`, { headers: cab(c) });
    const lista = Array.isArray(r) ? r : r.produtos || [];
    return lista.map((p) => ({
      ref: String(p.id ?? p.sku), variante: "", sku: p.sku ? String(p.sku) : "", nome: String(p.nome || p.sku || p.id),
      preco_centavos: p.preco === null || p.preco === undefined ? null : centavos(p.preco),
      promocao_centavos: p.promocao ? centavos(p.promocao) : null,
      estoque: Number(p.estoque) || 0, oculto: Boolean(p.oculto), categoria: String(p.categoria || ""),
      atributos: p.atributos && typeof p.atributos === "object" ? p.atributos : {}, imagem: String(p.imagem || ""),
    }));
  },

  normalizarPedido(o) {
    return {
      ref: String(o.id), status: STATUS[String(o.status || "").toLowerCase()] || "novo",
      total_centavos: centavos(o.total) ?? 0, taxa_centavos: centavos(o.taxa) ?? 0, criado: Number(o.criado) || Date.now(),
      itens: (o.itens || []).map((i) => ({ ref: String(i.id ?? i.sku), variante: "", sku: i.sku || "", quantidade: Number(i.quantidade) || 0 })),
    };
  },

  async buscarPedidos(c, desde = 0) {
    const r = await pedir(`${base(c)}/pedidos?desde=${desde}`, { headers: cab(c) });
    return (Array.isArray(r) ? r : r.pedidos || []).map((o) => this.normalizarPedido(o));
  },

  async buscarPedido(c, ref) {
    const o = await pedir(`${base(c)}/pedidos/${encodeURIComponent(ref)}`, { headers: cab(c) }, { aceitar404: true });
    return o ? this.normalizarPedido(o) : null;
  },

  async ajustarEstoque(c, { ref }, quantidade, sku = "") {
    await pedir(`${base(c)}/estoque`, { method: "POST", headers: cab(c), body: JSON.stringify({ id: ref, sku, estoque: Math.max(0, Math.trunc(quantidade)) }) });
  },

  async registrarWebhooks(c, urlBase) {
    await pedir(`${base(c)}/webhooks`, { method: "POST", headers: cab(c), body: JSON.stringify({ url: urlBase }) }).catch(() => {});
  },
  async removerWebhooks() {},

  async lerWebhook(_env, c, headers, corpoTexto) {
    if (!iguais(headers.get("x-venus-assinatura") || "", await hmacHex(c.chave, corpoTexto))) throw new ErroCanal("assinatura", "Assinatura inválida.", 401);
    const d = JSON.parse(corpoTexto);
    return d.pedido ? { pedido: String(d.pedido), evento: String(d.evento || "pedido") } : null;
  },
};
