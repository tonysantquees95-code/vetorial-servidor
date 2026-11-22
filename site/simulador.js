// Simulador interativo da suíte (dados de exemplo; nada aqui fala com o servidor).
(function () {
"use strict";
function $(s, r) { return (r || document).querySelector(s); }
function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
var BRL = function (centavos) { return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); };
function ir(id, app) { var a = document.getElementById(id); if (a) a.scrollIntoView({ behavior: "smooth", block: "start" }); if (app) abrirApp(app); return false; }
/* Os ícones são os mesmos dos cartões da suíte (os animados usam logos-animados.js). */
function iconeApp(id, p) {
  var m = {
    venus: '<img src="/icone/venus.png" alt="" width="40" height="40">',
    vindex: '<span class="anim anim-vindex"><img src="anim-vindex.png" alt="" width="40" height="40"></span>',
    vortex: '<span class="anim anim-vortex"><img src="anim-vortex.png" alt="" width="40" height="40"></span>',
    velox: '<span class="anim anim-velox" role="img" aria-label="Velox"></span>',
    vyntem: '<img class="icone-img" src="icone-vyntem.png" alt="" width="40" height="40">',
    voxix: '<span class="anim anim-voxix" role="img" aria-label="Voxix"></span>'
  };
  return '<span class="sim-ic' + (p ? " sim-ic-p" : "") + '" aria-hidden="true">' + m[id] + '</span>';
}
/* ===================== simulador ===================== */
var APPS = {
  venus: { nome: "Vênus", icone: "venus", titulo: "Uma vendedora que nunca dorme", texto: "Converse como se fosse o cliente: a Vênus responde com os dados da sua loja, gera o Pix e dá baixa no estoque.", pontos: ["Atende no WhatsApp 24 horas", "Gera Pix e QR Code na hora", "Atualiza o estoque a cada venda"], cta: ["Testar 7 dias grátis", "#preco"] },
  vindex: { nome: "Vindex", icone: "vindex", titulo: "Seu aparelho leve e seguro", texto: "Escolha o que limpar e toque em um botão. O Vindex mostra quanto espaço voltou e como está a saúde do aparelho.", pontos: ["Limpeza com 1 clique", "Organizador de arquivos", "Cofre de senhas"], cta: ["Ver planos", "#preco"] },
  vortex: { nome: "Vortex", icone: "vortex", titulo: "Seus jogos retrô, no lugar certo", texto: "Filtre por console, busque pelo nome e abra a ficha de cada jogo. Os saves ficam guardados na nuvem.", pontos: ["Ficha completa de cada jogo", "Emulação embutida", "Saves na nuvem"], cta: ["Ver planos", "#preco"] },
  velox: { nome: "Velox", icone: "velox", titulo: "Navegador rápido, sem anúncios", texto: "Ligue e desligue o bloqueio de anúncios e veja a diferença nos resultados. Grátis para sempre.", pontos: ["Bloqueio de anúncios", "Cofre de senhas", "Favoritos sincronizados"], cta: ["Baixar grátis", "#baixar"] },
  vyntem: { nome: "Vyntem", icone: "vyntem", titulo: "Anotar um gasto leva 5 segundos", texto: "Escreva do seu jeito, como “mercado 45,90 ontem”, e o Vyntem entende valor, categoria e data. Grátis.", pontos: ["Escreva ou fotografe a nota", "Contas e cartões", "Converse com a IA sobre o dinheiro"], cta: ["Baixar grátis", "#baixar"] },
  voxix: { nome: "Voxix", icone: "voxix", titulo: "O chat de quem joga", texto: "Salas de texto, comunidades e amigos online. Esta é uma prévia: o download ainda não foi liberado.", pontos: ["Comunidades e salas", "Convide por link ou código", "Teclado próprio"], cta: ["Ver a suíte", "#suite"] }
};
var ORDEM = ["venus", "vindex", "vortex", "velox", "vyntem", "voxix"], atual = null;

function montarAbas() {
  var box = $("#abas");
  ORDEM.forEach(function (id) {
    var a = APPS[id];
    var b = el('<button type="button" role="tab" id="aba-' + id + '" aria-selected="false" aria-controls="tela" class="sim-chip !min-h-12 flex items-center gap-2 !px-4">' + iconeApp(id) + '<span>' + a.nome + '</span></button>');
    b.addEventListener("click", function () { abrirApp(id); });
    b.addEventListener("keydown", function (e) { var i = ORDEM.indexOf(id); if (e.key === "ArrowRight") abrirApp(ORDEM[(i + 1) % 6], true); if (e.key === "ArrowLeft") abrirApp(ORDEM[(i + 5) % 6], true); });
    box.appendChild(b);
  });
}
function abrirApp(id, foco) {
  if (atual === id) return;
  atual = id; var a = APPS[id];
  ORDEM.forEach(function (x) { var t = $("#aba-" + x); t.setAttribute("aria-selected", x === id); t.setAttribute("aria-pressed", x === id); t.tabIndex = x === id ? 0 : -1; if (x === id) { t.style.background = "#EC6FD622"; t.style.borderColor = "#EC6FD6"; if (foco) t.focus(); t.scrollIntoView({ inline: "center", block: "nearest" }); } else { t.style.background = ""; t.style.borderColor = ""; } });
  $("#tela").setAttribute("aria-labelledby", "aba-" + id);
  $("#descricao").innerHTML = '<h3 class="text-2xl font-black sm:text-3xl">' + a.titulo + '</h3><p class="mt-3 text-suave">' + a.texto + '</p><ul class="mt-5 space-y-2">' + a.pontos.map(function (p) { return '<li class="flex gap-2"><span class="text-verde">✓</span><span class="min-w-0">' + p + '</span></li>'; }).join("") + '</ul><a class="sim-btn mt-6" href="' + a.cta[1] + '" onclick="return ir(\'' + a.cta[1].slice(1) + '\')">' + a.cta[0] + '</a>';
  var t = $("#tela"); t.innerHTML = ""; (REAIS[id] ? telaReal : TELAS[id])(t, id);
}

/* ---- o app de verdade (modo demonstração, em /demo/<app>/) dentro do celular, na largura de um celular de verdade ---- */
var REAIS = { vindex: 1, vortex: 1, vyntem: 1 }, LARGURA_REAL = 390;
function telaReal(t, id) {
  // sem a demonstração publicada (passo de montagem falhou), segue a tela de exemplo de antes
  fetch("/demo/" + id + "/demo-shim.js", { method: "HEAD" }).then(function (r) { if (!r.ok && atual === id) { t.innerHTML = ""; TELAS[id](t); } }, function () { if (atual === id) { t.innerHTML = ""; TELAS[id](t); } });
  var caixa = el('<div class="sim-real"></div>'), f = document.createElement("iframe");
  f.className = "sim-real-f"; f.title = APPS[id].nome + " funcionando (demonstração)"; f.src = "/demo/" + id + "/"; f.setAttribute("allow", "");
  f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-modals"); f.setAttribute("referrerpolicy", "no-referrer");
  caixa.appendChild(f); t.appendChild(caixa);
  function ajusta() {
    var w = caixa.clientWidth, h = caixa.clientHeight; if (!w) return;
    var k = w / LARGURA_REAL; f.style.width = LARGURA_REAL + "px"; f.style.height = Math.round(h / k) + "px"; f.style.transform = "scale(" + k + ")";
  }
  ajusta();
  if (window.ResizeObserver) { var ro = new ResizeObserver(ajusta); ro.observe(caixa); }
  else window.addEventListener("resize", ajusta);
}

/* ---- barra de topo de cada app ---- */
function cab(id, extra) { return '<div class="flex items-center gap-2 px-4 pb-2">' + iconeApp(id) + '<b class="text-base">' + APPS[id].nome + '</b><span class="ml-auto text-xs text-suave">' + (extra || "") + '</span></div>'; }

var TELAS = {};

/* ---------- Vênus: chat de venda ---------- */
TELAS.venus = function (t) {
  t.innerHTML = '<div class="flex items-center gap-3 border-b border-white/10 px-4 pb-3"><span class="grid size-9 place-items-center rounded-full bg-gradient-to-br from-rosa to-azul text-sm font-black text-[#08080F]">V</span><div class="min-w-0"><div class="text-sm font-bold">Loja TecnoPonto <span class="rounded bg-white/10 px-1 text-[10px] font-normal text-suave">exemplo</span></div><div class="text-xs text-verde">Vênus respondendo</div></div></div>' +
    '<div id="v-msgs" class="sim-rolagem flex-1 space-y-2 px-3 py-3"></div><div id="v-chips" class="flex flex-wrap gap-2 border-t border-white/10 px-3 py-3"></div>';
  var msgs = $("#v-msgs", t), chips = $("#v-chips", t), vivo = true, estoque = 12;
  function fim() { msgs.scrollTop = msgs.scrollHeight; }
  function cliente(txt) { msgs.appendChild(el('<div class="flex justify-end"><div class="sim-balao bg-[#1f6f4f] text-white">' + esc(txt) + '</div></div>')); fim(); }
  function venus(html, depois, ms) {
    var d = el('<div class="flex"><div class="sim-balao bg-white/10"><span class="sim-pontos"><span></span><span></span><span></span></span></div></div>'); msgs.appendChild(d); fim();
    setTimeout(function () { if (!vivo || !t.isConnected) return; d.firstChild.innerHTML = html; fim(); if (depois) depois(); }, ms || 900);
  }
  function opcoes(lista) {
    chips.innerHTML = ""; setTimeout(fim, 30);
    lista.forEach(function (o) { var b = el('<button type="button" class="sim-chip">' + esc(o[0]) + '</button>'); b.addEventListener("click", function () { chips.innerHTML = ""; cliente(o[0]); o[1](); }); chips.appendChild(b); });
  }
  var qr = '<svg viewBox="0 0 21 21" width="110" height="110" class="mt-2 rounded bg-white p-1" aria-label="QR Code Pix de exemplo" shape-rendering="crispEdges">' + (function () { var s = "", i, j; function f(x, y) { return '<rect x="' + x + '" y="' + y + '" width="7" height="7" fill="#000"/><rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="5" height="5" fill="#fff"/><rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" fill="#000"/>'; } s += f(0, 0) + f(14, 0) + f(0, 14); for (i = 0; i < 21; i++) for (j = 0; j < 21; j++) { if ((i < 8 && j < 8) || (i > 12 && j < 8) || (i < 8 && j > 12)) continue; if ((i * 7 + j * 13 + i * j) % 5 < 2) s += '<rect x="' + i + '" y="' + j + '" width="1" height="1" fill="#000"/>'; } return s; })() + '</svg>';
  function inicio() {
    cliente("Oi! Vocês têm fone bluetooth?");
    venus("Oi! 😊 Tenho sim: <b>Fone Bluetooth com cancelamento de ruído</b>, <b>R$ 189,90</b>. Tem <b>" + estoque + "</b> em estoque. Quer que eu separe um para você?", menu1);
  }
  function menu1() {
    opcoes([
      ["Quero comprar", function () { venus("Perfeito! Aqui está o Pix de <b>R$ 189,90</b>. Assim que você pagar, eu confirmo e dou baixa no estoque." + qr, function () { opcoes([["Já paguei", pago]]); }, 1100); }],
      ["Qual o prazo de entrega?", function () { venus("Entrego em <b>2 a 4 dias úteis</b> para todo o Brasil. Para retirada na loja, é no mesmo dia. 📦", menu1); }],
      ["Aceita cartão?", function () { venus("Aceito sim! Mando um <b>link de pagamento</b> no cartão em até 3x, ou o Pix com desconto. Qual você prefere?", menu1); }]
    ]);
  }
  function pago() {
    estoque--;
    venus("Pagamento confirmado ✅ Obrigada! Já separei o seu pedido <b>#1042</b>. O estoque foi atualizado: agora são <b>" + estoque + "</b> unidades. Seu pedido também chegou no painel do lojista.", function () { opcoes([["Conversar de novo", function () { msgs.innerHTML = ""; inicio(); }]]); }, 1000);
  }
  inicio();
  var obs = new MutationObserver(function () { if (!t.isConnected) { vivo = false; obs.disconnect(); } }); obs.observe(document.getElementById("tela"), { childList: true });
};

/* ---------- Vindex: limpeza ---------- */
TELAS.vindex = function (t) {
  var itens = [["Cache de apps", 1200], ["Arquivos duplicados", 640], ["Instaladores antigos", 420], ["Miniaturas e restos", 180]], livre = 0, nota = 62, rodando = false;
  function desenha() {
    var marcados = itens.filter(function (i) { return i.on !== false; });
    var total = marcados.reduce(function (s, i) { return s + i[1]; }, 0);
    t.innerHTML = cab("vindex", "Saúde do aparelho") +
      '<div class="sim-rolagem flex-1 px-4 pb-4"><div class="mx-auto my-3 grid size-36 place-items-center rounded-full" style="background:conic-gradient(#8ff0b4 ' + nota * 3.6 + 'deg,#ffffff1a 0)"><div class="grid size-28 place-items-center rounded-full bg-[#0b0d1c] text-center"><div><div class="text-4xl font-black">' + nota + '</div><div class="text-[11px] text-suave">' + (nota > 85 ? "Ótima" : "Pode melhorar") + '</div></div></div></div>' +
      (livre ? '<div class="mb-3 rounded-xl border border-verde/30 bg-verde/10 p-3 text-center text-sm text-verde">✓ ' + (livre / 1000).toFixed(1).replace(".", ",") + ' GB liberados!</div>' : '') +
      '<div class="space-y-2" role="group" aria-label="O que limpar">' + itens.map(function (i, k) { var on = i.on !== false; return '<button type="button" data-k="' + k + '" role="checkbox" aria-checked="' + on + '" class="flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 text-left text-sm ' + (livre ? "opacity-40" : "") + '"><span class="grid size-5 flex-none place-items-center rounded border ' + (on ? "border-verde bg-verde text-[#08080F]" : "border-white/30") + '">' + (on ? "✓" : "") + '</span><span class="min-w-0 flex-1">' + i[0] + '</span><span class="text-suave">' + (i[1] >= 1000 ? (i[1] / 1000).toFixed(1).replace(".", ",") + " GB" : i[1] + " MB") + '</span></button>'; }).join("") + '</div>' +
      (rodando ? '<div class="sim-barra mt-4"><i id="vx-b" style="width:0"></i></div><p class="mt-2 text-center text-xs text-suave">Limpando…</p>' : '<button type="button" id="vx-ir" class="sim-btn mt-4 w-full" ' + (!livre && !total ? "disabled style=\"opacity:.4\"" : "") + '>' + (livre ? "Analisar de novo" : "Limpar com 1 clique") + '</button>') + '</div>';
    t.querySelectorAll("[data-k]").forEach(function (b) { b.addEventListener("click", function () { if (livre || rodando) return; var i = itens[+b.dataset.k]; i.on = i.on === false; desenha(); }); });
    var go = $("#vx-ir", t);
    if (go) go.addEventListener("click", function () {
      if (livre) { livre = 0; nota = 62; itens.forEach(function (i) { i.on = true; }); desenha(); return; }
      rodando = true; desenha(); var p = 0, tm = setInterval(function () { p += 8; var b = $("#vx-b", t); if (b) b.style.width = Math.min(p, 100) + "%"; if (p >= 100) { clearInterval(tm); rodando = false; livre = total; nota = Math.min(98, 62 + Math.round(total / 60)); desenha(); } if (!t.isConnected) clearInterval(tm); }, 120);
    });
  }
  desenha();
};

/* ---------- Vortex: jogos retrô ---------- */
TELAS.vortex = function (t) {
  var JOGOS = [
    ["Pixel Quest", "SNES", 1994, "Aventura", "from-rosa to-azul", "12 h"], ["Turbo Kart Ring", "Mega Drive", 1993, "Corrida", "from-azul to-verde", "4 h"],
    ["Cave Runner", "GBA", 2002, "Plataforma", "from-verde to-azul", "7 h"], ["Space Patrol", "NES", 1989, "Tiro", "from-rosa to-orange-400", "2 h"],
    ["Mystic Tiles", "GBA", 2003, "Puzzle", "from-purple-400 to-rosa", "9 h"], ["Dino Dash", "SNES", 1995, "Plataforma", "from-green-400 to-teal-500", "5 h"]
  ], cons = ["Todos", "NES", "SNES", "Mega Drive", "GBA"], f = "Todos", q = "", aberto = null, jogando = false;
  function desenha() {
    var lista = JOGOS.filter(function (j) { return (f === "Todos" || j[1] === f) && j[0].toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    t.innerHTML = cab("vortex", JOGOS.length + " jogos") +
      '<div class="px-4"><input id="vt-q" type="search" placeholder="Buscar jogo" aria-label="Buscar jogo" value="' + esc(q) + '" class="min-h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-suave"></div>' +
      '<div class="sim-abas-apps flex gap-2 overflow-x-auto px-4 py-3" role="group" aria-label="Console">' + cons.map(function (c) { return '<button type="button" class="sim-chip" data-c="' + c + '" aria-pressed="' + (c === f) + '">' + c + '</button>'; }).join("") + '</div>' +
      '<ul class="sim-rolagem flex-1 space-y-2 px-4 pb-4">' + (lista.length ? lista.map(function (j, k) { return '<li><button type="button" data-j="' + JOGOS.indexOf(j) + '" class="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2 text-left"><span class="size-12 flex-none rounded-xl bg-gradient-to-br ' + j[4] + '"></span><span class="min-w-0 flex-1"><b class="block truncate text-sm">' + j[0] + '</b><span class="text-xs text-suave">' + j[1] + ' · ' + j[2] + ' · ' + j[3] + '</span></span><span class="text-xs text-suave">' + j[5] + '</span></button></li>'; }).join("") : '<li class="py-8 text-center text-sm text-suave">Nenhum jogo encontrado.</li>') + '</ul>' +
      (aberto !== null ? ficha() : "");
    var qi = $("#vt-q", t); qi.addEventListener("input", function () { q = qi.value; var p = qi.selectionStart; desenha(); var n = $("#vt-q", t); n.focus(); n.setSelectionRange(p, p); });
    t.querySelectorAll("[data-c]").forEach(function (b) { b.addEventListener("click", function () { f = b.dataset.c; desenha(); }); });
    t.querySelectorAll("[data-j]").forEach(function (b) { b.addEventListener("click", function () { aberto = +b.dataset.j; jogando = false; desenha(); }); });
    var x = $("#vt-x", t); if (x) x.addEventListener("click", function () { aberto = null; desenha(); });
    var p = $("#vt-p", t); if (p) p.addEventListener("click", function () { jogando = true; desenha(); });
  }
  function ficha() {
    var j = JOGOS[aberto];
    return '<div class="absolute inset-x-0 bottom-0 top-9 z-10 flex items-end bg-black/60"><div class="w-full rounded-t-3xl border-t border-white/15 bg-[#12152b] p-4">' +
      '<div class="flex items-start gap-3"><span class="size-16 flex-none rounded-2xl bg-gradient-to-br ' + j[4] + '"></span><div class="min-w-0 flex-1"><b class="block text-lg leading-tight">' + j[0] + '</b><span class="text-xs text-suave">' + j[1] + ' · ' + j[2] + ' · ' + j[3] + '</span></div><button type="button" id="vt-x" aria-label="Fechar ficha" class="grid size-11 flex-none place-items-center rounded-xl text-suave">✕</button></div>' +
      (jogando ? '<div class="mt-3 grid h-28 place-items-center rounded-xl border border-white/10 bg-black text-center text-xs text-verde"><div><div class="mb-1 text-2xl">🎮</div>Emulador rodando…<br><span class="text-suave">(demonstração)</span></div></div>' : '<p class="mt-3 text-sm text-suave">Tempo jogado: ' + j[5] + '. Seu save está guardado na nuvem e abre em qualquer aparelho.</p>') +
      '<button type="button" id="vt-p" class="sim-btn mt-3 w-full" ' + (jogando ? 'disabled style="opacity:.5"' : "") + '>' + (jogando ? "Jogando…" : "▶ Jogar") + '</button><p class="mt-2 text-center text-[11px] text-suave">Jogos de exemplo, criados para esta demonstração.</p></div></div>';
  }
  desenha();
};

/* ---------- Velox: navegador ---------- */
TELAS.velox = function (t) {
  var bloqueio = true, bloqueados = 0, q = "", buscou = false;
  var RES = [["Melhores jogos retrô para jogar hoje", "retrogames.exemplo", "Uma lista com os clássicos que continuam divertidos."], ["Como organizar sua coleção de ROMs", "guia.exemplo", "Dicas simples para manter tudo no lugar."], ["Emuladores: o que você precisa saber", "emulacao.exemplo", "Entenda como funcionam e como escolher."]];
  function desenha() {
    t.innerHTML = '<div class="flex gap-1 px-3"><span class="flex min-h-9 items-center gap-2 rounded-t-xl bg-white/10 px-3 text-xs">' + iconeApp("velox", true) + 'Nova aba</span><span class="flex min-h-9 items-center rounded-t-xl px-3 text-xs text-suave">+</span></div>' +
      '<div class="flex items-center gap-2 border-b border-white/10 bg-white/10 px-3 py-2"><span aria-hidden="true">🔒</span><input id="vl-q" type="search" placeholder="Pesquise ou digite um endereço" aria-label="Pesquisar" value="' + esc(q) + '" class="min-h-10 min-w-0 flex-1 rounded-full bg-black/30 px-3 text-sm text-white placeholder:text-suave"><button type="button" id="vl-ir" class="grid size-10 flex-none place-items-center rounded-full bg-azul text-[#08080F]" aria-label="Buscar">→</button></div>' +
      '<div class="flex items-center justify-between gap-3 px-4 py-3"><div class="min-w-0"><div class="text-sm font-semibold">Bloqueio de anúncios</div><div class="text-xs text-suave"><span class="text-verde">' + bloqueados + '</span> bloqueados nesta sessão</div></div><button type="button" role="switch" aria-checked="' + bloqueio + '" aria-label="Bloqueio de anúncios" id="vl-sw" class="sim-sw"></button></div>' +
      '<div class="sim-rolagem flex-1 space-y-3 px-4 pb-4">' + (buscou ?
        (bloqueio ? "" : '<div class="rounded-xl border border-aviso/40 bg-yellow-400/10 p-3 text-xs text-yellow-200">📢 ANÚNCIO · Ganhe 50 seguidores agora!!! Clique aqui</div>') +
        RES.map(function (r, i) { return (!bloqueio && i === 1 ? '<div class="rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-3 text-xs text-yellow-200">📢 ANÚNCIO · Oferta imperdível, só hoje</div>' : "") + '<div><div class="text-xs text-verde">' + r[1] + '</div><div class="font-semibold text-azul">' + r[0] + '</div><div class="text-xs text-suave">' + r[2] + '</div></div>'; }).join("") +
        (bloqueio ? '<p class="rounded-xl bg-verde/10 p-3 text-center text-xs text-verde">✓ Página limpa: nenhum anúncio.</p>' : '<p class="rounded-xl bg-white/5 p-3 text-center text-xs text-suave">Ligue o bloqueio para ver a página limpa.</p>')
        : '<p class="py-10 text-center text-sm text-suave">Pesquise algo, como “jogos retrô”, e ligue ou desligue o bloqueio para comparar.</p>') + '</div>';
    var qi = $("#vl-q", t);
    function buscar() { q = qi.value.trim() || "jogos retrô"; buscou = true; if (bloqueio) bloqueados += 3 + Math.floor(Math.random() * 5); desenha(); }
    $("#vl-ir", t).addEventListener("click", buscar); qi.addEventListener("keydown", function (e) { if (e.key === "Enter") buscar(); });
    $("#vl-sw", t).addEventListener("click", function () { q = qi.value; bloqueio = !bloqueio; if (bloqueio && buscou) bloqueados += 2; desenha(); });
  }
  desenha();
};

/* ---------- Vyntem: lançar gasto ---------- */
TELAS.vyntem = function (t) {
  var saldo = 284050, lista = [{ t: "Salário", c: 320000, cat: "Receita", d: "05/11" }, { t: "Conta de luz", c: -11500, cat: "Contas", d: "10/11" }], previa = null;
  var CATS = [["Mercado", /mercado|super|padaria|feira/], ["Transporte", /uber|ônibus|onibus|gasolina|táxi|taxi|metrô|metro/], ["Restaurante", /pizza|lanche|restaurante|ifood|almoço|almoco|jantar|café|cafe/], ["Contas", /luz|água|agua|internet|aluguel|celular/], ["Saúde", /farmácia|farmacia|remédio|remedio|médico|medico/]];
  function entende(txt) {
    var m = /(\d+(?:[.,]\d{1,2})?)/.exec(txt); if (!m) return null;
    var cent = Math.round(parseFloat(m[1].replace(",", ".")) * 100); if (!(cent > 0)) return null;
    var cat = "Outros"; CATS.forEach(function (c) { if (cat === "Outros" && c[1].test(txt.toLowerCase())) cat = c[0]; });
    var d = new Date(); if (/ontem/i.test(txt)) d.setDate(d.getDate() - 1);
    var titulo = txt.replace(m[1], "").replace(/ontem|hoje|r\$/gi, "").replace(/\s+/g, " ").trim() || cat;
    return { t: titulo.charAt(0).toUpperCase() + titulo.slice(1), c: -cent, cat: cat, d: ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) };
  }
  function desenha(msg) {
    t.innerHTML = cab("vyntem", "Novembro") + '<div class="sim-rolagem flex-1 px-4 pb-4">' +
      '<div class="rounded-2xl bg-gradient-to-br from-azul/30 to-rosa/20 p-4"><div class="text-xs text-suave">Saldo das contas</div><div class="text-3xl font-black">' + BRL(saldo) + '</div></div>' +
      '<form id="vy-f" class="mt-3"><label for="vy-t" class="text-xs text-suave">Escreva o gasto do seu jeito</label><div class="mt-1 flex gap-2"><input id="vy-t" autocomplete="off" placeholder="ex.: mercado 45,90 ontem" class="min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-suave"><button class="sim-btn !min-h-11 !px-4 text-sm" type="submit">Entender</button></div></form>' +
      (msg ? '<p class="mt-2 text-xs text-aviso">' + msg + '</p>' : '') +
      (previa ? '<div class="mt-3 rounded-2xl border border-verde/40 bg-verde/10 p-3 text-sm"><div class="text-xs text-verde">Entendi assim:</div><div class="mt-1 flex items-center justify-between gap-2"><b class="min-w-0 truncate">' + esc(previa.t) + '</b><b>' + BRL(previa.c) + '</b></div><div class="text-xs text-suave">' + previa.cat + ' · ' + previa.d + '</div><div class="mt-2 flex gap-2"><button type="button" id="vy-ok" class="sim-btn !min-h-11 flex-1 text-sm">Salvar gasto</button><button type="button" id="vy-no" class="sim-btn-sec !min-h-11 text-sm">Cancelar</button></div></div>' : '') +
      '<h4 class="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-suave">Lançamentos</h4><ul class="space-y-2">' + lista.map(function (l) { return '<li class="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"><span class="min-w-0"><b class="block truncate">' + esc(l.t) + '</b><span class="text-xs text-suave">' + l.cat + ' · ' + l.d + '</span></span><b class="flex-none ' + (l.c > 0 ? "text-verde" : "") + '">' + BRL(l.c) + '</b></li>'; }).join("") + '</ul></div>';
    $("#vy-f", t).addEventListener("submit", function (e) { e.preventDefault(); var v = $("#vy-t", t).value.trim(); var r = entende(v); if (!r) { previa = null; desenha("Não achei o valor. Tente algo como “pizza 62,00”."); return; } previa = r; desenha(); });
    var ok = $("#vy-ok", t); if (ok) { ok.addEventListener("click", function () { lista.unshift(previa); saldo += previa.c; previa = null; desenha(); }); $("#vy-no", t).addEventListener("click", function () { previa = null; desenha(); }); }
  }
  desenha();
};

/* ---------- Voxix: chat de comunidade (prévia) ---------- */
TELAS.voxix = function (t) {
  var salas = { geral: [["Duda", "Alguém joga hoje à noite?"], ["Rafa", "Eu entro às 21h 🎮"]], retro: [["Lia", "Terminei Cave Runner ontem!"]], dicas: [["Theo", "Dica: salve antes do chefe final."]] }, sala = "geral", amigos = ["Duda", "Rafa", "Lia", "Theo"], respostas = ["Boa! 🔥", "Bora!", "Também acho 😄", "Chama a galera!"];
  function desenha() {
    t.innerHTML = '<div class="flex items-center gap-2 px-4 pb-2">' + iconeApp("voxix") + '<b class="text-base">Voxix</b><span class="ml-auto rounded-full bg-azul/20 px-2 py-0.5 text-[11px] text-azul">Prévia · em breve</span></div>' +
      '<div class="sim-abas-apps flex gap-2 overflow-x-auto px-4 pb-2" role="group" aria-label="Salas">' + Object.keys(salas).map(function (s) { return '<button type="button" class="sim-chip" data-s="' + s + '" aria-pressed="' + (s === sala) + '"># ' + s + '</button>'; }).join("") + '</div>' +
      '<div class="px-4 pb-2 text-xs text-suave"><span class="text-verde">●</span> 4 online agora</div>' +
      '<div id="vx-m" class="sim-rolagem flex-1 space-y-2 px-3 pb-2">' + salas[sala].map(msg).join("") + '</div>' +
      '<form id="vx-f" class="flex gap-2 border-t border-white/10 p-3"><input id="vx-i" autocomplete="off" aria-label="Mensagem" placeholder="Escreva em #' + sala + '" class="min-h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 text-sm text-white placeholder:text-suave"><button type="submit" class="sim-btn !min-h-11 !px-4 text-sm" aria-label="Enviar">➤</button></form>';
    var m = $("#vx-m", t); m.scrollTop = m.scrollHeight;
    t.querySelectorAll("[data-s]").forEach(function (b) { b.addEventListener("click", function () { sala = b.dataset.s; desenha(); }); });
    $("#vx-f", t).addEventListener("submit", function (e) {
      e.preventDefault(); var i = $("#vx-i", t), v = i.value.trim(); if (!v) return; var s = sala;
      salas[s].push(["Você", v]); desenha(); $("#vx-i", t).focus();
      setTimeout(function () { salas[s].push([amigos[Math.floor(Math.random() * 4)], respostas[Math.floor(Math.random() * 4)]]); if (t.isConnected && sala === s) { desenha(); } }, 1200);
    });
  }
  function msg(m) { var eu = m[0] === "Você"; return '<div class="flex ' + (eu ? "justify-end" : "") + '"><div class="sim-balao ' + (eu ? "bg-azul/30" : "bg-white/10") + '"><b class="block text-[11px] ' + (eu ? "text-azul" : "text-rosa") + '">' + esc(m[0]) + '</b>' + esc(m[1]) + '</div></div>'; }
  desenha();
};


montarAbas();
abrirApp("venus");
// os logos animados (Velox e Voxix) são desenhados por logos-animados.js; pedimos de novo sempre que o aparelho muda de tela
(function () {
  var agenda = false, raiz = document.getElementById("simulador");
  function pinta() { agenda = false; if (window.pintarLogos) window.pintarLogos(raiz); }
  new MutationObserver(function () { if (!agenda) { agenda = true; setTimeout(pinta, 0); } }).observe(raiz, { childList: true, subtree: true });
  pinta();
})();
window.irParaApp = function (app) { abrirApp(app); var s = document.getElementById("simulador"); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); return false; };
})();
