// Atalhos curtos e fáceis de digitar: /venus (página de download), /venus/android, /venus/windows e /paineldev.
export const PAINEL_DEV = "https://tonysantquees95-code.github.io/vetorial-dev-center/";

export const VORTEX_BAIXAR = "https://github.com/tonysantquees95-code/Vortex/releases/latest/download";

export const VINDEX_BAIXAR = "https://github.com/tonysantquees95-code/Vindex-/releases/latest/download";

export function ehAtalho(caminho) {
  return /^\/(venus|vindex|vortex)(\/(android|windows|web))?$|^\/venus\/mac$|^\/paineldev$/i.test(caminho.toLowerCase());
}

const pagina = (origem) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vênus · Vetorial Tech</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070B14;color:#e8ecf4;font:16px system-ui,sans-serif}main{max-width:420px;padding:24px;text-align:center}h1{margin:0 0 6px}p{color:#9aa6bd}a{display:block;margin:12px 0;padding:14px;border-radius:14px;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600}a.s{background:#1b2436}.q{text-align:left;background:#0f1626;border:1px solid #1e2a44;border-radius:14px;padding:12px 14px;margin:12px 0;font-size:14px;color:#c4cde0}.q b{color:#fff}.q ul{margin:6px 0 0;padding-left:18px}</style></head>
<body><main><h1>Vênus</h1><p>Assistente e central da sua loja. Baixe o app:</p>
<div class="q"><b>Android:</b> assistente pessoal e comercial. Controla o celular e pode ser a sua assistente principal.</div>
<a href="${origem}/venus/android">Baixar para Android</a><a href="${origem}/venus/windows">Baixar para Windows</a><a href="${origem}/venus/mac">Baixar para Mac</a>
<div class="q"><b>iPhone (pelo navegador):</b> só assistente comercial. Não funciona como assistente pessoal nem controla o aparelho. Abra o link, toque em Compartilhar e em "Adicionar à Tela de Início".</div>
<a href="${origem}/app/">Usar no navegador / iPhone</a>
<div class="q"><b>Como a Vênus funciona:</b> a inteligência (conversa, PDF, áudio, fotos, imagens) já vem do nosso servidor, sem você criar chave nenhuma. Você só configura a loja e, se quiser publicar no Instagram, a conexão com a Meta.<ul><li>WhatsApp: respostas automáticas.</li><li>Instagram: posts e stories automáticos, acompanhamento de seguidores e criação de imagens. Sem resposta automática no direct: a Vênus escreve e você copia e cola nas respostas rápidas.</li></ul></div>
<a class="s" href="${PAINEL_DEV}">Painel Dev (administrador)</a></main></body></html>`;

const paginaVortex = (origem) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vortex · Vetorial Tech</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#04040a;color:#e8ecf4;font:16px system-ui,sans-serif}main{max-width:420px;padding:24px;text-align:center}h1{margin:0 0 6px;letter-spacing:.3em;text-shadow:0 0 24px #ff2a3d}p{color:#9aa6bd}a{display:block;margin:10px 0;padding:14px;border-radius:12px;background:#ff2a3d;color:#fff;text-decoration:none;font-weight:700}</style>
<body><main><h1>VORTEX</h1><p>Central de jogos retrô. Baixe o app:</p>
<a href="${origem}/vortex/android">Baixar para Android</a><a href="${origem}/vortex/windows">Baixar para Windows</a></main></body></html>`;

const paginaVindex = (origem) => pagina(origem).replace("<h1>Vênus</h1><p>Assistente e central da sua loja. Baixe o app:</p>", "<h1>Vindex</h1><p>Otimizador e organizador de arquivos. Baixe o app:</p>").replace(`${origem}/venus/android`, `${origem}/vindex/android`).replace(`${origem}/venus/windows`, `${origem}/vindex/windows`).replace("<title>Vênus", "<title>Vindex").replace(/<a href="[^"]*\/venus\/mac">[^<]*<\/a>/, "").replace(/<div class="q">[\s\S]*?<\/div>\n?/g, "").replace(/<a href="[^"]*\/app\/">[^<]*<\/a>/, "");

/** Resposta do atalho: a página /venus, ou um redirecionamento para o download / painel. */
export function responderAtalho(url, caminho) {
  const c = caminho.toLowerCase();
  const origem = url.origin;
  if (c === "/vindex/android") return Response.redirect(`${VINDEX_BAIXAR}/Vindex.apk`, 302);
  if (c === "/vindex/windows") return Response.redirect(`${VINDEX_BAIXAR}/VindexSetup.exe`, 302);
  if (c === "/vortex/android") return Response.redirect(`${VORTEX_BAIXAR}/Vortex.apk`, 302);
  if (c === "/vortex/windows") return Response.redirect(`${VORTEX_BAIXAR}/VortexSetup.exe`, 302);
  if (c === "/vortex" || c === "/vortex/web") return new Response(paginaVortex(origem), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
  if (c === "/vindex") return new Response(paginaVindex(origem), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
  if (c === "/venus/web") return Response.redirect(`${origem}/app/`, 302);
  if (c === "/paineldev") return Response.redirect(PAINEL_DEV, 302);
  if (c === "/venus") return new Response(pagina(origem), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
  const app = c.endsWith("/windows") ? "windows" : c.endsWith("/mac") ? "mac" : "venus";
  return Response.redirect(`${origem}/atualizacao?app=${app}&baixar=1`, 302);
}
