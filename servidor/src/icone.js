// Os ícones da suíte no site vêm direto do repositório de cada app: se o ícone mudar no app (Vindex ou Vortex),
// o site passa a mostrar o novo sozinho, sem copiar arquivo. A Vênus usa o arquivo do próprio site.
//   GET /icone/vindex.png | /icone/vortex.png | /icone/venus.png | /icone/velox.png | /icone/voxix.png
import { comPrazo } from "./prazo.js";
const FONTES = {
  vindex: "https://raw.githubusercontent.com/tonysantquees95-code/Vindex-/main/app/assets/icon-only.png",
  vortex: "https://raw.githubusercontent.com/tonysantquees95-code/Vortex/main/app/assets/icon-only.png",
  voxix: "https://raw.githubusercontent.com/tonysantquees95-code/voxix/main/app/assets/icon-only.png",
};
const TTL_S = 600;
export const ehRotaIcone = (c) => /^\/icone\/(venus|vindex|vortex|velox|voxix)\.png$/.test(c);

export async function tratarIcone(req, url, caminho) {
  const app = /^\/icone\/(\w+)\.png$/.exec(caminho)[1];
  const reserva = () => Response.redirect(new URL(`/icone-${app}.png`, url).href, 302);
  const fonte = FONTES[app];
  if (!fonte) return reserva();
  try {
    const r = await comPrazo(fonte, { cf: { cacheTtl: TTL_S, cacheEverything: true } }, 8000);
    const tipo = r.headers.get("content-type") || "";
    if (!r.ok || !tipo.startsWith("image/")) return reserva();
    return new Response(r.body, { headers: { "content-type": "image/png", "cache-control": `public, max-age=${TTL_S}`, "access-control-allow-origin": "*" } });
  } catch {
    return reserva();
  }
}
