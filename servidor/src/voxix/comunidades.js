// Voxix — comunidades (grupos) com salas de texto, públicas ou privadas.
//   POST   /voxix/comunidades {nome, descricao?, publica?, icone?}   → cria (quem cria é o dono) com a sala "geral"
//   GET    /voxix/comunidades                                        → as comunidades de quem pergunta
//   GET    /voxix/comunidades/publicas?q=                            → lista das públicas (para achar e entrar)
//   GET    /voxix/comunidades/:id                                    → detalhes + salas (só membros)
//   POST   /voxix/comunidades/entrar {codigo}                        → entra por código ou link de convite
//   GET    /voxix/convites/:codigo                                   → prévia do convite (nome, membros) antes de entrar
//   POST   /voxix/comunidades/:id/entrar                             → entra numa comunidade pública
//   POST   /voxix/comunidades/:id/sair                               → sai (o dono não sai: apaga a comunidade)
//   DELETE /voxix/comunidades/:id                                    → o dono apaga
//   POST   /voxix/comunidades/:id/codigo                             → o dono troca o código (o antigo para de valer)
//   GET    /voxix/comunidades/:id/membros                            → membros
//   DELETE /voxix/comunidades/:id/membros/:apelido                   → o dono expulsa
//   POST   /voxix/comunidades/:id/salas {nome} · DELETE .../salas/:sala
//   GET    /voxix/salas/:sala/ws?token=                              → WebSocket da sala (mensagens ao vivo e quem está online)
import { ErroLoja } from "../loja/lojas.js";
import { aleatorio } from "../loja/cripto.js";

export const MAX_COMUNIDADES_DONO = 10;
export const MAX_COMUNIDADES_MEMBRO = 100;
export const MAX_SALAS = 20;
export const MAX_MEMBROS = 1000;
export const ICONES = ["grupo", "jogo", "estrela", "raio", "coracao", "escudo", "chama", "planeta"];
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I: dá para ditar o código por voz
export const TAM_CODIGO = 8;

const nomeLimpo = (n, max) => String(n ?? "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

export function novoCodigo() {
  const bytes = crypto.getRandomValues(new Uint8Array(TAM_CODIGO));
  return [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join("");
}
/** Aceita o código solto ("ab12 cd34"), ou um link (…/entrar/AB12CD34, voxix://entrar/AB12CD34). */
export function codigoDoConvite(texto) {
  const bruto = String(texto ?? "").trim();
  const solto = bruto.split(/[/?#=]/).filter(Boolean).pop() || "";
  const s = solto.replace(/[\s-]/g, "").toUpperCase();
  if (!new RegExp(`^[${ALFABETO}]{${TAM_CODIGO}}$`).test(s)) throw new ErroLoja(400, "convite_invalido", "Esse convite não parece certo. Confira o código ou o link.");
  return s;
}
const idNovo = (agora) => agora.toString(36).padStart(9, "0") + aleatorio(5);

async function perfilDe(env, usuario) {
  const p = await env.DB.prepare("SELECT * FROM voxix_perfis WHERE usuario = ?").bind(usuario).first();
  if (!p) throw new ErroLoja(409, "sem_perfil", "Crie o seu perfil do Voxix antes de usar comunidades.");
  return p;
}
async function comunidade(env, id) {
  const c = await env.DB.prepare("SELECT * FROM voxix_comunidades WHERE id = ?").bind(String(id)).first();
  if (!c) throw new ErroLoja(404, "comunidade_inexistente", "Não achei essa comunidade.");
  return c;
}
async function membro(env, id, usuario) {
  return (await env.DB.prepare("SELECT * FROM voxix_membros WHERE comunidade = ? AND usuario = ?").bind(id, usuario).first()) || null;
}
async function exigirMembro(env, id, usuario) {
  const m = await membro(env, id, usuario);
  if (!m) throw new ErroLoja(403, "nao_e_membro", "Você não faz parte dessa comunidade.");
  return m;
}
async function exigirDono(env, id, usuario) {
  const c = await comunidade(env, id);
  if (c.dono !== usuario) throw new ErroLoja(403, "so_o_dono", "Só o dono da comunidade pode fazer isso.");
  return c;
}
const resumo = (c, meuCargo) => ({ id: c.id, nome: c.nome, descricao: c.descricao, icone: c.icone, publica: !!c.publica, membros: c.membros, ...(meuCargo ? { cargo: meuCargo } : {}) });

async function salasDe(env, id) {
  const { results } = await env.DB.prepare("SELECT id, nome FROM voxix_salas WHERE comunidade = ? ORDER BY ordem, criado").bind(id).all();
  return results;
}
function salaDO(env, salaId) {
  if (!env.VOXIX_SALA) throw new ErroLoja(503, "indisponivel", "As salas ao vivo ainda não estão ligadas no servidor.");
  return env.VOXIX_SALA.get(env.VOXIX_SALA.idFromName(salaId));
}
export const avisarSala = async (env, salaId, rota, corpo) => {
  if (!env.VOXIX_SALA) return;
  try { await salaDO(env, salaId).fetch(`https://sala${rota}`, { method: "POST", body: JSON.stringify(corpo || {}) }); } catch { /* a sala dorme: nada a avisar */ }
};

export async function criarComunidade(env, usuario, d, gastar, agora = Date.now()) {
  await perfilDe(env, usuario);
  const nome = nomeLimpo(d.nome, 40);
  if (nome.length < 3) throw new ErroLoja(400, "nome_curto", "Dê um nome à comunidade (pelo menos 3 letras).");
  const dono = await env.DB.prepare("SELECT COUNT(*) AS n FROM voxix_comunidades WHERE dono = ?").bind(usuario).first();
  if (dono.n >= MAX_COMUNIDADES_DONO) throw new ErroLoja(409, "muitas_comunidades", `Você já criou ${MAX_COMUNIDADES_DONO} comunidades. Apague alguma para criar outra.`);
  await gastar(env, usuario, "comunidade", agora);
  const icone = ICONES.includes(d.icone) ? d.icone : "grupo";
  const id = idNovo(agora);
  const codigo = novoCodigo();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO voxix_comunidades (id, nome, descricao, icone, dono, publica, codigo, membros, criado) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)").bind(id, nome, nomeLimpo(d.descricao, 200), icone, usuario, d.publica ? 1 : 0, codigo, agora),
    env.DB.prepare("INSERT INTO voxix_membros (comunidade, usuario, cargo, entrou) VALUES (?, ?, 'dono', ?)").bind(id, usuario, agora),
    env.DB.prepare("INSERT INTO voxix_salas (id, comunidade, nome, ordem, criado) VALUES (?, ?, 'geral', 0, ?)").bind(idNovo(agora + 1), id, agora),
  ]);
  return detalhes(env, usuario, id);
}

export async function minhas(env, usuario) {
  const { results } = await env.DB.prepare("SELECT c.*, m.cargo FROM voxix_membros m JOIN voxix_comunidades c ON c.id = m.comunidade WHERE m.usuario = ? ORDER BY m.entrou DESC").bind(usuario).all();
  return { comunidades: results.map((c) => resumo(c, c.cargo)) };
}

export async function publicas(env, texto) {
  const q = nomeLimpo(texto, 40).replace(/[%_]/g, "");
  const { results } = q
    ? await env.DB.prepare("SELECT * FROM voxix_comunidades WHERE publica = 1 AND nome LIKE ? ORDER BY membros DESC, criado DESC LIMIT 30").bind(`%${q}%`).all()
    : await env.DB.prepare("SELECT * FROM voxix_comunidades WHERE publica = 1 ORDER BY membros DESC, criado DESC LIMIT 30").all();
  return { comunidades: results.map((c) => resumo(c)) };
}

export async function detalhes(env, usuario, id) {
  const c = await comunidade(env, id);
  const eu = await exigirMembro(env, c.id, usuario);
  // o código de convite só aparece para o dono; os outros pedem o link ao dono
  return { ...resumo(c, eu.cargo), salas: await salasDe(env, c.id), ...(c.dono === usuario ? { codigo: c.codigo } : {}) };
}

export async function previaDoConvite(env, texto) {
  const c = await env.DB.prepare("SELECT * FROM voxix_comunidades WHERE codigo = ?").bind(codigoDoConvite(texto)).first();
  if (!c) throw new ErroLoja(404, "convite_invalido", "Esse convite não existe ou foi trocado pelo dono.");
  return resumo(c);
}

async function entrarNa(env, usuario, c, agora) {
  if (await membro(env, c.id, usuario)) return detalhes(env, usuario, c.id);
  if (await env.DB.prepare("SELECT 1 AS x FROM voxix_expulsos WHERE comunidade = ? AND usuario = ?").bind(c.id, usuario).first()) throw new ErroLoja(403, "expulso", "Você não pode entrar nessa comunidade.");
  if (c.membros >= MAX_MEMBROS) throw new ErroLoja(409, "comunidade_cheia", "Essa comunidade está lotada.");
  const meus = await env.DB.prepare("SELECT COUNT(*) AS n FROM voxix_membros WHERE usuario = ?").bind(usuario).first();
  if (meus.n >= MAX_COMUNIDADES_MEMBRO) throw new ErroLoja(409, "muitas_entradas", "Você já está em comunidades demais. Saia de alguma para entrar em outra.");
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO voxix_membros (comunidade, usuario, cargo, entrou) VALUES (?, ?, 'membro', ?)").bind(c.id, usuario, agora),
    env.DB.prepare("UPDATE voxix_comunidades SET membros = (SELECT COUNT(*) FROM voxix_membros WHERE comunidade = ?) WHERE id = ?").bind(c.id, c.id),
  ]);
  return detalhes(env, usuario, c.id);
}

export async function entrarPorConvite(env, usuario, d, agora = Date.now()) {
  await perfilDe(env, usuario);
  const c = await env.DB.prepare("SELECT * FROM voxix_comunidades WHERE codigo = ?").bind(codigoDoConvite(d.codigo)).first();
  if (!c) throw new ErroLoja(404, "convite_invalido", "Esse convite não existe ou foi trocado pelo dono.");
  return entrarNa(env, usuario, c, agora);
}
export async function entrarNaPublica(env, usuario, id, agora = Date.now()) {
  await perfilDe(env, usuario);
  const c = await comunidade(env, id);
  if (!c.publica) throw new ErroLoja(403, "comunidade_privada", "Essa comunidade é privada: entre pelo convite.");
  return entrarNa(env, usuario, c, agora);
}

async function tirarMembro(env, c, usuario) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM voxix_membros WHERE comunidade = ? AND usuario = ?").bind(c.id, usuario),
    env.DB.prepare("UPDATE voxix_comunidades SET membros = (SELECT COUNT(*) FROM voxix_membros WHERE comunidade = ?) WHERE id = ?").bind(c.id, c.id),
  ]);
  for (const s of await salasDe(env, c.id)) await avisarSala(env, s.id, "/expulsar", { usuario });
}

export async function sair(env, usuario, id) {
  const c = await comunidade(env, id);
  await exigirMembro(env, c.id, usuario);
  if (c.dono === usuario) throw new ErroLoja(409, "dono_nao_sai", "O dono não pode sair: apague a comunidade se não quiser mais.");
  await tirarMembro(env, c, usuario);
  return { ok: true };
}

export async function apagar(env, usuario, id) {
  const c = await exigirDono(env, id, usuario);
  for (const s of await salasDe(env, c.id)) await avisarSala(env, s.id, "/encerrar");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM voxix_salas WHERE comunidade = ?").bind(c.id),
    env.DB.prepare("DELETE FROM voxix_membros WHERE comunidade = ?").bind(c.id),
    env.DB.prepare("DELETE FROM voxix_expulsos WHERE comunidade = ?").bind(c.id),
    env.DB.prepare("DELETE FROM voxix_comunidades WHERE id = ?").bind(c.id),
  ]);
  return { ok: true };
}

export async function trocarCodigo(env, usuario, id) {
  const c = await exigirDono(env, id, usuario);
  const codigo = novoCodigo();
  await env.DB.prepare("UPDATE voxix_comunidades SET codigo = ? WHERE id = ?").bind(codigo, c.id).run();
  return { codigo };
}

export async function listarMembros(env, usuario, id) {
  const c = await comunidade(env, id);
  await exigirMembro(env, c.id, usuario);
  const { results } = await env.DB.prepare("SELECT p.apelido, p.nome, m.cargo FROM voxix_membros m JOIN voxix_perfis p ON p.usuario = m.usuario WHERE m.comunidade = ? ORDER BY CASE m.cargo WHEN 'dono' THEN 0 ELSE 1 END, p.apelido LIMIT 1000").bind(c.id).all();
  return { membros: results };
}

export async function expulsar(env, usuario, id, apelido, agora = Date.now()) {
  const c = await exigirDono(env, id, usuario);
  const alvo = await env.DB.prepare("SELECT usuario FROM voxix_perfis WHERE apelido = ?").bind(String(apelido)).first();
  if (!alvo || !(await membro(env, c.id, alvo.usuario))) throw new ErroLoja(404, "pessoa_inexistente", "Essa pessoa não está na comunidade.");
  if (alvo.usuario === usuario) throw new ErroLoja(400, "para_si", "Você é o dono: não dá para se expulsar.");
  await env.DB.prepare("INSERT OR IGNORE INTO voxix_expulsos (comunidade, usuario, criado) VALUES (?, ?, ?)").bind(c.id, alvo.usuario, agora).run();
  await tirarMembro(env, c, alvo.usuario);
  return { ok: true };
}

export async function criarSala(env, usuario, id, d, agora = Date.now()) {
  const c = await exigirDono(env, id, usuario);
  const nome = nomeLimpo(d.nome, 30).toLowerCase().replace(/\s/g, "-");
  if (nome.length < 2) throw new ErroLoja(400, "nome_curto", "Dê um nome à sala (pelo menos 2 letras).");
  const salas = await salasDe(env, c.id);
  if (salas.length >= MAX_SALAS) throw new ErroLoja(409, "muitas_salas", `Cada comunidade pode ter até ${MAX_SALAS} salas.`);
  if (salas.some((s) => s.nome === nome)) throw new ErroLoja(409, "sala_existe", "Já existe uma sala com esse nome.");
  const sala = { id: idNovo(agora), nome };
  await env.DB.prepare("INSERT INTO voxix_salas (id, comunidade, nome, ordem, criado) VALUES (?, ?, ?, ?, ?)").bind(sala.id, c.id, nome, salas.length, agora).run();
  return sala;
}

export async function apagarSala(env, usuario, id, salaId) {
  const c = await exigirDono(env, id, usuario);
  const salas = await salasDe(env, c.id);
  if (!salas.some((s) => s.id === salaId)) throw new ErroLoja(404, "sala_inexistente", "Não achei essa sala.");
  if (salas.length <= 1) throw new ErroLoja(409, "ultima_sala", "A comunidade precisa de pelo menos uma sala.");
  await avisarSala(env, salaId, "/encerrar");
  await env.DB.prepare("DELETE FROM voxix_salas WHERE id = ? AND comunidade = ?").bind(salaId, c.id).run();
  return { ok: true };
}

/** Abre a sala ao vivo para quem é membro da comunidade dela. */
export async function abrirSala(env, usuario, salaId, req) {
  const eu = await perfilDe(env, usuario);
  const s = await env.DB.prepare("SELECT * FROM voxix_salas WHERE id = ?").bind(String(salaId)).first();
  if (!s) throw new ErroLoja(404, "sala_inexistente", "Não achei essa sala.");
  await exigirMembro(env, s.comunidade, usuario);
  const h = new Headers(req.headers);
  h.set("x-voxix-usuario", usuario);
  h.set("x-voxix-apelido", eu.apelido);
  h.set("x-voxix-nome", eu.nome);
  return await salaDO(env, s.id).fetch(new Request("https://sala/ws", { headers: h }));
}

/** Roteia /voxix/comunidades…, /voxix/convites/… e /voxix/salas/… Devolve {dados, status} ou uma Response (WebSocket); null = não é daqui. */
export async function tratarComunidades(req, env, url, caminho, usuario, gastar) {
  const m = req.method;
  const corpo = async () => { const t = await req.text(); if (t.length > 10_000) throw new ErroLoja(413, "corpo_grande", "Pedido grande demais."); try { const d = JSON.parse(t || "{}"); return d && typeof d === "object" && !Array.isArray(d) ? d : {}; } catch { throw new ErroLoja(400, "json_invalido", "O corpo precisa ser um JSON válido."); } };
  let r;
  if (caminho === "/voxix/comunidades" && m === "POST") return { dados: await criarComunidade(env, usuario, await corpo(), gastar), status: 201 };
  if (caminho === "/voxix/comunidades" && m === "GET") return { dados: await minhas(env, usuario) };
  if (caminho === "/voxix/comunidades/publicas" && m === "GET") return { dados: await publicas(env, url.searchParams.get("q")) };
  if (caminho === "/voxix/comunidades/entrar" && m === "POST") return { dados: await entrarPorConvite(env, usuario, await corpo()) };
  if ((r = /^\/voxix\/convites\/([^/]{1,200})$/.exec(caminho)) && m === "GET") return { dados: await previaDoConvite(env, decodeURIComponent(r[1])) };
  if ((r = /^\/voxix\/salas\/([A-Za-z0-9]{8,40})\/ws$/.exec(caminho)) && m === "GET") return await abrirSala(env, usuario, r[1], req);
  if (!(r = /^\/voxix\/comunidades\/([A-Za-z0-9]{8,40})(?:\/([a-z]+)(?:\/([A-Za-z0-9_]{2,40}))?)?$/.exec(caminho))) return null;
  const [, id, parte, resto] = r;
  if (!parte && m === "GET") return { dados: await detalhes(env, usuario, id) };
  if (!parte && m === "DELETE") return { dados: await apagar(env, usuario, id) };
  if (parte === "entrar" && m === "POST" && !resto) return { dados: await entrarNaPublica(env, usuario, id) };
  if (parte === "sair" && m === "POST" && !resto) return { dados: await sair(env, usuario, id) };
  if (parte === "codigo" && m === "POST" && !resto) return { dados: await trocarCodigo(env, usuario, id) };
  if (parte === "membros" && m === "GET" && !resto) return { dados: await listarMembros(env, usuario, id) };
  if (parte === "membros" && m === "DELETE" && resto) return { dados: await expulsar(env, usuario, id, resto) };
  if (parte === "salas" && m === "POST" && !resto) return { dados: await criarSala(env, usuario, id, await corpo()), status: 201 };
  if (parte === "salas" && m === "DELETE" && resto) return { dados: await apagarSala(env, usuario, id, resto) };
  return null;
}
