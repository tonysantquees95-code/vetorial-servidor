// Pós-venda de quem recebeu os 60 dias: três mensagens prontas (dia seguinte, dia 7 e dia 50). O Painel Dev lembra a hora de enviar;
// quem envia é a pessoa, o servidor não manda nada ao lojista.
const DIA = 86_400_000, HORA = 3_600_000;
const BRASILIA = 3 * HORA; // fuso fixo (-3)
const JANELA = 3 * DIA; // aviso atrasado além disso não sai (a data continua aparecendo na conta)

export const PASSOS = [
  { dia: 1, rotulo: "Dia seguinte", texto: () => "Conseguiu divulgar o link? Precisa de ajuda em algo?" },
  { dia: 7, rotulo: "Dia 7", texto: () => "O que você mais usou? Conhece outra loja que precise disso?" },
  { dia: 50, rotulo: "Dia 50", texto: (fim) => `Seus 2 meses acabam em ${dataBR(fim)}. Quer continuar com a Vênus por R$ 49,90 por mês, no cartão ou Pix? É opcional.` },
];

export const dataBR = (ms) => new Date(ms - BRASILIA).toISOString().slice(0, 10).split("-").reverse().join("/");
/** 9h de Brasília, `dias` depois do dia da liberação. */
export const quandoEnviar = (inicio, dias) => Math.floor((inicio - BRASILIA) / DIA) * DIA + dias * DIA + 9 * HORA + BRASILIA;
export const mensagensDe = (inicio, fim) => PASSOS.map((p) => ({ dia: p.dia, rotulo: p.rotulo, quando: quandoEnviar(inicio, p.dia), texto: p.texto(fim) }));

export async function verificarAcompanhamentos(env, agora = Date.now()) {
  const { results } = await env.DB.prepare(
    "SELECT c.id, c.loja, c.inicio, c.fim, u.email, " +
      "(SELECT COUNT(*) FROM pagamentos p WHERE p.loja = c.loja AND p.status IN ('pago','liberado') AND p.criado > c.inicio) AS pagou " +
      "FROM cortesias c JOIN usuarios u ON u.id = c.usuario WHERE c.revogada = 0 AND c.inicio > ?",
  ).bind(agora - 70 * DIA).all();
  let novos = 0;
  for (const c of results || []) {
    for (const m of mensagensDe(c.inicio, c.fim)) {
      if (agora < m.quando || agora - m.quando > JANELA) continue;
      if (m.dia === 50 && c.pagou) continue; // já pagou para continuar: não precisa da pergunta
      const r = await env.DB.prepare("INSERT OR IGNORE INTO dev_alertas (criado, tipo, app, grupo, titulo, detalhe, chave) VALUES (?, 'acompanhamento', 'venus', ?, ?, ?, ?)")
        .bind(agora, `acomp:${c.id}`, `Enviar mensagem: ${m.rotulo}`, `${c.email} · assinou em ${dataBR(c.inicio)} · “${m.texto}”`, `acomp:${c.id}:${m.dia}`).run();
      if (r.meta.changes > 0) novos++;
    }
  }
  return novos;
}
