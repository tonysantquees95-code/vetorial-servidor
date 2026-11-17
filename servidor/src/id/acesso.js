// Trava no servidor: mesmo que alguém mexa no aplicativo, o que custa dinheiro (IA) e o que guarda dados (sincronização)
// só responde para conta com teste em andamento ou plano pago.
import { comPrivilegios } from "../loja/lojas.js";
import { estadoDaAssinatura } from "../loja/assinatura.js";

export async function contaComAcesso(env, usuario, agora = Date.now()) {
  if (!env.DB || !usuario || !usuario.loja) return !env.DB; // sem banco só nos testes de unidade
  const loja = await comPrivilegios(env, await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(usuario.loja).first());
  if (!loja) return false;
  return (await estadoDaAssinatura(env, loja, agora)).acesso;
}
/** O app está liberado para esta conta? (acesso ativo E o app incluído no plano: no teste grátis todos, depois só os do pacote.) */
export async function appLiberadoParaConta(env, usuario, app, agora = Date.now()) {
  if (app === "vyntem") return !!usuario; // gratuito: basta ter entrado com o Vetorial ID
  if (!env.DB || !usuario || !usuario.loja) return !env.DB;
  const loja = await comPrivilegios(env, await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(usuario.loja).first());
  if (!loja) return false;
  const e = await estadoDaAssinatura(env, loja, agora);
  return !!e.acesso && e.apps?.[app] !== false;
}
export const MSG_SEM_ACESSO = "O seu teste acabou. Escolha um plano para continuar.";
