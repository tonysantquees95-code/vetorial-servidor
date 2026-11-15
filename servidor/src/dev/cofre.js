// Cofre de chaves do Vindex/Vetorial: o administrador guarda e troca as APIs pelo Painel Dev.
//  - Só entra quem já é superadmin (JWT do Painel) E sabe a senha do cofre (alfanumérica, mínimo 12).
//  - As chaves ficam cifradas (AES-GCM com CHAVE_COFRE) e NUNCA voltam para a tela: só os 4 últimos caracteres.
//  - 5 senhas erradas seguidas travam o cofre por 15 minutos (e depois 1 hora, 6 horas…).
//  - lerSegredo() é o caminho que o servidor usará para buscar as chaves no cofre; por enquanto ninguém o chama:
//    o servidor continua usando as chaves de ambiente até o cofre estar cheio e conferido.
import { iguais, cifrar, decifrar, aleatorio } from "../loja/cripto.js";
import { hashSenha } from "../id/jwt.js";
import { ErroLoja } from "../loja/lojas.js";

export const NOME_VALIDO = /^[A-Z][A-Z0-9_]{2,47}$/;
export const MAX_FALHAS = 5;
export const BLOQUEIOS_MS = [15 * 60_000, 60 * 60_000, 6 * 3_600_000, 24 * 3_600_000];

/** As chaves que a Vênus/Vindex conhecem (a lista aparece no painel mesmo vazia). */
export const CHAVES_SUGERIDAS = [
  { nome: "GROQ_API_KEY", rotulo: "Groq (chat e transcrição de voz)" },
  { nome: "GEMINI_API_KEY", rotulo: "Gemini (PDF, áudio, fotos e memória)" },
  { nome: "DEEPSEEK_API_KEY", rotulo: "DeepSeek (raciocínio)" },
  { nome: "TAVILY_API_KEY", rotulo: "Tavily (busca na web)" },
  { nome: "CLOUDFLARE_API_TOKEN", rotulo: "Cloudflare (Workers AI)" },
  { nome: "MERCADOPAGO_ACCESS_TOKEN", rotulo: "Mercado Pago" },
  { nome: "GITHUB_TOKEN", rotulo: "GitHub (leitura dos repositórios)" },
  { nome: "PINTEREST_ACCESS_TOKEN", rotulo: "Pinterest (publicar a vitrine)" },
];

/** Senha do cofre: 12+ caracteres, com letras e números (só isso ou mais). */
export function senhaForte(s) {
  const t = String(s ?? "");
  return t.length >= 12 && t.length <= 128 && /[A-Za-z]/.test(t) && /[0-9]/.test(t);
}
const MSG_SENHA = "A senha do cofre precisa ter pelo menos 12 caracteres, com letras e números.";

const linha = (env) => env.DB.prepare("SELECT * FROM cofre_acesso WHERE id = 1").first();
const registrar = (env, acao, nome, ok, agora) =>
  env.DB.prepare("INSERT INTO cofre_log (quando, acao, nome, ok) VALUES (?, ?, ?, ?)").bind(agora, acao, nome || "", ok ? 1 : 0).run();

export async function estado(env, agora = Date.now()) {
  const a = await linha(env);
  return { configurado: !!a, bloqueadoAte: a && a.bloqueado_ate > agora ? a.bloqueado_ate : 0 };
}

/** Primeira vez: define a senha do cofre. Só funciona enquanto não existir uma. */
export async function iniciar(env, senha, agora = Date.now()) {
  if (await linha(env)) throw new ErroLoja(409, "cofre_existe", "O cofre já tem senha. Use Trocar senha.");
  if (!senhaForte(senha)) throw new ErroLoja(400, "senha_fraca", MSG_SENHA);
  const sal = aleatorio(16);
  await env.DB.prepare("INSERT INTO cofre_acesso (id, sal, hash, criado) VALUES (1, ?, ?, ?)").bind(sal, await hashSenha(String(senha), sal), agora).run();
  await registrar(env, "iniciar", "", true, agora);
  return { ok: true };
}

/** Confere a senha do cofre (com trava contra tentativas em sequência). Lança erro se estiver errada. */
export async function conferir(env, senha, agora = Date.now()) {
  const a = await linha(env);
  if (!a) throw new ErroLoja(409, "cofre_sem_senha", "Crie a senha do cofre primeiro.");
  if (a.bloqueado_ate > agora) throw new ErroLoja(429, "cofre_bloqueado", "Cofre trancado por tentativas erradas. Tente de novo mais tarde.");
  const ok = iguais(await hashSenha(String(senha ?? ""), a.sal), a.hash);
  if (ok) {
    if (a.falhas) await env.DB.prepare("UPDATE cofre_acesso SET falhas = 0 WHERE id = 1").run();
    return;
  }
  const falhas = a.falhas + 1;
  let bloqueio = 0;
  let zera = falhas;
  if (falhas >= MAX_FALHAS) {
    const rodada = Math.min(BLOQUEIOS_MS.length - 1, Math.floor(falhas / MAX_FALHAS) - 1);
    bloqueio = agora + BLOQUEIOS_MS[rodada];
    zera = falhas % (MAX_FALHAS * BLOQUEIOS_MS.length) === 0 ? 0 : falhas;
  }
  await env.DB.prepare("UPDATE cofre_acesso SET falhas = ?, bloqueado_ate = ? WHERE id = 1").bind(zera, bloqueio).run();
  await registrar(env, "senha_errada", "", false, agora);
  throw new ErroLoja(403, "cofre_senha", bloqueio ? "Senha errada. O cofre foi trancado por um tempo." : `Senha do cofre incorreta (${MAX_FALHAS - falhas} tentativas até trancar).`);
}

/** Lista as chaves SEM os valores: nome, rótulo, se está no cofre, os 4 últimos caracteres e se o servidor também tem a sua. */
export async function listar(env, agora = Date.now()) {
  const { results } = await env.DB.prepare("SELECT nome, rotulo, previa, atualizado FROM cofre_chaves ORDER BY nome").all();
  const guardadas = new Map(results.map((r) => [r.nome, r]));
  const nomes = new Set([...CHAVES_SUGERIDAS.map((c) => c.nome), ...guardadas.keys()]);
  await registrar(env, "listar", "", true, agora);
  return [...nomes].sort().map((nome) => {
    const g = guardadas.get(nome);
    const sug = CHAVES_SUGERIDAS.find((c) => c.nome === nome);
    return { nome, rotulo: g?.rotulo || sug?.rotulo || "", noCofre: !!g, previa: g?.previa || "", atualizado: g?.atualizado || 0, noServidor: !!env[nome] };
  });
}

export async function guardar(env, { nome, valor, rotulo }, agora = Date.now()) {
  esquecerChavesGuardadas();
  const n = String(nome ?? "").trim().toUpperCase();
  if (!NOME_VALIDO.test(n)) throw new ErroLoja(400, "nome_invalido", "O nome da chave usa letras maiúsculas, números e _ (ex.: GROQ_API_KEY).");
  const v = String(valor ?? "").trim();
  if (v.length < 8 || v.length > 4096 || /\s/.test(v)) throw new ErroLoja(400, "valor_invalido", "Cole a chave inteira, sem espaços (de 8 a 4096 caracteres).");
  const cifrada = await cifrar(env, { v });
  const previa = `••••${v.slice(-4)}`;
  await env.DB.prepare(
    "INSERT INTO cofre_chaves (nome, valor, rotulo, previa, atualizado) VALUES (?, ?, ?, ?, ?) ON CONFLICT(nome) DO UPDATE SET valor = excluded.valor, rotulo = excluded.rotulo, previa = excluded.previa, atualizado = excluded.atualizado",
  ).bind(n, cifrada, String(rotulo ?? "").trim().slice(0, 80), previa, agora).run();
  await registrar(env, "guardar", n, true, agora);
  return { ok: true, nome: n, previa };
}

export async function apagar(env, nome, agora = Date.now()) {
  esquecerChavesGuardadas();
  const n = String(nome ?? "").trim().toUpperCase();
  const r = await env.DB.prepare("DELETE FROM cofre_chaves WHERE nome = ?").bind(n).run();
  await registrar(env, "apagar", n, r.meta.changes > 0, agora);
  return { ok: r.meta.changes > 0 };
}

export async function trocarSenha(env, nova, agora = Date.now()) {
  if (!senhaForte(nova)) throw new ErroLoja(400, "senha_fraca", MSG_SENHA);
  const sal = aleatorio(16);
  await env.DB.prepare("UPDATE cofre_acesso SET sal = ?, hash = ?, falhas = 0, bloqueado_ate = 0, trocado = ? WHERE id = 1").bind(sal, await hashSenha(String(nova), sal), agora).run();
  await registrar(env, "trocar_senha", "", true, agora);
  return { ok: true };
}

/**
 * Como o servidor lê uma chave: primeiro o cofre, depois a variável de ambiente do Worker (o que já existe hoje).
 * Ainda NÃO é usado pelas rotas de IA: a troca do caminho vem depois de o cofre estar preenchido e conferido.
 */
export async function lerSegredo(env, nome) {
  try {
    const l = await env.DB.prepare("SELECT valor FROM cofre_chaves WHERE nome = ?").bind(nome).first();
    if (l) return (await decifrar(env, l.valor)).v;
  } catch {
    /* cofre ilegível: cai para a variável de ambiente */
  }
  return env[nome] || "";
}

const CHAVES_DE_IA = ["GROQ_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "TAVILY_API_KEY"];
const VALIDADE_CHAVES_MS = 5 * 60_000;
let cacheChaves = { ate: 0, valores: null };

/**
 * Entrega o `env` com as chaves de IA que estão no cofre do Vindex (o cofre vale mais que a variável do Worker).
 * Uma só consulta ao banco, guardada por 5 minutos na memória do Worker: as rotas de IA continuam lendo `env.GROQ_API_KEY` etc.
 * Se o cofre não estiver legível ou não tiver a chave, fica a variável de ambiente, como antes.
 */
export async function comChavesDoCofre(env, agora = Date.now()) {
  if (!env.DB) return env;
  if (!cacheChaves.valores || agora > cacheChaves.ate) {
    const valores = {};
    try {
      const marcas = CHAVES_DE_IA.map(() => "?").join(",");
      const { results } = await env.DB.prepare(`SELECT nome, valor FROM cofre_chaves WHERE nome IN (${marcas})`).bind(...CHAVES_DE_IA).all();
      for (const l of results ?? []) {
        try { const v = (await decifrar(env, l.valor)).v; if (v) valores[l.nome] = v; } catch { /* esta chave não abriu: usa a do ambiente */ }
      }
      cacheChaves = { ate: agora + VALIDADE_CHAVES_MS, valores };
    } catch {
      return env; // cofre ilegível: não guarda o fracasso, tenta de novo na próxima
    }
  }
  return Object.keys(cacheChaves.valores).length ? { ...env, ...cacheChaves.valores } : env;
}

/** Esquece as chaves guardadas (usar quando o cofre muda uma chave, para valer na hora). */
export function esquecerChavesGuardadas() { cacheChaves = { ate: 0, valores: null }; }

export async function historico(env, limite = 30) {
  const { results } = await env.DB.prepare("SELECT quando, acao, nome, ok FROM cofre_log ORDER BY id DESC LIMIT ?").bind(Math.min(100, limite)).all();
  return results;
}

// ------------------------------------------------------------------ importação dos segredos do GitHub
const IGNORAR = new Set(["GITHUB_TOKEN", "CHAVE_COFRE"]);
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Gera um código de uso único (15 min) para o workflow de importação. Só o hash fica guardado. */
export async function gerarCodigo(env, agora = Date.now()) {
  const codigo = `vcx-${aleatorio(24)}`;
  await env.DB.prepare("DELETE FROM cofre_codigos WHERE expira < ? OR usado = 1").bind(agora).run();
  await env.DB.prepare("INSERT INTO cofre_codigos (hash, expira) VALUES (?, ?)").bind(await sha(codigo), agora + 15 * 60_000).run();
  await registrar(env, "codigo_importacao", "", true, agora);
  return { codigo, expira: agora + 15 * 60_000 };
}

/**
 * Recebe os segredos de um repositório (o workflow manda toJSON(secrets)). O código só vale uma vez.
 * Chaves que já estão no cofre NÃO são sobrescritas (a menos que `sobrescrever` venha true).
 */
export async function importar(env, codigo, segredos, { sobrescrever = false, origem = "" } = {}, agora = Date.now()) {
  esquecerChavesGuardadas();
  const h = await sha(String(codigo ?? ""));
  const c = await env.DB.prepare("SELECT expira, usado FROM cofre_codigos WHERE hash = ?").bind(h).first();
  if (!c || c.usado || c.expira < agora) throw new ErroLoja(403, "codigo_invalido", "Código de importação inválido ou vencido. Gere outro no Painel.");
  // queima o código antes de qualquer coisa: se algo falhar, gera-se outro
  await env.DB.prepare("UPDATE cofre_codigos SET usado = 1 WHERE hash = ?").bind(h).run();
  if (!segredos || typeof segredos !== "object" || Array.isArray(segredos)) throw new ErroLoja(400, "corpo_invalido", "Faltou a lista de segredos.");
  const guardados = [], pulados = [], existentes = [];
  const ja = new Set((await env.DB.prepare("SELECT nome FROM cofre_chaves").all()).results.map((r) => r.nome));
  for (const [nome, valor] of Object.entries(segredos)) {
    if (IGNORAR.has(nome) || !NOME_VALIDO.test(nome) || typeof valor !== "string" || valor.length < 8 || valor.length > 4096 || /\s/.test(valor)) { pulados.push(nome); continue; }
    if (ja.has(nome) && !sobrescrever) { existentes.push(nome); continue; }
    await guardar(env, { nome, valor, rotulo: origem ? `importada de ${String(origem).slice(0, 60)}` : "" }, agora);
    guardados.push(nome);
  }
  await registrar(env, "importar", String(origem).slice(0, 60), true, agora);
  return { ok: true, guardados, existentes, pulados }; // só nomes, nunca valores
}
