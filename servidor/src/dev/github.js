// Dados dos repositórios para o Painel Dev: métricas de código, estado dos builds e APKs publicados.
// Usa o GITHUB_TOKEN (só leitura) do Worker. Tudo guardado em cache por alguns minutos.
export const REPO_VENUS = "tonysantquees95-code/Venus-core";
export const REPO_VINDEX = "tonysantquees95-code/Vindex-";
export const REPO_VORTEX = "tonysantquees95-code/Vortex";
export const REPO_VELOX = "tonysantquees95-code/velox-gaming-search";
export const REPO_DRIVE = "tonysantquees95-code/vetorial-drive";
export const REPO_VOXIX = "tonysantquees95-code/voxix";
export const REPO_DEV_CENTER = "tonysantquees95-code/vetorial-dev-center";

/** Projetos do ecossistema. Vindex e Vortex ganham repositório pelo painel (dev_config "repo:<id>") ou pela variável do Worker. */
export const PROJETOS = [
  {
    id: "venus", nome: "Vênus", repo: REPO_VENUS,
    descricao: "Assistente e plataforma do lojista: app Android, web/PWA, Windows, iOS e servidor.",
    apks: [
      { app: "venus", rotulo: "Vênus (Android)", tag: /^v?1\.(\d+)$/, arquivo: (n) => /\.apk$/i.test(n) && !/robo|dev/i.test(n) },
      { app: "windows", rotulo: "Vênus (Windows)", tag: /^win-1\.(\d+)$/, arquivo: (n) => /\.exe$/i.test(n) },
      { app: "mac", rotulo: "Vênus (Mac)", tag: /^mac-1\.(\d+)$/, arquivo: (n) => /\.dmg$/i.test(n) },
    ],
  },
  {
    id: "devcenter", nome: "Vetorial Dev Center", repo: REPO_DEV_CENTER,
    descricao: "Este painel: site (PWA) e APK Dev do administrador.",
    apks: [{ app: "dev", rotulo: "Vetorial Dev (este painel)", tag: /^dev-1\.(\d+)$/, arquivo: (n) => /\.apk$/i.test(n) }],
  },
  {
    id: "vindex", nome: "Vindex · Manager e Vault", repo: REPO_VINDEX,
    descricao: "Otimizador de hardware, organizador de arquivos (Manager) e cofre de segredos (Vault): Windows e Android.",
    apks: [
      { app: "vindex-android", rotulo: "Vindex (Android)", tag: /^1\.(\d+)$/, arquivo: (n) => /^Vindex\.apk$/i.test(n) },
      { app: "vindex-windows", rotulo: "Vindex (Windows)", tag: /^1\.(\d+)$/, arquivo: (n) => /^VindexSetup\.exe$/i.test(n) },
    ],
  },
  { id: "vortex", nome: "Vortex · Game Space", repo: REPO_VORTEX, descricao: "Game Space: launcher de jogos retrô com Modo Jogo, saves na nuvem e voz da Vênus (Windows e Android).", apks: [
      { app: "vortex-android", rotulo: "Vortex (Android)", tag: /^v?1\.(\d+)$/, arquivo: (n) => /^Vortex\.apk$/i.test(n) },
      { app: "vortex-windows", rotulo: "Vortex (Windows)", tag: /^v?1\.(\d+)$/, arquivo: (n) => /^VortexSetup\.exe$/i.test(n) },
    ] },  { id: "velox", nome: "Velox Search", repo: REPO_VELOX, descricao: "Navegador gamer da Vetorial Tech: abas, bloqueio de anúncios, temas e downloads (Android e Windows).", apks: [
      { app: "velox-android", rotulo: "Velox (Android)", tag: /^v?1\.(\d+)$/, arquivo: (n) => /^Velox\.apk$/i.test(n) },
      { app: "velox-windows", rotulo: "Velox (Windows)", tag: /^windows-1\.(\d+)$/, arquivo: (n) => /^Velox-Instalador-.*\.exe$/i.test(n) },
    ] },
  { id: "drive", nome: "Vetorial Drive", repo: REPO_DRIVE, descricao: "Nuvem da conta Vetorial ID para documentos e ROMs (2 GB por arquivo): app Android; o Vortex usa o mesmo espaço.", apks: [
      { app: "drive-android", rotulo: "Vetorial Drive (Android)", tag: /^v?1\.(\d+)$/, arquivo: (n) => /^VetorialDrive\.apk$/i.test(n) },
    ] },
  { id: "voxix", nome: "Voxix · Chat para gamers", repo: REPO_VOXIX, descricao: "Chat para gamers: conversas privadas ao vivo com apelido, bloqueio, denúncia e ditado por microfone (Android e Windows).", apks: [
      { app: "voxix-android", rotulo: "Voxix (Android)", tag: /^v?1\.(\d+)$/, arquivo: (n) => /^Voxix\.apk$/i.test(n) },
      { app: "voxix-windows", rotulo: "Voxix (Windows)", tag: /^v?1\.(\d+)$/, arquivo: (n) => /^VoxixSetup\.exe$/i.test(n) },
    ] },
];

export const REPO_VALIDO = /^[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9_.-]{1,100}$/;

export function gh(env, caminho, extra = {}) {
  return fetch(`https://api.github.com${caminho}`, {
    ...extra,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, "User-Agent": "venus-servidor", "X-GitHub-Api-Version": "2022-11-28", Accept: "application/vnd.github+json", ...(extra.headers || {}) },
  });
}

/** Cache de poucos minutos na borda (some em testes, onde não há caches.default). */
export async function comCache(chave, ttl, buscar) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const req = new Request(`https://cache.venus/dev/${encodeURIComponent(chave)}`);
  if (cache) {
    const g = await cache.match(req);
    if (g) return g.json();
  }
  const v = await buscar();
  if (cache && v !== undefined) await cache.put(req, new Response(JSON.stringify(v), { headers: { "cache-control": `max-age=${ttl}` } }));
  return v;
}

const TEXTO = /\.(kt|java|xml|json|m?[jt]sx?|html|css|sql|ya?ml|toml|md|mjs|cjs|sh|gradle|kts|py)$/i;
const IGNORADOS = /(^|\/)(node_modules|dist|dist-desktop|build|android|\.gradle)\/|package-lock\.json$|\.map$/;

/** Estimativa quando ainda não existe o arquivo exato do CI: arquivos de texto do repositório e linhas por tamanho (~34 bytes/linha). */
export function estimarPelaArvore(arvore) {
  const blobs = (arvore || []).filter((x) => x.type === "blob" && TEXTO.test(x.path) && !IGNORADOS.test(x.path));
  const porLinguagem = {};
  let linhas = 0;
  for (const b of blobs) {
    const l = Math.max(1, Math.round((b.size || 0) / 34));
    const ext = (b.path.match(/\.([A-Za-z]+)$/) || [, "outros"])[1].toLowerCase();
    const p = (porLinguagem[ext] ||= { nome: ext, arquivos: 0, linhas: 0 });
    p.arquivos++; p.linhas += l; linhas += l;
  }
  return { arquivos: blobs.length, linhas, linguagens: Object.values(porLinguagem).sort((a, b) => b.linhas - a.linhas).slice(0, 8), fonte: "estimado", atualizado: 0 };
}

async function baixarAsset(env, repo, asset) {
  const r = await gh(env, `/repos/${repo}/releases/assets/${asset.id}`, { headers: { Accept: "application/octet-stream" }, redirect: "manual" });
  const link = r.headers.get("location");
  return link ? fetch(link) : r;
}

/** Métricas de código: o CI publica o número exato (release "metricas"); sem ele, estimativa pela árvore do Git. */
export async function metricasDoRepo(env, repo) {
  return comCache(`metricas:${repo}`, 600, async () => {
    try {
      const rel = await gh(env, `/repos/${repo}/releases/tags/metricas`);
      if (rel.ok) {
        const a = ((await rel.json()).assets || []).find((x) => x.name === "metricas.json");
        if (a) {
          const d = await (await baixarAsset(env, repo, a)).json();
          if (d && typeof d.linhas === "number") return { arquivos: d.arquivos, linhas: d.linhas, linguagens: (d.linguagens || []).slice(0, 8), pastas: (d.pastas || []).slice(0, 8), commit: d.commit || "", fonte: "ci", atualizado: Date.parse(d.quando) || 0 };
        }
      }
      const t = await gh(env, `/repos/${repo}/git/trees/HEAD?recursive=1`);
      if (t.ok) return estimarPelaArvore((await t.json()).tree);
    } catch (e) {
      console.error("metricas", repo, e && e.message);
    }
    return null;
  });
}

/** Último resultado de cada workflow (build do APK, servidor, web). */
/** Último motivo de falha ao ler os builds de cada repositório (o painel mostra no lugar de "Sem build"). */
export const falhaDosBuilds = new Map();

export async function buildsDoRepo(env, repo) {
  return comCache(`builds:${repo}`, 120, async () => {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const r = await gh(env, `/repos/${repo}/actions/runs?per_page=30`);
        if (!r.ok) {
          const msg = String(((await r.json().catch(() => ({}))) || {}).message || "").slice(0, 110);
          falhaDosBuilds.set(repo, `o GitHub respondeu ${r.status}: ${msg}${r.headers.get("x-ratelimit-remaining") === "0" ? " · limite de uso esgotado" : ""}`);
          continue;
        }
        const vistos = new Map();
        for (const x of (await r.json()).workflow_runs || []) {
          if (!vistos.has(x.name)) vistos.set(x.name, { id: x.id, workflow: x.name, estado: x.status, resultado: x.conclusion, numero: x.run_number, commit: String(x.head_sha || "").slice(0, 7), quando: Date.parse(x.updated_at) || 0, url: x.html_url, manual: x.event === "workflow_dispatch" });
        }
        falhaDosBuilds.delete(repo);
        return [...vistos.values()];
      } catch (e) {
        falhaDosBuilds.set(repo, String((e && e.message) || e).slice(0, 80));
        console.error("builds", repo, e && e.message);
      }
    }
    return undefined; // falha não vai para o cache: a próxima leitura tenta de novo e guarda o motivo
  });
}

/** Quanto de uma compilação já andou, pelos passos dos jobs (puro, testado). Sem passos ainda, cada job conta como um passo. */
export function percentualDosJobs(jobs) {
  let total = 0, feitos = 0, atual = "";
  for (const j of jobs || []) {
    const passos = Array.isArray(j.steps) && j.steps.length ? j.steps : [{ name: j.name, status: j.status }];
    for (const p of passos) {
      total++;
      if (p.status === "completed") feitos++;
      else if (!atual && p.status === "in_progress") atual = p.name || "";
    }
  }
  return { percentual: total ? Math.min(99, Math.round((feitos / total) * 100)) : 0, etapa: atual };
}

/** Progresso da compilação em andamento (null se nada está compilando). */
export async function progressoDoBuild(env, repo, builds) {
  const b = (builds || []).find((x) => x.estado !== "completed" && x.id);
  if (!b) return null;
  return comCache(`jobs:${repo}:${b.id}`, 15, async () => {
    try {
      const r = await gh(env, `/repos/${repo}/actions/runs/${b.id}/jobs?per_page=30`);
      if (!r.ok) return { workflow: b.workflow, percentual: 0, etapa: "" };
      return { workflow: b.workflow, ...percentualDosJobs((await r.json()).jobs) };
    } catch (e) {
      console.error("jobs", repo, e && e.message);
      return { workflow: b.workflow, percentual: 0, etapa: "" };
    }
  });
}

/** Resume a lista de builds num único estado: falhou > rodando > ok.
 *  Falha de uma execução manual (ferramentas como "Guardar a chave antiga") continua aparecendo na lista, mas não marca o projeto inteiro como "Build falhou". */
export function estadoGeral(builds) {
  if (!builds || !builds.length) return "desconhecido";
  if (builds.some((b) => !b.manual && b.estado === "completed" && ["failure", "timed_out", "startup_failure"].includes(b.resultado))) return "falhou";
  if (builds.some((b) => b.estado !== "completed")) return "rodando";
  return "ok";
}

export async function listaDeVersoes(env, repo) {
  return comCache(`releases:${repo}`, 300, async () => {
    const r = await gh(env, `/repos/${repo}/releases?per_page=100`);
    return r.ok ? await r.json() : null;
  });
}

/** Versão mais nova de cada APK do projeto (número, página da versão e tamanho). */
export function apksDoProjeto(projeto, lista) {
  return projeto.apks.map((a) => {
    let melhor = null;
    for (const r of lista || []) {
      if (r.draft) continue;
      const m = a.tag.exec(r.tag_name || "");
      if (!m) continue;
      const arq = (r.assets || []).find((x) => a.arquivo(x.name));
      if (arq && (!melhor || Number(m[1]) > melhor.numero)) melhor = { numero: Number(m[1]), tag: r.tag_name, pagina: r.html_url, tamanho: arq.size || 0, publicado: Date.parse(r.published_at) || 0, arquivoId: arq.id };
    }
    return { app: a.app, rotulo: a.rotulo, versao: melhor ? { numero: melhor.numero, tag: melhor.tag, pagina: melhor.pagina, tamanho: melhor.tamanho, publicado: melhor.publicado } : null, _id: melhor && melhor.arquivoId };
  });
}

/** Link temporário (poucos minutos) para baixar o APK direto do GitHub. */
export async function linkDoApk(env, repo, assetId) {
  const d = await gh(env, `/repos/${repo}/releases/assets/${assetId}`, { headers: { Accept: "application/octet-stream" }, redirect: "manual" });
  return d.headers.get("location") || "";
}
