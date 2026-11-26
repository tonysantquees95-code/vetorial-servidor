// Voxix dentro do Vortex: troca de @, "jogando agora", jogos mais jogados, conquistas e privacidade da presença.
//   PUT  /voxix/perfil/apelido {apelido}     → troca o @ (1 vez a cada 30 dias; o antigo fica reservado 60 dias só para a pessoa)
//   PUT  /voxix/privacidade {presenca}       → 'amigos' (padrão) | 'todos' | 'invisivel'
//   PUT  /voxix/jogando {jogo, plataforma}   → batimento do app a cada ~60 s; jogo vazio = parou de jogar
//   PUT  /voxix/conquistas {itens:[{id,nome}]} → conquistas que aparecem no perfil
//   GET  /voxix/pessoas/<apelido>            → perfil público: conquistas, 3 jogos mais jogados e (se permitido) "jogando agora"
//   GET  /voxix/presenca?apelidos=a,b,c      → quem, entre esses, está jogando agora (e pode ser visto por mim)
// "Amigo" = quem já trocou mensagem comigo (entregue) ou divide uma comunidade. Quem me bloqueou nunca vê o que eu jogo.
import { ErroLoja } from "../loja/lojas.js";

export const DIAS_ENTRE_TROCAS = 30;
export const DIAS_RESERVADO = 60;
export const VALIDADE_PRESENCA_MS = 3 * 60_000;
export const MAX_JOGOS_POR_PESSOA = 100;
export const MAX_CONQUISTAS = 40;
export const PRESENCAS = ["amigos", "todos", "invisivel"];
export const PLATAFORMAS = ["android", "windows", "web", "retro"];
const DIA = 86_400_000;

/** Nome de jogo/conquista seguro para mostrar: sem controle nem < >, até `max` letras. */
export function textoCurto(v, max) {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f<>\u2028\u2029]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

// ------------------------------------------------------------------ troca de @
/** `apelido` já veio de apelidoValido (minúsculo, 3–20, não reservado). */
export async function trocarApelido(env, usuario, apelido, agora = Date.now()) {
  const eu = await env.DB.prepare("SELECT usuario, apelido, apelido_trocado FROM voxix_perfis WHERE usuario = ?").bind(usuario).first();
  if (!eu) throw new ErroLoja(409, "sem_perfil", "Crie o seu perfil do Voxix antes.");
  if (eu.apelido.toLowerCase() === apelido) return { apelido: eu.apelido, proximaTroca: eu.apelido_trocado ? eu.apelido_trocado + DIAS_ENTRE_TROCAS * DIA : null };
  const liberaEm = eu.apelido_trocado ? eu.apelido_trocado + DIAS_ENTRE_TROCAS * DIA : 0;
  if (liberaEm > agora) {
    const e = new ErroLoja(429, "troca_cedo", `Você já trocou o @ há pouco tempo. Dá para trocar de novo em ${Math.ceil((liberaEm - agora) / DIA)} dia(s).`);
    e.dados = { proximaTroca: liberaEm };
    throw e;
  }
  const reservado = await env.DB.prepare("SELECT usuario, ate FROM voxix_apelidos_reservados WHERE apelido = ?").bind(apelido).first();
  if (reservado && reservado.ate > agora && reservado.usuario !== usuario) throw new ErroLoja(409, "apelido_em_uso", "Esse @ não está disponível.");
  if (await env.DB.prepare("SELECT 1 AS x FROM voxix_perfis WHERE apelido = ? AND usuario <> ?").bind(apelido, usuario).first()) throw new ErroLoja(409, "apelido_em_uso", "Esse @ não está disponível.");
  // um único UPDATE confere a espera de 30 dias (duas trocas ao mesmo tempo: só uma passa) e o UNIQUE do apelido barra o empate
  let r;
  try {
    r = await env.DB.prepare("UPDATE voxix_perfis SET apelido = ?, apelido_trocado = ? WHERE usuario = ? AND (apelido_trocado IS NULL OR apelido_trocado <= ?)").bind(apelido, agora, usuario, agora - DIAS_ENTRE_TROCAS * DIA).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new ErroLoja(409, "apelido_em_uso", "Esse @ não está disponível.");
    throw e;
  }
  if (!r.meta.changes) throw new ErroLoja(429, "troca_cedo", "Você já trocou o @ há pouco tempo.");
  // o antigo fica reservado para a pessoa; se ela está voltando a um @ reservado dela, a reserva some
  await env.DB.prepare("DELETE FROM voxix_apelidos_reservados WHERE apelido = ?").bind(apelido).run();
  await env.DB.prepare("INSERT INTO voxix_apelidos_reservados (apelido, usuario, ate) VALUES (?, ?, ?) ON CONFLICT(apelido) DO UPDATE SET usuario = excluded.usuario, ate = excluded.ate").bind(eu.apelido.toLowerCase(), usuario, agora + DIAS_RESERVADO * DIA).run();
  return { apelido, proximaTroca: agora + DIAS_ENTRE_TROCAS * DIA };
}

/** Na criação do perfil: um @ reservado por outra pessoa não vale. */
export async function apelidoReservadoPorOutro(env, usuario, apelido, agora = Date.now()) {
  const r = await env.DB.prepare("SELECT usuario, ate FROM voxix_apelidos_reservados WHERE apelido = ?").bind(apelido).first();
  return !!(r && r.ate > agora && r.usuario !== usuario);
}

// ------------------------------------------------------------------ privacidade, jogando agora
export async function definirPresenca(env, usuario, presenca) {
  if (!PRESENCAS.includes(presenca)) throw new ErroLoja(400, "presenca_invalida", "Escolha: amigos, todos ou invisível.");
  const r = await env.DB.prepare("UPDATE voxix_perfis SET presenca = ? WHERE usuario = ?").bind(presenca, usuario).run();
  if (!r.meta.changes) throw new ErroLoja(409, "sem_perfil", "Crie o seu perfil do Voxix antes.");
  if (presenca === "invisivel") await env.DB.prepare("DELETE FROM voxix_jogando WHERE usuario = ?").bind(usuario).run();
  return { presenca };
}

/** Batimento: grava o jogo atual e soma o tempo jogado (no máximo 2 min por batimento, para não inflar). */
export async function jogando(env, usuario, d, agora = Date.now()) {
  const eu = await env.DB.prepare("SELECT presenca FROM voxix_perfis WHERE usuario = ?").bind(usuario).first();
  if (!eu) throw new ErroLoja(409, "sem_perfil", "Crie o seu perfil do Voxix antes.");
  const jogo = textoCurto(d.jogo, 60);
  if (!jogo) { await env.DB.prepare("DELETE FROM voxix_jogando WHERE usuario = ?").bind(usuario).run(); return { ok: true, jogando: null }; }
  const plataforma = PLATAFORMAS.includes(d.plataforma) ? d.plataforma : "web";
  const antes = await env.DB.prepare("SELECT jogo, desde, visto FROM voxix_jogando WHERE usuario = ?").bind(usuario).first();
  const mesmo = antes && antes.jogo.toLowerCase() === jogo.toLowerCase() && agora - antes.visto <= VALIDADE_PRESENCA_MS;
  if (mesmo && agora - antes.visto < 20_000) return { ok: true, jogando: jogo }; // batimento rápido demais: ignora
  const segundos = mesmo ? Math.min(120, Math.max(0, Math.round((agora - antes.visto) / 1000))) : 0;
  await env.DB.prepare("INSERT INTO voxix_jogando (usuario, jogo, plataforma, desde, visto) VALUES (?, ?, ?, ?, ?) ON CONFLICT(usuario) DO UPDATE SET jogo = excluded.jogo, plataforma = excluded.plataforma, desde = ?, visto = excluded.visto")
    .bind(usuario, jogo, plataforma, agora, agora, mesmo ? antes.desde : agora).run();
  const tem = await env.DB.prepare("SELECT 1 AS x FROM voxix_jogos WHERE usuario = ? AND jogo = ?").bind(usuario, jogo).first();
  if (tem) await env.DB.prepare("UPDATE voxix_jogos SET segundos = segundos + ?, ultimo = ? WHERE usuario = ? AND jogo = ?").bind(segundos, agora, usuario, jogo).run();
  else {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM voxix_jogos WHERE usuario = ?").bind(usuario).first();
    if (n.n < MAX_JOGOS_POR_PESSOA) await env.DB.prepare("INSERT INTO voxix_jogos (usuario, jogo, segundos, ultimo) VALUES (?, ?, ?, ?)").bind(usuario, jogo, segundos, agora).run();
  }
  return { ok: true, jogando: jogo };
}

// ------------------------------------------------------------------ conquistas
export function conquistasLimpas(itens) {
  if (!Array.isArray(itens)) throw new ErroLoja(400, "conquistas_invalidas", "Mande a lista de conquistas.");
  const vistos = new Set();
  const r = [];
  for (const x of itens) {
    if (!x || typeof x !== "object") continue;
    const id = String(x.id ?? "");
    const nome = textoCurto(x.nome, 40);
    if (!/^[a-z0-9_-]{1,40}$/i.test(id) || !nome || vistos.has(id)) continue;
    vistos.add(id);
    r.push({ id, nome });
    if (r.length >= MAX_CONQUISTAS) break;
  }
  return r;
}
export async function definirConquistas(env, usuario, itens, agora = Date.now()) {
  if (!(await env.DB.prepare("SELECT 1 AS x FROM voxix_perfis WHERE usuario = ?").bind(usuario).first())) throw new ErroLoja(409, "sem_perfil", "Crie o seu perfil do Voxix antes.");
  const lista = conquistasLimpas(itens);
  await env.DB.prepare("INSERT INTO voxix_conquistas (usuario, itens, atualizado) VALUES (?, ?, ?) ON CONFLICT(usuario) DO UPDATE SET itens = excluded.itens, atualizado = excluded.atualizado").bind(usuario, JSON.stringify(lista), agora).run();
  return { itens: lista };
}

// ------------------------------------------------------------------ ver os outros
/** `quem` pode ver a presença de `alvo` (linha de voxix_perfis)? Bloqueado nunca; 'invisivel' nunca; 'amigos' só conhecidos. */
async function podeVer(env, quem, alvo) {
  if (alvo.usuario === quem) return true;
  if (await env.DB.prepare("SELECT 1 AS x FROM voxix_bloqueios WHERE usuario = ? AND bloqueado = ?").bind(alvo.usuario, quem).first()) return false;
  if (alvo.presenca === "invisivel") return false;
  if (alvo.presenca === "todos") return true;
  if (await env.DB.prepare("SELECT 1 AS x FROM voxix_mensagens WHERE entregue = 1 AND ((de = ?1 AND para = ?2) OR (de = ?2 AND para = ?1)) LIMIT 1").bind(quem, alvo.usuario).first()) return true;
  return !!(await env.DB.prepare("SELECT 1 AS x FROM voxix_membros a JOIN voxix_membros b ON a.comunidade = b.comunidade WHERE a.usuario = ? AND b.usuario = ? LIMIT 1").bind(quem, alvo.usuario).first());
}

async function agoraJogando(env, alvo, agora) {
  const j = await env.DB.prepare("SELECT jogo, plataforma, desde, visto FROM voxix_jogando WHERE usuario = ?").bind(alvo.usuario).first();
  if (!j || agora - j.visto > VALIDADE_PRESENCA_MS) return null;
  return { jogo: j.jogo, plataforma: j.plataforma, desde: j.desde };
}

export async function perfilPublico(env, quem, apelido, agora = Date.now()) {
  const alvo = await env.DB.prepare("SELECT usuario, apelido, nome, avatar, presenca FROM voxix_perfis WHERE apelido = ?").bind(apelido).first();
  if (!alvo) throw new ErroLoja(404, "pessoa_inexistente", "Não achei ninguém com esse apelido.");
  const { results } = await env.DB.prepare("SELECT jogo, segundos FROM voxix_jogos WHERE usuario = ? AND segundos > 0 ORDER BY segundos DESC, ultimo DESC LIMIT 3").bind(alvo.usuario).all();
  const c = await env.DB.prepare("SELECT itens FROM voxix_conquistas WHERE usuario = ?").bind(alvo.usuario).first();
  const ver = await podeVer(env, quem, alvo);
  return {
    apelido: alvo.apelido, nome: alvo.nome, avatar: alvo.avatar || null,
    conquistas: c ? JSON.parse(c.itens) : [],
    maisJogados: (results || []).map((r) => ({ jogo: r.jogo, horas: Math.round((r.segundos / 3600) * 10) / 10 })),
    jogandoAgora: ver ? await agoraJogando(env, alvo, agora) : null,
  };
}

export async function presencaDe(env, quem, apelidos, agora = Date.now()) {
  const lista = [...new Set(String(apelidos || "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9_]{3,20}$/.test(x)))].slice(0, 60);
  const r = {};
  for (const a of lista) {
    const alvo = await env.DB.prepare("SELECT usuario, apelido, presenca FROM voxix_perfis WHERE apelido = ?").bind(a).first();
    if (!alvo || !(await podeVer(env, quem, alvo))) continue;
    const j = await agoraJogando(env, alvo, agora);
    if (j) r[alvo.apelido.toLowerCase()] = j;
  }
  return { presenca: r };
}
