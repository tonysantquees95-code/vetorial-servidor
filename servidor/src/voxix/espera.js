// Lista de espera do Voxix: POST /voxix/espera {email} (público, sem login).
// Guarda só o e-mail (minúsculo) e a data. Resposta sempre igual, para ninguém descobrir quem já está na lista.
import { ErroLoja } from "../loja/lojas.js";

export const LIMITE_ESPERA_DIA = 300;
export const MAX_EMAIL = 120;

export function emailValido(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.length < 6 || s.length > MAX_EMAIL || !/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(s) || s.includes("..")) {
    throw new ErroLoja(400, "email_invalido", "Esse e-mail não parece certo. Confira e tente de novo.");
  }
  return s;
}

/** `d.site` é um campo escondido no formulário: gente não preenche, robô sim. */
export async function entrarNaEspera(env, d, agora = Date.now()) {
  if (d && typeof d.site === "string" && d.site.trim()) return { ok: true };
  const email = emailValido(d && d.email);
  const dia = new Date(agora).toISOString().slice(0, 10);
  await env.DB.prepare("INSERT INTO voxix_espera_dia (dia, n) VALUES (?, 1) ON CONFLICT(dia) DO UPDATE SET n = n + 1").bind(dia).run();
  const r = await env.DB.prepare("SELECT n FROM voxix_espera_dia WHERE dia = ?").bind(dia).first();
  if (r.n > LIMITE_ESPERA_DIA) throw new ErroLoja(429, "muitos_hoje", "Recebemos muitos pedidos hoje. Tente de novo amanhã.");
  await env.DB.prepare("INSERT OR IGNORE INTO voxix_espera (email, criado) VALUES (?, ?)").bind(email, agora).run();
  return { ok: true };
}
