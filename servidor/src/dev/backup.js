// Cópia de segurança das chaves que assinam os APKs (tabela `assinaturas`).
// Se o banco for perdido, nenhum app instalado aceita atualização: por isso o administrador baixa um arquivo CRIPTOGRAFADO
// com uma frase só dele (PBKDF2 + AES-GCM) e guarda fora da Cloudflare (Drive). Restaurar devolve as chaves ao banco.
// O arquivo NÃO leva a CHAVE_COFRE (a chave-mestra do servidor): essa precisa de cópia à parte, feita pelo dono.
import { cifrar, decifrar } from "../loja/cripto.js";
import { ErroLoja } from "../loja/lojas.js";
import { senhaForte } from "./cofre.js";

const enc = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const FORMATO = "vetorial-backup-chaves";
const ITERACOES = 100_000; // o Cloudflare Workers não aceita mais que isso no PBKDF2
const KEYSTORE = /^[A-Za-z0-9+/=]{100,30000}$/;
const REPO = /^[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9_.-]{1,100}$/;

async function chaveDaFrase(frase, sal) {
  const base = await crypto.subtle.importKey("raw", enc.encode(frase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: ITERACOES, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function exigirFrase(frase) {
  if (!senhaForte(frase)) throw new ErroLoja(400, "frase_fraca", "A frase do backup precisa ter pelo menos 12 caracteres, com letras e números.");
}

/** Gera o arquivo de backup (objeto JSON) com todas as chaves de assinatura. */
export async function gerarBackup(env, frase, agora = Date.now()) {
  exigirFrase(frase);
  const { results } = await env.DB.prepare("SELECT repo, dados FROM assinaturas ORDER BY repo").all();
  const itens = [];
  for (const l of results) {
    try { const d = await decifrar(env, l.dados); itens.push({ repo: l.repo, keystore: d.keystore, senha: d.senha }); } catch { /* chave ilegível: fica de fora e o painel avisa */ }
  }
  if (!itens.length) throw new ErroLoja(404, "sem_chaves", "Ainda não há chave de assinatura guardada.");
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const claro = enc.encode(JSON.stringify({ quando: agora, itens }));
  const dados = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chaveDaFrase(frase, sal), claro);
  return { formato: FORMATO, v: 1, quando: agora, repositorios: itens.map((i) => i.repo), sal: b64(sal), iv: b64(iv), dados: b64(new Uint8Array(dados)) };
}

/** Abre um arquivo de backup e devolve as chaves (só dentro do servidor; nunca volta para a tela). */
export async function abrirBackup(arquivo, frase) {
  if (!arquivo || arquivo.formato !== FORMATO || arquivo.v !== 1) throw new ErroLoja(400, "arquivo_invalido", "Esse arquivo não é um backup de chaves da Vetorial Tech.");
  try {
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(arquivo.iv) }, await chaveDaFrase(String(frase ?? ""), deB64(arquivo.sal)), deB64(arquivo.dados));
    const d = JSON.parse(new TextDecoder().decode(claro));
    return Array.isArray(d.itens) ? d.itens : [];
  } catch {
    throw new ErroLoja(403, "frase_errada", "Frase errada ou arquivo danificado.");
  }
}

/** Devolve as chaves ao banco. Nunca sobrescreve uma chave que já existe (trocar a chave impediria atualizar os apps instalados). */
export async function restaurarBackup(env, arquivo, frase, agora = Date.now()) {
  const itens = await abrirBackup(arquivo, frase);
  let restauradas = 0, jaExistiam = 0, invalidas = 0;
  for (const i of itens) {
    if (!i || !REPO.test(String(i.repo)) || !KEYSTORE.test(String(i.keystore)) || String(i.senha).length < 12 || String(i.senha).length > 200) { invalidas++; continue; }
    const r = await env.DB.prepare("INSERT OR IGNORE INTO assinaturas (repo, dados, criado) VALUES (?, ?, ?)").bind(i.repo, await cifrar(env, { keystore: i.keystore, senha: i.senha }), agora).run();
    if (r.meta.changes) restauradas++; else jaExistiam++;
  }
  return { restauradas, jaExistiam, invalidas };
}

/** Quantas chaves existem e quando foi a última cópia (a data é guardada pelo painel em dev_config). */
export async function situacaoDoBackup(env) {
  const { results } = await env.DB.prepare("SELECT repo FROM assinaturas ORDER BY repo").all();
  const u = await env.DB.prepare("SELECT valor FROM dev_config WHERE chave = 'backup_chaves_em'").first();
  return { repositorios: results.map((r) => r.repo), ultimoBackup: u ? Number(u.valor) || 0 : 0 };
}

export async function anotarBackup(env, agora = Date.now()) {
  await env.DB.prepare("INSERT INTO dev_config (chave, valor, atualizado) VALUES ('backup_chaves_em', ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado = excluded.atualizado").bind(String(agora), agora).run();
}
