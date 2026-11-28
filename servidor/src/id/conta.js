// Vetorial ID: contas, dispositivos (até 3 vinculados), sessões (até 2 ativas ao mesmo tempo) e batimento (ping).
import { aleatorio, iguais, sha256Hex } from "../loja/cripto.js";
import { ErroLoja, registrarLoja } from "../loja/lojas.js";
import { assinar, hashSenha, verificar } from "./jwt.js";
import { canaisDisponiveis, enviarCodigo } from "./envio.js";
import { ehAdmin } from "../dev/admin.js";
import { apagarConta } from "./apagar.js";
import { cobrancaAutomatica } from "../loja/assinatura.js";

export const MAX_DISPOSITIVOS = 3;
export const MAX_ATIVAS = 2;
export const TTL_ATIVA_MS = 5 * 60_000; // sem ping por 5 minutos = sessão inativa
/** Cada aplicativo tem os seus próprios limites. O Velox é gratuito e público: não entra na conta de limites. */
export const APPS_COM_LIMITE = new Set(["venus", "vindex", "vortex", "vyntem"]);
const APPS_DE_LOGIN = new Set([...APPS_COM_LIMITE, "velox", "drive", "voxix", "vspace", "vynx"]);
export function appDeLogin(app, dispositivoId = "") {
  // versões antigas do Vindex não diziam o app: o identificador do aparelho começa com "vindex-"
  const a = String(app || (String(dispositivoId).startsWith("vindex-") ? "vindex" : "venus")).trim().toLowerCase();
  const n = a === "venus-windows" || a === "venus-ios" ? "venus" : a;
  if (!APPS_DE_LOGIN.has(n)) throw new ErroId(400, "app_invalido", "Aplicativo desconhecido.");
  return n;
}
const comLimite = (env, email, app) => APPS_COM_LIMITE.has(app) && !semLimites(env, email);
const PLATAFORMAS = new Set(["android", "ios", "windows", "mac", "web"]);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export class ErroId extends ErroLoja {
  constructor(status, codigo, mensagem, dados = {}) {
    super(status, codigo, mensagem);
    this.dados = dados;
  }
}

/** O dono (administrador master) usa em quantos aparelhos e sessões quiser: sem limites. */
const semLimites = (env, email) => String(email || "").trim().toLowerCase() === (String(env.ADMIN_EMAIL || "").trim().toLowerCase() || "vetorialtech.dev@gmail.com");

/** Celular brasileiro → +55DDDNÚMERO. Aceita (51) 99999-9999, 51999999999, +5551999999999. Devolve "" se não parecer um celular. */
export function telefoneLimpo(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return /^[1-9]\d9\d{8}$/.test(d) ? `+55${d}` : "";
}

const emailLimpo = (e) => String(e || "").trim().toLowerCase();

function lerDispositivo(d) {
  const id = String((d && d.id) || "").slice(0, 200);
  if (id.length < 8) throw new ErroId(400, "dispositivo_invalido", "Faltou o identificador do aparelho.");
  const plataforma = PLATAFORMAS.has(d.plataforma) ? d.plataforma : "web";
  return { bruto: id, nome: String(d.nome || plataforma).trim().slice(0, 60) || plataforma, plataforma };
}

async function limitarTentativas(env, chave, agora, max = 8) {
  await env.DB.prepare("DELETE FROM id_tentativas WHERE quando < ?").bind(agora - 15 * 60_000).run();
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM id_tentativas WHERE chave = ? AND quando > ?").bind(chave, agora - 15 * 60_000).first();
  if (n.n >= max) throw new ErroId(429, "muitas_tentativas", "Muitas tentativas. Espere alguns minutos e tente de novo.");
}

/**
 * Limite por rede (IP): quem tenta senhas em muitos e-mails diferentes não é barrado pelo limite por e-mail.
 * Conta só as FALHAS; 40 em 15 minutos (folga para 4G, hotel e wi-fi de casa, que dividem IP). Sem IP conhecido, não limita.
 */
export const MAX_FALHAS_POR_IP = 40;
async function limitarPorIp(env, tipo, ip, agora) {
  if (!ip) return;
  await limitarTentativas(env, `${tipo}:${ip}`, agora, MAX_FALHAS_POR_IP);
}
async function anotarPorIp(env, tipo, ip, agora) {
  if (!ip) return;
  await env.DB.prepare("INSERT INTO id_tentativas (chave, quando) VALUES (?, ?)").bind(`${tipo}:${ip}`, agora).run();
}

export async function cadastrar(env, { email, senha, nome, dispositivo, app, lojaExistente, telefone, exigirTelefone = false, ip = "", recuperacao = null }, agora = Date.now()) {
  email = emailLimpo(email);
  const fone = telefoneLimpo(telefone);
  if (exigirTelefone && !fone && !semLimites(env, email)) throw new ErroId(400, "telefone_invalido", "Informe um celular com DDD (ex.: 51 99999-9999). Ele serve para recuperar a senha.");
  if (!EMAIL.test(email)) throw new ErroId(400, "email_invalido", "Esse e-mail não parece certo.");
  if (String(senha || "").length < 8) throw new ErroId(400, "senha_curta", "A senha precisa ter pelo menos 8 caracteres.");
  const d = lerDispositivo(dispositivo);
  if (await env.DB.prepare("SELECT 1 AS x FROM usuarios WHERE email = ?").bind(email).first()) {
    throw new ErroId(409, "email_em_uso", "Já existe uma conta com esse e-mail. Entre com a senha.");
  }
  const id = aleatorio(8);
  const salt = aleatorio(16);
  let lojaId = lojaExistente ? lojaExistente.id : null;
  if (lojaId && (await env.DB.prepare("SELECT 1 AS x FROM usuarios WHERE loja = ?").bind(lojaId).first())) {
    throw new ErroId(409, "loja_ja_vinculada", "Essa loja já está ligada a outra conta.");
  }
  if (!lojaId) {
    const loja = await registrarLoja(env, { nome: nome || email.split("@")[0], dispositivo: d.bruto, ip }, agora);
    lojaId = loja.id;
    // um teste grátis por celular: se este número já tem conta, a nova nasce sem teste
    if (fone && !loja.testeGratisUsado && (await env.DB.prepare("SELECT 1 AS x FROM usuarios WHERE telefone = ?").bind(fone).first())) {
      await env.DB.prepare("UPDATE lojas SET trial_fim = ?, plano = 'sem_teste' WHERE id = ?").bind(agora, lojaId).run();
    }
  }
  await env.DB.prepare("INSERT INTO usuarios (id, email, nome, senha_hash, salt, loja, criado, telefone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, email, String(nome || "").trim().slice(0, 80), await hashSenha(senha, salt), salt, lojaId, agora, fone).run();
  if (recuperacao) await gravarRecuperacao(env, id, recuperacao);
  return entrar(env, { email, senha, dispositivo, app }, agora);
}

export async function sessoesAtivas(env, usuario, agora = Date.now(), app = "venus") {
  const { results } = await env.DB.prepare(
    `SELECT s.id AS sessao, s.dispositivo, s.criado, s.ultimo_ping AS ultimoPing, d.nome, d.plataforma
       FROM sessoes s JOIN dispositivos d ON d.id = s.dispositivo
      WHERE s.usuario = ? AND s.app = ? AND s.encerrada = 0 AND s.ultimo_ping > ? ORDER BY s.ultimo_ping DESC`,
  ).bind(usuario, app, agora - TTL_ATIVA_MS).all();
  return results;
}

const AVISO_LIMITE = "Já há 2 aparelhos usando este aplicativo agora. Encerre um deles para entrar aqui, ou cancele.";

/** Garante uma vaga entre as 2 sessões ativas; sem vaga, devolve o aviso com as opções. */
async function abrirVaga(env, usuario, dispositivo, encerrar, agora, app = "venus") {
  const dono = await env.DB.prepare("SELECT email FROM usuarios WHERE id = ?").bind(usuario).first();
  if (dono && !comLimite(env, dono.email, app)) return;
  let ativas = (await sessoesAtivas(env, usuario, agora, app)).filter((s) => s.dispositivo !== dispositivo);
  if (ativas.length >= MAX_ATIVAS) {
    const alvo = encerrar && ativas.find((s) => s.sessao === encerrar);
    if (!alvo) {
      throw new ErroId(409, "limite_simultaneo", AVISO_LIMITE, { ativas, opcoes: ["encerrar_sessao", "cancelar"], maxAtivas: MAX_ATIVAS });
    }
    await encerrarSessao(env, usuario, alvo.sessao, "encerrada_por_outro_aparelho");
  }
}

export async function encerrarSessao(env, usuario, sessao, motivo = "encerrada") {
  const r = await env.DB.prepare("UPDATE sessoes SET encerrada = 1, motivo = ? WHERE id = ? AND usuario = ? AND encerrada = 0").bind(motivo, sessao, usuario).run();
  return r.meta.changes > 0;
}

export async function entrar(env, { email, senha, dispositivo, encerrar, remover, app: appPedido, ip = "" }, agora = Date.now()) {
  email = emailLimpo(email);
  const app = appDeLogin(appPedido, dispositivo && dispositivo.id);
  const d = lerDispositivo(dispositivo);
  await limitarTentativas(env, `login:${email}`, agora);
  await limitarPorIp(env, "loginip", ip, agora);
  const u = await env.DB.prepare("SELECT * FROM usuarios WHERE email = ?").bind(email).first();
  const hash = await hashSenha(String(senha || ""), u ? u.salt : "00".repeat(16)); // tempo parecido com ou sem conta
  if (!u || !iguais(hash, u.senha_hash)) {
    await env.DB.prepare("INSERT INTO id_tentativas (chave, quando) VALUES (?, ?)").bind(`login:${email}`, agora).run();
    await anotarPorIp(env, "loginip", ip, agora);
    throw new ErroId(401, "credenciais", "E-mail ou senha incorretos.");
  }
  if (u.bloqueado) throw new ErroId(403, "conta_bloqueada", "Esta conta foi bloqueada pela administração da Vetorial Tech.");
  // no Vênus o identificador continua o mesmo de antes (contas antigas); nos outros apps ele leva o nome do app
  const devId = await sha256Hex(app === "venus" ? `vid:${u.id}:${d.bruto}` : `vid:${u.id}:${app}:${d.bruto}`);
  const jaTem = await env.DB.prepare("SELECT 1 AS x FROM dispositivos WHERE id = ? AND usuario = ?").bind(devId, u.id).first();
  if (!jaTem) {
    const { results } = await env.DB.prepare("SELECT id, nome, plataforma, ultimo FROM dispositivos WHERE usuario = ? AND app = ? ORDER BY ultimo DESC").bind(u.id, app).all();
    if (results.length >= MAX_DISPOSITIVOS && comLimite(env, u.email, app)) {
      if (!remover || !results.some((x) => x.id === remover)) {
        throw new ErroId(409, "limite_dispositivos", "Você já tem 3 aparelhos vinculados a este aplicativo. Remova um para vincular este, ou cancele.", { dispositivos: results, opcoes: ["remover_dispositivo", "cancelar"], maxDispositivos: MAX_DISPOSITIVOS, app });
      }
      await removerDispositivo(env, u.id, remover);
    }
    // celular reinstalado ou app reassinado ganha identificador novo: o registro antigo do mesmo modelo, parado, sai (não conta como mais um aparelho)
    if (d.plataforma === "android" || d.plataforma === "ios") {
      const velhos = await env.DB.prepare("SELECT id FROM dispositivos WHERE usuario = ? AND app = ? AND nome = ? AND plataforma = ?").bind(u.id, app, d.nome, d.plataforma).all();
      for (const v of velhos.results) {
        const ativo = await env.DB.prepare("SELECT 1 AS x FROM sessoes WHERE dispositivo = ? AND encerrada = 0 AND ultimo_ping > ?").bind(v.id, agora - TTL_ATIVA_MS).first();
        if (!ativo) await removerDispositivo(env, u.id, v.id);
      }
    }
    await env.DB.prepare("INSERT INTO dispositivos (id, usuario, nome, plataforma, criado, ultimo, app) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(devId, u.id, d.nome, d.plataforma, agora, agora, app).run();
  } else {
    await env.DB.prepare("UPDATE dispositivos SET nome = ?, plataforma = ?, ultimo = ? WHERE id = ?").bind(d.nome, d.plataforma, agora, devId).run();
  }
  await env.DB.prepare("UPDATE sessoes SET encerrada = 1, motivo = 'novo_login' WHERE usuario = ? AND dispositivo = ? AND encerrada = 0").bind(u.id, devId).run();
  await abrirVaga(env, u.id, devId, encerrar, agora, app);
  const sid = aleatorio(12);
  await env.DB.prepare("INSERT INTO sessoes (id, usuario, dispositivo, criado, ultimo_ping, app) VALUES (?, ?, ?, ?, ?, ?)").bind(sid, u.id, devId, agora, agora, app).run();
  const token = await assinar(env, { sub: u.id, sid, dev: devId }, { agora });
  return { token, sessao: sid, dispositivo: devId, app, usuario: { id: u.id, email: u.email, nome: u.nome } };
}

export async function removerDispositivo(env, usuario, dispositivo) {
  await env.DB.prepare("UPDATE sessoes SET encerrada = 1, motivo = 'dispositivo_removido' WHERE usuario = ? AND dispositivo = ?").bind(usuario, dispositivo).run();
  const r = await env.DB.prepare("DELETE FROM dispositivos WHERE id = ? AND usuario = ?").bind(dispositivo, usuario).run();
  return r.meta.changes > 0;
}

// ------------------------------------------------------------------ perfil e tokens por aplicativo
export const APPS_DA_SUITE = new Set(["venus", "venus-windows", "venus-ios", "vindex", "vortex", "vyntem", "voxix", "vspace", "portal"]);
const FOTO_MAX = 70_000;
export const fotoValida = (f) =>
  f === "" || (typeof f === "string" && f.length <= FOTO_MAX && (/^https:\/\/[^\s"'<>]{4,400}$/.test(f) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(f)));

export const perfilPublico = (u) => ({ id: u.id, email: u.email, nome: u.nome, foto: u.foto || "", atualizado: u.atualizado || 0 });

export async function salvarPerfil(env, ctx, { nome, foto }, agora = Date.now()) {
  const n = nome === undefined ? ctx.usuario.nome : String(nome).trim().slice(0, 80);
  if (foto !== undefined && !fotoValida(foto)) throw new ErroId(400, "foto_invalida", "A foto precisa ser https ou uma imagem png/jpeg/webp pequena (até ~50 KB).");
  const f = foto === undefined ? ctx.usuario.foto || "" : foto;
  await env.DB.prepare("UPDATE usuarios SET nome = ?, foto = ?, atualizado = ? WHERE id = ?").bind(n, f, agora, ctx.usuario.id).run();
  return perfilPublico({ ...ctx.usuario, nome: n, foto: f, atualizado: agora });
}

/**
 * Token de um aplicativo da suíte (Vindex, Vortex…) no MESMO aparelho: usa a mesma sessão do aparelho,
 * então não ocupa outra vaga das 2 ativas, e sair da Vênus derruba todos.
 */
export async function tokenDeApp(env, ctx, app, agora = Date.now()) {
  if (!APPS_DA_SUITE.has(app)) throw new ErroId(400, "app_invalido", "Aplicativo desconhecido.");
  return { app, token: await assinar(env, { sub: ctx.usuario.id, sid: ctx.sessao, dev: ctx.dispositivo, app }, { agora, validadeMs: 7 * 86_400_000 }) };
}

export const ehJwt = (t) => /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(t || "");
export const tokenDoPedido = (req) => (/^Bearer\s+(\S+)$/.exec(req.headers.get("authorization") || "") || [])[1] || "";

/**
 * Middleware: confere o JWT, a sessão (não encerrada) e o batimento. Sessão parada há mais de 5 minutos
 * só volta se ainda houver vaga entre as 2 ativas; senão 409 com o aviso e as opções.
 */
export async function validarSessao(env, req, { agora = Date.now(), ping = true } = {}) {
  const dados = await verificar(env, tokenDoPedido(req), agora);
  if (!dados) throw new ErroId(401, "token_invalido", "Entre de novo com o seu Vetorial ID.");
  const s = await env.DB.prepare("SELECT * FROM sessoes WHERE id = ? AND usuario = ?").bind(dados.sid, dados.sub).first();
  if (!s) throw new ErroId(401, "sessao_inexistente", "Entre de novo com o seu Vetorial ID.");
  if (s.encerrada) throw new ErroId(401, "sessao_encerrada", "Esta sessão foi encerrada. Entre de novo.", { motivo: s.motivo });
  const u = await env.DB.prepare("SELECT * FROM usuarios WHERE id = ?").bind(dados.sub).first();
  if (!u) throw new ErroId(401, "sessao_inexistente", "Conta não encontrada.");
  if (u.bloqueado) throw new ErroId(403, "conta_bloqueada", "Esta conta foi bloqueada pela administração da Vetorial Tech.");
  if (agora - s.ultimo_ping > TTL_ATIVA_MS) {
    const ativas = (await sessoesAtivas(env, u.id, agora, s.app)).filter((x) => x.sessao !== s.id);
    if (ativas.length >= MAX_ATIVAS && comLimite(env, u.email, s.app)) throw new ErroId(409, "limite_simultaneo", AVISO_LIMITE, { ativas, opcoes: ["encerrar_sessao", "cancelar"], maxAtivas: MAX_ATIVAS, sessaoAtual: s.id });
  }
  if (ping && agora - s.ultimo_ping > 15_000) {
    await env.DB.prepare("UPDATE sessoes SET ultimo_ping = ? WHERE id = ?").bind(agora, s.id).run();
    await env.DB.prepare("UPDATE dispositivos SET ultimo = ? WHERE id = ?").bind(agora, s.dispositivo).run();
  }
  return { usuario: u, sessao: s.id, dispositivo: s.dispositivo, app: s.app };
}

/** Reativa uma sessão parada, encerrando a escolhida para abrir vaga (resposta ao aviso 409). */
export async function reativar(env, ctxToken, encerrar, agora = Date.now()) {
  const dados = await verificar(env, ctxToken, agora);
  if (!dados) throw new ErroId(401, "token_invalido", "Entre de novo com o seu Vetorial ID.");
  const s = await env.DB.prepare("SELECT * FROM sessoes WHERE id = ? AND usuario = ? AND encerrada = 0").bind(dados.sid, dados.sub).first();
  if (!s) throw new ErroId(401, "sessao_encerrada", "Esta sessão foi encerrada. Entre de novo.");
  await abrirVaga(env, dados.sub, s.dispositivo, encerrar, agora, s.app);
  await env.DB.prepare("UPDATE sessoes SET ultimo_ping = ? WHERE id = ?").bind(agora, s.id).run();
  return { ok: true };
}

export async function renovarToken(env, ctx, agora = Date.now()) {
  return { token: await assinar(env, { sub: ctx.usuario.id, sid: ctx.sessao, dev: ctx.dispositivo }, { agora }) };
}

export async function listarDispositivos(env, ctx, agora = Date.now()) {
  const { results } = await env.DB.prepare("SELECT id, nome, plataforma, criado, ultimo FROM dispositivos WHERE usuario = ? AND app = ? ORDER BY ultimo DESC").bind(ctx.usuario.id, ctx.app || "venus").all();
  const ativas = await sessoesAtivas(env, ctx.usuario.id, agora, ctx.app || "venus");
  return {
    maxDispositivos: MAX_DISPOSITIVOS, maxAtivas: MAX_ATIVAS,
    dispositivos: results.map((d) => {
      const s = ativas.find((x) => x.dispositivo === d.id);
      return { ...d, atual: d.id === ctx.dispositivo, ativo: !!s, sessao: s ? s.sessao : null };
    }),
  };
}

// ------------------------------------------------------------------ sincronização (última escrita vence, com versão)
export const chaveDeSync = (c) => CHAVES_SYNC.has(c) || /^empresa-[a-f0-9]{6,16}$/.test(String(c)); // "empresa-<loja>": o cadastro de cada loja extra
export const CHAVES_SYNC = new Set(["tema", "preferencias", "modo", "sessoes", "catalogo", "marketing", "empresa", "ideiaspost", "postagens", "stories", "instagram", "velox", "velox-tema", "velox-senhas", "velox-abas", "voz", "conexoes"]);
const MAX_DOC = 64_000;

export async function lerSync(env, ctx, desde = 0) {
  const { results } = await env.DB.prepare("SELECT chave, valor, versao, atualizado, dispositivo FROM sync_docs WHERE usuario = ? AND atualizado > ?").bind(ctx.usuario.id, desde).all();
  return { agora: Date.now(), docs: results.map((r) => ({ ...r, valor: JSON.parse(r.valor), deEsteAparelho: r.dispositivo === ctx.dispositivo })) };
}

export async function gravarSync(env, ctx, chave, valor, versaoBase, agora = Date.now()) {
  if (!chaveDeSync(chave)) throw new ErroId(400, "chave_invalida", "Esse dado não é sincronizado.");
  const texto = JSON.stringify(valor ?? null);
  if (texto.length > MAX_DOC) throw new ErroId(413, "doc_grande", "Esse dado é grande demais para sincronizar.");
  const atual = await env.DB.prepare("SELECT versao, valor FROM sync_docs WHERE usuario = ? AND chave = ?").bind(ctx.usuario.id, chave).first();
  if (atual && Number(versaoBase) !== atual.versao) {
    throw new ErroId(409, "versao_antiga", "Outro aparelho mudou isso antes. Atualize e tente de novo.", { versao: atual.versao, valor: JSON.parse(atual.valor) });
  }
  const versao = (atual ? atual.versao : 0) + 1;
  await env.DB.prepare(
    "INSERT INTO sync_docs (usuario, chave, valor, versao, atualizado, dispositivo) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(usuario, chave) DO UPDATE SET valor = excluded.valor, versao = excluded.versao, atualizado = excluded.atualizado, dispositivo = excluded.dispositivo",
  ).bind(ctx.usuario.id, chave, texto, versao, agora, ctx.dispositivo).run();
  return { versao, atualizado: agora };
}

export async function limpezaDeSessoes(env, agora = Date.now()) {
  await env.DB.prepare("DELETE FROM sessoes WHERE (encerrada = 1 AND ultimo_ping < ?) OR ultimo_ping < ?").bind(agora - 7 * 86_400_000, agora - 40 * 86_400_000).run();
}

// ---------------------------------------------------------------- recuperação de senha
const CODIGO_MS = 10 * 60_000;
const mascarar = (c, v) => (c === "email" ? v.replace(/^(.{2}).*(@.*)$/, "$1***$2") : v.replace(/^(\+55\d{2})\d+(\d{2})$/, "$1*****$2"));

export async function celularDaConta(env, email) {
  const u = await env.DB.prepare("SELECT telefone FROM usuarios WHERE email = ?").bind(emailLimpo(email)).first();
  return u ? u.telefone : "";
}

/** Sempre responde igual (a conta existir ou não não vaza). Só envia de verdade quando existe e o canal está ligado. */
export async function pedirRecuperacao(env, { email, canal }, ip = "", agora = Date.now()) {
  email = emailLimpo(email);
  canal = canal === "sms" ? "sms" : "email";
  const disp = canaisDisponiveis(env);
  if (!disp[canal]) throw new ErroId(503, "canal_indisponivel", canal === "sms" ? "O envio de SMS ainda não está ligado. Use o e-mail." : "O envio de e-mail ainda não está ligado.", { canais: disp });
  await limitarTentativas(env, `rec:${email}`, agora);
  await limitarTentativas(env, `recip:${ip || "?"}`, agora);
  await env.DB.prepare("INSERT INTO id_tentativas (chave, quando) VALUES (?, ?)").bind(`rec:${email}`, agora).run();
  await env.DB.prepare("INSERT INTO id_tentativas (chave, quando) VALUES (?, ?)").bind(`recip:${ip || "?"}`, agora).run();
  const u = await env.DB.prepare("SELECT * FROM usuarios WHERE email = ?").bind(email).first();
  const destino = u ? (canal === "sms" ? u.telefone : u.email) : "";
  let enviado = true; // só vira false quando a conta existe e o provedor recusou o envio
  if (u && destino) {
    const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await env.DB.prepare("INSERT OR REPLACE INTO id_recuperacao (usuario, codigo_hash, canal, expira, tentativas, criado) VALUES (?, ?, ?, ?, 0, ?)")
      .bind(u.id, await sha256Hex(`rec:${u.id}:${codigo}`), canal, agora + CODIGO_MS, agora).run();
    try { enviado = (await enviarCodigo(env, canal, destino, codigo)) !== false; } catch { enviado = false; }
  }
  return { ok: true, enviado, mensagem: "Se existir uma conta com esse e-mail, enviamos um código.", minutos: 10 };
}

/** A tela de "esqueci a senha" só libera o envio se o e-mail tem conta. Limite por IP para não servir de lista de e-mails. */
export async function existeConta(env, { email }, ip = "", agora = Date.now()) {
  email = emailLimpo(email);
  await limitarTentativas(env, `recv:${ip || "?"}`, agora, 30);
  await env.DB.prepare("INSERT INTO id_tentativas (chave, quando) VALUES (?, ?)").bind(`recv:${ip || "?"}`, agora).run();
  if (!EMAIL.test(email)) return { ok: true, existe: false };
  const u = await env.DB.prepare("SELECT 1 AS x FROM usuarios WHERE email = ?").bind(email).first();
  return { ok: true, existe: !!u };
}

export async function confirmarRecuperacao(env, { email, codigo, novaSenha, ip = "" }, agora = Date.now()) {
  email = emailLimpo(email);
  if (String(novaSenha || "").length < 8) throw new ErroId(400, "senha_curta", "A senha precisa ter pelo menos 8 caracteres.");
  await limitarTentativas(env, `recc:${email}`, agora);
  await limitarPorIp(env, "reccip", ip, agora);
  const u = await env.DB.prepare("SELECT * FROM usuarios WHERE email = ?").bind(email).first();
  const r = u ? await env.DB.prepare("SELECT * FROM id_recuperacao WHERE usuario = ?").bind(u.id).first() : null;
  const falha = () => new ErroId(400, "codigo_invalido", "Código errado ou vencido. Peça outro.");
  if (!u || !r || r.expira < agora || r.tentativas >= 5) { await anotarPorIp(env, "reccip", ip, agora); throw falha(); }
  if (!iguais(await sha256Hex(`rec:${u.id}:${String(codigo || "").replace(/\D/g, "")}`), r.codigo_hash)) {
    await env.DB.prepare("UPDATE id_recuperacao SET tentativas = tentativas + 1 WHERE usuario = ?").bind(u.id).run();
    await env.DB.prepare("INSERT INTO id_tentativas (chave, quando) VALUES (?, ?)").bind(`recc:${email}`, agora).run();
    await anotarPorIp(env, "reccip", ip, agora);
    throw falha();
  }
  const salt = aleatorio(16);
  await env.DB.prepare("UPDATE usuarios SET senha_hash = ?, salt = ? WHERE id = ?").bind(await hashSenha(novaSenha, salt), salt, u.id).run();
  await env.DB.prepare("DELETE FROM id_recuperacao WHERE usuario = ?").bind(u.id).run();
  await env.DB.prepare("UPDATE sessoes SET encerrada = 1, motivo = 'senha_trocada' WHERE usuario = ? AND encerrada = 0").bind(u.id).run();
  return { ok: true };
}

// ------------------------------------------------------------------ recuperação por senha de 6 números e pergunta secreta
const PINS_FRACOS = new Set(["123456", "654321", "012345", "123123", "121212", "112233", "696969"]);
/** Resposta secreta sem acento, em minúsculas e sem pontuação: "São Paulo!" e "sao paulo" valem igual. */
export const respostaNormalizada = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Confere o que a pessoa digitou no cadastro (cada coisa duas vezes) e devolve já limpo. */
export function conferirRecuperacao(r) {
  r = r && typeof r === "object" ? r : {};
  const pin = String(r.pin ?? "");
  if (!/^\d{6}$/.test(pin)) throw new ErroId(400, "pin_invalido", "A senha de recuperação precisa ter exatamente 6 números.");
  if (pin !== String(r.pinConfirma ?? "")) throw new ErroId(400, "pin_diferente", "As duas senhas de recuperação não são iguais.");
  if (/^(\d)\1{5}$/.test(pin) || PINS_FRACOS.has(pin)) throw new ErroId(400, "pin_fraco", "Escolha uma senha de recuperação menos óbvia (não use 123456 nem números repetidos).");
  const pergunta = String(r.pergunta ?? "").replace(/\s+/g, " ").trim();
  if (pergunta.length < 8 || pergunta.length > 120) throw new ErroId(400, "pergunta_invalida", "Escreva a pergunta secreta (de 8 a 120 letras).");
  const resposta = respostaNormalizada(r.resposta);
  if (resposta.length < 3 || resposta.length > 80) throw new ErroId(400, "resposta_invalida", "A resposta secreta precisa ter pelo menos 3 letras.");
  if (resposta !== respostaNormalizada(r.respostaConfirma)) throw new ErroId(400, "resposta_diferente", "As duas respostas da pergunta secreta não são iguais.");
  return { pin, pergunta, resposta };
}

async function gravarRecuperacao(env, usuarioId, bruto) {
  const { pin, pergunta, resposta } = conferirRecuperacao(bruto);
  const sp = aleatorio(16), sr = aleatorio(16);
  await env.DB.prepare("UPDATE usuarios SET rec_pin_hash = ?, rec_pin_salt = ?, rec_pergunta = ?, rec_resp_hash = ?, rec_resp_salt = ? WHERE id = ?")
    .bind(await hashSenha(`pin:${pin}`, sp), sp, pergunta, await hashSenha(`resp:${resposta}`, sr), sr, usuarioId).run();
}

/** Quem já tem conta (e quem quer trocar) define a recuperação logado; pede a senha atual para um token roubado não valer. */
export async function definirRecuperacao(env, ctx, { senhaAtual, ...resto }, agora = Date.now()) {
  await limitarTentativas(env, `recdef:${ctx.usuario.id}`, agora, 6);
  const u = await env.DB.prepare("SELECT * FROM usuarios WHERE id = ?").bind(ctx.usuario.id).first();
  if (!u || !iguais(await hashSenha(String(senhaAtual || ""), u.salt), u.senha_hash)) {
    await env.DB.prepare("INSERT INTO id_tentativas (chave, quando) VALUES (?, ?)").bind(`recdef:${ctx.usuario.id}`, agora).run();
    throw new ErroId(401, "credenciais", "A senha atual está errada.");
  }
  await gravarRecuperacao(env, u.id, resto);
  return { ok: true };
}

/** A própria pessoa apaga a conta: pede a senha de novo (token roubado não basta) e a palavra APAGAR. */
export async function apagarPropriaConta(env, ctx, { senha, confirmacao }, agora = Date.now()) {
  const chave = `apagar:${ctx.usuario.id}`;
  await limitarTentativas(env, chave, agora, 6);
  const u = await env.DB.prepare("SELECT u.*, l.plano, l.ativo_ate AS ativoAte FROM usuarios u LEFT JOIN lojas l ON l.id = u.loja WHERE u.id = ?").bind(ctx.usuario.id).first();
  if (!u || !iguais(await hashSenha(String(senha || ""), u.salt), u.senha_hash)) {
    await env.DB.prepare("INSERT INTO id_tentativas (chave, quando) VALUES (?, ?)").bind(chave, agora).run();
    throw new ErroId(401, "credenciais", "A senha está errada.");
  }
  if (String(confirmacao || "").trim() !== "APAGAR") throw new ErroId(400, "confirmacao", "Para confirmar, escreva APAGAR em letras maiúsculas.");
  if (ehAdmin(env, u.email) || u.plano === "dono") throw new ErroId(400, "usuario_protegido", "A conta de administrador não pode ser apagada.");
  // conta paga: apagar sem cancelar poderia deixar a cobrança automática correndo
  if (u.plano !== "testador" && u.plano !== "cortesia" && agora < (u.ativoAte || 0)) {
    throw new ErroId(409, "assinatura_ativa", "Esta conta tem um plano pago em andamento. Para não ficar nenhuma cobrança ligada, peça a exclusão pelo e-mail vetorialtech.dev@gmail.com, a partir do e-mail da conta.");
  }
  if (u.loja) {
    const cobranca = await cobrancaAutomatica(env, u.loja);
    if (cobranca === "sim") throw new ErroId(409, "cobranca_ativa", "Há uma assinatura com cobrança automática no Mercado Pago. Cancele a assinatura por lá primeiro e depois apague a conta.");
    if (cobranca === "nao_sei") throw new ErroId(503, "cobranca_sem_resposta", "Não consegui confirmar no Mercado Pago se há cobrança ligada. Tente de novo em alguns minutos ou escreva para vetorialtech.dev@gmail.com.");
  }
  await apagarConta(env, u.id, agora);
  return { ok: true };
}

export async function estadoDaRecuperacao(env, usuarioId) {
  const u = await env.DB.prepare("SELECT rec_pin_hash, rec_pergunta FROM usuarios WHERE id = ?").bind(usuarioId).first();
  return { configurada: !!(u && u.rec_pin_hash), pergunta: u ? u.rec_pergunta : "" };
}

/** Passo 1 da recuperação: mostra a pergunta secreta (se a conta tem). Limite por IP para não servir de lista de e-mails. */
export async function perguntaSecreta(env, { email }, ip = "", agora = Date.now()) {
  email = emailLimpo(email);
  await limitarTentativas(env, `recp:${ip || "?"}`, agora, 30);
  await env.DB.prepare("INSERT INTO id_tentativas (chave, quando) VALUES (?, ?)").bind(`recp:${ip || "?"}`, agora).run();
  const u = EMAIL.test(email) ? await env.DB.prepare("SELECT rec_pin_hash, rec_pergunta FROM usuarios WHERE email = ?").bind(email).first() : null;
  return { ok: true, existe: !!u, configurada: !!(u && u.rec_pin_hash), pergunta: u ? u.rec_pergunta : "" };
}

/** Passo 2: a senha de 6 números OU a resposta da pergunta secreta abrem a troca da senha. Poucas tentativas, para não dar para adivinhar. */
export async function recuperarPorSegredo(env, { email, metodo, valor, novaSenha }, ip = "", agora = Date.now()) {
  email = emailLimpo(email);
  if (String(novaSenha || "").length < 8) throw new ErroId(400, "senha_curta", "A senha precisa ter pelo menos 8 caracteres.");
  await limitarTentativas(env, `recs:${email}`, agora, 5);
  await limitarTentativas(env, `recsip:${ip || "?"}`, agora, 20);
  const u = await env.DB.prepare("SELECT * FROM usuarios WHERE email = ?").bind(email).first();
  const porPin = metodo !== "pergunta";
  const sal = u ? (porPin ? u.rec_pin_salt : u.rec_resp_salt) : "";
  const alvo = u ? (porPin ? u.rec_pin_hash : u.rec_resp_hash) : "";
  const dado = porPin ? `pin:${String(valor || "").replace(/\D/g, "")}` : `resp:${respostaNormalizada(valor)}`;
  const hash = await hashSenha(dado, sal || "00".repeat(16)); // tempo parecido com ou sem conta
  if (!u || !alvo || !iguais(hash, alvo)) {
    await env.DB.prepare("INSERT INTO id_tentativas (chave, quando) VALUES (?, ?)").bind(`recs:${email}`, agora).run();
    await env.DB.prepare("INSERT INTO id_tentativas (chave, quando) VALUES (?, ?)").bind(`recsip:${ip || "?"}`, agora).run();
    throw new ErroId(400, "segredo_errado", u && !alvo ? "Essa conta ainda não tem recuperação por senha de 6 números ou pergunta secreta." : porPin ? "Senha de recuperação errada." : "Resposta errada.");
  }
  const salt = aleatorio(16);
  await env.DB.prepare("UPDATE usuarios SET senha_hash = ?, salt = ? WHERE id = ?").bind(await hashSenha(novaSenha, salt), salt, u.id).run();
  await env.DB.prepare("DELETE FROM id_tentativas WHERE chave = ?").bind(`recs:${email}`).run();
  await env.DB.prepare("UPDATE sessoes SET encerrada = 1, motivo = 'senha_trocada' WHERE usuario = ? AND encerrada = 0").bind(u.id).run();
  return { ok: true };
}

/** Quem já tem conta sem celular (ou quer trocar) cadastra o número logado; vale para a recuperação por SMS. */
export async function salvarTelefone(env, ctx, telefone) {
  const fone = telefoneLimpo(telefone);
  if (!fone) throw new ErroId(400, "telefone_invalido", "Informe um celular com DDD (ex.: 51 99999-9999).");
  await env.DB.prepare("UPDATE usuarios SET telefone = ? WHERE id = ?").bind(fone, ctx.usuario.id).run();
  return { ok: true, telefone: mascarar("sms", fone) };
}
