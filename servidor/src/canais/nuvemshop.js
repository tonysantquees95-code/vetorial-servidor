// Nuvemshop (Tiendanube): OAuth, produtos, pedidos, estoque e webhooks.
import { centavos, ErroCanal, pedir, texto } from "./comum.js";
import { hmacHex, iguais } from "../loja/cripto.js";

const BASE = "https://api.nuvemshop.com.br/v1";
const UA = "Venus (venus-servidor)";

const cab = (c) => ({ Authentication: `bearer ${c.token}`, "User-Agent": UA, "Content-Type": "application/json" });

export const nuvemshop = {
  id: "nuvemshop",
  nome: "Nuvemshop",
  eventos: ["order/created", "order/paid", "order/cancelled", "order/voided", "order/updated"],

  urlDeAutorizacao(env, state) {
    if (!env.NUVEMSHOP_APP_ID) throw new ErroCanal("sem_app", "A Nuvemshop ainda não foi configurada neste servidor.", 503);
    return `https://www.tiendanube.com/apps/${env.NUVEMSHOP_APP_ID}/authorize?state=${encodeURIComponent(state)}`;
  },

  async trocarCodigo(env, { code }) {
    if (!env.NUVEMSHOP_APP_ID || !env.NUVEMSHOP_APP_SECRET) throw new ErroCanal("sem_app", "A Nuvemshop ainda não foi configurada neste servidor.", 503);
    const r = await pedir("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ client_id: env.NUVEMSHOP_APP_ID, client_secret: env.NUVEMSHOP_APP_SECRET, grant_type: "authorization_code", code }),
    });
    if (!r.access_token || !r.user_id) throw new ErroCanal("acesso_negado", "A Nuvemshop não liberou o acesso.", 401);
    return { credenciais: { token: r.access_token, loja: String(r.user_id) }, conta: String(r.user_id) };
  },

  /** Conexão direta (token já em mãos). */
  async conectarDireto(env, { loja, token }) {
    if (!loja || !token) throw new ErroCanal("dados_faltando", "Informe o código da loja e o token.", 400);
    const c = { token: String(token), loja: String(loja) };
    await pedir(`${BASE}/${c.loja}/store`, { headers: cab(c) });
    return { credenciais: c, conta: c.loja };
  },

  normalizarProduto(p) {
    const variantes = Array.isArray(p.variants) && p.variants.length ? p.variants : [{}];
    const atributos = {};
    (p.attributes || []).forEach((a, i) => {
      const nome = texto(a);
      const valor = variantes[0].values?.[i] ? texto(variantes[0].values[i]) : "";
      if (nome) atributos[nome] = valor;
    });
    const promo = centavos(variantes[0].promotional_price);
    return variantes.map((v) => ({
      ref: String(p.id),
      variante: v.id ? String(v.id) : "",
      sku: v.sku ? String(v.sku) : "",
      nome: texto(p.name) + (variantes.length > 1 && v.values?.length ? ` (${v.values.map(texto).join(" / ")})` : ""),
      preco_centavos: centavos(v.price),
      promocao_centavos: centavos(v.promotional_price) ?? promo,
      estoque: v.stock === null || v.stock === undefined ? 0 : Number(v.stock) || 0,
      estoque_ilimitado: v.stock === null,
      oculto: p.published === false,
      categoria: (p.categories || []).map((c) => texto(c.name)).join(" > "),
      atributos,
      imagem: p.images?.[0]?.src || "",
    }));
  },

  async buscarProdutos(c) {
    const saida = [];
    for (let pagina = 1; pagina <= 20; pagina++) {
      const r = await pedir(`${BASE}/${c.loja}/products?per_page=200&page=${pagina}`, { headers: cab(c) }, { aceitar404: true });
      if (!r || !Array.isArray(r) || !r.length) break; // a Nuvemshop responde 404 depois da última página
      for (const p of r) saida.push(...this.normalizarProduto(p));
      if (r.length < 200) break;
    }
    return saida;
  },

  statusDoPedido(o) {
    if (o.status === "cancelled" || o.cancelled_at) return "cancelado";
    if (o.payment_status === "refunded") return "reembolsado";
    if (o.payment_status === "voided") return "cancelado";
    if (o.payment_status === "paid") return "pago";
    return "novo";
  },

  normalizarPedido(o) {
    const total = centavos(o.total);
    return {
      ref: String(o.id),
      status: this.statusDoPedido(o),
      total_centavos: total ?? 0,
      taxa_centavos: 0, // a Nuvemshop não informa a taxa do meio de pagamento no pedido
      criado: Date.parse(o.created_at) || Date.now(),
      itens: (o.products || []).map((i) => ({
        ref: String(i.product_id),
        variante: i.variant_id ? String(i.variant_id) : "",
        sku: i.sku || "",
        quantidade: Number(i.quantity) || 0,
      })),
    };
  },

  async buscarPedidos(c, desde = 0) {
    const saida = [];
    const filtro = desde ? `&created_at_min=${encodeURIComponent(new Date(desde).toISOString())}` : "";
    for (let pagina = 1; pagina <= 10; pagina++) {
      const r = await pedir(`${BASE}/${c.loja}/orders?per_page=100&page=${pagina}${filtro}`, { headers: cab(c) }, { aceitar404: true });
      if (!r || !Array.isArray(r) || !r.length) break;
      saida.push(...r.map((o) => this.normalizarPedido(o)));
      if (r.length < 100) break;
    }
    return saida;
  },

  async buscarPedido(c, ref) {
    const o = await pedir(`${BASE}/${c.loja}/orders/${encodeURIComponent(ref)}`, { headers: cab(c) }, { aceitar404: true });
    return o ? this.normalizarPedido(o) : null;
  },

  async ajustarEstoque(c, { ref, variante }, quantidade) {
    if (!variante) throw new ErroCanal("sem_variante", "Produto sem variação na Nuvemshop.", 422);
    await pedir(`${BASE}/${c.loja}/products/${ref}/variants/${variante}`, {
      method: "PUT", headers: cab(c), body: JSON.stringify({ stock: Math.max(0, Math.trunc(quantidade)) }),
    });
  },

  async registrarWebhooks(c, urlBase) {
    const existentes = await pedir(`${BASE}/${c.loja}/webhooks`, { headers: cab(c) }).catch(() => []);
    for (const evento of this.eventos) {
      if (Array.isArray(existentes) && existentes.some((w) => w.event === evento && w.url === urlBase)) continue;
      await pedir(`${BASE}/${c.loja}/webhooks`, { method: "POST", headers: cab(c), body: JSON.stringify({ event: evento, url: urlBase }) });
    }
  },

  async removerWebhooks(c, urlBase) {
    const lista = await pedir(`${BASE}/${c.loja}/webhooks`, { headers: cab(c) }).catch(() => []);
    for (const w of Array.isArray(lista) ? lista : []) {
      if (w.url === urlBase) await pedir(`${BASE}/${c.loja}/webhooks/${w.id}`, { method: "DELETE", headers: cab(c) }).catch(() => {});
    }
  },

  /** Confere a assinatura do webhook e diz de qual pedido se trata. */
  async lerWebhook(env, _c, headers, corpoTexto) {
    if (!env.NUVEMSHOP_APP_SECRET) throw new ErroCanal("sem_app", "Nuvemshop sem segredo no servidor.", 503);
    const assinatura = headers.get("x-linkedstore-hmac-sha256") || "";
    if (!iguais(assinatura, await hmacHex(env.NUVEMSHOP_APP_SECRET, corpoTexto))) throw new ErroCanal("assinatura", "Assinatura inválida.", 401);
    const d = JSON.parse(corpoTexto);
    if (!String(d.event || "").startsWith("order/")) return null;
    return { pedido: String(d.id), evento: d.event };
  },
};
