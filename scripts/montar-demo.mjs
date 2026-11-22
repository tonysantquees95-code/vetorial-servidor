// Monta a demonstração de um app em site/demo/<app>/: o app de verdade (modo demonstração, dados de exemplo)
// com um script que já deixa a primeira abertura, os termos e a sessão resolvidos e não deixa nada sair para a internet.
// Uso: node scripts/montar-demo.mjs <app> <pasta-do-app> <saida>
import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const [, , app, pasta, saida] = process.argv;
const termosDe = { vindex: "src/apresentacao.ts", vortex: "src/termos.ts", vyntem: "src/apresentacao.ts", venus: "src/apresentacao/dados.ts" };
if (!termosDe[app] || !pasta || !saida) { console.error("uso: montar-demo.mjs vindex|vortex|vyntem|venus <pasta> <saida>"); process.exit(1); }
const termos = readFileSync(join(pasta, termosDe[app]), "utf8").match(/VERSAO_DOS_TERMOS\s*=\s*(\d+)/)[1];
const licenca = { acesso: true, apps: { vindex: true, vortex: true, vyntem: true }, pacote: "admin", emTeste: false };
const sessao = JSON.stringify({ token: "demo", email: "demo@exemplo.com", nome: "Demonstração", licenca });
const sementes = {
  vindex: { "vindex.tour": "1", "vindex.termos": termos, "vindex.sessao": sessao, "vindex.permissoes.vistas2": "1", "vindex.novidades.vistas": "9999" },
  vortex: { "vortex.tour": "1", "vortex.termos": termos, "vortex:configurado": "1", "vortex.novidades.vistas": "9999" },
  venus: { "venus.tour": "1", "venus.termos": termos, "venus.novidades.vistas": "9999", "venus:loja-guiada": "1" },
  vyntem: { "vyntem.tour": "1", "vyntem.termos": termos, "vyntem.sessao": sessao, "vyntem.novidades.vistas": "9999" },
}[app];

rmSync(saida, { recursive: true, force: true });
cpSync(join(pasta, app === "venus" ? "dist-demo" : "dist"), saida, { recursive: true });
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


// Vênus: a conversa de verdade, mas quem responde é uma lista de respostas prontas (nada de IA nem servidor na demonstração).
let iaVenus = "";
if (app === "venus") {
  iaVenus = `
  var RESPOSTAS = [
    [/prazo|entrega|chega|frete|envio|correio/i, "O prazo de entrega da TecnoPonto é de 2 a 4 dias úteis para Porto Alegre e região e de 5 a 9 dias úteis para o resto do Brasil. O frete é grátis acima de R$ 199. Quer que eu calcule pelo seu CEP?"],
    [/estoque|fone|bluetooth|tem /i, "Tenho sim: o Fone Bluetooth com cancelamento de ruído custa R$ 189,90 e temos 12 em estoque. Quer que eu separe um para você e gere o Pix?"],
    [/pix|pagar|pagamento|cart[aã]o|parcel/i, "Aceitamos Pix (com 5% de desconto), cartão em até 6x sem juros e boleto. Se for no Pix, eu gero o código na hora e dou baixa no estoque assim que o pagamento cair."],
    [/vend|faturei|faturamento|hoje|resumo/i, "Hoje a loja vendeu R$ 1.284,50 em 9 pedidos. O mais vendido foi o Fone Bluetooth (4 unidades). Há 2 pedidos aguardando pagamento e 1 para despachar."],
    [/troca|devol|garantia|arrepend/i, "Você pode trocar ou devolver em até 7 dias após receber, sem custo, se o produto estiver na embalagem. A garantia dos eletrônicos é de 12 meses."],
    [/hor[aá]rio|aberto|funciona|atendimento|endere[cç]o|onde/i, "Atendemos de segunda a sábado, das 9h às 19h, e a Vênus responde 24 horas por dia. A loja física fica em Porto Alegre, e o envio sai todo dia útil até as 16h."],
    [/oi|ol[aá]|bom dia|boa tarde|boa noite/i, "Oi! Eu sou a Vênus. Posso responder sobre prazo de entrega, estoque, formas de pagamento, trocas e o resumo de vendas do dia. O que você quer saber?"]
  ];
  var FALHA = "Esta é uma demonstração, então só respondo algumas perguntas prontas. Tente: “Qual o prazo de entrega?”, “Tem fone bluetooth?”, “Como posso pagar?”, “Quanto vendi hoje?” ou “Como funciona a troca?”";
  function resposta(t) { for (var i = 0; i < RESPOSTAS.length; i++) if (RESPOSTAS[i][0].test(t)) return RESPOSTAS[i][1]; return FALHA; }
  var pronta = window.fetch;
  window.fetch = function (u, o) {
    var alvo; try { alvo = new URL(String(u && u.url ? u.url : u), location.href); } catch (e) { return pronta.apply(null, arguments); }
    if (/\\/v1\\/chat$/.test(alvo.pathname) || /\\/chat\\/completions$/.test(alvo.pathname)) {
      var ultima = ""; try { var c = JSON.parse(o && o.body || "{}"); var m = (c.mensagens || c.messages || []).filter(function (x) { return (x.papel || x.role) === "user"; }).pop(); ultima = m ? (m.texto || m.content || "") : ""; } catch (e) {}
      var r = resposta(ultima);
      return new Promise(function (ok) { setTimeout(function () { ok(new Response(JSON.stringify({ resposta: r, choices: [{ message: { content: r } }] }), { status: 200, headers: { "Content-Type": "application/json" } })); }, 900 + Math.min(1200, r.length * 8)); });
    }
    return pronta.apply(null, arguments);
  };`;
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
  ${iaVenus}
})();
`;
writeFileSync(join(saida, "demo-shim.js"), shim);
const idx = join(saida, "index.html");
let html = readFileSync(idx, "utf8");
html = html.replace(/<head>/i, '<head><script src="./demo-shim.js"></script>');
writeFileSync(idx, html);
console.log(`demo ${app}: termos v${termos}, ${statSync(saida).isDirectory() ? "ok" : ""}`);
