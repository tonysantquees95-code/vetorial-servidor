// Conexão de canais e sincronização de produtos e pedidos.
import { conector } from "../canais/index.js";
import { ErroCanal } from "../canais/comum.js";
import { aleatorio, cifrar, segredoDoCanal } from "./cripto.js";
import { aplicarPedido, credenciais } from "./estoque.js";
import { ErroLoja, MAX_CANAIS } from "./lojas.js";

export const publico = (c) => ({ id: c.id, plataforma: c.plataforma, conta: c.conta, nome: c.nome, status: c.status, ultimoSync: c.ultimo_sync, criado: c.criado });

export async function listarCanais(env, loja) {
  const { results } = await env.DB.prepare("SELECT * FROM canais WHERE loja = ? ORDER BY criado").bind(loja.id).all();
  return results;
}

export function urlDoWebhook(origem, canal, segredo) {
  return `${origem}/webhook/${canal.plataforma}/${canal.id}/${segredo}`;
}

export async function conectarCanal(env, loja, plataforma, resultado, origem, nome = "") {
  const existentes = await listarCanais(env, loja);
  if (existentes.length >= MAX_CANAIS) throw new ErroLoja(409, "limite_de_canais", `Você já tem ${MAX_CANAIS} canais conectados.`);
  const repetido = existentes.find((c) => c.plataforma === plataforma && c.conta === resultado.conta);
  if (repetido) throw new ErroLoja(409, "canal_repetido", "Essa conta já está conectada.");
  const id = aleatorio(8);
  const canal = {
    id, loja: loja.id, plataforma, conta: resultado.conta, nome: nome || conector(plataforma).nome,
    credenciais: await cifrar(env, resultado.credenciais), config: "{}", criado: Date.now(), ultimo_sync: 0, status: "ok",
  };
  await env.DB.prepare("INSERT INTO canais (id, loja, plataforma, conta, nome, credenciais, config, criado, ultimo_sync, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(canal.id, canal.loja, canal.plataforma, canal.conta, canal.nome, canal.credenciais, canal.config, canal.criado, 0, "ok").run();
  let aviso = "";
  try {
    await conector(plataforma).registrarWebhooks(resultado.credenciais, urlDoWebhook(origem, canal, await segredoDoCanal(env, id)));
  } catch (e) {
    aviso = "Conectado, mas não consegui ligar os avisos em tempo real; a sincronização manual continua funcionando.";
    await env.DB.prepare("UPDATE canais SET status = 'sem_webhook' WHERE id = ?").bind(id).run();
  }
  return { canal, aviso };
}

export async function removerCanal(env, loja, id, origem) {
  const canal = await env.DB.prepare("SELECT * FROM canais WHERE id = ? AND loja = ?").bind(id, loja.id).first();
  if (!canal) throw new ErroLoja(404, "canal_inexistente", "Canal não encontrado.");
  try {
    const c = await credenciais(env, canal);
    await conector(canal.plataforma).removerWebhooks(c, urlDoWebhook(origem, canal, await segredoDoCanal(env, id)));
  } catch (e) {}
  await env.DB.batch([
    env.DB.prepare("DELETE FROM vinculos WHERE canal = ?").bind(id),
    env.DB.prepare("DELETE FROM canais WHERE id = ?").bind(id),
  ]);
}

/** Traz os produtos do canal para o catálogo central e liga cada um ao seu item na plataforma. */
export async function sincronizarProdutos(env, canal, agora = Date.now()) {
  const c = await credenciais(env, canal);
  const itens = await conector(canal.plataforma).buscarProdutos(c);
  let novos = 0, atualizados = 0, divergentes = 0;
  for (const it of itens) {
    const sku = it.sku || `${canal.plataforma}:${it.ref}${it.variante ? ":" + it.variante : ""}`;
    let p = await env.DB.prepare("SELECT id, estoque FROM produtos WHERE loja = ? AND sku = ?").bind(canal.loja, sku).first();
    const atributos = JSON.stringify(it.atributos || {});
    if (!p) {
      const r = await env.DB.prepare(
        "INSERT INTO produtos (loja, sku, nome, preco_centavos, estoque, oculto, categoria, atributos, imagem, promocao_centavos, atualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(canal.loja, sku, it.nome, it.preco_centavos, it.estoque, it.oculto ? 1 : 0, it.categoria || "", atributos, it.imagem || "", it.promocao_centavos ?? null, agora).run();
      p = { id: r.meta.last_row_id, estoque: it.estoque };
      novos++;
    } else {
      const outros = await env.DB.prepare("SELECT COUNT(*) AS n FROM vinculos WHERE produto = ? AND canal != ?").bind(p.id, canal.id).first();
      const adotar = !outros.n; // só este canal vende o produto: ele é a verdade do saldo
      if (adotar) {
        await env.DB.prepare(
          "UPDATE produtos SET nome = ?, preco_centavos = ?, estoque = ?, oculto = ?, categoria = ?, atributos = ?, imagem = ?, promocao_centavos = ?, atualizado = ? WHERE id = ?"
        ).bind(it.nome, it.preco_centavos, it.estoque, it.oculto ? 1 : 0, it.categoria || "", atributos, it.imagem || "", it.promocao_centavos ?? null, agora, p.id).run();
      } else {
        await env.DB.prepare("UPDATE produtos SET preco_centavos = COALESCE(preco_centavos, ?), imagem = CASE WHEN imagem = '' THEN ? ELSE imagem END, atualizado = ? WHERE id = ?")
          .bind(it.preco_centavos, it.imagem || "", agora, p.id).run();
        if (p.estoque !== it.estoque) divergentes++;
      }
      atualizados++;
    }
    await env.DB.prepare("INSERT OR REPLACE INTO vinculos (canal, ref, variante, produto) VALUES (?, ?, ?, ?)").bind(canal.id, it.ref, it.variante || "", p.id).run();
  }
  await env.DB.prepare("UPDATE canais SET ultimo_sync = ?, status = CASE WHEN status LIKE 'erro%' THEN 'ok' ELSE status END WHERE id = ?").bind(agora, canal.id).run();
  return { total: itens.length, novos, atualizados, divergentes };
}

/** Importa pedidos recentes (recupera o que algum webhook perdeu). Não mexe no estoque de pedidos antigos já resolvidos. */
export async function sincronizarPedidos(env, canal, { dias = 30, agora = Date.now() } = {}) {
  const c = await credenciais(env, canal);
  const pedidos = await conector(canal.plataforma).buscarPedidos(c, agora - dias * 86_400_000);
  let baixas = 0, reposicoes = 0;
  for (const p of pedidos) {
    const r = await aplicarPedido(env, canal, p, { agora, historico: !canal.ultimo_sync || p.criado <= canal.ultimo_sync });
    for (const m of r.mudancas) m.tipo === "baixa" ? baixas++ : reposicoes++;
  }
  return { total: pedidos.length, baixas, reposicoes };
}

export async function tratarWebhook(env, canal, headers, corpoTexto) {
  const c = await credenciais(env, canal);
  const con = conector(canal.plataforma);
  const aviso = await con.lerWebhook(env, c, headers, corpoTexto);
  if (!aviso) return { ignorado: true };
  // sempre confere o pedido na própria plataforma: vale para o Mercado Livre (sem assinatura) e evita eventos fora de ordem
  const pedido = await con.buscarPedido(c, aviso.pedido);
  if (!pedido) return { ignorado: true };
  return await aplicarPedido(env, canal, pedido);
}

export { ErroCanal };
