// Baixar os apps pelo site exige o Vetorial ID (conta grátis): a Vetorial Tech precisa saber quem baixa os seus produtos.
// O site chama POST /baixar?app=<app> com o token; o servidor confere a conta, conta o download e devolve o endereço do arquivo.
// A rota /atualizacao?...&baixar=1 continua aberta de propósito: é por ela que os apps se atualizam por dentro.
import { ErroId, validarSessao } from "./id/conta.js";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "POST,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });

export const ehRotaBaixar = (c) => c === "/baixar";

/** [entregar] = função que devolve a resposta de /atualizacao?app=...&baixar=1 (um redirecionamento para o arquivo). */
export async function tratarBaixar(req, env, url, { entregar, registrar }) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "não encontrado" }, 404);
  try {
    await validarSessao(env, req, {});
    const app = String(url.searchParams.get("app") || "");
    if (!/^[a-z0-9-]{3,30}$/.test(app)) return json({ error: "app desconhecido" }, 400);
    const destino = new URL(url.origin + "/atualizacao");
    destino.searchParams.set("app", app);
    destino.searchParams.set("baixar", "1");
    const r = await entregar(destino);
    const link = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!link) {
      let motivo = "Não consegui achar o arquivo agora. Tente de novo.";
      try { motivo = (await r.json()).error || motivo; } catch { /* sem corpo */ }
      return json({ error: motivo }, r.status === 404 || r.status === 400 ? r.status : 502);
    }
    await registrar(env, req, app).catch(() => {});
    return json({ url: link });
  } catch (e) {
    if (e instanceof ErroId) return json({ error: e.message, codigo: e.codigo }, e.status);
    console.error("baixar", e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
