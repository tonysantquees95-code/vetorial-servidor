// Monta a demonstração de um app em site/demo/<app>/: o app de verdade (modo demonstração, dados de exemplo)
// com um script que já deixa a primeira abertura, os termos e a sessão resolvidos e não deixa nada sair para a internet.
// Uso: node scripts/montar-demo.mjs <app> <pasta-do-app> <saida>
import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const [, , app, pasta, saida] = process.argv;
const termosDe = { vindex: "src/apresentacao.ts", vortex: "src/termos.ts", vyntem: "src/apresentacao.ts" };
if (!termosDe[app] || !pasta || !saida) { console.error("uso: montar-demo.mjs vindex|vortex|vyntem <pasta> <saida>"); process.exit(1); }
const termos = readFileSync(join(pasta, termosDe[app]), "utf8").match(/VERSAO_DOS_TERMOS\s*=\s*(\d+)/)[1];
const licenca = { acesso: true, apps: { vindex: true, vortex: true, vyntem: true }, pacote: "admin", emTeste: false };
const sessao = JSON.stringify({ token: "demo", email: "demo@exemplo.com", nome: "Demonstração", licenca });
const sementes = {
  vindex: { "vindex.tour": "1", "vindex.termos": termos, "vindex.sessao": sessao, "vindex.permissoes.vistas2": "1", "vindex.novidades.vistas": "9999" },
  vortex: { "vortex.tour": "1", "vortex.termos": termos, "vortex:configurado": "1", "vortex.novidades.vistas": "9999" },
  vyntem: { "vyntem.tour": "1", "vyntem.termos": termos, "vyntem.sessao": sessao, "vyntem.novidades.vistas": "9999" },
}[app];

rmSync(saida, { recursive: true, force: true });
cpSync(join(pasta, "dist"), saida, { recursive: true });
(function limpar(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) limpar(p); else if (f.endsWith(".map")) rmSync(p); } })(saida);

// Vyntem: o app de verdade precisa de alguns lançamentos para a demonstração não aparecer vazia (datas contam a partir de hoje).
let bancoVyntem = "";
if (app === "vyntem") {
  const cats = [...readFileSync(join(pasta, "src/dados.ts"), "utf8").matchAll(/\{ id: "(c-[a-z-]+)", nome: "([^"]+)", tipo: "(despesa|receita)", icone: "([a-z]+)", cor: "(#[0-9a-f]{6})"/g)]
    .map((m) => ({ id: m[1], nome: m[2], tipo: m[3], icone: m[4], cor: m[5] }));
  if (cats.length < 10) throw new Error("não achei as categorias padrão do Vyntem");
  bancoVyntem = `
  try {
    if (localStorage.getItem("vyntem.dados") === null) {
      var h = new Date(), pad = function (n) { return (n < 10 ? "0" : "") + n; };
      var dia = function (atras) { var d = new Date(h.getFullYear(), h.getMonth(), h.getDate() - atras); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
      var L = [["receita", 450000, 9, "c-salario", "Salário"], ["receita", 62000, 6, "c-vendas", "Vendas da semana"], ["despesa", 38790, 8, "c-mercado", "Mercado do mês"], ["despesa", 5490, 7, "c-restaurante", "Almoço"],
        ["despesa", 18900, 6, "c-contas", "Conta de luz"], ["despesa", 12000, 5, "c-transporte", "Gasolina"], ["despesa", 4590, 4, "c-mercado", "Mercado"], ["despesa", 8900, 3, "c-lazer", "Cinema"],
        ["despesa", 15990, 2, "c-roupas", "Camiseta"], ["despesa", 3250, 1, "c-restaurante", "Lanche"], ["despesa", 6700, 0, "c-saude", "Farmácia"]];
      var banco = { versao: 1, categorias: ${JSON.stringify(cats)}, contas: [{ id: "k-banco", nome: "Conta corrente", tipo: "banco", saldoInicial: 120000, cor: "#22d3ee" }, { id: "k-din", nome: "Carteira", tipo: "dinheiro", saldoInicial: 15000, cor: "#34d399" }],
        lancamentos: L.map(function (l, i) { return { id: "demo-" + i, tipo: l[0], valor: l[1], data: dia(l[2]), contaId: "k-banco", categoriaId: l[3], nota: l[4], origem: "manual", criadoEm: Date.now() - i * 1000 }; }) };
      localStorage.setItem("vyntem.dados", JSON.stringify(banco));
    }
  } catch (e) {}`;
}

const shim = `// Demonstração do ${app}: dados de exemplo, nada sai do navegador.
(function () {
  try { var s = ${JSON.stringify(sementes)}; for (var k in s) if (localStorage.getItem(k) === null) localStorage.setItem(k, s[k]); } catch (e) {}
  ${bancoVyntem}
  var feita = window.fetch ? window.fetch.bind(window) : null;
  var base = location.pathname.replace(/[^/]*$/, "");
  window.fetch = function (u) {
    var url = String(u && u.url ? u.url : u), alvo;
    try { alvo = new URL(url, location.href); } catch (e) { return Promise.reject(new TypeError("Demonstração: endereço inválido")); }
    if (/\\/id\\/verificar/.test(alvo.pathname)) return Promise.resolve(new Response(JSON.stringify({ licenca: ${JSON.stringify(licenca)} }), { status: 200, headers: { "Content-Type": "application/json" } }));
    // só os arquivos do próprio app; o resto (servidor, internet) fica fora da demonstração
    if (alvo.origin === location.origin && alvo.pathname.indexOf(base) === 0 && feita) return feita.apply(null, arguments);
    return Promise.reject(new TypeError("Demonstração: sem internet"));
  };
})();
`;
writeFileSync(join(saida, "demo-shim.js"), shim);
const idx = join(saida, "index.html");
let html = readFileSync(idx, "utf8");
html = html.replace(/<head>/i, '<head><script src="./demo-shim.js"></script>');
writeFileSync(idx, html);
console.log(`demo ${app}: termos v${termos}, ${statSync(saida).isDirectory() ? "ok" : ""}`);
