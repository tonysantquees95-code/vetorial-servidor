// Visitas ao site, downloads dos apps e novos cadastros para o Painel Dev. Não guarda IP nem navegador: só um código do dia.
import { APPS } from "../feedback/dados.js";

const HORA = 3600000;
const DIA = 24 * HORA;
const FUSO_BR = -3 * HORA;
const ROBO = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|uptime|curl|wget|python|go-http/i;

export const diaDeBrasilia = (agora = Date.now()) => new Date(agora + FUSO_BR).toISOString().slice(0, 10);

/** Página aceita: só letras minúsculas, números, "-", "/" e "." (ex.: "vortex.html", "pdf/"). Qualquer outra coisa vira "". */
export const paginaLimpa = (p) => {
  const s = String(p || "").trim().toLowerCase().replace(/^\/+/, "").replace(/[?#].*$/, "");
  return /^[a-z0-9\-/.]{0,48}$/.test(s) ? (s || "inicio") : "";
};

async function codigoDoVisitante(req, dia) {
  const ip = req.headers.get("cf-connecting-ip") || "";
  const ua = req.headers.get("user-agent") || "";
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${ua}|${dia}`));
  return [...new Uint8Array(b).slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const eRobo = (req) => { const ua = req.headers.get("user-agent") || ""; return !ua || ROBO.test(ua); };

export async function registrarVisita(env, req, pagina, agora = Date.now()) {
  const p = paginaLimpa(pagina);
  if (!p || eRobo(req)) return false;
  const dia = diaDeBrasilia(agora);
  await env.DB.prepare("INSERT OR IGNORE INTO site_visitas (dia, pagina, visitante) VALUES (?, ?, ?)").bind(dia, p, await codigoDoVisitante(req, dia)).run();
  return true;
}

export async function registrarDownload(env, req, app, agora = Date.now()) {
  if (!/^[a-z0-9-]{3,30}$/.test(String(app || "")) || eRobo(req)) return false;
  const dia = diaDeBrasilia(agora);
  await env.DB.prepare("INSERT OR IGNORE INTO downloads_apps (dia, app, visitante, criado) VALUES (?, ?, ?, ?)").bind(dia, app, await codigoDoVisitante(req, dia), agora).run();
  return true;
}

/** Quantas pessoas entraram (visitantes diferentes por dia), por dia e por página, e quantos downloads por app. */
export async function resumoDeVisitas(env, dias = 14, agora = Date.now()) {
  const n = Math.min(90, Math.max(1, dias | 0));
  const hoje = diaDeBrasilia(agora);
  const desde = diaDeBrasilia(agora - (n - 1) * DIA);
  const { results: porDia } = await env.DB.prepare("SELECT dia, COUNT(DISTINCT visitante) AS pessoas FROM site_visitas WHERE dia >= ? GROUP BY dia ORDER BY dia").bind(desde).all();
  const mapa = new Map(porDia.map((x) => [x.dia, x.pessoas]));
  const serie = [];
  for (let i = n - 1; i >= 0; i--) { const d = diaDeBrasilia(agora - i * DIA); serie.push({ dia: d, pessoas: mapa.get(d) || 0 }); }
  const { results: paginas } = await env.DB.prepare("SELECT pagina, COUNT(*) AS visitas FROM site_visitas WHERE dia >= ? GROUP BY pagina ORDER BY visitas DESC LIMIT 10").bind(desde).all();
  const { results: baixados } = await env.DB.prepare("SELECT app, COUNT(*) AS total, SUM(CASE WHEN dia = ? THEN 1 ELSE 0 END) AS hoje FROM downloads_apps WHERE dia >= ? GROUP BY app ORDER BY total DESC").bind(hoje, desde).all();
  const soma = (k) => serie.slice(-k).reduce((a, x) => a + x.pessoas, 0);
  return {
    dias: n, hoje: serie[serie.length - 1].pessoas, ontem: serie.length > 1 ? serie[serie.length - 2].pessoas : 0, ultimos7: soma(7), periodo: soma(n),
    serie, paginas: paginas.map((p) => ({ pagina: p.pagina, visitas: p.visitas })),
    downloads: baixados.map((b) => ({ app: b.app, nome: nomeDoDownload(b.app), total: b.total, hoje: b.hoje || 0 })),
  };
}

/** "vortex-android" → "Vortex (Android)". */
export function nomeDoDownload(app) {
  const [base, plat] = String(app).split("-");
  const nome = APPS[base] || base.charAt(0).toUpperCase() + base.slice(1);
  const p = { android: "Android", windows: "Windows", mac: "Mac", ios: "iPhone" }[plat];
  return p ? `${nome} (${p})` : nome;
}

// ------------------------------------------------------------------ avisos do Painel (rodam no cron de 10 em 10 minutos)
async function gravarAviso(env, a, agora) {
  const r = await env.DB.prepare(
    "INSERT INTO dev_alertas (criado, tipo, app, grupo, titulo, detalhe, chave) VALUES (?, ?, ?, '', ?, ?, ?) " +
      "ON CONFLICT(chave) DO UPDATE SET titulo = excluded.titulo, detalhe = excluded.detalhe, status = CASE WHEN dev_alertas.detalhe != excluded.detalhe THEN 'novo' ELSE dev_alertas.status END",
  ).bind(agora, a.tipo, a.app, a.titulo, a.detalhe, a.chave).run();
  return (r.meta && r.meta.changes) > 0;
}

/** Quem se cadastrou nas últimas 2 horas e por qual app (pelo primeiro acesso). Um aviso por conta. */
export async function verificarCadastros(env, agora = Date.now()) {
  const { results } = await env.DB.prepare(
    "SELECT u.id, u.email, u.criado, (SELECT s.app FROM sessoes s WHERE s.usuario = u.id ORDER BY s.criado LIMIT 1) AS app FROM usuarios u WHERE u.criado > ? ORDER BY u.criado",
  ).bind(agora - 2 * HORA).all();
  let novos = 0;
  for (const u of results || []) {
    const app = u.app || "venus";
    const gravou = await env.DB.prepare("INSERT OR IGNORE INTO dev_alertas (criado, tipo, app, grupo, titulo, detalhe, chave) VALUES (?, 'cadastro', ?, '', ?, ?, ?)")
      .bind(u.criado, app, `Novo cadastro: ${APPS[app] || app}`, String(u.email || "").slice(0, 120), `cadastro:${u.id}`).run();
    if (gravou.meta && gravou.meta.changes > 0) novos++;
  }
  return novos;
}

/** Downloads da última hora (por app) viram um aviso por app e hora; se chegar mais um, o aviso volta a ficar novo. */
export async function verificarDownloads(env, agora = Date.now()) {
  const { results } = await env.DB.prepare("SELECT app, COUNT(*) AS n FROM downloads_apps WHERE criado > ? GROUP BY app").bind(agora - 2 * HORA).all();
  let mexeu = 0;
  const hora = Math.floor(agora / HORA);
  for (const d of results || []) {
    const nome = nomeDoDownload(d.app);
    if (await gravarAviso(env, { tipo: "download", app: d.app.split("-")[0], titulo: `Download: ${nome}`, detalhe: `${d.n} ${d.n === 1 ? "pessoa baixou" : "pessoas baixaram"} nas últimas 2 horas`, chave: `download:${d.app}:${hora}` }, agora)) mexeu++;
  }
  return mexeu;
}

export async function limparVisitas(env, agora = Date.now()) {
  const corte = diaDeBrasilia(agora - 120 * DIA);
  await env.DB.prepare("DELETE FROM site_visitas WHERE dia < ?").bind(corte).run();
  await env.DB.prepare("DELETE FROM downloads_apps WHERE dia < ?").bind(corte).run();
}
