// Manual de cada projeto no Painel Dev: o texto do MANUAL.md do repositório + as últimas movimentações (commits).
// Só leitura, com o GITHUB_TOKEN (somente leitura) do Worker. Nada é guardado no banco.
import { gh, comCache } from "./github.js";

const LIMITE_TEXTO = 300_000;

/** Reduz um commit da API do GitHub ao que a tela mostra. */
export function resumirCommit(c) {
  const msg = String((c && c.commit && c.commit.message) || "").split("\n")[0].trim().slice(0, 160);
  const quando = Date.parse((c && c.commit && c.commit.author && c.commit.author.date) || "") || 0;
  return {
    sha: String((c && c.sha) || "").slice(0, 7),
    mensagem: msg,
    quando,
    autor: String((c && c.commit && c.commit.author && c.commit.author.name) || "").slice(0, 60),
    url: c && /^https:\/\/github\.com\//.test(c.html_url || "") ? c.html_url : null,
  };
}

/** Lê o manual e as movimentações de um repositório. `falha` diz por que algo não veio (nunca derruba a tela). */
export async function manualDoRepo(env, repo) {
  const base = { repo, url: `https://github.com/${repo}`, texto: null, atualizado: 0, movimentacoes: [], falha: null };
  if (!env.GITHUB_TOKEN) return { ...base, falha: "O Worker está sem o token de leitura do GitHub." };
  const [arq, lista, ultimoManual] = await Promise.all([
    gh(env, `/repos/${repo}/contents/MANUAL.md`, { headers: { Accept: "application/vnd.github.raw+json" } }).catch(() => null),
    gh(env, `/repos/${repo}/commits?per_page=20`).catch(() => null),
    gh(env, `/repos/${repo}/commits?path=MANUAL.md&per_page=1`).catch(() => null),
  ]);
  const saida = { ...base };
  if (arq && arq.ok) saida.texto = (await arq.text()).slice(0, LIMITE_TEXTO);
  else if (arq && arq.status === 404) saida.falha = "Este repositório ainda não tem o MANUAL.md.";
  else saida.falha = `Não consegui ler o manual (${arq ? arq.status : "sem resposta"}).`;
  if (lista && lista.ok) {
    const dados = await lista.json().catch(() => []);
    if (Array.isArray(dados)) saida.movimentacoes = dados.map(resumirCommit);
  }
  if (ultimoManual && ultimoManual.ok) {
    const dados = await ultimoManual.json().catch(() => []);
    if (Array.isArray(dados) && dados[0]) saida.atualizado = resumirCommit(dados[0]).quando;
  }
  return saida;
}

/** Com cache curto, para o painel não gastar o limite do GitHub. */
export const manualComCache = (env, repo) => comCache(`manual:${repo}`, 120, () => manualDoRepo(env, repo));
