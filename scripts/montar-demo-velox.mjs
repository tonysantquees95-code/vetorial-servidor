// Demonstração do Velox em site/demo/velox/: as páginas de verdade do app (início, apps) sem sair para a internet.
// Uso: node scripts/montar-demo-velox.mjs <pasta-assets-do-velox> <saida>
import { cpSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const [, , pasta, saida] = process.argv;
if (!pasta || !saida) { console.error("uso: montar-demo-velox.mjs <assets> <saida>"); process.exit(1); }
rmSync(saida, { recursive: true, force: true }); mkdirSync(saida, { recursive: true });
for (const f of ["inicio.html", "apps.html", "vgx.css", "vgx.js", "marcas.js"]) if (existsSync(join(pasta, f))) cpSync(join(pasta, f), join(saida, f === "inicio.html" ? "index.html" : f));
const tira = (h) => h.replace(/location\.href\s*=/g, "window.__demoNav =").replace(/window\.open\s*\(/g, "(function(){})(");
for (const f of ["index.html", "apps.html"]) { const c = join(saida, f); if (existsSync(c)) writeFileSync(c, tira(readFileSync(c, "utf8")).replace("</head>", '<meta name="referrer" content="no-referrer"><script>window.alert=function(){};window.confirm=function(){return false};window.prompt=function(){return null};</script></head>')); }
writeFileSync(join(saida, "demo-shim.js"), "// demonstração do Velox: nada sai para fora\n");
console.log("demo velox: ok");
