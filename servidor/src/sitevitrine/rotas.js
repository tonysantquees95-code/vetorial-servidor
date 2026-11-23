// Site grátis da Vênus Vitrine: página pública /w/<nome>, fotos, logo e edição (Vetorial ID só ao publicar).
// Reaproveita o gerador do "Meu site" (meusite/site.js): HTML puro, sem JavaScript, tudo escapado.
import { ErroId, validarSessao } from "../id/conta.js";
import { semLimite } from "../pdf/uso.js";
import { fotoValida, numeroWhats, slugDe, slugValido } from "../catalogo/dados.js";
import { especDoModelo, listaPublica, modeloPorId } from "../meusite/modelos-logo.js";
import { logoSvg, NICHOS, normalizarEspec } from "../meusite/logos.js";
import { cartaoHtml, vcard } from "./cartao.js";
import { LAYOUTS_SITE, normalizarSite, renderizarSite, siteInicial, TEMAS, textosModelo } from "../meusite/site.js";

export const TEMAS_GRATIS = ["creme", "claro"];
export const LAYOUTS = [
  { id: "banner", nome: "Banner no topo", desc: "Faixa grande com a arte do seu ramo, depois serviços e contato.", gratis: true, ordem: ["servicos", "sobre", "galeria", "depoimentos", "contato"] },
  { id: "servicos", nome: "Serviços em lista", desc: "Banner baixo e a lista de preços logo de cara. Bom para salão e barbearia.", gratis: true, ordem: ["servicos", "contato", "sobre", "galeria", "depoimentos"] },
  { id: "loja", nome: "Vitrine de produtos", desc: "Cartões de produto com botão de pedir no WhatsApp, como uma loja.", gratis: false, ordem: ["galeria", "servicos", "sobre", "depoimentos", "contato"] },
  { id: "cartao", nome: "Cartão de visita", desc: "Uma coluna só, com botões grandes. Perfeito para quem vive do Instagram.", gratis: false, ordem: ["servicos", "sobre", "contato"] },
  { id: "galeria", nome: "Galeria de fotos", desc: "As fotos em destaque, para quem vende pelo visual.", gratis: false, ordem: ["galeria", "sobre", "servicos", "depoimentos", "contato"] },
  { id: "classico", nome: "Clássico centralizado", desc: "Sem banner: logo e nome no centro, limpo e direto. Funciona para qualquer ramo.", gratis: true, ordem: ["servicos", "sobre", "galeria", "depoimentos", "contato"] },
  { id: "destaque", nome: "Destaque em tela cheia", desc: "A arte do seu ramo ocupa o topo inteiro, com o nome grande por cima. Visual de marca.", gratis: false, ordem: ["servicos", "galeria", "sobre", "depoimentos", "contato"] },
];
export const LIMITES = { gratis: { fotos: 6, servicos: 8 }, pago: { fotos: 9, servicos: 20 } };
const RESERVADOS = new Set(["admin", "api", "app", "www", "vitrine", "painel", "dev", "login", "suporte", "vetorial", "venus", "loja", "site", "teste"]);
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
const CSP = "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
const pagina = (corpo, status = 200, cache = "public, max-age=60") => new Response(corpo, { status, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": cache } });
const naoAchei = () => pagina('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta name=robots content=noindex><title>Site não encontrado</title><body style="font-family:system-ui,sans-serif;background:#0f1020;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:20px"><div><h1>Site não encontrado</h1><p>O endereço pode estar errado ou o site saiu do ar.</p></div>', 404, "no-store");

export const ehRotaDeSiteVitrine = (c) => /^\/w\/[a-z0-9-]{3,30}(\/logo\.svg|\/cartao|\/contato\.vcf|\/foto\/[a-z0-9]{8,24})?$/.test(c) || c === "/sitev" || c === "/sitev/previa" || c === "/sitev/modelos";

const aleatorio = (n) => { const b = crypto.getRandomValues(new Uint8Array(n)); let s = ""; for (const x of b) s += "abcdefghjkmnpqrstuvwxyz23456789"[x % 31]; return s; };
const linha = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const centavos = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 && n <= 99_999_999 ? n : null; };

/** Confere tudo que veio do editor. Fotos: { foto: <id guardado> } ou { fotoNova: <base64> } (virão em `fotos`). */
export function normalizarSiteVitrine(d = {}, { assinante = false } = {}) {
  const erros = [], lim = assinante ? LIMITES.pago : LIMITES.gratis;
  const nome = linha(d.nome, 40);
  if (!nome) erros.push("Escreva o nome do seu negócio.");
  const whats = numeroWhats(d.whats);
  if (!whats) erros.push("Coloque o WhatsApp com DDD, para os clientes falarem com você.");
  const nicho = NICHOS[d.nicho] ? d.nicho : "outro";
  const layout = LAYOUTS.find((l) => l.id === d.layout) || LAYOUTS[0];
  const cfg = normalizarSite({ nicho, layout: layout.id, tema: d.tema, fonte: d.fonte, cor: d.cor, slogan: d.slogan, sobre: d.sobre, endereco: d.endereco, horario: d.horario, instagram: d.instagram, depoimentos: assinante ? d.depoimentos : (Array.isArray(d.depoimentos) ? d.depoimentos.slice(0, 2) : []), publicado: true, logo: null }, { ...siteInicial(nicho), tema: "creme" });
  cfg.secoes = [...layout.ordem, ...["servicos", "produtos", "sobre", "equipe", "galeria", "depoimentos", "contato"].filter((id) => !layout.ordem.includes(id))].map((id) => ({ id, ativa: layout.ordem.includes(id) }));
  const servicos = (Array.isArray(d.servicos) ? d.servicos : []).map((x) => ({ nome: linha(x?.nome, 50), descricao: linha(x?.descricao, 120), preco_centavos: centavos(x?.preco) })).filter((x) => x.nome);
  if (servicos.length > lim.servicos) erros.push(`No plano grátis são até ${lim.servicos} serviços. Assine a Vênus para ter até ${LIMITES.pago.servicos}.`);
  const fotos = [];
  for (const f of Array.isArray(d.fotos) ? d.fotos : []) {
    if (f?.fotoNova) { const b = fotoValida(f.fotoNova); if (!b) erros.push("Uma das fotos não é um JPEG válido ou ficou pesada demais."); else fotos.push({ nova: b }); }
    else if (typeof f?.foto === "string" && /^[a-z0-9]{8,24}$/.test(f.foto)) fotos.push({ id: f.foto });
  }
  if (fotos.length > lim.fotos) erros.push(`No plano grátis são até ${lim.fotos} fotos. Assine a Vênus para ter até ${LIMITES.pago.fotos}.`);
  const logoModelo = modeloPorId(String(d.logoModelo || "")) ? String(d.logoModelo) : "";
  // logo montado no editor: a espec inteira é validada aqui; nunca se aceita SVG de fora
  const logoEspec = d.logoEspec && typeof d.logoEspec === "object" ? normalizarEspec(d.logoEspec) : null;
  return { erros, valor: { nome, whats, cidade: linha(d.cidade, 60), cfg, servicos, fotos, logoModelo: logoEspec ? "" : logoModelo, logoEspec } };
}

const aplicarLogo = (cfg, logoModelo, nome, logoEspec = null) => { const m = modeloPorId(logoModelo); cfg.logo = logoEspec ? normalizarEspec(logoEspec) : m ? especDoModelo(m, nome) : null; return cfg; };
const paraRender = (s, base, origem, { previa = false, fotoUrl = null, marca, catalogo = null } = {}) => ({
  loja: { titulo: s.nome, nome: s.nome, whatsapp: s.whats }, cfg: aplicarLogo({ ...s.cfg }, s.logoModelo, s.nome, s.logoEspec),
  servicos: s.servicos.map((x, i) => ({ id: String(i), nome: x.nome, descricao: x.descricao, preco_centavos: x.preco_centavos, duracao_min: 0 })),
  fotos: s.fotos, base, previa, fotoUrl, marca, catalogo,
});
const doBanco = (l, origem) => { const d = JSON.parse(l.dados); return { slug: l.slug, link: `${origem}/w/${l.slug}`, nome: l.nome, whats: l.whats, visitas: l.visitas, semMarca: !!l.sem_marca, ...d }; };

export async function tratarSiteVitrine(req, env, url, caminho) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    let m = /^\/w\/([a-z0-9-]{3,30})$/.exec(caminho);
    if (m && req.method === "GET") {
      const l = await env.DB.prepare("SELECT * FROM sites_vitrine WHERE slug = ?").bind(m[1]).first();
      if (!l) return naoAchei();
      await env.DB.prepare("UPDATE sites_vitrine SET visitas = visitas + 1 WHERE id = ?").bind(l.id).run();
      const s = doBanco(l, url.origin);
      const cat = await env.DB.prepare("SELECT slug FROM catalogos WHERE usuario = ?").bind(l.usuario).first();
      return pagina(renderizarSite(paraRender(s, s.link, url.origin, { marca: l.sem_marca ? false : "vitrine", catalogo: cat ? `${url.origin}/c/${cat.slug}` : null })));
    }
    m = /^\/w\/([a-z0-9-]{3,30})\/(cartao|contato\.vcf)$/.exec(caminho);
    if (m && req.method === "GET") {
      const l = await env.DB.prepare("SELECT * FROM sites_vitrine WHERE slug = ?").bind(m[1]).first();
      if (!l) return naoAchei();
      const s = doBanco(l, url.origin), mod = modeloPorId(s.logoModelo);
      if (m[2] === "cartao") return pagina(cartaoHtml(s, { logoEspec: s.logoEspec || (mod ? especDoModelo(mod, s.nome) : null), base: s.link, marca: !l.sem_marca }));
      return new Response(vcard(s, s.link), { headers: { "content-type": "text/vcard; charset=utf-8", "content-disposition": `attachment; filename="${m[1]}.vcf"`, "x-content-type-options": "nosniff", "cache-control": "public, max-age=300" } });
    }
    m = /^\/w\/([a-z0-9-]{3,30})\/logo\.svg$/.exec(caminho);
    if (m && req.method === "GET") {
      const l = await env.DB.prepare("SELECT * FROM sites_vitrine WHERE slug = ?").bind(m[1]).first();
      const dl = l ? JSON.parse(l.dados) : {};
      const mod = modeloPorId(dl.logoModelo);
      if (!mod && !dl.logoEspec) return new Response("Sem logo", { status: 404 });
      return new Response(logoSvg(dl.logoEspec || especDoModelo(mod, l.nome), "w"), { headers: { "content-type": "image/svg+xml; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "x-content-type-options": "nosniff", "cache-control": "public, max-age=300" } });
    }
    m = /^\/w\/([a-z0-9-]{3,30})\/foto\/([a-z0-9]{8,24})$/.exec(caminho);
    if (m && req.method === "GET") {
      const f = await env.DB.prepare("SELECT f.dados FROM sites_vitrine_fotos f JOIN sites_vitrine s ON s.id = f.site WHERE s.slug = ? AND f.id = ?").bind(m[1], m[2]).first();
      if (!f) return new Response("não achei", { status: 404 });
      const bin = Uint8Array.from(atob(f.dados), (ch) => ch.charCodeAt(0));
      return new Response(bin, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
    }
    if (caminho === "/sitev/modelos" && req.method === "GET") {
      return json({ layouts: LAYOUTS.map(({ id, nome, desc, gratis }) => ({ id, nome, desc, gratis })), limites: LIMITES, nichos: Object.entries(NICHOS).map(([id, nome]) => ({ id, nome })), temas: Object.entries(TEMAS).map(([id, t]) => ({ id, nome: t.nome, fundo: t.fundo, texto: t.texto, gratis: TEMAS_GRATIS.includes(id) })), logos: listaPublica().filter((x) => x.gratis), textos: Object.fromEntries(Object.keys(NICHOS).map((id) => [id, textosModelo(id, "{nome}")])) });
    }
    if (caminho === "/sitev/previa" && req.method === "POST") {
      if (Number(req.headers.get("content-length") || 0) > 1_800_000) return json({ error: "Muitas fotos de uma vez." }, 413);
      const corpo = await req.json().catch(() => ({}));
      const { erros, valor } = normalizarSiteVitrine(corpo, { assinante: true });
      if (!valor.nome) return json({ html: "", erros });
      const slug = slugValido(String(corpo.slug || "")) ? corpo.slug : "";
      const novas = valor.fotos.map((f, i) => (f.nova ? `n${i}` : f.id));
      const mapa = Object.fromEntries(valor.fotos.map((f, i) => [f.nova ? `n${i}` : f.id, f.nova ? `data:image/jpeg;base64,${f.nova}` : slug ? `${url.origin}/w/${slug}/foto/${f.id}` : ""]));
      const s = { ...valor, fotos: novas };
      return json({ html: renderizarSite(paraRender(s, `${url.origin}/w/${slug || "previa"}`, url.origin, { previa: true, fotoUrl: (n) => mapa[n] || "", marca: "vitrine" })), erros: erros.filter((e) => !/WhatsApp/.test(e)) });
    }
    const ctx = await validarSessao(env, req, {});
    const assinante = await semLimite(env, ctx.usuario);
    const situacao = { assinante, limites: assinante ? LIMITES.pago : LIMITES.gratis };
    const meu = () => env.DB.prepare("SELECT * FROM sites_vitrine WHERE usuario = ?").bind(ctx.usuario.id).first();
    if (caminho === "/sitev" && req.method === "GET") { const l = await meu(); return json({ site: l ? doBanco(l, url.origin) : null, ...situacao }); }
    if (caminho === "/sitev" && req.method === "POST") {
      if (Number(req.headers.get("content-length") || 0) > 1_800_000) return json({ error: "Muitas fotos de uma vez. Salve em duas etapas.", codigo: "grande" }, 413);
      const corpo = await req.json().catch(() => ({}));
      const { erros, valor } = normalizarSiteVitrine(corpo, { assinante });
      if (erros.length) return json({ error: erros[0], erros, ...situacao }, 400);
      if (!TEMAS_GRATIS.includes(valor.cfg.tema) && !assinante) return json({ error: "Este tema é só para quem tem assinatura da Vênus.", codigo: "assinatura", ...situacao }, 403);
      if (!LAYOUTS.find((l) => l.id === valor.cfg.layout)?.gratis && !assinante) return json({ error: "Este formato de página é só para quem tem assinatura da Vênus.", codigo: "assinatura", ...situacao }, 403);
      const mod = valor.logoModelo && modeloPorId(valor.logoModelo);
      if (mod && !mod.gratis && !assinante) return json({ error: "Este logo é só para quem tem assinatura da Vênus.", codigo: "assinatura", ...situacao }, 403);
      if (valor.logoEspec?.neon?.ativo && !assinante) return json({ error: "O efeito neon no logo é só para quem tem assinatura da Vênus.", codigo: "assinatura", ...situacao }, 403);
      const agora = Date.now();
      let l = await meu(), id = l?.id;
      if (!l) {
        id = aleatorio(14);
        let base = slugDe(valor.nome); if (base.length < 3 || RESERVADOS.has(base)) base = `${base.length >= 3 ? base : "meu-negocio"}-${aleatorio(3)}`;
        let criou = false;
        for (let i = 0; i < 6 && !criou; i++) {
          const slug = i === 0 ? base : `${base.slice(0, 24)}-${aleatorio(3)}`;
          try {
            await env.DB.prepare("INSERT INTO sites_vitrine (id, usuario, slug, nome, whats, dados, sem_marca, criado, atualizado) VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?)").bind(id, ctx.usuario.id, slug, valor.nome, valor.whats, assinante ? 1 : 0, agora, agora).run();
            criou = true;
          } catch (e) { if (!/UNIQUE/i.test(String(e?.message || e))) throw e; if (await meu()) break; }
        }
        l = await meu();
        if (!l) return json({ error: "Não consegui reservar o endereço agora. Tente de novo.", ...situacao }, 409);
        id = l.id;
      }
      const guardadas = new Set((await env.DB.prepare("SELECT id FROM sites_vitrine_fotos WHERE site = ?").bind(id).all()).results.map((r) => r.id));
      const ids = [];
      for (const f of valor.fotos) {
        if (f.nova) { const novo = aleatorio(12); await env.DB.prepare("INSERT INTO sites_vitrine_fotos (id, site, dados, criado) VALUES (?, ?, ?, ?)").bind(novo, id, f.nova, agora).run(); ids.push(novo); }
        else if (guardadas.has(f.id)) ids.push(f.id);
      }
      for (const antiga of guardadas) if (!ids.includes(antiga)) await env.DB.prepare("DELETE FROM sites_vitrine_fotos WHERE id = ? AND site = ?").bind(antiga, id).run();
      const dados = { nicho: valor.cfg.nicho, cidade: valor.cidade, cfg: valor.cfg, servicos: valor.servicos, fotos: ids, logoModelo: valor.logoModelo, logoEspec: valor.logoEspec };
      await env.DB.prepare("UPDATE sites_vitrine SET nome = ?, whats = ?, dados = ?, sem_marca = ?, atualizado = ? WHERE id = ?").bind(valor.nome, valor.whats, JSON.stringify(dados), assinante ? 1 : 0, agora, id).run();
      return json({ ok: true, site: doBanco(await meu(), url.origin), ...situacao });
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroId) return json({ error: e.message, codigo: e.codigo }, e.status);
    console.error("sitevitrine", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
