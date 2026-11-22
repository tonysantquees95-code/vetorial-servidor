// Catálogo digital da Vênus Vitrine: a página pública /c/<nome>, as fotos e a edição (pede o Vetorial ID só ao publicar).
import { ErroId, validarSessao } from "../id/conta.js";
import { semLimite } from "../pdf/uso.js";
import { CORES, LIMITE_PRODUTOS_GRATIS, LIMITE_PRODUTOS_PAGO, normalizarCatalogo, renderizarCatalogo, slugDe, slugValido, temaPorId, TEMAS } from "./dados.js";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
const CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'self'; base-uri 'none'; form-action 'none'";
const pagina = (corpo, status = 200, cache = "public, max-age=60") => new Response(corpo, { status, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": cache } });
const naoAchei = () => pagina('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta name=robots content=noindex><title>Catálogo não encontrado</title><body style="font-family:system-ui,sans-serif;background:#0f1020;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:20px"><div><h1>Catálogo não encontrado</h1><p>O endereço pode estar errado ou o catálogo saiu do ar.</p></div>', 404, "no-store");

export const ehRotaDeCatalogo = (c) => /^\/c\/[a-z0-9-]{3,30}(\/f\/[a-z0-9]{8,24})?$/.test(c) || c === "/catalogo" || c === "/catalogo/previa" || c === "/catalogo/modelos";

const aleatorio = (n) => { const b = crypto.getRandomValues(new Uint8Array(n)); let s = ""; for (const x of b) s += "abcdefghjkmnpqrstuvwxyz23456789"[x % 31]; return s; };

function doBanco(l, origem) {
  return { slug: l.slug, nome: l.nome, whats: l.whats, descricao: l.descricao, tema: l.tema, cor: l.cor, produtos: JSON.parse(l.produtos), visitas: l.visitas, link: `${origem}/c/${l.slug}` };
}

export async function tratarCatalogo(req, env, url, caminho) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    // ---------- páginas públicas
    let m = /^\/c\/([a-z0-9-]{3,30})$/.exec(caminho);
    if (m && req.method === "GET") {
      const l = await env.DB.prepare("SELECT * FROM catalogos WHERE slug = ?").bind(m[1]).first();
      if (!l) return naoAchei();
      await env.DB.prepare("UPDATE catalogos SET visitas = visitas + 1 WHERE id = ?").bind(l.id).run();
      const c = { ...doBanco(l, url.origin) };
      return pagina(renderizarCatalogo(c, { fotoUrl: (p) => `/c/${l.slug}/f/${p.foto}`, scriptUrl: "/catalogo.js", marca: !l.sem_marca }));
    }
    m = /^\/c\/([a-z0-9-]{3,30})\/f\/([a-z0-9]{8,24})$/.exec(caminho);
    if (m && req.method === "GET") {
      const f = await env.DB.prepare("SELECT f.dados FROM catalogo_fotos f JOIN catalogos c ON c.id = f.catalogo WHERE c.slug = ? AND f.id = ?").bind(m[1], m[2]).first();
      if (!f) return new Response("não achei", { status: 404 });
      const bin = Uint8Array.from(atob(f.dados), (ch) => ch.charCodeAt(0));
      return new Response(bin, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
    }
    // ---------- vitrine dos temas e prévia (sem login)
    if (caminho === "/catalogo/modelos" && req.method === "GET") {
      return json({ limiteGratis: LIMITE_PRODUTOS_GRATIS, limitePago: LIMITE_PRODUTOS_PAGO, cores: CORES, temas: TEMAS.map(({ id, nome, gratis }) => ({ id, nome, gratis })) });
    }
    if (caminho === "/catalogo/previa" && req.method === "POST") {
      if (Number(req.headers.get("content-length") || 0) > 1_800_000) return json({ error: "Muitas fotos de uma vez." }, 413);
      const corpo = await req.json().catch(() => ({}));
      const { erros, valor } = normalizarCatalogo(corpo, { limiteProdutos: LIMITE_PRODUTOS_PAGO });
      if (!valor.produtos.length) return json({ html: "", erros });
      const slug = slugValido(String(corpo.slug || "")) ? corpo.slug : "";
      const html = renderizarCatalogo({ ...valor, whats: valor.whats || "5551999990000" }, {
        fotoUrl: (p) => (p.fotoNova ? `data:image/jpeg;base64,${p.fotoNova}` : slug && p.foto ? `${url.origin}/c/${slug}/f/${p.foto}` : ""),
        scriptUrl: `${url.origin}/catalogo.js`, previa: true,
      });
      return json({ html, erros: erros.filter((e) => !/WhatsApp/.test(e)) });
    }
    // ---------- edição (Vetorial ID)
    const ctx = await validarSessao(env, req, {});
    const assinante = await semLimite(env, ctx.usuario);
    const limiteProdutos = assinante ? LIMITE_PRODUTOS_PAGO : LIMITE_PRODUTOS_GRATIS;
    const situacao = { assinante, limiteProdutos };
    const meu = () => env.DB.prepare("SELECT * FROM catalogos WHERE usuario = ?").bind(ctx.usuario.id).first();
    if (caminho === "/catalogo" && req.method === "GET") {
      const l = await meu();
      return json({ catalogo: l ? doBanco(l, url.origin) : null, ...situacao });
    }
    if (caminho === "/catalogo" && req.method === "POST") {
      if (Number(req.headers.get("content-length") || 0) > 1_800_000) return json({ error: "Muitas fotos de uma vez. Salve em duas etapas.", codigo: "grande" }, 413);
      const corpo = await req.json().catch(() => ({}));
      const { erros, valor } = normalizarCatalogo(corpo, { limiteProdutos });
      if (erros.length) return json({ error: erros[0], erros, ...situacao }, 400);
      if (!temaPorId(valor.tema).gratis && !assinante) return json({ error: "Este tema é só para quem tem assinatura da Vênus.", codigo: "assinatura", ...situacao }, 403);
      const agora = Date.now();
      let l = await meu();
      let id = l?.id;
      if (!l) {
        id = aleatorio(14);
        const base = slugDe(valor.nome).length >= 3 ? slugDe(valor.nome) : "loja";
        let criou = false;
        for (let i = 0; i < 6 && !criou; i++) {
          const slug = i === 0 ? base : `${base.slice(0, 24)}-${aleatorio(3)}`;
          try {
            await env.DB.prepare("INSERT INTO catalogos (id, usuario, slug, nome, whats, descricao, cor, tema, produtos, sem_marca, criado, atualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)")
              .bind(id, ctx.usuario.id, slug, valor.nome, valor.whats, valor.descricao, valor.cor, valor.tema, assinante ? 1 : 0, agora, agora).run();
            criou = true;
          } catch (e) { if (!/UNIQUE/i.test(String(e?.message || e))) throw e; if (await meu()) break; }
        }
        l = await meu();
        if (!l) return json({ error: "Não consegui reservar o endereço agora. Tente de novo.", ...situacao }, 409);
        id = l.id;
      }
      // fotos: as novas entram, as que já existiam só valem se forem deste catálogo, o resto é apagado
      const guardadas = new Set((await env.DB.prepare("SELECT id FROM catalogo_fotos WHERE catalogo = ?").bind(id).all()).results.map((r) => r.id));
      const finais = [];
      for (const p of valor.produtos) {
        let foto = guardadas.has(p.foto) ? p.foto : "";
        if (p.fotoNova) {
          foto = aleatorio(12);
          await env.DB.prepare("INSERT INTO catalogo_fotos (id, catalogo, dados, criado) VALUES (?, ?, ?, ?)").bind(foto, id, p.fotoNova, agora).run();
        }
        finais.push({ nome: p.nome, preco: p.preco, desc: p.desc, foto });
      }
      const usadas = new Set(finais.map((p) => p.foto).filter(Boolean));
      for (const antiga of guardadas) if (!usadas.has(antiga)) await env.DB.prepare("DELETE FROM catalogo_fotos WHERE id = ? AND catalogo = ?").bind(antiga, id).run();
      await env.DB.prepare("UPDATE catalogos SET nome = ?, whats = ?, descricao = ?, cor = ?, tema = ?, produtos = ?, sem_marca = ?, atualizado = ? WHERE id = ?")
        .bind(valor.nome, valor.whats, valor.descricao, valor.cor, valor.tema, JSON.stringify(finais), assinante ? 1 : 0, agora, id).run();
      const salvo = await meu();
      return json({ ok: true, catalogo: doBanco(salvo, url.origin), ...situacao });
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroId) return json({ error: e.message, codigo: e.codigo }, e.status);
    console.error("catalogo", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
