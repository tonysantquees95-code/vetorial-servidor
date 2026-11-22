// Ferramentas grátis: link curto (pede o Vetorial ID só na hora de criar) e QR code (livre, sem conta).
// Páginas montadas só com texto (textContent), nunca innerHTML.
(() => {
  const API = (window.VENUS && window.VENUS.api) || "";
  const $ = (id) => document.getElementById(id);
  const CHAVE = "ferramentas.token";

  // ------------------------------------------------------------ conta (Vetorial ID)
  const lerToken = () => {
    try {
      const mesmaOrigem = API && new URL(API).origin === location.origin;
      return localStorage.getItem(CHAVE) || (mesmaOrigem ? localStorage.getItem("vid_token") : "") || "";
    } catch { return ""; }
  };
  const guardarToken = (t) => { try { if (t) localStorage.setItem(CHAVE, t); else localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ } };

  /** Abre a janela do Vetorial ID. Precisa ser chamada direto de um toque (senão o navegador bloqueia). */
  function entrarComVetorialId() {
    return new Promise((resolve) => {
      const origem = new URL(API).origin;
      const j = window.open(`${API}/id?plataforma=web&nome=${encodeURIComponent("Ferramentas Vetorial")}`, "vetorial-id", "width=460,height=720");
      if (!j) return resolve(false);
      let feito = false;
      const fim = (ok) => { if (feito) return; feito = true; window.removeEventListener("message", ouvir); clearInterval(t); resolve(ok); };
      const ouvir = (e) => {
        if (e.origin !== origem) return;
        const tk = e.data && e.data.vetorialId;
        if (typeof tk === "string" && tk) { guardarToken(tk); try { j.close(); } catch { /* ok */ } fim(true); }
      };
      window.addEventListener("message", ouvir);
      const t = setInterval(() => { if (j.closed) fim(!!lerToken()); }, 600);
    });
  }

  async function chamar(metodo, caminho, corpo) {
    const r = await fetch(API + caminho, {
      method: metodo,
      headers: { authorization: `Bearer ${lerToken()}`, ...(corpo ? { "content-type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: r.status, corpo: await r.json().catch(() => ({})) };
  }

  // ------------------------------------------------------------ abas
  const abas = [["aba-link", "painel-link"], ["aba-qr", "painel-qr"], ["aba-panfleto", "painel-panfleto"], ["aba-logo", "painel-logo"]];
  function abrirAba(idAba) {
    for (const [a, p] of abas) {
      const ativa = a === idAba;
      $(a).setAttribute("aria-selected", ativa ? "true" : "false");
      $(a).tabIndex = ativa ? 0 : -1;
      $(p).hidden = !ativa;
    }
  }
  for (const [a] of abas) {
    $(a).addEventListener("click", () => abrirAba(a));
    $(a).addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = abas.findIndex(([x]) => x === a);
      const prox = abas[(i + (e.key === "ArrowRight" ? 1 : abas.length - 1)) % abas.length][0];
      abrirAba(prox); $(prox).focus();
    });
  }

  // ------------------------------------------------------------ link curto
  const dizer = (id, texto) => { const e = $(id); e.textContent = texto || ""; e.hidden = !texto; };
  let pendente = null; // o que fazer assim que a pessoa entrar (criar o link, gerar o panfleto...)
  let focoAntes = null;
  const janela = $("fr-janela");
  const TEXTO_PADRAO = $("fr-j-texto").textContent;
  const abrirJanela = (erro, texto) => { focoAntes = document.activeElement; $("fr-j-texto").textContent = texto || TEXTO_PADRAO; dizer("fr-j-erro", erro || ""); janela.hidden = false; $("fr-j-entrar").focus(); };
  const fecharJanela = () => { janela.hidden = true; if (focoAntes && focoAntes.focus) focoAntes.focus(); };
  $("fr-j-fechar").addEventListener("click", () => { pendente = null; fecharJanela(); });
  janela.addEventListener("keydown", (e) => { if (e.key === "Escape") { pendente = null; fecharJanela(); } });
  $("fr-j-entrar").addEventListener("click", async () => {
    const ok = await entrarComVetorialId();
    if (!ok) return dizer("fr-j-erro", "Não deu para entrar agora. Se a janela fechou sozinha, libere pop-ups para este site e toque de novo.");
    fecharJanela();
    const fazer = pendente; pendente = null;
    if (fazer) fazer();
  });

  let ultimo = "";
  async function criarLink() {
    dizer("fr-aviso-link", "");
    const destino = $("fr-destino").value.trim();
    if (!destino) return dizer("fr-aviso-link", "Cole o endereço que você quer encurtar.");
    if (!lerToken()) { pendente = criarLink; return abrirJanela(); } // só aqui, na hora de gerar, pede o Vetorial ID
    const botao = $("fr-encurtar");
    botao.disabled = true;
    try {
      const r = await chamar("POST", "/links", { destino });
      if (r.status === 401) { guardarToken(""); pendente = criarLink; return abrirJanela("Sua sessão venceu. Entre de novo para continuar."); }
      if (r.status !== 201) return dizer("fr-aviso-link", r.corpo.error || "Não consegui criar o link agora. Tente de novo.");
      ultimo = r.corpo.link.curto;
      $("fr-curto").textContent = ultimo;
      $("fr-whats").href = "https://wa.me/?text=" + encodeURIComponent(ultimo);
      $("fr-resultado").hidden = false;
      carregarMeus();
    } catch {
      dizer("fr-aviso-link", "Sem internet para criar o link. Conecte-se e tente de novo.");
    } finally { botao.disabled = false; }
  }
  $("fr-encurtar").addEventListener("click", criarLink);
  $("fr-destino").addEventListener("keydown", (e) => { if (e.key === "Enter") criarLink(); });

  async function copiar(texto, botao) {
    try { await navigator.clipboard.writeText(texto); } catch {
      const t = document.createElement("textarea"); t.value = texto; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch { /* sem cópia */ } t.remove();
    }
    const antes = botao.textContent; botao.textContent = "Copiado!"; setTimeout(() => { botao.textContent = antes; }, 1500);
  }
  $("fr-copiar").addEventListener("click", (e) => copiar(ultimo, e.currentTarget));
  $("fr-qr-do-link").addEventListener("click", () => {
    $("fr-q-url").value = ultimo;
    document.querySelector('input[name="fr-tipo"][value="link"]').checked = true;
    mostrarTipo(); abrirAba("aba-qr"); atualizarQr();
  });

  async function carregarMeus() {
    if (!lerToken()) return;
    try {
      const r = await chamar("GET", "/links");
      if (r.status === 401) { guardarToken(""); return; }
      if (r.status !== 200) return;
      const lista = $("fr-lista");
      lista.replaceChildren();
      for (const l of r.corpo.links) {
        const li = document.createElement("li"); li.className = "fr-item";
        const dados = document.createElement("div");
        const b = document.createElement("b"); b.textContent = l.curto.replace(/^https?:\/\//, "");
        const s = document.createElement("small"); s.textContent = l.destino;
        dados.append(b, s);
        const c = document.createElement("span"); c.className = "fr-cliques";
        c.textContent = l.cliques === 1 ? "1 clique" : `${l.cliques} cliques`;
        const acoes = document.createElement("div"); acoes.className = "fr-acoes";
        const bc = document.createElement("button"); bc.type = "button"; bc.className = "btn sec p"; bc.textContent = "Copiar";
        bc.addEventListener("click", () => copiar(l.curto, bc));
        const bx = document.createElement("button"); bx.type = "button"; bx.className = "btn sec p"; bx.textContent = "Apagar";
        bx.addEventListener("click", async () => {
          if (!confirm("Apagar este link? Quem tiver ele não vai mais conseguir abrir.")) return;
          const d = await chamar("DELETE", `/links/${l.codigo}`);
          if (d.status === 200) carregarMeus();
        });
        acoes.append(bc, bx);
        li.append(dados, c, acoes);
        lista.append(li);
      }
      $("fr-meus").hidden = r.corpo.links.length === 0;
    } catch { /* sem internet: a lista aparece quando voltar */ }
  }

  // ------------------------------------------------------------ QR code (livre)
  const tipoAtual = () => document.querySelector('input[name="fr-tipo"]:checked').value;
  const corAtual = () => document.querySelector('input[name="fr-cor"]:checked').value;
  function mostrarTipo() {
    const t = tipoAtual();
    $("fr-q-link").hidden = t !== "link"; $("fr-q-whats").hidden = t !== "whats"; $("fr-q-texto").hidden = t !== "texto";
  }
  function conteudoDoQr() {
    const t = tipoAtual();
    if (t === "link") {
      let u = $("fr-q-url").value.trim();
      if (!u) return "";
      if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
      return u;
    }
    if (t === "whats") {
      let n = $("fr-q-fone").value.replace(/\D/g, "");
      if (n.length < 10) return "";
      if (n.length <= 11) n = "55" + n;
      const m = $("fr-q-msg").value.trim();
      return `https://wa.me/${n}` + (m ? `?text=${encodeURIComponent(m)}` : "");
    }
    return $("fr-q-txt").value.trim();
  }

  let svgAtual = "", urlDaImagem = "", espera = 0, vez = 0;
  async function atualizarQr() {
    const texto = conteudoDoQr();
    const img = $("fr-qr-img");
    dizer("fr-aviso-qr", "");
    if (!texto) { svgAtual = ""; img.hidden = true; $("fr-qr-vazio").hidden = false; $("fr-baixar-png").disabled = $("fr-baixar-svg").disabled = true; return; }
    const minha = ++vez;
    try {
      const r = await fetch(`${API}/ferramentas/qr?texto=${encodeURIComponent(texto)}&cor=${encodeURIComponent(corAtual())}`);
      if (minha !== vez) return;
      if (!r.ok) throw new Error("qr");
      svgAtual = await r.text();
      if (urlDaImagem) URL.revokeObjectURL(urlDaImagem);
      urlDaImagem = URL.createObjectURL(new Blob([svgAtual], { type: "image/svg+xml" }));
      img.src = urlDaImagem; img.hidden = false; $("fr-qr-vazio").hidden = true;
      $("fr-baixar-png").disabled = $("fr-baixar-svg").disabled = false;
    } catch {
      if (minha !== vez) return;
      dizer("fr-aviso-qr", texto.length > 1000 ? "O conteúdo é grande demais para um QR code." : "Não consegui gerar o QR code agora. Confira a internet e tente de novo.");
    }
  }
  const adiar = () => { clearTimeout(espera); espera = setTimeout(atualizarQr, 350); };
  for (const id of ["fr-q-url", "fr-q-fone", "fr-q-msg", "fr-q-txt"]) $(id).addEventListener("input", adiar);
  for (const r of document.querySelectorAll('input[name="fr-tipo"]')) r.addEventListener("change", () => { mostrarTipo(); atualizarQr(); });
  for (const r of document.querySelectorAll('input[name="fr-cor"]')) r.addEventListener("change", atualizarQr);

  function baixar(nome, blob) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  $("fr-baixar-svg").addEventListener("click", () => { if (svgAtual) baixar("qr-code.svg", new Blob([svgAtual], { type: "image/svg+xml" })); });
  $("fr-baixar-png").addEventListener("click", () => {
    if (!svgAtual) return;
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"); c.width = c.height = 1024;
      const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(im, 0, 0, 1024, 1024);
      c.toBlob((b) => { if (b) baixar("qr-code.png", b); else dizer("fr-aviso-qr", "Não consegui montar o PNG. Use o SVG."); }, "image/png");
    };
    im.onerror = () => dizer("fr-aviso-qr", "Não consegui montar o PNG. Use o SVG.");
    im.src = urlDaImagem;
  });

  mostrarTipo();
  carregarMeus();

  // Peças que as outras ferramentas (panfleto.js) usam: a mesma conta, a mesma janela "Quase lá!".
  window.FR = {
    API, $, dizer, baixar, lerToken, guardarToken, chamar,
    /** Pede o Vetorial ID e, ao entrar, roda `depois`. `texto` troca a explicação da janela. */
    pedirEntrada(depois, erro, texto) { pendente = depois; abrirJanela(erro, texto); },
  };
  document.dispatchEvent(new Event("fr-pronto"));
})();
