// Vexperyon: o laboratório (GitHub Actions) envia capturas e relatório para cá; só o administrador lê.
// Quem envia se identifica pelo token OIDC do GitHub (nenhum segredo para cadastrar). Este repositório NÃO entra
// na lista da chave de assinatura dos APKs, e o destinatário do token é outro.
//   POST /vexperyon/envio?rodada=N&app=vindex&arquivo=01.png   (corpo = o arquivo)
//   POST /vexperyon/envio?rodada=N&app=vindex&fim=success|failure
import { verificarOidc, chavesDoGithub } from "../ci/assinatura.js";

export const PUBLICO_VEXPERYON = "vexperyon-resultados";
export const REGRAS_OIDC = { publico: PUBLICO_VEXPERYON, repos: ["tonysantquees95-code/vexperyon"], apelidos: {} };
export const MAX_ARQUIVO = 1_800_000; // uma linha do D1 vai até 2 MB
export const MAX_ARQUIVOS = 80;
export const RODADAS_GUARDADAS = 3; // por app
const NOME = /^(\d{2}\.(png|txt)|resultado\.json|quedas\.txt|versao\.txt)$/;
const APP = /^[a-z][a-z0-9-]{1,30}$/;
const TIPOS = { png: "image/png", txt: "text/plain; charset=utf-8", json: "application/json; charset=utf-8" };

export const ehRotaVexperyon = (c) => c === "/vexperyon/envio";
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function tratarVexperyon(req, env, url, caminho, opcoes = {}) {
  if (!env.DB) return json({ error: "sem banco" }, 503);
  if (req.method !== "POST") return json({ error: "método não permitido" }, 405);
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  let quem = null;
  try { quem = await verificarOidc(token, opcoes.chaves || (await chavesDoGithub()), opcoes.agora, REGRAS_OIDC); } catch { return json({ error: "não consegui conferir a identidade agora" }, 502); }
  if (!quem) return json({ error: "identidade não aceita" }, 403);

  const rodada = Number(url.searchParams.get("rodada"));
  const app = url.searchParams.get("app") || "";
  if (!Number.isSafeInteger(rodada) || rodada <= 0 || !APP.test(app)) return json({ error: "rodada ou app inválido" }, 400);
  const atual = await env.DB.prepare("SELECT app FROM vexperyon_rodadas WHERE id = ?").bind(rodada).first();
  if (atual && atual.app !== app) return json({ error: "rodada de outro app" }, 409);

  const fim = url.searchParams.get("fim");
  if (fim !== null) {
    if (!["success", "failure"].includes(fim) || !atual) return json({ error: "fim inválido" }, 400);
    await env.DB.prepare("UPDATE vexperyon_rodadas SET situacao = ? WHERE id = ?").bind(fim, rodada).run();
    await apagarAntigas(env, app);
    return json({ ok: true });
  }

  const nome = url.searchParams.get("arquivo") || "";
  if (!NOME.test(nome)) return json({ error: "arquivo não aceito" }, 400);
  if (Number(req.headers.get("content-length") || 0) > MAX_ARQUIVO) return json({ error: "arquivo grande demais" }, 413);
  const dados = new Uint8Array(await req.arrayBuffer());
  if (dados.length > MAX_ARQUIVO) return json({ error: "arquivo grande demais" }, 413);
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM vexperyon_arquivos WHERE rodada = ? AND nome <> ?").bind(rodada, nome).first();
  if (n >= MAX_ARQUIVOS) return json({ error: "arquivos demais na rodada" }, 413);
  // repetir a mesma execução ("Re-run") começa de novo como "enviando"
  await env.DB.prepare("INSERT INTO vexperyon_rodadas (id, app, criado) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET situacao = 'enviando'").bind(rodada, app, Date.now()).run();
  await env.DB.prepare("INSERT OR REPLACE INTO vexperyon_arquivos (rodada, nome, dados, bytes) VALUES (?, ?, ?, ?)").bind(rodada, nome, dados, dados.length).run();
  return json({ ok: true }, 201);
}

async function apagarAntigas(env, app) {
  const velhas = "SELECT id FROM vexperyon_rodadas WHERE app = ? ORDER BY id DESC LIMIT -1 OFFSET ?";
  await env.DB.prepare(`DELETE FROM vexperyon_arquivos WHERE rodada IN (${velhas})`).bind(app, RODADAS_GUARDADAS).run();
  await env.DB.prepare(`DELETE FROM vexperyon_rodadas WHERE id IN (${velhas})`).bind(app, RODADAS_GUARDADAS).run();
}

// ---- leitura: só chamadas pelas rotas /dev, depois de conferir o administrador
export async function listarRodadas(env) {
  const { results: rodadas } = await env.DB.prepare("SELECT id, app, situacao, criado FROM vexperyon_rodadas ORDER BY id DESC").all();
  const { results: arquivos } = await env.DB.prepare("SELECT rodada, nome, bytes FROM vexperyon_arquivos ORDER BY nome").all();
  return { rodadas: rodadas.map((r) => ({ ...r, arquivos: arquivos.filter((a) => a.rodada === r.id).map(({ nome, bytes }) => ({ nome, bytes })) })) };
}

export async function lerArquivo(env, rodada, nome, cabecalhos = {}) {
  if (!NOME.test(nome)) return null;
  const l = await env.DB.prepare("SELECT dados FROM vexperyon_arquivos WHERE rodada = ? AND nome = ?").bind(Number(rodada), nome).first();
  if (!l) return null;
  return new Response(new Uint8Array(l.dados), { headers: { ...cabecalhos, "content-type": TIPOS[nome.split(".").pop()], "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
