// Central de Marketing: a IA (Groq) cruza o que está em promoção ou sobrando no estoque e preenche a fila de postagens.
import { groq } from "../ia/provedores.js";
import { reais } from "./vitrine.js";

const BASE_HASHTAGS = ["#promoção", "#novidade", "#compreonline", "#entregadiscreta"];

export function candidatos(produtos, limite = 5) {
  const ok = produtos.filter((p) => !p.oculto && p.estoque > 0 && p.preco_centavos);
  const promo = (p) => (p.promocao_centavos && p.promocao_centavos < p.preco_centavos ? 1 - p.promocao_centavos / p.preco_centavos : 0);
  return [...ok].sort((a, b) => promo(b) - promo(a) || b.estoque - a.estoque).slice(0, limite);
}

export function limparHashtags(lista, max = 12) {
  const vistos = new Set();
  const saida = [];
  for (const h of Array.isArray(lista) ? lista : String(lista || "").split(/[\s,]+/)) {
    const t = "#" + String(h).replace(/^#+/, "").normalize("NFC").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 30);
    if (t.length > 1 && !vistos.has(t.toLowerCase())) { vistos.add(t.toLowerCase()); saida.push(t); }
    if (saida.length >= max) break;
  }
  return saida;
}

/** Aceita JSON puro, JSON dentro de ``` ou com texto em volta. */
export function lerSugestao(texto) {
  const t = String(texto || "");
  const ini = t.indexOf("{");
  const fim = t.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  try {
    const d = JSON.parse(t.slice(ini, fim + 1));
    const legenda = String(d.legenda || "").trim().slice(0, 600);
    const copy = String(d.copy || d.chamada || "").trim().slice(0, 200);
    if (!legenda && !copy) return null;
    return { legenda, copy, hashtags: limparHashtags(d.hashtags) };
  } catch {
    return null;
  }
}

/** Texto pronto, sem IA, para a fila nunca ficar vazia quando o Groq falha. */
export function sugestaoModelo(produto, loja) {
  const promo = produto.promocao_centavos && produto.promocao_centavos < produto.preco_centavos;
  return {
    legenda: promo
      ? `${produto.nome} com preço especial: de ${reais(produto.preco_centavos)} por ${reais(produto.promocao_centavos)}. Garanta o seu enquanto há estoque! Compre com entrega discreta.`
      : `${produto.nome} por ${reais(produto.preco_centavos)}. Peça agora com entrega discreta.`,
    copy: promo ? "Oferta por tempo limitado" : "Chegou para você",
    hashtags: limparHashtags([...BASE_HASHTAGS, (loja.nome || "").replace(/\s+/g, "")]),
  };
}

const SISTEMA =
  "Você é redator de redes sociais de uma loja online brasileira com entrega discreta. Escreva em português do Brasil, tom elegante, sensual apenas de forma sutil, " +
  "SEM termos explícitos e sem nada que viole as regras do Instagram. Responda SOMENTE um JSON: " +
  '{"legenda":"até 280 caracteres, com no máximo 2 emojis","copy":"chamada curta de até 60 caracteres","hashtags":["8 a 10 hashtags sem espaços"]}.';

export async function gerarSugestao(env, produto, loja, { gerar = groq, agora = Date.now() } = {}) {
  const promo = produto.promocao_centavos && produto.promocao_centavos < produto.preco_centavos;
  const pedido =
    `Loja: ${loja.titulo || loja.nome}. Produto: ${produto.nome}. Preço: ${reais(produto.preco_centavos)}` +
    (promo ? ` (em promoção por ${reais(produto.promocao_centavos)})` : "") + `. Categoria: ${produto.categoria || "geral"}. ` +
    `Estoque: ${produto.estoque} unidades${produto.estoque <= 3 ? " (últimas unidades)" : ""}.`;
  try {
    const r = await gerar(env, { tarefa: "texto", sistema: SISTEMA, mensagens: [{ papel: "user", texto: pedido }], temperatura: 0.8, maxTokens: 500 });
    const s = lerSugestao(r.texto);
    if (s) return { ...s, origem: "ia" };
  } catch (e) {}
  return { ...sugestaoModelo(produto, loja), origem: "modelo" };
}

export async function produtosDaLoja(env, loja) {
  const { results } = await env.DB.prepare("SELECT * FROM produtos WHERE loja = ?").bind(loja.id).all();
  return results.map((p) => ({ ...p, oculto: !!p.oculto }));
}

export async function preencherFila(env, loja, { quantidade = 5, gerar } = {}, agora = Date.now()) {
  const todos = await produtosDaLoja(env, loja);
  const ja = new Set((await env.DB.prepare("SELECT produto FROM fila_posts WHERE loja = ? AND status IN ('sugerido','agendado')").bind(loja.id).all()).results.map((r) => r.produto));
  const novos = candidatos(todos.filter((p) => !ja.has(p.id)), Math.min(Math.max(quantidade, 1), 10));
  const criados = [];
  for (const p of novos) {
    const s = await gerarSugestao(env, p, loja, { gerar });
    const r = await env.DB.prepare("INSERT INTO fila_posts (loja, produto, legenda, copy, hashtags, status, origem, criado, atualizado) VALUES (?, ?, ?, ?, ?, 'sugerido', ?, ?, ?)")
      .bind(loja.id, p.id, s.legenda, s.copy, JSON.stringify(s.hashtags), s.origem, agora, agora).run();
    criados.push(r.meta.last_row_id);
  }
  return criados;
}

export async function regenerar(env, loja, ids, { gerar } = {}, agora = Date.now()) {
  const marcas = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`SELECT * FROM fila_posts WHERE loja = ? AND id IN (${marcas || "NULL"})`).bind(loja.id, ...ids).all();
  let feitos = 0;
  for (const post of results) {
    const p = await env.DB.prepare("SELECT * FROM produtos WHERE id = ? AND loja = ?").bind(post.produto, loja.id).first();
    if (!p) continue;
    const s = await gerarSugestao(env, { ...p, oculto: !!p.oculto }, loja, { gerar });
    await env.DB.prepare("UPDATE fila_posts SET legenda = ?, copy = ?, hashtags = ?, origem = ?, atualizado = ? WHERE id = ?")
      .bind(s.legenda, s.copy, JSON.stringify(s.hashtags), s.origem, agora, post.id).run();
    feitos++;
  }
  return feitos;
}

export const darForma = (p) => ({ ...p, hashtags: JSON.parse(p.hashtags || "[]") });
