// Agenda no banco: serviços, equipe, horários, marcações. As regras de dia/horário estão em horarios.js.
import { aleatorio } from "../loja/cripto.js";
import { ErroLoja } from "../loja/lojas.js";
import { agoraLocal, dataValida, diaDaSemana, diasEntre, hhmm, lerHHMM, livres, normalizarSemana } from "./horarios.js";

const LIMITES = { servicos: 60, profissionais: 20 };
export const STATUS = ["marcado", "concluido", "faltou", "cancelado"];
const texto = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const inteiro = (v, min, max, padrao) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : padrao;
};
const corOk = (c, padrao = "#E36BD0") => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c).toUpperCase() : padrao);
export const soDigitos = (t) => String(t || "").replace(/\D/g, "");

/** Telefone brasileiro só com números, com o 55 na frente (para o link do WhatsApp). */
export function telefoneBr(t) {
  const n = soDigitos(t);
  if (n.length === 10 || n.length === 11) return `55${n}`;
  if ((n.length === 12 || n.length === 13) && n.startsWith("55")) return n;
  return "";
}

// ----------------------------------------------------------------------------------------------- configuração
export async function garantirConfig(env, lojaId, agora = Date.now()) {
  let c = await env.DB.prepare("SELECT * FROM agenda_config WHERE loja = ?").bind(lojaId).first();
  if (!c) {
    await env.DB.prepare("INSERT OR IGNORE INTO agenda_config (loja, token_geral, criado) VALUES (?, ?, ?)").bind(lojaId, aleatorio(24), agora).run();
    c = await env.DB.prepare("SELECT * FROM agenda_config WHERE loja = ?").bind(lojaId).first();
  }
  return c;
}

export async function salvarConfig(env, lojaId, d) {
  const c = await garantirConfig(env, lojaId);
  const passo = [5, 10, 15, 20, 30, 45, 60].includes(Number(d.passo_min)) ? Number(d.passo_min) : c.passo_min;
  await env.DB.prepare("UPDATE agenda_config SET ativa = ?, antecedencia_min = ?, janela_dias = ?, passo_min = ?, intervalo_min = ?, cancelamento_horas = ?, aviso = ? WHERE loja = ?")
    .bind(d.ativa === undefined ? c.ativa : d.ativa ? 1 : 0, inteiro(d.antecedencia_min, 0, 7 * 24 * 60, c.antecedencia_min), inteiro(d.janela_dias, 1, 180, c.janela_dias),
      passo, inteiro(d.intervalo_min, 0, 120, c.intervalo_min), inteiro(d.cancelamento_horas, 0, 72, c.cancelamento_horas), d.aviso === undefined ? c.aviso : texto(d.aviso, 300), lojaId).run();
  return garantirConfig(env, lojaId);
}

export async function novoLinkGeral(env, lojaId) {
  await garantirConfig(env, lojaId);
  const t = aleatorio(24);
  await env.DB.prepare("UPDATE agenda_config SET token_geral = ? WHERE loja = ?").bind(t, lojaId).run();
  return t;
}

// ----------------------------------------------------------------------------------------------- serviços
export async function listarServicos(env, lojaId, { so_ativos = false } = {}) {
  const { results } = await env.DB.prepare(`SELECT id, nome, descricao, duracao_min, preco_centavos, ativo, ordem FROM agenda_servicos WHERE loja = ? ${so_ativos ? "AND ativo = 1" : ""} ORDER BY ordem, criado`).bind(lojaId).all();
  return results.map((s) => ({ ...s, ativo: !!s.ativo }));
}

export async function salvarServico(env, lojaId, d, agora = Date.now()) {
  const nome = texto(d.nome, 80);
  if (!nome) throw new ErroLoja(400, "nome_obrigatorio", "Dê um nome para o serviço.");
  const duracao = inteiro(d.duracao_min, 5, 720, 0);
  if (!duracao) throw new ErroLoja(400, "duracao_invalida", "Informe a duração do serviço em minutos (de 5 a 720).");
  const preco = d.preco_centavos === null || d.preco_centavos === "" || d.preco_centavos === undefined ? null : inteiro(d.preco_centavos, 0, 100_000_000, null);
  const descricao = texto(d.descricao, 200);
  if (d.id) {
    const ex = await env.DB.prepare("SELECT id FROM agenda_servicos WHERE id = ? AND loja = ?").bind(String(d.id), lojaId).first();
    if (!ex) throw new ErroLoja(404, "servico_inexistente", "Serviço não encontrado.");
    await env.DB.prepare("UPDATE agenda_servicos SET nome = ?, descricao = ?, duracao_min = ?, preco_centavos = ?, ativo = ? WHERE id = ?")
      .bind(nome, descricao, duracao, preco, d.ativo === false ? 0 : 1, ex.id).run();
    return ex.id;
  }
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM agenda_servicos WHERE loja = ?").bind(lojaId).first();
  if (total.n >= LIMITES.servicos) throw new ErroLoja(409, "servicos_demais", `Cada loja pode ter até ${LIMITES.servicos} serviços.`);
  const id = aleatorio(6);
  await env.DB.prepare("INSERT INTO agenda_servicos (id, loja, nome, descricao, duracao_min, preco_centavos, ativo, ordem, criado) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
    .bind(id, lojaId, nome, descricao, duracao, preco, total.n, agora).run();
  return id;
}

export async function removerServico(env, lojaId, id) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM agenda_prof_servicos WHERE servico = ? AND servico IN (SELECT id FROM agenda_servicos WHERE loja = ?)").bind(id, lojaId),
    env.DB.prepare("DELETE FROM agenda_servicos WHERE id = ? AND loja = ?").bind(id, lojaId),
  ]);
}

// ----------------------------------------------------------------------------------------------- equipe
/** A equipe com os serviços que cada um faz e o horário de atendimento da semana. */
export async function listarEquipe(env, lojaId, { so_ativos = false } = {}) {
  const { results: profs } = await env.DB.prepare(`SELECT id, nome, funcao, cor, token, ativo, ordem FROM agenda_profissionais WHERE loja = ? ${so_ativos ? "AND ativo = 1" : ""} ORDER BY ordem, criado`).bind(lojaId).all();
  if (!profs.length) return [];
  const ids = profs.map((p) => p.id);
  const marcas = ids.map(() => "?").join(",");
  const { results: ligacoes } = await env.DB.prepare(`SELECT profissional, servico FROM agenda_prof_servicos WHERE profissional IN (${marcas})`).bind(...ids).all();
  const { results: horarios } = await env.DB.prepare(`SELECT profissional, dia, ini, fim FROM agenda_horarios WHERE profissional IN (${marcas}) ORDER BY dia, ini`).bind(...ids).all();
  return profs.map((p) => ({
    id: p.id, nome: p.nome, funcao: p.funcao, cor: p.cor, token: p.token, ativo: !!p.ativo,
    servicos: ligacoes.filter((l) => l.profissional === p.id).map((l) => l.servico),
    horarios: horarios.filter((h) => h.profissional === p.id).map((h) => ({ dia: h.dia, ini: h.ini, fim: h.fim })),
  }));
}

/** Horário padrão para quem acabou de entrar: segunda a sexta, das 9h às 18h, com pausa das 12h às 13h. */
export const SEMANA_PADRAO = [1, 2, 3, 4, 5].flatMap((dia) => [{ dia, ini: 540, fim: 720 }, { dia, ini: 780, fim: 1080 }]);

export async function salvarProfissional(env, lojaId, d, agora = Date.now()) {
  const nome = texto(d.nome, 60);
  if (!nome) throw new ErroLoja(400, "nome_obrigatorio", "Dê um nome para o profissional.");
  let id = d.id ? String(d.id) : "";
  if (id) {
    const ex = await env.DB.prepare("SELECT id FROM agenda_profissionais WHERE id = ? AND loja = ?").bind(id, lojaId).first();
    if (!ex) throw new ErroLoja(404, "profissional_inexistente", "Profissional não encontrado.");
    await env.DB.prepare("UPDATE agenda_profissionais SET nome = ?, funcao = ?, cor = ?, ativo = ? WHERE id = ?").bind(nome, texto(d.funcao, 60), corOk(d.cor), d.ativo === false ? 0 : 1, id).run();
  } else {
    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM agenda_profissionais WHERE loja = ?").bind(lojaId).first();
    if (total.n >= LIMITES.profissionais) throw new ErroLoja(409, "equipe_grande", `Cada loja pode ter até ${LIMITES.profissionais} profissionais.`);
    id = aleatorio(6);
    await env.DB.prepare("INSERT INTO agenda_profissionais (id, loja, nome, funcao, cor, token, ativo, ordem, criado) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
      .bind(id, lojaId, nome, texto(d.funcao, 60), corOk(d.cor), aleatorio(24), total.n, agora).run();
  }
  const lote = [];
  if (Array.isArray(d.servicos)) {
    const { results: meus } = await env.DB.prepare("SELECT id FROM agenda_servicos WHERE loja = ?").bind(lojaId).all();
    const validos = new Set(meus.map((s) => s.id));
    lote.push(env.DB.prepare("DELETE FROM agenda_prof_servicos WHERE profissional = ?").bind(id));
    for (const s of [...new Set(d.servicos.map(String))].filter((s) => validos.has(s))) lote.push(env.DB.prepare("INSERT INTO agenda_prof_servicos (profissional, servico) VALUES (?, ?)").bind(id, s));
  }
  if (Array.isArray(d.horarios) || !d.id) {
    const semana = normalizarSemana(Array.isArray(d.horarios) ? d.horarios : SEMANA_PADRAO);
    lote.push(env.DB.prepare("DELETE FROM agenda_horarios WHERE profissional = ?").bind(id));
    for (const h of semana) lote.push(env.DB.prepare("INSERT INTO agenda_horarios (profissional, dia, ini, fim) VALUES (?, ?, ?, ?)").bind(id, h.dia, h.ini, h.fim));
  }
  if (lote.length) await env.DB.batch(lote);
  return id;
}

export async function removerProfissional(env, lojaId, id) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM agenda_prof_servicos WHERE profissional IN (SELECT id FROM agenda_profissionais WHERE id = ? AND loja = ?)").bind(id, lojaId),
    env.DB.prepare("DELETE FROM agenda_horarios WHERE profissional IN (SELECT id FROM agenda_profissionais WHERE id = ? AND loja = ?)").bind(id, lojaId),
    env.DB.prepare("DELETE FROM agenda_profissionais WHERE id = ? AND loja = ?").bind(id, lojaId),
  ]);
}

export async function novoLinkDoProfissional(env, lojaId, id) {
  const t = aleatorio(24);
  const r = await env.DB.prepare("UPDATE agenda_profissionais SET token = ? WHERE id = ? AND loja = ?").bind(t, id, lojaId).run();
  if (!r.meta.changes) throw new ErroLoja(404, "profissional_inexistente", "Profissional não encontrado.");
  return t;
}

// ----------------------------------------------------------------------------------------------- bloqueios (folgas)
export async function listarBloqueios(env, lojaId, de) {
  const { results } = await env.DB.prepare("SELECT id, profissional, data, ini, fim, motivo FROM agenda_bloqueios WHERE loja = ? AND data >= ? ORDER BY data, ini LIMIT 200").bind(lojaId, de).all();
  return results;
}
export async function criarBloqueio(env, lojaId, d) {
  if (!dataValida(d.data)) throw new ErroLoja(400, "data_invalida", "Informe a data (AAAA-MM-DD).");
  const diaTodo = d.ini === undefined && d.fim === undefined;
  const ini = diaTodo ? 0 : typeof d.ini === "string" ? lerHHMM(d.ini) : Number(d.ini);
  const fim = diaTodo ? 1440 : typeof d.fim === "string" ? lerHHMM(d.fim) : Number(d.fim);
  if (!Number.isInteger(ini) || !Number.isInteger(fim) || ini < 0 || fim > 1440 || fim <= ini) throw new ErroLoja(400, "horario_invalido", "O horário de término precisa ser depois do de início.");
  let prof = null;
  if (d.profissional) {
    prof = await env.DB.prepare("SELECT id FROM agenda_profissionais WHERE id = ? AND loja = ?").bind(String(d.profissional), lojaId).first();
    if (!prof) throw new ErroLoja(404, "profissional_inexistente", "Profissional não encontrado.");
  }
  const r = await env.DB.prepare("INSERT INTO agenda_bloqueios (loja, profissional, data, ini, fim, motivo) VALUES (?, ?, ?, ?, ?, ?)").bind(lojaId, prof ? prof.id : null, d.data, ini, fim, texto(d.motivo, 80)).run();
  return r.meta.last_row_id;
}
export const removerBloqueio = (env, lojaId, id) => env.DB.prepare("DELETE FROM agenda_bloqueios WHERE id = ? AND loja = ?").bind(Number(id), lojaId).run();

// ----------------------------------------------------------------------------------------------- horários livres
async function ocupacaoDoDia(env, lojaId, profId, data) {
  const { results: marcadas } = await env.DB.prepare("SELECT ini, fim FROM agenda_reservas WHERE loja = ? AND profissional = ? AND data = ? AND status IN ('marcado', 'concluido')").bind(lojaId, profId, data).all();
  const { results: bloqueios } = await env.DB.prepare("SELECT ini, fim FROM agenda_bloqueios WHERE loja = ? AND data = ? AND (profissional IS NULL OR profissional = ?)").bind(lojaId, data, profId).all();
  return [...marcadas, ...bloqueios];
}

/** Quem atende este serviço (ativo e com o serviço na lista dele, ou sem lista = faz tudo). */
export async function quemFaz(env, lojaId, servicoId, profId = null) {
  const equipe = await listarEquipe(env, lojaId, { so_ativos: true });
  return equipe.filter((p) => (!profId || p.id === profId) && (!p.servicos.length || p.servicos.includes(servicoId)));
}

/** Horários livres de um dia para um serviço. Sem profissional escolhido, junta a equipe toda ("tanto faz"). */
export async function horariosLivres(env, lojaId, { servicoId, profId = null, data, agora = Date.now(), config = null }) {
  const cfg = config || (await garantirConfig(env, lojaId));
  if (!dataValida(data)) throw new ErroLoja(400, "data_invalida", "Data inválida.");
  const hoje = agoraLocal(agora);
  const dias = diasEntre(hoje.data, data);
  if (dias < 0 || dias > cfg.janela_dias) return [];
  const servico = await env.DB.prepare("SELECT id, duracao_min, ativo FROM agenda_servicos WHERE id = ? AND loja = ?").bind(servicoId, lojaId).first();
  if (!servico || !servico.ativo) throw new ErroLoja(404, "servico_inexistente", "Serviço não encontrado.");
  const dia = diaDaSemana(data);
  const apartirDe = dias === 0 ? hoje.minuto + cfg.antecedencia_min : 0;
  const mapa = new Map();
  for (const p of await quemFaz(env, lojaId, servico.id, profId)) {
    const janelas = p.horarios.filter((h) => h.dia === dia);
    if (!janelas.length) continue;
    const ocupados = await ocupacaoDoDia(env, lojaId, p.id, data);
    for (const ini of livres({ janelas, ocupados, duracao: servico.duracao_min, passo: cfg.passo_min, intervalo: cfg.intervalo_min, apartirDe })) {
      if (!mapa.has(ini)) mapa.set(ini, { ini, hora: hhmm(ini), profissional: p.id, profissionalNome: p.nome });
    }
  }
  return [...mapa.values()].sort((a, b) => a.ini - b.ini);
}

// ----------------------------------------------------------------------------------------------- marcações
/**
 * Marca um horário sem deixar dois clientes no mesmo lugar: a conferência e a gravação são UM comando só no banco,
 * então duas pessoas tocando "confirmar" ao mesmo tempo não conseguem as duas.
 */
async function gravarSemChoque(env, lojaId, r, config, agora) {
  const codigo = aleatorio(6);
  const folga = config.intervalo_min || 0;
  const res = await env.DB.prepare(
    `INSERT INTO agenda_reservas (loja, profissional, servico, servico_nome, duracao_min, preco_centavos, data, ini, fim, cliente, telefone, obs, status, origem, codigo, criado, atualizado)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'marcado', ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM agenda_reservas WHERE profissional = ? AND data = ? AND status IN ('marcado', 'concluido') AND ini < ? AND fim > ?)
       AND NOT EXISTS (SELECT 1 FROM agenda_bloqueios WHERE loja = ? AND data = ? AND (profissional IS NULL OR profissional = ?) AND ini < ? AND fim > ?)`)
    .bind(lojaId, r.profissional, r.servico, r.servicoNome, r.duracao, r.preco, r.data, r.ini, r.fim, r.cliente, r.telefone, r.obs, r.origem, codigo, agora, agora,
      r.profissional, r.data, r.fim + folga, r.ini - folga,
      lojaId, r.data, r.profissional, r.fim, r.ini).run();
  if (!res.meta.changes) throw new ErroLoja(409, "horario_ocupado", "Esse horário acabou de ser ocupado. Escolha outro.");
  return { id: res.meta.last_row_id, codigo };
}

/** Marcação feita pelo cliente na página pública. */
export async function reservar(env, loja, d, { agora = Date.now(), config = null } = {}) {
  const cfg = config || (await garantirConfig(env, loja.id));
  if (!cfg.ativa) throw new ErroLoja(403, "agenda_desligada", "A agenda online está pausada. Fale com o estabelecimento.");
  const cliente = texto(d.cliente, 80);
  const telefone = telefoneBr(d.telefone);
  if (cliente.length < 2) throw new ErroLoja(400, "nome_obrigatorio", "Informe o seu nome.");
  if (!telefone) throw new ErroLoja(400, "telefone_invalido", "Informe o seu WhatsApp com DDD.");
  const ini = Number(d.ini);
  if (!Number.isInteger(ini)) throw new ErroLoja(400, "horario_invalido", "Escolha um horário.");
  const servicoId = String(d.servico || "");
  const livresDoDia = await horariosLivres(env, loja.id, { servicoId, profId: d.profissional ? String(d.profissional) : null, data: String(d.data || ""), agora, config: cfg });
  const livre = livresDoDia.find((h) => h.ini === ini);
  if (!livre) throw new ErroLoja(409, "horario_ocupado", "Esse horário não está mais disponível. Escolha outro.");
  // ninguém reserva a agenda inteira: até 3 marcações futuras por telefone
  const hoje = agoraLocal(agora);
  const ativas = await env.DB.prepare("SELECT COUNT(*) AS n FROM agenda_reservas WHERE loja = ? AND telefone = ? AND status = 'marcado' AND data >= ?").bind(loja.id, telefone, hoje.data).first();
  if (ativas.n >= 3) throw new ErroLoja(429, "muitas_marcacoes", "Você já tem 3 horários marcados. Cancele um ou fale com o estabelecimento.");
  const servico = await env.DB.prepare("SELECT nome, duracao_min, preco_centavos FROM agenda_servicos WHERE id = ?").bind(servicoId).first();
  const r = { profissional: livre.profissional, servico: servicoId, servicoNome: servico.nome, duracao: servico.duracao_min, preco: servico.preco_centavos, data: String(d.data), ini, fim: ini + servico.duracao_min, cliente, telefone, obs: texto(d.obs, 200), origem: "online" };
  const g = await gravarSemChoque(env, loja.id, r, cfg, agora);
  return { ...g, ...r, profissionalNome: livre.profissionalNome };
}

/** Marcação feita pelo dono ou pela recepção (balcão, telefone, WhatsApp): vale qualquer horário que esteja vago. */
export async function reservarNoBalcao(env, loja, d, { agora = Date.now() } = {}) {
  const cfg = await garantirConfig(env, loja.id);
  const cliente = texto(d.cliente, 80);
  if (cliente.length < 2) throw new ErroLoja(400, "nome_obrigatorio", "Informe o nome do cliente.");
  if (!dataValida(String(d.data))) throw new ErroLoja(400, "data_invalida", "Data inválida.");
  const ini = typeof d.ini === "string" ? lerHHMM(d.ini) : Number(d.ini);
  if (!Number.isInteger(ini) || ini < 0 || ini >= 1440) throw new ErroLoja(400, "horario_invalido", "Horário inválido.");
  const prof = await env.DB.prepare("SELECT id FROM agenda_profissionais WHERE id = ? AND loja = ?").bind(String(d.profissional || ""), loja.id).first();
  if (!prof) throw new ErroLoja(404, "profissional_inexistente", "Escolha o profissional.");
  const servico = await env.DB.prepare("SELECT id, nome, duracao_min, preco_centavos FROM agenda_servicos WHERE id = ? AND loja = ?").bind(String(d.servico || ""), loja.id).first();
  if (!servico) throw new ErroLoja(404, "servico_inexistente", "Escolha o serviço.");
  const duracao = inteiro(d.duracao_min, 5, 720, servico.duracao_min);
  const fim = ini + duracao;
  if (fim > 1440) throw new ErroLoja(400, "horario_invalido", "O atendimento passa da meia-noite.");
  const r = { profissional: prof.id, servico: servico.id, servicoNome: servico.nome, duracao, preco: d.preco_centavos === undefined ? servico.preco_centavos : inteiro(d.preco_centavos, 0, 100_000_000, null), data: String(d.data), ini, fim, cliente, telefone: telefoneBr(d.telefone), obs: texto(d.obs, 200), origem: "balcao" };
  const g = await gravarSemChoque(env, loja.id, r, { ...cfg, intervalo_min: 0 }, agora);
  return { ...g, ...r };
}

const COLUNAS_RESERVA = "r.id, r.profissional, p.nome AS profissional_nome, p.cor AS profissional_cor, r.servico_nome, r.duracao_min, r.preco_centavos, r.data, r.ini, r.fim, r.cliente, r.telefone, r.obs, r.status, r.origem, r.codigo, r.criado";

/** Marcações de um intervalo de dias (a loja toda ou um profissional só). */
export async function listarReservas(env, lojaId, de, ate, profId = null) {
  if (!dataValida(de) || !dataValida(ate)) throw new ErroLoja(400, "data_invalida", "Informe o período (AAAA-MM-DD).");
  if (diasEntre(de, ate) > 62) throw new ErroLoja(400, "periodo_grande", "Peça no máximo 62 dias de cada vez.");
  const { results } = await env.DB.prepare(
    `SELECT ${COLUNAS_RESERVA} FROM agenda_reservas r LEFT JOIN agenda_profissionais p ON p.id = r.profissional WHERE r.loja = ? AND r.data >= ? AND r.data <= ? ${profId ? "AND r.profissional = ?" : ""} ORDER BY r.data, r.ini LIMIT 1000`)
    .bind(...[lojaId, de, ate, ...(profId ? [profId] : [])]).all();
  return results;
}

export async function reservaPorCodigo(env, codigo) {
  return env.DB.prepare(`SELECT ${COLUNAS_RESERVA}, r.loja FROM agenda_reservas r LEFT JOIN agenda_profissionais p ON p.id = r.profissional WHERE r.codigo = ?`).bind(String(codigo)).first();
}

/** Muda o estado de uma marcação. `escopo`: a loja toda, ou só um profissional (link da equipe). Reabrir uma cancelada confere o choque de novo. */
export async function mudarStatus(env, lojaId, id, status, { profissional = null, agora = Date.now() } = {}) {
  if (!STATUS.includes(status)) throw new ErroLoja(400, "status_invalido", "Estado inválido.");
  const r = await env.DB.prepare("SELECT * FROM agenda_reservas WHERE id = ? AND loja = ?").bind(Number(id), lojaId).first();
  if (!r || (profissional && r.profissional !== profissional)) throw new ErroLoja(404, "reserva_inexistente", "Marcação não encontrada.");
  const reabre = ["cancelado", "faltou"].includes(r.status) && ["marcado", "concluido"].includes(status);
  const guarda = reabre
    ? " AND NOT EXISTS (SELECT 1 FROM agenda_reservas o WHERE o.profissional = ? AND o.data = ? AND o.id <> ? AND o.status IN ('marcado', 'concluido') AND o.ini < ? AND o.fim > ?)"
    : "";
  const res = await env.DB.prepare(`UPDATE agenda_reservas SET status = ?, atualizado = ? WHERE id = ?${guarda}`)
    .bind(...[status, agora, r.id, ...(reabre ? [r.profissional, r.data, r.id, r.fim, r.ini] : [])]).run();
  if (!res.meta.changes) throw new ErroLoja(409, "horario_ocupado", "Já existe outra marcação nesse horário. Cancele ou mude a outra primeiro.");
  return { ...r, status };
}

/** O próprio cliente cancela pelo link dele, respeitando a antecedência que o estabelecimento definiu. */
export async function cancelarPeloCliente(env, codigo, { agora = Date.now() } = {}) {
  const r = await reservaPorCodigo(env, codigo);
  if (!r) throw new ErroLoja(404, "reserva_inexistente", "Marcação não encontrada.");
  if (r.status !== "marcado") throw new ErroLoja(409, "ja_encerrada", "Essa marcação já foi encerrada.");
  const cfg = await garantirConfig(env, r.loja);
  const hoje = agoraLocal(agora);
  const faltam = diasEntre(hoje.data, r.data) * 1440 + (r.ini - hoje.minuto);
  if (faltam < cfg.cancelamento_horas * 60) throw new ErroLoja(409, "prazo_encerrado", `Para cancelar, fale direto com o estabelecimento (o prazo é de ${cfg.cancelamento_horas} h antes).`);
  await env.DB.prepare("UPDATE agenda_reservas SET status = 'cancelado', atualizado = ? WHERE id = ?").bind(agora, r.id).run();
  return r;
}

/** Marcações novas (feitas depois de `desde`) para o aviso no celular do dono. */
export async function marcacoesNovas(env, lojaId, desde) {
  const { results } = await env.DB.prepare(
    `SELECT ${COLUNAS_RESERVA} FROM agenda_reservas r LEFT JOIN agenda_profissionais p ON p.id = r.profissional WHERE r.loja = ? AND r.id > ? AND r.origem = 'online' ORDER BY r.id LIMIT 50`).bind(lojaId, Number(desde) || 0).all();
  const u = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS ultimo FROM agenda_reservas WHERE loja = ?").bind(lojaId).first();
  return { reservas: results, ultimo: u.ultimo };
}

/** Tudo que o painel do dono precisa numa chamada só. */
export async function estado(env, lojaId) {
  const config = await garantirConfig(env, lojaId);
  return { config, servicos: await listarServicos(env, lojaId), equipe: await listarEquipe(env, lojaId) };
}

/** Apaga marcações antigas (mais de 1 ano), para não guardar dados de clientes sem necessidade. */
export async function limparAntigas(env, agora = Date.now()) {
  const corte = new Date(agora - 366 * 86_400_000).toISOString().slice(0, 10);
  await env.DB.prepare("DELETE FROM agenda_reservas WHERE data < ?").bind(corte).run();
  await env.DB.prepare("DELETE FROM agenda_bloqueios WHERE data < ?").bind(corte).run();
}
