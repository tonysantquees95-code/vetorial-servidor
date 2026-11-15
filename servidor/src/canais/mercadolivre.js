// Mercado Livre: OAuth (com renovação), anúncios, pedidos, estoque e notificações.
import { centavos, ErroCanal, pedir } from "./comum.js";

const API = "https://api.mercadolibre.com";
const cab = (c) => ({ Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" });

export const mercadolivre = {
  id: "mercadolivre",
  nome: "Mercado Livre",

  urlDeAutorizacao(env, state, redirect) {
    if (!env.ML_APP_ID) throw new ErroCanal("sem_app", "O Mercado Livre ainda não foi configurado neste servidor.", 503);
    return `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${env.ML_APP_ID}&redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}`;
  },

  async _token(env, corpo) {
    if (!env.ML_APP_ID || !env.ML_APP_SECRET) throw new ErroCanal("sem_app", "O Mercado Livre ainda não foi configurado neste servidor.", 503);
    const r = await pedir(`${API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: env.ML_APP_ID, client_secret: env.ML_APP_SECRET, ...corpo }).toString(),
    });
    if (!r.access_token) throw new ErroCanal("acesso_negado", "O Mercado Livre não liberou o acesso.", 401);
    return { token: r.access_token, renovar: r.refresh_token, vence: Date.now() + (Number(r.expires_in) || 21600) * 1000 - 60_000, usuario: String(r.user_id || "") };
  },

  async trocarCodigo(env, { code, redirect }) {
    const t = await this._token(env, { grant_type: "authorization_code", code, redirect_uri: redirect });
    return { credenciais: t, conta: t.usuario };
  },

  /** Renova o token quando venceu; devolve as credenciais atualizadas (ou as mesmas). */
  async garantirAcesso(env, c) {
    if (c.vence && Date.now() < c.vence) return c;
    if (!c.renovar) throw new ErroCanal("acesso_negado", "Reconecte o Mercado Livre.", 401);
    const t = await this._token(env, { grant_type: "refresh_token", refresh_token: c.renovar });
    return { ...c, ...t, usuario: c.usuario || t.usuario };
  },

  normalizarAnuncio(i) {
    const atributos = {};
    for (const a of i.attributes || []) if (a.name && a.value_name) atributos[a.name] = a.value_name;
    return {
      ref: String(i.id), variante: "", sku: String((i.attributes || []).find((a) => a.id === "SELLER_SKU")?.value_name || i.seller_custom_field || ""),
      nome: String(i.title || i.id), preco_centavos: centavos(i.price), promocao_centavos: i.original_price ? centavos(i.price) : null,
      estoque: Number(i.available_quantity) || 0, oculto: i.status === "paused" || i.status === "closed" || i.status === "inactive",
      categoria: String(i.category_id || ""), atributos, imagem: i.thumbnail || i.pictures?.[0]?.secure_url || "",
    };
  },

  async buscarProdutos(c) {
    const ids = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const r = await pedir(`${API}/users/${c.usuario}/items/search?limit=100&offset=${offset}`, { headers: cab(c) });
      ids.push(...(r.results || []));
      if ((r.results || []).length < 100) break;
    }
    const saida = [];
    for (let i = 0; i < ids.length; i += 20) {
      const lote = ids.slice(i, i + 20);
      const r = await pedir(`${API}/items?ids=${lote.join(",")}`, { headers: cab(c) });
      for (const x of Array.isArray(r) ? r : []) if (x.code === 200 && x.body) saida.push(this.normalizarAnuncio(x.body));
    }
    return saida;
  },

  statusDoPedido(o) {
    if (o.status === "cancelled") return "cancelado";
    if ((o.tags || []).includes("not_delivered") && o.status !== "paid") return "cancelado";
    if (o.status === "paid") return "pago";
    return "novo";
  },

  normalizarPedido(o) {
    const taxa = (o.order_items || []).reduce((s, i) => s + (centavos(i.sale_fee) ?? 0) * (Number(i.quantity) || 1), 0);
    return {
      ref: String(o.id), status: this.statusDoPedido(o), total_centavos: centavos(o.total_amount) ?? 0, taxa_centavos: taxa,
      criado: Date.parse(o.date_created) || Date.now(),
      itens: (o.order_items || []).map((i) => ({ ref: String(i.item?.id), variante: "", sku: i.item?.seller_sku || "", quantidade: Number(i.quantity) || 0 })),
    };
  },

  async buscarPedidos(c, desde = 0) {
    const filtro = desde ? `&order.date_created.from=${encodeURIComponent(new Date(desde).toISOString())}` : "";
    const r = await pedir(`${API}/orders/search?seller=${c.usuario}&sort=date_desc&limit=50${filtro}`, { headers: cab(c) });
    return (r.results || []).map((o) => this.normalizarPedido(o));
  },

  async buscarPedido(c, ref) {
    const o = await pedir(`${API}/orders/${encodeURIComponent(ref)}`, { headers: cab(c) }, { aceitar404: true });
    return o ? this.normalizarPedido(o) : null;
  },

  async ajustarEstoque(c, { ref }, quantidade) {
    await pedir(`${API}/items/${ref}`, { method: "PUT", headers: cab(c), body: JSON.stringify({ available_quantity: Math.max(0, Math.trunc(quantidade)) }) });
  },

  // As notificações do Mercado Livre são configuradas no painel do aplicativo (uma URL por app).
  async registrarWebhooks() {},
  async removerWebhooks() {},

  /** O Mercado Livre não assina a notificação: o servidor só aceita o que confere depois, consultando o pedido com o token do canal. */
  async lerWebhook(_env, c, _headers, corpoTexto) {
    const d = JSON.parse(corpoTexto);
    if (!/^orders/.test(String(d.topic || "")) || !d.resource) return null;
    if (c.usuario && String(d.user_id) !== String(c.usuario)) return null;
    const m = /\/orders\/(\d+)/.exec(d.resource);
    return m ? { pedido: m[1], evento: d.topic } : null;
  },
};
