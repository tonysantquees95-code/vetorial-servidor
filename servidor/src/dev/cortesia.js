// Cortesia de prazo certo: a conta usa o plano Vênus por 60 dias, sem cobrança, e volta sozinha ao grátis quando vence.
// Não é pagamento: não entra em assinantes nem em receita, e não impede a pessoa de apagar a conta.
import { aleatorio } from "../loja/cripto.js";
import { ErroLoja } from "../loja/lojas.js";

export const DIAS_DE_CORTESIA = 60;
const DIA = 86_400_000;

export const emCortesia = (plano, ativoAte, agora = Date.now()) => plano === "cortesia" && agora < (ativoAte || 0);

/** `alvo` = { id, loja }. Quem chama já conferiu que é o administrador e que o alvo não é administrador. */
export async function darCortesia(env, alvo, quem, agora = Date.now()) {
  const loja = alvo.loja ? await env.DB.prepare("SELECT id, plano, pacote, ativo_ate FROM lojas WHERE id = ?").bind(alvo.loja).first() : null;
  if (!loja) throw new ErroLoja(409, "sem_loja", "Essa conta ainda não tem loja.");
  if (await env.DB.prepare("SELECT 1 AS x FROM testadores t JOIN usuarios u ON lower(u.email) = t.email WHERE u.id = ?").bind(alvo.id).first()) throw new ErroLoja(409, "ja_e_testador", "Essa conta é de testador: já usa tudo sem prazo.");
  if (agora < (loja.ativo_ate || 0)) throw new ErroLoja(409, "ja_tem_plano", "Essa conta já tem um plano em andamento.");
  if (await env.DB.prepare("SELECT 1 AS x FROM cortesias WHERE usuario = ? AND revogada = 0").bind(alvo.id).first()) throw new ErroLoja(409, "cortesia_ja_usada", "Essa conta já usou a cortesia.");
  const fim = agora + DIAS_DE_CORTESIA * DIA;
  // o registro entra primeiro: o índice único barra dois toques ao mesmo tempo
  const id = aleatorio(8);
  try {
    await env.DB.prepare("INSERT INTO cortesias (id, usuario, loja, inicio, fim, plano_antes, pacote_antes, dado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, alvo.id, loja.id, agora, fim, loja.plano || "", loja.pacote || "", quem).run();
  } catch { throw new ErroLoja(409, "cortesia_ja_usada", "Essa conta já usou a cortesia."); }
  const r = await env.DB.prepare("UPDATE lojas SET ativo_ate = ?, plano = 'cortesia', pacote = 'venus' WHERE id = ? AND COALESCE(ativo_ate, 0) <= ?").bind(fim, loja.id, agora).run();
  if (r.meta.changes !== 1) {
    await env.DB.prepare("DELETE FROM cortesias WHERE id = ?").bind(id).run();
    throw new ErroLoja(409, "ja_tem_plano", "Essa conta já tem um plano em andamento.");
  }
  return { ok: true, fim };
}

/** Desfaz uma cortesia dada por engano. Se a pessoa já pagou depois, o plano pago não é tocado. */
export async function tirarCortesia(env, alvo) {
  const c = await env.DB.prepare("SELECT * FROM cortesias WHERE usuario = ? AND revogada = 0").bind(alvo.id).first();
  if (!c) throw new ErroLoja(404, "sem_cortesia", "Essa conta não tem cortesia.");
  const r = await env.DB.prepare("UPDATE lojas SET ativo_ate = 0, plano = ?, pacote = ? WHERE id = ? AND plano = 'cortesia' AND ativo_ate = ?")
    .bind(c.plano_antes, c.pacote_antes, c.loja, c.fim).run();
  if (r.meta.changes !== 1) throw new ErroLoja(409, "ja_tem_plano", "O plano dessa conta mudou depois da cortesia: nada foi alterado.");
  await env.DB.prepare("UPDATE cortesias SET revogada = 1 WHERE id = ?").bind(c.id).run();
  return { ok: true };
}
