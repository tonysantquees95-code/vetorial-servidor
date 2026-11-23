// Monta a demonstração de um app em site/demo/<app>/: o app de verdade (modo demonstração, dados de exemplo)
// com um script que já deixa a primeira abertura, os termos e a sessão resolvidos e não deixa nada sair para a internet.
// Uso: node scripts/montar-demo.mjs <app> <pasta-do-app> <saida>
import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const [, , app, pasta, saida] = process.argv;
const termosDe = { vindex: "src/apresentacao.ts", vortex: "src/termos.ts", vyntem: "src/apresentacao.ts", venus: "src/apresentacao/dados.ts", voxix: "src/apresentacao.ts" };
if (!termosDe[app] || !pasta || !saida) { console.error("uso: montar-demo.mjs vindex|vortex|vyntem|venus|voxix <pasta> <saida>"); process.exit(1); }
const termos = readFileSync(join(pasta, termosDe[app]), "utf8").match(/VERSAO_DOS_TERMOS\s*=\s*(\d+)/)[1];
const licenca = { acesso: true, apps: { vindex: true, vortex: true, vyntem: true }, pacote: "admin", emTeste: false };
const sessao = JSON.stringify({ token: "demo", email: "demo@exemplo.com", nome: "Demonstração", licenca });
const sementes = {
  vindex: { "vindex.tour": "1", "vindex.termos": termos, "vindex.sessao": sessao, "vindex.permissoes.vistas2": "1", "vindex.novidades.vistas": "9999" },
  vortex: { "vortex.tour": "1", "vortex.termos": termos, "vortex:configurado": "1", "vortex.novidades.vistas": "9999" },
  venus: { "venus.tour": "1", "venus.termos": termos, "venus.novidades.vistas": "9999", "venus:loja-guiada": "1" },
  voxix: { "voxix.tour": "1", "voxix.termos": termos, "voxix.sessao": JSON.stringify({ token: "demo", email: "demo@exemplo.com", nome: "Você" }), "voxix.novidades.vistas": "9999",
    "voxix.conversas": JSON.stringify({ conversas: (() => { const agora = Date.now(), m = (id, minha, corpo, min) => ({ id, minha, corpo, criado: agora - min * 60000, estado: "enviada" });
      return {
        kaua: { apelido: "kaua", nome: "Kauã", naoLidas: 2, ultima: agora - 4 * 60000, mensagens: [m("a1", false, "bora fechar o time hoje à noite?", 42), m("a2", true, "bora! 21h tá bom?", 40), m("a3", false, "fechou, chama o Rafa também", 39), m("a4", false, "tô no lobby já", 5), m("a5", false, "vem logo 😂", 4)] },
        lari: { apelido: "lari", nome: "Larissa", naoLidas: 0, ultima: agora - 95 * 60000, mensagens: [m("b1", true, "viu o torneio de sábado?", 130), m("b2", false, "vi! já me inscrevi, falta só a gente fechar a dupla", 120), m("b3", true, "me coloca na dupla então 🎮", 100), m("b4", false, "feito!", 95)] },
        rafa: { apelido: "rafa", nome: "Rafa", naoLidas: 0, ultima: agora - 1500 * 60000, mensagens: [m("c1", false, "passa o código da sala", 1510), m("c2", true, "VX-4821", 1505), m("c3", false, "valeu!", 1500)] }
      }; })() }) },
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

// Voxix: o chat de verdade, mas com servidor de mentira (perfil, comunidades, salas ao vivo e respostas prontas).
let servidorVoxix = "";
if (app === "voxix") {
  servidorVoxix = `
  var EU = { apelido: "voce", nome: "Você", avatar: null };
  var agora = function () { return Date.now(); };
  var P = function (apelido, nome) { return { apelido: apelido, nome: nome, avatar: null }; };
  var AMIGOS = [P("kaua", "Kauã"), P("lari", "Larissa"), P("rafa", "Rafa"), P("duda", "Duda"), P("theo", "Theo")];
  var COMS = [
    { id: "c-retro", nome: "Retrô Club", descricao: "Quem ama jogo clássico. Dicas, saves e partidas.", icone: "jogo", publica: true, membros: 128, cargo: "membro", salas: [{ id: "s-geral", nome: "geral" }, { id: "s-dicas", nome: "dicas" }, { id: "s-torneios", nome: "torneios" }] },
    { id: "c-time", nome: "Time do Sábado", descricao: "Nosso grupo fechado de ranqueada.", icone: "raio", publica: false, membros: 9, cargo: "dono", codigo: "SAB-2026", salas: [{ id: "s-time", nome: "papo-do-time" }, { id: "s-estrategia", nome: "estratégia" }] },
    { id: "c-pub", nome: "Gamers de Porto Alegre", descricao: "Encontros e campeonatos na cidade.", icone: "escudo", publica: true, membros: 342, salas: [{ id: "s-poa", nome: "geral" }] }
  ];
  var FALAS = {
    "s-geral": [["lari", "Larissa", "alguém joga hoje à noite?", 55], ["kaua", "Kauã", "eu tô dentro 🙌", 52], ["theo", "Theo", "bora, fecho às 21h", 47], ["duda", "Duda", "alguém tem dica pro chefe da fase 3?", 21]],
    "s-dicas": [["rafa", "Rafa", "dica: salvem antes de cada chefe", 300], ["duda", "Duda", "boa! já me salvou umas 3 vezes", 290]],
    "s-torneios": [["lari", "Larissa", "inscrições abertas até sexta", 700]],
    "s-time": [["kaua", "Kauã", "treino hoje 21h, sem atraso 😅", 80], ["rafa", "Rafa", "confirmado", 75]],
    "s-estrategia": [["theo", "Theo", "vamos testar a nova formação sábado", 900]],
    "s-poa": [["duda", "Duda", "alguém vai no evento do sábado?", 160]]
  };
  var RESP = ["boa! 😄", "bora então", "kkkk verdade", "fechou", "isso aí 👊", "também acho"];
  var json = function (o, st) { return new Response(JSON.stringify(o), { status: st || 200, headers: { "Content-Type": "application/json" } }); };
  var pronta = window.fetch;
  window.fetch = function (u, o) {
    var alvo; try { alvo = new URL(String(u && u.url ? u.url : u), location.href); } catch (e) { return pronta.apply(null, arguments); }
    if (alvo.hostname.indexOf("workers.dev") < 0 && alvo.hostname.indexOf("vetorial") < 0) return pronta.apply(null, arguments);
    var c = alvo.pathname, m = (o && o.method || "GET").toUpperCase(), corpo = {}; try { corpo = JSON.parse(o && o.body || "{}"); } catch (e) {}
    var q;
    if (c === "/voxix/perfil") return Promise.resolve(json(EU));
    if (c === "/voxix/comunidades/publicas") return Promise.resolve(json({ comunidades: COMS.filter(function (x) { return x.publica; }).map(function (x) { return { id: x.id, nome: x.nome, descricao: x.descricao, icone: x.icone, publica: true, membros: x.membros }; }) }));
    if (c === "/voxix/comunidades" && m === "GET") return Promise.resolve(json({ comunidades: COMS.filter(function (x) { return x.cargo; }).map(function (x) { return { id: x.id, nome: x.nome, descricao: x.descricao, icone: x.icone, publica: x.publica, membros: x.membros, cargo: x.cargo }; }) }));
    if ((q = /^\\/voxix\\/comunidades\\/([^/]+)\\/membros$/.exec(c))) return Promise.resolve(json({ membros: AMIGOS.map(function (a, i) { return { apelido: a.apelido, nome: a.nome, cargo: i === 0 ? "dono" : "membro" }; }).concat([{ apelido: "voce", nome: "Você", cargo: "membro" }]) }));
    if ((q = /^\\/voxix\\/comunidades\\/([^/]+)$/.exec(c)) && m === "GET") { var x = COMS.filter(function (k) { return k.id === q[1]; })[0] || COMS[0]; return Promise.resolve(json(x)); }
    if (c === "/voxix/historico") return Promise.resolve(json({ mensagens: [], mais: false }));
    if (c === "/voxix/avatares") return Promise.resolve(json({ avatares: {} }));
    if (c === "/voxix/bloqueios") return Promise.resolve(json({ bloqueios: [] }));
    if (c === "/voxix/buscar") { var ap = (alvo.searchParams.get("apelido") || "").toLowerCase(); return Promise.resolve(json(P(ap || "amigo", ap ? ap.charAt(0).toUpperCase() + ap.slice(1) : "Amigo"))); }
    if (c === "/voxix/mensagens" && m === "POST") return Promise.resolve(json({ ok: true, id: "m" + agora(), criado: agora() }));
    if (c === "/voxix/pontuar") return Promise.resolve(json({ texto: corpo.texto || "", ajustado: false }));
    if (c === "/voxix/ticket") return Promise.resolve(json({ ticket: "demo" }));
    return Promise.resolve(json({}));
  };
  // chat ao vivo de mentira: as salas já abrem com conversa e quem manda uma mensagem recebe uma resposta
  function Falso(url) {
    var self = this, sala = /\\/voxix\\/salas\\/([^/]+)\\/ws/.exec(url); self.readyState = 0; self.OPEN = 1;
    setTimeout(function () {
      self.readyState = 1; if (self.onopen) self.onopen({});
      if (sala && self.onmessage) {
        var id = sala[1], base = agora();
        var ms = (FALAS[id] || []).map(function (f, i) { return { id: "f" + id + i, de: f[0], deNome: f[1], corpo: f[2], criado: base - f[3] * 60000 }; });
        self.onmessage({ data: JSON.stringify({ t: "inicio", mensagens: ms, online: AMIGOS.slice(0, 3).concat([EU]) }) });
      }
    }, 120);
    self.send = function (d) {
      var p; try { p = JSON.parse(d); } catch (e) { return; }
      if (p.t !== "msg" || !self.onmessage) return;
      var t = agora(); self.onmessage({ data: JSON.stringify({ t: "confirmada", idLocal: p.idLocal, mensagem: { id: "e" + t, de: "voce", deNome: "Você", corpo: p.corpo, criado: t } }) });
      var quem = AMIGOS[Math.floor(Math.random() * AMIGOS.length)];
      setTimeout(function () { if (self.onmessage) self.onmessage({ data: JSON.stringify({ t: "msg", mensagem: { id: "r" + agora(), de: quem.apelido, deNome: quem.nome, corpo: RESP[Math.floor(Math.random() * RESP.length)], criado: agora() } }) }); }, 1400);
    };
    self.close = function () { self.readyState = 3; };
  }
  Falso.OPEN = 1; Falso.CONNECTING = 0; Falso.CLOSED = 3; Falso.CLOSING = 2;
  window.WebSocket = Falso;`;
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
  ${servidorVoxix}
})();
`;
writeFileSync(join(saida, "demo-shim.js"), shim);
const idx = join(saida, "index.html");
let html = readFileSync(idx, "utf8");
html = html.replace(/<head>/i, '<head><script src="./demo-shim.js"></script>');
writeFileSync(idx, html);
console.log(`demo ${app}: termos v${termos}, ${statSync(saida).isDirectory() ? "ok" : ""}`);
