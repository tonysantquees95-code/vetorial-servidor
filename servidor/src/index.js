/**
 * Servidor da Vênus (Cloudflare Workers + D1).
 *
 *   GET  /saude                          → está no ar?
 *   GET  /atualizacao?app=venus|windows|robo|vindex-android|vindex-windows|vortex-android|vortex-windows|velox-android|velox-windows → versão mais nova {numero, tag, notas, tamanho, sha256, url}; &baixar=1 redireciona ao APK
 *   POST /aviso/<canal>                  → guarda um aviso curto (ex.: "publicacao", "pago 12")
 *   GET  /aviso/<canal>?desde=<id>       → avisos depois do id {avisos:[{id,texto,criado}], ultimo}
 *   POST /cobranca/aviso                 → webhook da InfinitePay (cobrança por link dos lojistas)
 *   GET  /cobranca/status?ref=&handle=   → o pagamento foi feito? (confirma com a InfinitePay)
 *   POST /chat                           → conversa com busca na web (Groq + Tavily, reserva Gemini) — ver chat.js
 *   POST /v1/chat, POST /v1/ocr, GET /v1/rotas → roteador de IA por função (Groq / DeepSeek / Gemini só multimodal), CORS e cache vetorial — ver ia/
 *   POST /ia/v1/chat/completions, GET /ia/v1/models → IA para os apps (compatível com a OpenAI), só com Vetorial ID — ver ia/proxy.js
 *  /id, /id/*                           → Vetorial ID: login único (JWT), dispositivos (3) e sessões (2 ativas), sincronização — ver id/
 *  /voxix/*                             → Voxix (chat para gamers): perfis, mensagens, bloqueio, denúncia e ditado — ver voxix/
 *  /dev/*                               → Painel Dev da Vetorial Tech (só o superadministrador) — ver dev/
 *  /loja/*, /canais*, /produtos, /pedidos, /webhook/*, /oauth/* → lojistas, canais de venda (Nuvemshop, Mercado Livre, site próprio) e estoque central — ver loja/
 *
 * Segredos (wrangler secret): GITHUB_TOKEN (só leitura do repositório, para o canal de atualização);
 * GROQ_API_KEY, TAVILY_API_KEY e GEMINI_API_KEY (conversa); DEEPSEEK_API_KEY e APP_TOKEN (opcional) para o roteador /v1.
 */
import { ehAtalho, responderAtalho } from "./atalhos.js";
import { ehRotaVindex, tratarVindex } from "./vindex/rotas.js";
import { ehRotaVoxix, tratarVoxix } from "./voxix/rotas.js";
import { ehRotaCofre, tratarCofre } from "./vindex/cofre.js";
import { ehRotaIcone, tratarIcone } from "./icone.js";
import { ehRotaVortex, tratarVortex } from "./vortex/saves.js";
import { ehRotaDrive, tratarDrive, limparDrive } from "./drive/drive.js";
import { ehRotaCi, tratarCi } from "./ci/assinatura.js";
import { chat, chatPreflight } from "./chat.js";
import { comChavesDoCofre } from "./dev/cofre.js";
import { tratarIA } from "./ia/rotas.js";
import { comCors, preflight } from "./ia/cors.js";
import { ehRotaDaIA, tratarProxyIA } from "./ia/proxy.js";
import { ehRotaDaLoja, tratarLoja } from "./loja/rotas.js";
import { ehRotaDoId, tratarId } from "./id/rotas.js";
import { limpezaDeSessoes } from "./id/conta.js";
import { ehRotaDev, tratarDev } from "./dev/rotas.js";
import { limparTrafego, registrarTrafego, registrarUso } from "./dev/uso.js";
import { publicarVencidos } from "./loja/publicar.js";
import { appConhecido, escolherVersao } from "./atualizacao.js";

export { CaixaVoxix } from "./voxix/caixa.js";

const REPO = "tonysantquees95-code/Venus-core";
const CABECALHOS = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: CABECALHOS });
const texto = (v, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export default {
  async fetch(req, env, ctx) {
    const inicio = Date.now();
    const resp = await this.tratar(req, env, ctx);
    if (env.DB && req.method !== "OPTIONS") ctx.waitUntil(registrarTrafego(env, { metodo: req.method, caminho: new URL(req.url).pathname.replace(/\/+$/, "") || "/", status: resp.status, ms: Date.now() - inicio, origem: req.headers.get("origin") }).catch(() => {}));
    return resp;
  },

  async tratar(req, env, ctx) {
    const url = new URL(req.url);
    const caminho = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (caminho === "/" || caminho === "/saude") return json({ ok: true, servico: "venus", versao: 1 });
      if (ehAtalho(caminho) && req.method === "GET") return responderAtalho(url, caminho);
      if (caminho === "/atualizacao" && req.method === "GET") return await atualizacao(url, env, ctx);
      const canal = caminho.match(/^\/aviso\/([A-Za-z0-9_-]{16,64})$/);
      if (canal && req.method === "POST") return await avisoNovo(canal[1], req, env);
      if (canal && req.method === "GET") return await avisosDesde(canal[1], url, env);
      if (caminho === "/cobranca/aviso" && req.method === "POST") return await cobrancaAviso(req, env);
      if (caminho === "/cobranca/status" && req.method === "GET") return await cobrancaStatus(url, env);
      const ehChat = caminho === "/chat" && (req.method === "POST" || req.method === "OPTIONS");
      // as chaves de IA vêm do cofre do Vindex (guardadas 5 min); sem cofre, valem as variáveis do Worker
      const envIA = ehRotaDaIA(caminho) || caminho.startsWith("/v1/") || ehChat ? await comChavesDoCofre(env) : env;
      if (ehRotaDaIA(caminho)) {
        // o app do Windows/navegador também usa a IA da conta: precisa do CORS (o celular fala direto e não precisa)
        const origem = req.headers.get("origin");
        if (req.method === "OPTIONS") return preflight(origem, env);
        return comCors(await tratarProxyIA(req, envIA, ctx, caminho), origem, env);
      }
      if (caminho.startsWith("/v1/")) return await tratarIA(req, envIA, ctx);
      if (ehRotaDoId(caminho)) return await tratarId(req, env, url, caminho);
      if (ehRotaCi(caminho)) return await tratarCi(req, env, url, caminho);
      if (ehRotaVortex(caminho)) return await tratarVortex(req, env, url, caminho);
      if (ehRotaDrive(caminho)) return await tratarDrive(req, env, url, caminho);
      if (ehRotaVindex(caminho)) return await tratarVindex(req, env, url, caminho);
      if (ehRotaVoxix(caminho)) return await tratarVoxix(req, env, url, caminho);
      if (ehRotaCofre(caminho)) return await tratarCofre(req, env, url, caminho);
      if (ehRotaIcone(caminho) && req.method === "GET") return await tratarIcone(req, url, caminho);
      if (ehRotaDev(caminho)) return await tratarDev(req, env, url, caminho);
      if (ehRotaDaLoja(caminho) || (env.DOMINIO_CURTO && url.hostname === env.DOMINIO_CURTO && req.method === "GET" && /^\/[a-z0-9-]{3,32}(\/[^/]+)?$/.test(caminho) && !["/saude", "/atualizacao"].includes(caminho))) {
        return await tratarLoja(req, env, ctx, url, caminho);
      }
      if (caminho === "/chat" && req.method === "OPTIONS") return chatPreflight();
      if (caminho === "/chat" && req.method === "POST") {
        const r = await chat(req, envIA);
        if (env.DB && r.ok) ctx.waitUntil(r.clone().json().then((d) => registrarUso(env, { provedor: d.provider, tarefa: "conversa", uso: null })).catch(() => {}));
        return r;
      }
      return json({ error: "não encontrado" }, 404);
    } catch (e) {
      console.error("venus servidor", caminho, e && e.stack ? e.stack : e);
      return json({ error: "erro interno" }, 500);
    }
  },

  // limpeza diária
  async scheduled(evento, env) {
    if (evento.cron === "*/10 * * * *") { // posts agendados da Central de Marketing
      await publicarVencidos(env);
      return;
    }
    await env.DB.prepare("DELETE FROM avisos WHERE criado < ?").bind(Date.now() - 7 * 86400000).run();
    await limpezaDeSessoes(env);
    await limparTrafego(env);
    try { await limparDrive(env); } catch (e) { console.error("drive limpeza", e); }
    await env.DB.prepare("DELETE FROM cobranca_avisos WHERE criado < ?").bind(Date.now() - 30 * 86400000).run();
  },
};

// ------------------------------------------------------------------ canal de atualização
function gh(env, caminho, extra = {}) {
  return fetch(`https://api.github.com${caminho}`, {
    ...extra,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "venus-servidor",
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
      ...(extra.headers || {}),
    },
  });
}

function notas(corpo) {
  return String(corpo || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^co-authored-by/i.test(l) && !/^claude-session/i.test(l) && !l.startsWith("Baixe o arquivo"))
    .join("\n")
    .slice(0, 600);
}

async function publicacoes(env, ctx, repo = REPO, publico = false) {
  // guarda a lista por 5 minutos (economiza o limite da API do GitHub)
  const chave = new Request(`https://cache.venus/releases/${repo}`);
  const cache = caches.default;
  const guardada = await cache.match(chave);
  if (guardada) return guardada.json();
  const r = publico
    ? await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers: { "User-Agent": "venus-servidor", Accept: "application/vnd.github+json", ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) } })
    : await gh(env, `/repos/${repo}/releases?per_page=100`);
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const lista = await r.json();
  ctx.waitUntil(cache.put(chave, new Response(JSON.stringify(lista), { headers: { "cache-control": "max-age=300" } })));
  return lista;
}

async function atualizacao(url, env, ctx) {
  const app = url.searchParams.get("app") || "venus";
  const cfg = appConhecido(app);
  if (!cfg) return json({ error: "app desconhecido" }, 400);
  if (!cfg.publico && !env.GITHUB_TOKEN) return json({ error: "canal sem token do GitHub" }, 503);
  let lista;
  try { lista = await publicacoes(env, ctx, cfg.repo, !!cfg.publico); } catch { return json({ error: "GitHub indisponível" }, 502); }
  const melhor = escolherVersao(lista, app);
  if (!melhor) return json({ error: "nenhuma versão publicada" }, 404);
  if (cfg.publico) {
    // repositório público: o link do arquivo não expira e não precisa de token
    const link = melhor.apk.browser_download_url;
    if (url.searchParams.get("baixar") === "1") return Response.redirect(link, 302);
    const dig = String(melhor.apk.digest || "");
    return json({ numero: melhor.numero, tag: melhor.r.tag_name, notas: notas(melhor.r.body), tamanho: melhor.apk.size || 0, sha256: dig.toLowerCase().startsWith("sha256:") ? dig.slice(7).toLowerCase() : "", url: link });
  }
  // link assinado do GitHub (vale poucos minutos): o app pede de novo antes de baixar
  const d = await gh(env, `/repos/${REPO}/releases/assets/${melhor.apk.id}`, {
    headers: { Accept: "application/octet-stream" },
    redirect: "manual",
  });
  const link = d.headers.get("location");
  if (!link) return json({ error: `GitHub não deu o link (${d.status})` }, 502);
  if (url.searchParams.get("baixar") === "1") return Response.redirect(link, 302);
  const digest = String(melhor.apk.digest || "");
  return json({
    numero: melhor.numero,
    tag: melhor.r.tag_name,
    notas: notas(melhor.r.body),
    tamanho: melhor.apk.size || 0,
    sha256: digest.toLowerCase().startsWith("sha256:") ? digest.slice(7).toLowerCase() : "",
    url: link,
  });
}

// ------------------------------------------------------------------ canal de avisos
async function avisoNovo(canal, req, env) {
  const corpo = texto(await req.text(), 120);
  if (!corpo) return json({ error: "aviso vazio" }, 400);
  const hoje = await env.DB.prepare("SELECT COUNT(*) AS n FROM avisos WHERE canal = ? AND criado > ?")
    .bind(canal, Date.now() - 86400000)
    .first();
  if ((hoje && hoje.n) >= 500) return json({ error: "limite de avisos do dia" }, 429);
  const r = await env.DB.prepare("INSERT INTO avisos (canal, texto, criado) VALUES (?, ?, ?)").bind(canal, corpo, Date.now()).run();
  return json({ ok: true, id: r.meta.last_row_id });
}

async function avisosDesde(canal, url, env) {
  const desde = Number(url.searchParams.get("desde"));
  const consulta = Number.isFinite(desde) && desde > 0
    ? env.DB.prepare("SELECT id, texto, criado FROM avisos WHERE canal = ? AND id > ? ORDER BY id LIMIT 50").bind(canal, desde)
    : env.DB.prepare("SELECT id, texto, criado FROM avisos WHERE canal = ? AND criado > ? ORDER BY id LIMIT 50").bind(canal, Date.now() - 30 * 60000);
  const { results } = await consulta.all();
  let ultimo = results.length ? results[results.length - 1].id : Number.isFinite(desde) && desde > 0 ? desde : 0;
  if (!ultimo) {
    const max = await env.DB.prepare("SELECT MAX(id) AS id FROM avisos WHERE canal = ?").bind(canal).first();
    ultimo = (max && max.id) || 0;
  }
  return json({ avisos: results, ultimo });
}

// ------------------------------------------------------------------ cobrança (InfinitePay)
async function cobrancaAviso(req, env) {
  try {
    const c = JSON.parse(await req.text());
    const ref = texto(c.order_nsu);
    if (ref) {
      const slug = texto(c.invoice_slug) || texto(c.slug);
      const transacao = texto(c.transaction_nsu);
      await env.DB.prepare(
        "INSERT INTO cobranca_avisos (order_nsu, slug, transaction_nsu, corpo, criado) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(order_nsu) DO UPDATE SET slug = excluded.slug, transaction_nsu = excluded.transaction_nsu, corpo = excluded.corpo",
      ).bind(ref, slug, transacao, JSON.stringify(c).slice(0, 4000), Date.now()).run();
    }
  } catch (e) {
    console.error("cobranca aviso", e);
  }
  return json({ ok: true });
}

async function cobrancaStatus(url, env) {
  const ref = (url.searchParams.get("ref") || "").trim();
  const handle = (url.searchParams.get("handle") || "").trim().replace(/^\$/, "");
  const nada = { pago: false, avisado: false, valorCentavos: null, forma: null, recibo: null };
  if (ref.length < 12 || !handle) return json(nada, 400);
  const aviso = await env.DB.prepare("SELECT * FROM cobranca_avisos WHERE order_nsu = ?").bind(ref).first();
  if (!aviso || !aviso.slug || !aviso.transaction_nsu) return json(nada);
  const r = await fetch("https://api.checkout.infinitepay.io/payment_check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, order_nsu: ref, transaction_nsu: aviso.transaction_nsu, slug: aviso.slug }),
  });
  const d = await r.json().catch(() => ({}));
  let corpo = {};
  try {
    corpo = JSON.parse(aviso.corpo || "{}");
  } catch (e) {}
  const valor = Number(d.paid_amount ?? d.amount);
  return json({
    pago: d.paid === true,
    avisado: true,
    valorCentavos: Number.isFinite(valor) ? valor : null,
    forma: typeof d.capture_method === "string" ? d.capture_method : null,
    recibo: typeof corpo.receipt_url === "string" ? corpo.receipt_url : null,
  });
}
