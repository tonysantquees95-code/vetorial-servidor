// Vetorial ID do administrador: só o e-mail corporativo entra no Painel Dev (superadministrador).
// A sessão é um JWT HS256 (assinado pelo Worker, 12 horas) com papel "superadmin", preso a uma sessão do Vetorial ID
// (3 aparelhos / 2 ativos) que pode ser encerrada à distância.
import { iguais } from "../loja/cripto.js";
import { ErroId, cadastrar, entrar, tokenDoPedido, validarSessao } from "../id/conta.js";
import { assinar, verificar } from "../id/jwt.js";

export const ADMIN_PADRAO = "vetorialtech.dev@gmail.com";
export const VALIDADE_ADMIN_MS = 12 * 3_600_000;
export const emailLimpo = (e) => String(e || "").trim().toLowerCase();
export const emailAdmin = (env) => emailLimpo(env.ADMIN_EMAIL) || ADMIN_PADRAO;
export const ehAdmin = (env, email) => emailLimpo(email) === emailAdmin(env);

async function tokenAdmin(env, r, agora) {
  const token = await assinar(env, { sub: r.usuario.id, sid: r.sessao, dev: r.dispositivo, papel: "superadmin" }, { agora, validadeMs: VALIDADE_ADMIN_MS });
  return { token, papel: "superadmin", expira: agora + VALIDADE_ADMIN_MS, sessao: r.sessao, usuario: r.usuario };
}

/** Entrar no painel: e-mail e senha do Vetorial ID, mas só o e-mail do administrador passa. */
export async function entrarAdmin(env, { email, senha, dispositivo, encerrar, remover }, agora = Date.now()) {
  if (!ehAdmin(env, email)) {
    await new Promise((r) => setTimeout(r, 300)); // não revela se a conta existe
    throw new ErroId(403, "nao_admin", "Este painel é só para a conta administrativa da Vetorial Tech.");
  }
  return tokenAdmin(env, await entrar(env, { email, senha, dispositivo, encerrar, remover }, agora), agora);
}

/** Primeira vez: cria a conta do administrador. Exige o convite (segredo DEV_CONVITE do Worker); só funciona uma vez. */
export async function criarAdmin(env, { senha, nome, convite, dispositivo }, agora = Date.now()) {
  if (!env.DEV_CONVITE || String(env.DEV_CONVITE).length < 8) throw new ErroId(503, "sem_convite", "O convite do Painel Dev ainda não foi configurado no servidor.");
  if (!iguais(String(convite || ""), String(env.DEV_CONVITE))) throw new ErroId(403, "convite_invalido", "Convite incorreto.");
  const email = emailAdmin(env);
  const r = await cadastrar(env, { email, senha, nome: nome || "Vetorial Tech", dispositivo }, agora);
  return tokenAdmin(env, r, agora);
}

/** Barreira de todas as rotas /dev/*: JWT com papel superadmin + sessão ativa + e-mail do administrador. */
export async function exigirAdmin(env, req, agora = Date.now()) {
  const dados = await verificar(env, tokenDoPedido(req), agora);
  if (!dados || dados.papel !== "superadmin") throw new ErroId(401, "token_invalido", "Entre de novo no Painel Dev.");
  const ctx = await validarSessao(env, req, { agora });
  if (!ehAdmin(env, ctx.usuario.email)) throw new ErroId(403, "nao_admin", "Acesso restrito ao administrador.");
  return ctx;
}

