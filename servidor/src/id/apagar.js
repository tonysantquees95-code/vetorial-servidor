// Apagar conta (LGPD). Uma função só, usada pela própria pessoa (POST /id/apagar-conta) e pelo Painel Dev.
// Sai tudo o que é da pessoa e da loja dela (inclusive os clientes que ela cadastrou). Fica só o que precisamos guardar:
//   - pagamentos e avisos de cobrança (registro financeiro);
//   - a linha da loja SEM dados pessoais, com os códigos embaralhados do aparelho e da rede, para o teste grátis não repetir.
// Tabela nova com coluna `usuario` ou `loja`: ponha numa das listas abaixo (teste/apagar-conta.test.mjs cobra).
import { avisarSala } from "../voxix/comunidades.js";

export const POR_USUARIO = [
  "drive_envios", "drive_arquivos", "dispositivos", "sessoes", "sync_docs", "id_recuperacao", "vindex_comandos", "vindex_presenca",
  "vortex_comandos", "vortex_presenca", "vortex_steam", "vortex_steam_login", "cofre_pessoal",
  "voxix_perfis", "voxix_bloqueios", "voxix_uso", "voxix_membros", "voxix_expulsos", "voxix_limpezas", "voxix_jogando", "voxix_jogos",
  "voxix_conquistas", "voxix_apelidos_reservados",
  "pdf_uso", "panfleto_uso", "logo_uso", "cardapio_uso", "caixa_entradas", "links_curtos", "catalogos", "sites_vitrine",
];
/** pagamentos fica de propósito (registro financeiro). */
export const POR_LOJA = [
  "canais", "produtos", "pedidos", "eventos_estoque", "links", "fila_posts", "publicacao_destinos", "post_log", "vitrine_itens", "vitrine_fotos",
  "agenda_config", "agenda_servicos", "agenda_profissionais", "agenda_bloqueios", "agenda_reservas", "site_config", "site_fotos",
];
export const LOJA_MANTIDAS = ["pagamentos"];

async function apagarArquivos(env, prefixo) {
  if (!env.SAVES) return;
  let cursor;
  do {
    const l = await env.SAVES.list({ prefix: prefixo, cursor });
    for (const o of l.objects) await env.SAVES.delete(o.key);
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
}

/** Comunidade em que a pessoa é dona passa para o membro mais antigo; sem mais ninguém, é apagada. */
async function resolverComunidades(env, id, run, todos) {
  for (const c of await todos("SELECT id FROM voxix_comunidades WHERE dono = ?", id)) {
    const herdeiro = (await todos("SELECT usuario FROM voxix_membros WHERE comunidade = ? AND usuario != ? ORDER BY entrou LIMIT 1", c.id, id))[0];
    if (herdeiro) {
      await run("UPDATE voxix_comunidades SET dono = ? WHERE id = ?", herdeiro.usuario, c.id);
      await run("UPDATE voxix_membros SET cargo = 'dono' WHERE comunidade = ? AND usuario = ?", c.id, herdeiro.usuario);
      continue;
    }
    for (const s of await todos("SELECT id FROM voxix_salas WHERE comunidade = ?", c.id)) {
      if (env.VOXIX_SALA) await avisarSala(env, s.id, "/encerrar");
      await run("DELETE FROM voxix_mensagens WHERE para = ?", s.id);
    }
    for (const t of ["voxix_salas", "voxix_membros", "voxix_expulsos"]) await run(`DELETE FROM ${t} WHERE comunidade = ?`, c.id);
    await run("DELETE FROM voxix_comunidades WHERE id = ?", c.id);
  }
  await run("UPDATE voxix_comunidades SET membros = MAX(0, membros - 1) WHERE id IN (SELECT comunidade FROM voxix_membros WHERE usuario = ?)", id);
}

async function apagarDadosDaLoja(env, loja, run, agora) {
  await run("DELETE FROM agenda_prof_servicos WHERE profissional IN (SELECT id FROM agenda_profissionais WHERE loja = ?)", loja);
  await run("DELETE FROM agenda_horarios WHERE profissional IN (SELECT id FROM agenda_profissionais WHERE loja = ?)", loja);
  await run("DELETE FROM vinculos WHERE canal IN (SELECT id FROM canais WHERE loja = ?)", loja);
  await run("DELETE FROM avisos WHERE canal IN (SELECT id FROM canais WHERE loja = ?)", loja);
  for (const t of POR_LOJA) await run(`DELETE FROM ${t} WHERE loja = ?`, loja);
  // a linha fica sem nada pessoal: token e endereço trocados (o token antigo deixa de valer) e plano encerrado
  await run(
    "UPDATE lojas SET token_hash = ?, nome = '', slug = ?, titulo = '', descricao = '', cor = '', logo = '', whatsapp = '', totp_segredo = '', totp_ativo = 0, plano = 'sem_teste', trial_fim = ?, ativo_ate = 0, matriz = NULL WHERE id = ?",
    `apagada:${loja}`, `apagada-${loja}`, agora, loja,
  );
}

export async function apagarConta(env, id, agora = Date.now()) {
  const run = (sql, ...a) => env.DB.prepare(sql).bind(...a).run();
  const todos = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
  const u = (await todos("SELECT email, loja FROM usuarios WHERE id = ?", id))[0];
  if (!u) return false;
  // arquivos primeiro: se falhar, a conta continua e dá para tentar de novo
  await apagarArquivos(env, `drive/${id}/`);
  await apagarArquivos(env, `u/${id}/`);
  await resolverComunidades(env, id, run, todos);
  await run("DELETE FROM drive_pedacos WHERE envio IN (SELECT envio FROM drive_envios WHERE usuario = ?)", id);
  await run("DELETE FROM catalogo_fotos WHERE catalogo IN (SELECT id FROM catalogos WHERE usuario = ?)", id);
  await run("DELETE FROM sites_vitrine_fotos WHERE site IN (SELECT id FROM sites_vitrine WHERE usuario = ?)", id);
  for (const t of POR_USUARIO) await run(`DELETE FROM ${t} WHERE usuario = ?`, id);
  await run("DELETE FROM voxix_bloqueios WHERE bloqueado = ?", id);
  await run("DELETE FROM voxix_limpezas WHERE outro = ?", id);
  await run("DELETE FROM voxix_mensagens WHERE de = ? OR para = ?", id, id);
  await run("DELETE FROM voxix_denuncias WHERE de = ?", id);
  if (u.loja) {
    for (const l of await todos("SELECT id FROM lojas WHERE matriz = ?", u.loja)) await apagarDadosDaLoja(env, l.id, run, agora);
    await apagarDadosDaLoja(env, u.loja, run, agora);
  }
  const email = String(u.email || "").toLowerCase();
  await run("DELETE FROM testadores WHERE lower(email) = ?", email);
  await run("DELETE FROM voxix_espera WHERE lower(email) = ?", email);
  await run("UPDATE feedbacks SET contato = '' WHERE lower(contato) = ?", email);
  await run("DELETE FROM dev_alertas WHERE instr(lower(detalhe), ?) > 0", email);
  await run("DELETE FROM id_tentativas WHERE chave IN (?, ?)", `login:${email}`, `apagar:${id}`);
  await run("DELETE FROM usuarios WHERE id = ?", id);
  return true;
}
