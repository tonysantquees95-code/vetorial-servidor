// Steam no Vortex. Login pelo OpenID da própria Steam (a senha nunca passa por aqui) e lista dos jogos da conta.
//   POST   /vortex/steam/iniciar  → { url } para abrir no navegador e entrar na Steam
//   GET    /vortex/steam/retorno  → a Steam volta aqui (sem sessão: vale pelo "n" gerado no iniciar)
//   GET    /vortex/steam          → { ligado, steamid }
//   DELETE /vortex/steam          → desliga
//   GET    /vortex/steam/jogos    → jogos da conta { jogos: [{ appid, nome, minutos }] }
// A lista usa a chave da Steam (STEAM_API_KEY, grátis) quando há; sem ela lê a página pública do perfil.
import { ErroId } from "../id/conta.js";

const OPENID = "https://steamcommunity.com/openid/login";
const ID_STEAM = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const NS = "http://specs.openid.net/auth/2.0";

export async function iniciar(env, usuario, origem, agora = Date.now()) {
  const nonce = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare("DELETE FROM vortex_steam_login WHERE expira < ?").bind(agora).run();
  await env.DB.prepare("INSERT INTO vortex_steam_login (nonce, usuario, expira) VALUES (?, ?, ?)").bind(nonce, usuario, agora + 10 * 60_000).run();
  const retorno = `${origem}/vortex/steam/retorno?n=${nonce}`;
  const p = new URLSearchParams({
    "openid.ns": NS, "openid.mode": "checkid_setup", "openid.return_to": retorno, "openid.realm": origem,
    "openid.identity": `${NS}/identifier_select`, "openid.claimed_id": `${NS}/identifier_select`,
  });
  return { url: `${OPENID}?${p}` };
}

const pagina = (titulo, texto) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vortex · Steam</title><body style="margin:0;background:#05060d;color:#e6f6ff;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:1.5rem"><div><h1 style="color:#19e3ff">${titulo}</h1><p>${texto}</p></div></body>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

/** A Steam voltou com o login: confere com a própria Steam que a resposta é verdadeira e guarda o número da conta. */
export async function retorno(env, url, origem, buscar = fetch, agora = Date.now()) {
  const n = url.searchParams.get("n") || "";
  const reg = /^[a-f0-9]{24}$/.test(n) ? await env.DB.prepare("SELECT * FROM vortex_steam_login WHERE nonce = ?").bind(n).first() : null;
  if (!reg || reg.expira < agora) return pagina("Link vencido", "Volte ao Vortex e toque em “Entrar com a Steam” de novo.");
  await env.DB.prepare("DELETE FROM vortex_steam_login WHERE nonce = ?").bind(n).run();
  const dados = new URLSearchParams();
  for (const [k, v] of url.searchParams) if (k.startsWith("openid.")) dados.set(k, v);
  if (dados.get("openid.mode") !== "id_res" || dados.get("openid.return_to") !== `${origem}/vortex/steam/retorno?n=${n}`) return pagina("Não deu certo", "A Steam não confirmou o login. Tente de novo pelo Vortex.");
  const m = ID_STEAM.exec(dados.get("openid.claimed_id") || "");
  if (!m) return pagina("Não deu certo", "Não reconheci a conta Steam.");
  dados.set("openid.mode", "check_authentication");
  let ok = false;
  try {
    const r = await buscar(OPENID, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: dados });
    ok = /is_valid\s*:\s*true/.test(await r.text());
  } catch { /* cai no aviso abaixo */ }
  if (!ok) return pagina("Não deu certo", "A Steam não confirmou o login. Tente de novo pelo Vortex.");
  await env.DB.prepare("INSERT INTO vortex_steam (usuario, steamid, atualizado) VALUES (?, ?, ?) ON CONFLICT(usuario) DO UPDATE SET steamid = excluded.steamid, atualizado = excluded.atualizado").bind(reg.usuario, m[1], agora).run();
  return pagina("Steam ligada ✓", "Pode fechar esta página e voltar ao Vortex.");
}

export async function estado(env, usuario) {
  const l = await env.DB.prepare("SELECT steamid FROM vortex_steam WHERE usuario = ?").bind(usuario).first();
  return { ligado: !!l, steamid: l?.steamid ?? null };
}

export async function desligar(env, usuario) {
  await env.DB.prepare("DELETE FROM vortex_steam WHERE usuario = ?").bind(usuario).run();
  return { ligado: false };
}

const PRIVADO = "Não consegui ver seus jogos. No perfil da Steam, deixe “Detalhes dos jogos” como Público (Steam › Perfil › Editar perfil › Privacidade).";

function lerXml(texto) {
  const jogos = [];
  for (const m of texto.matchAll(/<game>([\s\S]*?)<\/game>/g)) {
    const id = /<appID>(\d+)<\/appID>/.exec(m[1]);
    const nome = /<name>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/name>/.exec(m[1]);
    const horas = /<hoursOnRecord>([\d.,]+)<\/hoursOnRecord>/.exec(m[1]);
    if (id && nome) jogos.push({ appid: Number(id[1]), nome: nome[1].trim(), minutos: horas ? Math.round(parseFloat(horas[1].replace(/,/g, "")) * 60) : 0 });
  }
  return jogos;
}

export async function jogos(env, usuario, buscar = fetch) {
  const { steamid } = await estado(env, usuario);
  if (!steamid) throw new ErroId(409, "steam_nao_ligada", "Entre com a sua conta Steam primeiro.");
  let lista = [];
  if (env.STEAM_API_KEY) {
    const r = await buscar(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(env.STEAM_API_KEY)}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1&format=json`);
    const j = r.ok ? await r.json().catch(() => null) : null;
    lista = (j?.response?.games ?? []).map((g) => ({ appid: g.appid, nome: String(g.name || ""), minutos: Number(g.playtime_forever) || 0 })).filter((g) => g.nome);
  }
  if (!lista.length) {
    const r = await buscar(`https://steamcommunity.com/profiles/${steamid}/games?tab=all&xml=1`).catch(() => null);
    lista = r && r.ok ? lerXml(await r.text()) : [];
  }
  if (!lista.length) throw new ErroId(422, "steam_perfil_privado", PRIVADO);
  lista.sort((a, b) => a.nome.localeCompare(b.nome));
  return { jogos: lista.slice(0, 3000), steamid };
}
