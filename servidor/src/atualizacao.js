// Qual é a versão mais nova de cada app, a partir da lista de publicações do GitHub.
// Vênus (privado, Venus-core): tags 1.N (APK), win-1.N (instalador Windows), mac-1.N (instalador Mac), robo-1.N.
// Vindex (público, Vindex-): tags 1.N com Vindex.apk e VindexSetup.exe.

export const REPO_DA_VENUS = "tonysantquees95-code/Venus-core";
export const REPO_DO_VINDEX = "tonysantquees95-code/Vindex-";
export const REPO_DO_VORTEX = "tonysantquees95-code/Vortex";
export const REPO_DO_DRIVE = "tonysantquees95-code/vetorial-drive";
export const REPO_DO_VELOX = "tonysantquees95-code/velox-gaming-search";
export const REPO_DO_VOXIX = "tonysantquees95-code/voxix";

const APPS = {
  venus: { repo: REPO_DA_VENUS, tag: /^v?1\.(\d+)$/, arquivo: (n) => /\.apk$/i.test(n) && !/robo/i.test(n) },
  windows: { repo: REPO_DA_VENUS, tag: /^win-1\.(\d+)$/, arquivo: (n) => /\.exe$/i.test(n) },
  mac: { repo: REPO_DA_VENUS, tag: /^mac-1\.(\d+)$/, arquivo: (n) => /\.dmg$/i.test(n) },
  robo: { repo: REPO_DA_VENUS, tag: /^robo-1\.(\d+)$/, arquivo: (n) => /^venusrobo\.apk$/i.test(n) },
  "vindex-android": { repo: REPO_DO_VINDEX, tag: /^v?1\.(\d+)$/, arquivo: (n) => /\.apk$/i.test(n), publico: true },
  "vindex-windows": { repo: REPO_DO_VINDEX, tag: /^v?1\.(\d+)$/, arquivo: (n) => /\.exe$/i.test(n), publico: true },
  "vortex-android": { repo: REPO_DO_VORTEX, tag: /^v?1\.(\d+)$/, arquivo: (n) => /\.apk$/i.test(n), publico: true },
  "vortex-windows": { repo: REPO_DO_VORTEX, tag: /^v?1\.(\d+)$/, arquivo: (n) => /\.exe$/i.test(n), publico: true },
  "drive-android": { repo: REPO_DO_DRIVE, tag: /^v?1\.(\d+)$/, arquivo: (n) => /^VetorialDrive\.apk$/i.test(n) },
  "voxix-android": { repo: REPO_DO_VOXIX, tag: /^v?1\.(\d+)$/, arquivo: (n) => /^Voxix\.apk$/i.test(n) },
  "voxix-windows": { repo: REPO_DO_VOXIX, tag: /^v?1\.(\d+)$/, arquivo: (n) => /^VoxixSetup\.exe$/i.test(n) },
  "velox-android": { repo: REPO_DO_VELOX, tag: /^v?1\.(\d+)$/, arquivo: (n) => /^Velox\.apk$/i.test(n), publico: true },
  "velox-windows": { repo: REPO_DO_VELOX, tag: /^windows-1\.(\d+)$/, arquivo: (n) => /^Velox-Instalador-.*\.exe$/i.test(n), publico: true },
};

export const appConhecido = (app) => Object.prototype.hasOwnProperty.call(APPS, app) ? APPS[app] : null;

/** Maior número de versão que tenha o arquivo certo. Devolve { numero, r, apk } ou null. */
export function escolherVersao(lista, app) {
  const cfg = appConhecido(app);
  if (!cfg) return null;
  let melhor = null;
  for (const r of lista) {
    if (r.draft) continue;
    const m = cfg.tag.exec(r.tag_name || "");
    if (!m) continue;
    const apk = (r.assets || []).find((a) => cfg.arquivo(a.name));
    if (!apk) continue;
    const numero = Number(m[1]);
    if (!melhor || numero > melhor.numero) melhor = { numero, r, apk };
  }
  return melhor;
}
