// Ponte Vênus ↔ Vortex. A Vênus (voz) pede; o Vortex aberto no aparelho busca, executa e responde.
// Só existem as ações da lista: nenhum comando livre nem caminho de arquivo passa por aqui.
import { ErroId } from "../id/conta.js";
import { aleatorio } from "../loja/cripto.js";

export const ACOES = { abrir_jogo: "Abrir um jogo", otimizar: "Otimizar o Vortex" };
export const VALIDADE_MS = 5 * 60_000;
export const PRESENCA_MS = 20_000;

export async function vortexOnline(env, usuario, agora = Date.now()) {
  const p = await env.DB.prepare("SELECT plataforma, ultimo FROM vortex_presenca WHERE usuario = ?").bind(usuario).first();
  return p && agora - p.ultimo < PRESENCA_MS ? { online: true, plataforma: p.plataforma } : { online: false };
}

export async function pedir(env, usuario, comando, argumento, agora = Date.now()) {
  if (!ACOES[comando]) throw new ErroId(400, "acao_invalida", `Ação desconhecida. Use: ${Object.keys(ACOES).join(", ")}.`);
  const arg = String(argumento || "").trim().slice(0, 100);
  if (comando === "abrir_jogo" && arg.length < 2) throw new ErroId(400, "jogo_faltando", "Diga qual jogo abrir.");
  const on = await vortexOnline(env, usuario, agora);
  if (!on.online) throw new ErroId(409, "vortex_fechado", "O Vortex não está aberto no seu aparelho agora. Abra o Vortex e peça de novo.");
  const pend = await env.DB.prepare("SELECT COUNT(*) AS n FROM vortex_comandos WHERE usuario = ? AND status IN ('pendente','recebido') AND criado > ?").bind(usuario, agora - VALIDADE_MS).first();
  if (pend.n >= 5) throw new ErroId(429, "muitos_pedidos", "Já há pedidos esperando o Vortex. Aguarde terminarem.");
  const id = aleatorio(12);
  await env.DB.prepare("INSERT INTO vortex_comandos (id, usuario, comando, argumento, criado, atualizado) VALUES (?, ?, ?, ?, ?, ?)").bind(id, usuario, comando, arg, agora, agora).run();
  return { id, comando, rotulo: ACOES[comando], plataforma: on.plataforma };
}

/** O Vortex pergunta o que há para fazer (e com isso diz que está aberto). */
export async function buscar(env, usuario, plataforma, agora = Date.now()) {
  await env.DB.prepare("INSERT INTO vortex_presenca (usuario, plataforma, ultimo) VALUES (?, ?, ?) ON CONFLICT(usuario) DO UPDATE SET plataforma = excluded.plataforma, ultimo = excluded.ultimo").bind(usuario, plataforma, agora).run();
  await env.DB.prepare("UPDATE vortex_comandos SET status = 'expirado', atualizado = ? WHERE usuario = ? AND status IN ('pendente','recebido') AND criado <= ?").bind(agora, usuario, agora - VALIDADE_MS).run();
  const { results } = await env.DB.prepare("SELECT id, comando, argumento, criado FROM vortex_comandos WHERE usuario = ? AND status = 'pendente' ORDER BY criado LIMIT 5").bind(usuario).all();
  for (const r of results) await env.DB.prepare("UPDATE vortex_comandos SET status = 'recebido', atualizado = ? WHERE id = ? AND status = 'pendente'").bind(agora, r.id).run();
  return results;
}

export async function responder(env, usuario, id, d, agora = Date.now()) {
  const c = await env.DB.prepare("SELECT * FROM vortex_comandos WHERE id = ? AND usuario = ?").bind(id, usuario).first();
  if (!c) throw new ErroId(404, "pedido_inexistente", "Pedido não encontrado.");
  if (c.status === "concluido" || c.status === "falhou") return { ok: true };
  await env.DB.prepare("UPDATE vortex_comandos SET status = ?, resumo = ?, atualizado = ? WHERE id = ?").bind(d.ok === false ? "falhou" : "concluido", String(d.resumo || "").slice(0, 500), agora, id).run();
  return { ok: true };
}

export async function consultar(env, usuario, id, agora = Date.now()) {
  const c = await env.DB.prepare("SELECT * FROM vortex_comandos WHERE id = ? AND usuario = ?").bind(id, usuario).first();
  if (!c) throw new ErroId(404, "pedido_inexistente", "Pedido não encontrado.");
  const status = (c.status === "pendente" || c.status === "recebido") && agora - c.criado > VALIDADE_MS ? "expirado" : c.status;
  return { id: c.id, comando: c.comando, argumento: c.argumento, status, resumo: c.resumo || "" };
}
