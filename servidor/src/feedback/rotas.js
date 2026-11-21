// Rotas públicas do feedback: a página (/feedback) que cada app abre e o envio (POST /feedback).
import { ErroLoja } from "../loja/lojas.js";
import { registrarRelato } from "./dados.js";
import { paginaDeFeedback } from "./pagina.js";

const CAB = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...CAB } });
export const ehRotaDoFeedback = (c) => c === "/feedback";
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'none'; base-uri 'none'";

export async function tratarFeedback(req, env, ctx, url, agora = Date.now()) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" } });
  try {
    if (req.method === "GET") {
      const q = url.searchParams;
      return new Response(paginaDeFeedback({ app: q.get("app") || "", versao: q.get("v") || "", plataforma: q.get("p") || "", cor: q.get("cor") || "" }), { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, ...CAB } });
    }
    if (req.method === "POST") {
      if (env.LIMITADOR) {
        const ip = req.headers.get("cf-connecting-ip") || "x";
        if (!(await env.LIMITADOR.limit({ key: `feedback:${ip}` })).success) throw new ErroLoja(429, "muitas_tentativas", "Muitos envios seguidos. Espere um minuto.");
      }
      const t = await req.text();
      if (t.length > 8000) throw new ErroLoja(413, "corpo_grande", "Texto grande demais.");
      let d;
      try { d = JSON.parse(t || "{}"); } catch { throw new ErroLoja(400, "json_invalido", "O corpo precisa ser um JSON válido."); }
      if (!d || typeof d !== "object" || Array.isArray(d)) throw new ErroLoja(400, "json_invalido", "O corpo precisa ser um JSON válido.");
      if (d.site) return json({ ok: true }); // campo escondido preenchido: robô, finge que deu certo
      return json(await registrarRelato(env, d, req.headers.get("user-agent") || "", agora), 201);
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroLoja) return json({ error: e.message, codigo: e.codigo }, e.status);
    console.error("feedback", e && e.stack ? e.stack : e);
    return json({ error: "Não consegui enviar agora. Tente de novo em instantes." }, 500);
  }
}
