// Rotas do "Meu site": a página pública do negócio (/s/<loja>), o logo e as fotos dele, e o editor do dono.
import { garantirConfig, listarEquipe, listarServicos } from "../agenda/dados.js";
import { groq } from "../ia/provedores.js";
import { acessoLiberado, comPrivilegios, ErroLoja } from "../loja/lojas.js";
import { gerarOpcoes, FONTES, LAYOUTS, logoSvg, NICHOS, normalizarEspec, PALETAS, SIMBOLOS } from "./logos.js";
import { EDITOR_DO_SITE } from "./editor.js";
import { MAX_FOTOS, normalizarSite, renderizarSite, SECOES, siteInicial, TEMAS, textosModelo } from "./site.js";

const CAB = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...CAB } });
const CSP_SITE = "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
const pagina = (corpo, status = 200, cache = "public, max-age=60") =>
  new Response(corpo, { status, headers: { "content-type": "text/html; charset=utf-8", ...CAB, "cache-control": cache, "content-security-policy": CSP_SITE } });
const aviso = (titulo, texto, status = 404) =>
  pagina(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta name=robots content=noindex><title>${titulo}</title><body style="font-family:system-ui,sans-serif;background:#070a1c;color:#fff;text-align:center;padding:60px 20px"><h2>${titulo}</h2><p style="color:#8b95c0">${texto}</p>`, status, "no-store");

export const ehRotaDoSite = (c) => c.startsWith("/s/") || c === "/site/editor";

export async function lerSite(env, lojaId) {
  const r = await env.DB.prepare("SELECT dados FROM site_config WHERE loja = ?").bind(lojaId).first();
  if (!r) return null;
  try {
    return normalizarSite(JSON.parse(r.dados), siteInicial());
  } catch {
    return null;
  }
}
async function guardarSite(env, lojaId, cfg, agora = Date.now()) {
  await env.DB.prepare("INSERT INTO site_config (loja, dados, atualizado) VALUES (?, ?, ?) ON CONFLICT(loja) DO UPDATE SET dados = excluded.dados, atualizado = excluded.atualizado").bind(lojaId, JSON.stringify(cfg), agora).run();
}
async function numerosDasFotos(env, lojaId) {
  const { results } = await env.DB.prepare("SELECT n FROM site_fotos WHERE loja = ? ORDER BY n").bind(lojaId).all();
  return results.map((r) => r.n);
}

/** O que a página mostra além das escolhas do dono: serviços, equipe, produtos e se a agenda está de pé. */
async function conteudoDoSite(env, loja, origem) {
  const servicos = await listarServicos(env, loja.id, { so_ativos: true });
  const equipe = (await listarEquipe(env, loja.id, { so_ativos: true })).filter((p) => p.horarios.length);
  const cfgAgenda = await garantirConfig(env, loja.id);
  const { results: produtos } = await env.DB.prepare("SELECT sku, nome, preco_centavos, promocao_centavos, imagem, estoque FROM vitrine_itens WHERE loja = ? AND preco_centavos IS NOT NULL AND estoque > 0 ORDER BY nome LIMIT 6").bind(loja.id).all();
  const { results: dosCanais } = produtos.length ? { results: [] } : await env.DB.prepare("SELECT sku, nome, preco_centavos, promocao_centavos, imagem, estoque FROM produtos WHERE loja = ? AND oculto = 0 AND preco_centavos IS NOT NULL AND estoque > 0 ORDER BY nome LIMIT 6").bind(loja.id).all();
  const lista = produtos.length ? produtos : dosCanais;
  return {
    servicos, equipe: equipe.map((p) => ({ nome: p.nome, funcao: p.funcao })), produtos: lista, fotos: await numerosDasFotos(env, loja.id),
    agenda: cfgAgenda.ativa && servicos.length && equipe.length ? `${origem}/agenda/${loja.slug}` : null,
    vitrine: lista.length ? `${origem}/v/${loja.slug}` : null,
  };
}

async function lojaPublica(env, slug) {
  const loja = await comPrivilegios(env, await env.DB.prepare("SELECT * FROM lojas WHERE slug = ?").bind(slug).first());
  if (!loja) throw new ErroLoja(404, "loja_inexistente", "Site não encontrado. Confira o endereço do link.");
  if (!acessoLiberado(loja)) throw new ErroLoja(404, "fora_do_ar", "Este site está temporariamente fora do ar.");
  return loja;
}

export async function tratarSite(req, env, ctx, url, caminho) {
  if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "não encontrado" }, 404);
  try {
    if (caminho === "/site/editor") return new Response(EDITOR_DO_SITE, { headers: { "content-type": "text/html; charset=utf-8", ...CAB, "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https:; frame-src 'self' about: data:; form-action 'none'; base-uri 'none'" } });
    const m = /^\/s\/([a-z0-9-]{3,32})(?:\/(logo\.svg)|\/foto\/([1-9]))?$/.exec(caminho);
    if (!m) return json({ error: "não encontrado" }, 404);
    const loja = await lojaPublica(env, m[1]);
    if (m[2]) {
      const cfg = await lerSite(env, loja.id);
      if (!cfg || !cfg.logo) return new Response("Sem logo", { status: 404, headers: CAB });
      return new Response(logoSvg(cfg.logo), { headers: { "content-type": "image/svg+xml; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "x-content-type-options": "nosniff", "cache-control": "public, max-age=300" } });
    }
    if (m[3]) {
      const f = await env.DB.prepare("SELECT dados FROM site_fotos WHERE loja = ? AND n = ?").bind(loja.id, Number(m[3])).first();
      if (!f) return new Response("Foto não encontrada", { status: 404, headers: CAB });
      const bin = atob(f.dados);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" } });
    }
    const cfg = await lerSite(env, loja.id);
    if (!cfg || !cfg.publicado) return aviso("Site em construção", "Este site ainda não foi publicado. Volte em breve.");
    const conteudo = await conteudoDoSite(env, loja, url.origin);
    return pagina(renderizarSite({ loja, cfg, ...conteudo, base: `${url.origin}/s/${loja.slug}` }));
  } catch (e) {
    if (e instanceof ErroLoja) return aviso("Não foi possível abrir", e.message, e.status);
    console.error("site", caminho, e && e.stack ? e.stack : e);
    return aviso("Não consegui abrir agora", "Tente de novo em instantes.", 500);
  }
}

// ======================================================================================================== do lojista
const OPCOES = {
  nichos: Object.entries(NICHOS).map(([id, nome]) => ({ id, nome })),
  temas: Object.entries(TEMAS).map(([id, t]) => ({ id, nome: t.nome, fundo: t.fundo, texto: t.texto })),
  fontes: ["moderna", "elegante", "classica", "arredondada"].map((id) => ({ id, nome: FONTES[id].nome, familia: FONTES[id].familia, peso: FONTES[id].peso, estilo: FONTES[id].estilo })),
  secoes: Object.entries(SECOES).map(([id, nome]) => ({ id, nome })),
  paletas: PALETAS.map(({ id, nome, fundo, principal, apoio, texto }) => ({ id, nome, fundo, principal, apoio, texto })),
  simbolos: Object.entries(SIMBOLOS).map(([id, s]) => ({ id, nome: s.nome })),
  layouts: Object.entries(LAYOUTS).map(([id, nome]) => ({ id, nome })),
};

async function estadoDoEditor(env, loja, url) {
  const salvo = await lerSite(env, loja.id);
  const cfg = salvo || siteInicial("outro");
  const conteudo = await conteudoDoSite(env, loja, url.origin);
  return {
    url: `${url.origin}/s/${loja.slug}`, slug: loja.slug, nome: loja.titulo || loja.nome, whatsapp: loja.whatsapp || "", novo: !salvo,
    config: cfg, logoSvg: cfg.logo ? logoSvg(cfg.logo, "e") : "", fotos: conteudo.fotos,
    agenda: { ativa: !!conteudo.agenda, servicos: conteudo.servicos.length, equipe: conteudo.equipe.length }, temProdutos: conteudo.produtos.length > 0,
    opcoes: OPCOES, max_fotos: MAX_FOTOS,
  };
}

const JSON_NO_TEXTO = /\{[\s\S]*\}/;
const SISTEMA_TEXTOS =
  "Você escreve os textos do site de um pequeno negócio brasileiro (salão, barbearia, manicure, estética ou loja). Português do Brasil, tom acolhedor e profissional, " +
  "sem exageros, sem termos explícitos, sem prometer resultados médicos. Responda SOMENTE um JSON: " +
  '{"slogan":"frase curta de até 70 caracteres, sem aspas","sobre":"2 a 3 frases, até 420 caracteres, falando do atendimento"}.';

export async function tratarSiteDaLoja(req, env, loja, url, caminho, { corpoJson, exigeAcesso } = {}) {
  if (caminho !== "/loja/site" && !caminho.startsWith("/loja/site/")) return null;
  const escrever = () => exigeAcesso && exigeAcesso(loja);
  let m;
  if (caminho === "/loja/site" && req.method === "GET") return json(await estadoDoEditor(env, loja, url));
  if (caminho === "/loja/site" && req.method === "PUT") {
    escrever();
    const d = await corpoJson(req);
    const salvo = (await lerSite(env, loja.id)) || normalizarSite({ nicho: d.nicho }, null);
    const cfg = normalizarSite(d, salvo);
    await guardarSite(env, loja.id, cfg);
    const nome = d.nome === undefined ? null : String(d.nome).trim().slice(0, 80);
    const zap = d.whatsapp === undefined ? null : String(d.whatsapp).replace(/\D/g, "").slice(0, 15);
    if (nome || zap !== null) await env.DB.prepare("UPDATE lojas SET titulo = ?, whatsapp = ? WHERE id = ?").bind(nome || loja.titulo || "", zap === null ? loja.whatsapp || "" : zap, loja.id).run();
    const atual = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(loja.id).first();
    return json(await estadoDoEditor(env, atual, url));
  }
  if (caminho === "/loja/site/previa" && req.method === "POST") {
    const d = await corpoJson(req);
    const salvo = (await lerSite(env, loja.id)) || normalizarSite({ nicho: d.nicho }, null);
    const cfg = normalizarSite(d, salvo);
    const conteudo = await conteudoDoSite(env, loja, url.origin);
    const lojaPrevia = { ...loja, titulo: d.nome === undefined ? loja.titulo : String(d.nome).trim().slice(0, 80), whatsapp: d.whatsapp === undefined ? loja.whatsapp : String(d.whatsapp).replace(/\D/g, "").slice(0, 15) };
    return json({ html: renderizarSite({ loja: lojaPrevia, cfg, ...conteudo, base: `${url.origin}/s/${loja.slug}`, previa: true }) });
  }
  if (caminho === "/loja/site/logos" && req.method === "POST") {
    const d = await corpoJson(req);
    const opcoes = gerarOpcoes({ nome: d.nome || loja.titulo || loja.nome, subtitulo: d.subtitulo, nicho: d.nicho, paleta: d.paleta, simbolo: d.simbolo }, { quantidade: Math.min(24, Math.max(1, Number(d.quantidade) || 12)), variacao: Number(d.variacao) || 0 });
    return json({ opcoes: opcoes.map((espec, i) => ({ espec, svg: logoSvg(espec, `o${i}`) })) });
  }
  if (caminho === "/loja/site/logo" && req.method === "POST") {
    const d = await corpoJson(req);
    const espec = normalizarEspec(d.espec || d);
    return json({ espec, svg: logoSvg(espec, "x") });
  }
  if (caminho === "/loja/site/textos" && req.method === "POST") {
    const d = await corpoJson(req);
    const nome = String(d.nome || loja.titulo || loja.nome || "").trim().slice(0, 60) || "Meu negócio";
    const nicho = NICHOS[d.nicho] ? d.nicho : "outro";
    const cidade = String(d.cidade || "").trim().slice(0, 60);
    const modelo = textosModelo(nicho, nome, cidade);
    const gerar = env.GERADOR_DE_TESTE || groq;
    try {
      const servicos = (Array.isArray(d.servicos) ? d.servicos : []).map((s) => String(s).slice(0, 40)).slice(0, 8).join(", ");
      const r = await gerar(env, { tarefa: "texto", sistema: SISTEMA_TEXTOS, mensagens: [{ papel: "user", texto: `Negócio: ${nome}. Ramo: ${NICHOS[nicho]}.${cidade ? ` Cidade: ${cidade}.` : ""}${servicos ? ` Serviços: ${servicos}.` : ""}` }], temperatura: 0.8, maxTokens: 400 });
      const achado = JSON_NO_TEXTO.exec(String(r.texto || ""));
      const o = achado ? JSON.parse(achado[0]) : null;
      const slogan = String(o?.slogan || "").replace(/\s+/g, " ").trim().slice(0, 90);
      const sobre = String(o?.sobre || "").trim().slice(0, 700);
      if (slogan && sobre) return json({ slogan, sobre, origem: "ia" });
    } catch (e) { /* sem IA agora: segue com o texto pronto */ }
    return json({ ...modelo, origem: "modelo" });
  }
  if ((m = /^\/loja\/site\/foto\/([1-9])$/.exec(caminho)) && req.method === "PUT") {
    escrever();
    const texto = await req.text();
    if (texto.length > 400_000) throw new ErroLoja(413, "corpo_grande", "Foto grande demais.");
    let d;
    try { d = JSON.parse(texto || "{}"); } catch { throw new ErroLoja(400, "json_invalido", "O corpo precisa ser um JSON válido."); }
    const dados = String(d?.dados ?? "");
    // JPEG em base64 (começa com /9j/), reduzido pelo app: até uns 250 KB
    if (!/^\/9j\/[A-Za-z0-9+/=]+$/.test(dados) || dados.length > 340_000) throw new ErroLoja(400, "foto_invalida", "Mande a foto em JPEG, reduzida (até 250 KB).");
    await env.DB.prepare("INSERT INTO site_fotos (loja, n, dados, atualizado) VALUES (?, ?, ?, ?) ON CONFLICT(loja, n) DO UPDATE SET dados = excluded.dados, atualizado = excluded.atualizado").bind(loja.id, Number(m[1]), dados, Date.now()).run();
    return json({ ok: true, fotos: await numerosDasFotos(env, loja.id) });
  }
  if ((m = /^\/loja\/site\/foto\/([1-9])$/.exec(caminho)) && req.method === "DELETE") {
    escrever();
    await env.DB.prepare("DELETE FROM site_fotos WHERE loja = ? AND n = ?").bind(loja.id, Number(m[1])).run();
    return json({ ok: true, fotos: await numerosDasFotos(env, loja.id) });
  }
  return json({ error: "não encontrado" }, 404);
}
