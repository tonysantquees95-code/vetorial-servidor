// Logo grátis: vitrine com os 48 modelos (12 livres, o resto só com assinatura, tudo visível antes de decidir).
// O desenho vem do servidor (nunca montamos SVG aqui) e entra só como imagem. O Vetorial ID é pedido em "Criar meu logo".
(() => {
  const iniciar = () => {
    const FR = window.FR, { $, dizer, baixar } = FR, API = FR.API;
    let modelos = [], categoria = "todos", escolhido = null, assinante = false, svgFinal = "";

    const aviso = (t) => dizer("fr-lg-aviso", t);
    const dados = () => ({ nome: $("fr-lg-nome").value.trim(), sub: $("fr-lg-sub").value.trim() });
    const urlPrevia = (id) => { const d = dados(); return `${API}/ferramentas/logo/previa?modelo=${encodeURIComponent(id)}&nome=${encodeURIComponent(d.nome || "Seu Negócio")}&sub=${encodeURIComponent(d.sub)}`; };

    function cadeado() {
      const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
      for (const [t, at] of [["rect", { x: 5, y: 11, width: 14, height: 9, rx: 2 }], ["path", { d: "M8 11V8a4 4 0 0 1 8 0v3" }]]) {
        const e = document.createElementNS("http://www.w3.org/2000/svg", t); for (const k in at) e.setAttribute(k, at[k]); s.append(e);
      }
      return s;
    }

    function desenharChips(categorias) {
      const box = $("fr-lg-cats"); box.replaceChildren();
      for (const c of [{ id: "todos", nome: "Todos" }, { id: "gratis", nome: "Só os grátis" }, ...categorias]) {
        const b = document.createElement("button"); b.type = "button"; b.className = "fr-lg-chip"; b.textContent = c.nome;
        b.setAttribute("aria-pressed", c.id === categoria ? "true" : "false");
        b.addEventListener("click", () => { categoria = c.id; desenharChips(categorias); desenharGrade(); });
        box.append(b);
      }
    }
    let todasCategorias = [];

    function desenharGrade() {
      const grade = $("fr-lg-grade"); grade.replaceChildren();
      const lista = modelos.filter((m) => categoria === "todos" || (categoria === "gratis" ? m.gratis : m.categoria === categoria));
      for (const m of lista) {
        const li = document.createElement("li");
        const b = document.createElement("button"); b.type = "button"; b.className = "fr-lg-modelo";
        b.setAttribute("aria-pressed", escolhido === m.id ? "true" : "false");
        b.setAttribute("aria-label", `${m.nome}, ${m.gratis ? "grátis" : "com assinatura"}`);
        const img = document.createElement("img"); img.alt = ""; img.loading = "lazy"; img.width = 200; img.height = 200; img.src = urlPrevia(m.id);
        const nome = document.createElement("span"); nome.className = "fr-lg-nome"; nome.textContent = m.nome;
        const selo = document.createElement("span"); selo.className = "fr-lg-selo" + (m.gratis ? "" : " tranca");
        if (!m.gratis) selo.append(cadeado());
        selo.append(document.createTextNode(m.gratis ? "Grátis" : "Com assinatura"));
        const tique = document.createElement("span"); tique.className = "fr-lg-tique"; tique.textContent = "✓"; tique.setAttribute("aria-hidden", "true");
        b.append(img, nome, selo, tique);
        b.addEventListener("click", () => escolher(m));
        li.append(b); grade.append(li);
      }
    }

    function escolher(m) {
      escolhido = m.id; aviso("");
      for (const b of $("fr-lg-grade").querySelectorAll(".fr-lg-modelo")) b.setAttribute("aria-pressed", "false");
      const ativo = [...$("fr-lg-grade").querySelectorAll(".fr-lg-modelo")].find((b) => b.getAttribute("aria-label").startsWith(m.nome + ","));
      if (ativo) ativo.setAttribute("aria-pressed", "true");
      $("fr-lg-escolhido").textContent = m.gratis ? `Modelo escolhido: ${m.nome} (grátis).` : `Modelo escolhido: ${m.nome}. Ele é para assinantes: dá para ver como fica, mas só libera com a assinatura.`;
      $("fr-lg-convite").hidden = m.gratis || assinante;
    }

    let espera = 0;
    function atualizarPrevias() {
      clearTimeout(espera);
      espera = setTimeout(() => { for (const img of $("fr-lg-grade").querySelectorAll("img")) { const li = img.closest(".fr-lg-modelo"); const m = modelos.find((x) => li.getAttribute("aria-label").startsWith(x.nome + ",")); if (m) img.src = urlPrevia(m.id); } }, 400);
    }
    $("fr-lg-nome").addEventListener("input", atualizarPrevias);
    $("fr-lg-sub").addEventListener("input", atualizarPrevias);

    function mostrarLimite(s) {
      const e = $("fr-lg-limite");
      if (!s || s.ilimitado) { e.hidden = true; return; }
      e.textContent = s.restantes === 0 ? "Você já criou os 2 logos de hoje. Volte amanhã ou conheça os planos da Vênus." : s.restantes === 1 ? "Você ainda pode criar 1 logo hoje." : "Você pode criar 2 logos por dia, de graça.";
      e.hidden = false;
    }

    async function criar() {
      aviso(""); $("fr-lg-pronto").hidden = true;
      const d = dados(), m = modelos.find((x) => x.id === escolhido);
      if (!d.nome) return aviso("Escreva o nome do seu negócio.");
      if (!m) return aviso("Toque em um modelo para escolher.");
      if (!m.gratis && !assinante) return FR.convidarAssinar({ recurso: "Este logo", aoEntrar: async () => { await situacao(); if (escolhido) escolher(modelos.find((x) => x.id === escolhido)); } });
      if (!FR.lerToken()) return FR.pedirEntrada(criar, "", "Seu logo está quase pronto! Entre com o seu Vetorial ID para criar e baixar. É grátis, uma conta só serve para todos os nossos apps e assim a gente melhora as ferramentas.");
      const botao = $("fr-lg-criar"); botao.disabled = true;
      try {
        const r = await FR.chamar("POST", "/ferramentas/logo", { modelo: m.id, nome: d.nome, subtitulo: d.sub });
        if (r.status === 401) { FR.guardarToken(""); return FR.pedirEntrada(criar, "Sua sessão venceu. Entre de novo para continuar."); }
        if (r.status === 403 && r.corpo.codigo === "assinatura") return FR.convidarAssinar({ recurso: "Este logo", aoEntrar: situacao });
        if (r.status === 429) { mostrarLimite(r.corpo); return aviso(r.corpo.error); }
        if (r.status !== 200) return aviso(r.corpo.error || "Não consegui criar agora. Tente de novo.");
        assinante = !!r.corpo.assinante; svgFinal = r.corpo.svg; mostrarLimite(r.corpo);
        $("fr-lg-final").src = URL.createObjectURL(new Blob([svgFinal], { type: "image/svg+xml" }));
        $("fr-lg-pronto").hidden = false; $("fr-lg-pronto").scrollIntoView({ block: "nearest" });
      } catch { aviso("Sem internet para criar o logo. Conecte-se e tente de novo."); } finally { botao.disabled = false; }
    }
    $("fr-lg-criar").addEventListener("click", criar);
    // editor: fonte, ícone, cores e neon; só cria (e gasta o limite do dia) depois de "Usar este logo"
    async function personalizar() {
      aviso("");
      const d = dados(); if (!d.nome) return aviso("Escreva o nome do seu negócio.");
      const m = modelos.find((x) => x.id === escolhido);
      const base = m ? await FR.especDoModelo(m.id, d.nome) : null;
      FR.editarLogo({ espec: { ...(base || { simbolo: "estrela", layout: "horizontal", fonte: "moderna", paleta: "rose" }), nome: d.nome, subtitulo: d.sub }, assinante, textoBotao: "Criar este logo", aoUsar: (espec) => gerarPersonalizado(espec) });
    }
    async function gerarPersonalizado(espec) {
      if (!FR.lerToken()) return FR.pedirEntrada(() => gerarPersonalizado(espec), "", "Seu logo está quase pronto! Entre com o seu Vetorial ID para criar e baixar. É grátis, uma conta só serve para todos os nossos apps.");
      try {
        const r = await FR.chamar("POST", "/ferramentas/logo/personalizado", { espec });
        if (r.status === 401) { FR.guardarToken(""); return FR.pedirEntrada(() => gerarPersonalizado(espec), "Sua sessão venceu. Entre de novo para continuar."); }
        if (r.status === 403 && r.corpo.codigo === "assinatura") return FR.convidarAssinar({ recurso: "O efeito neon", aoEntrar: situacao });
        if (r.status === 429) { mostrarLimite(r.corpo); return aviso(r.corpo.error); }
        if (r.status !== 200) return aviso(r.corpo.error || "Não consegui criar agora. Tente de novo.");
        assinante = !!r.corpo.assinante; svgFinal = r.corpo.svg; mostrarLimite(r.corpo);
        $("fr-lg-final").src = URL.createObjectURL(new Blob([svgFinal], { type: "image/svg+xml" }));
        $("fr-lg-pronto").hidden = false; $("fr-lg-pronto").scrollIntoView({ block: "nearest" });
      } catch { aviso("Sem internet para criar o logo. Conecte-se e tente de novo."); }
    }
    $("fr-lg-editar").addEventListener("click", personalizar);
    $("fr-lg-ja-assino").addEventListener("click", () => FR.pedirEntrada(async () => { await situacao(); if (escolhido) escolher(modelos.find((x) => x.id === escolhido)); }, "", "Entre com o seu Vetorial ID para liberar os modelos da sua assinatura."));
    $("fr-lg-ver-gratis").addEventListener("click", () => { categoria = "gratis"; desenharChips(todasCategorias); desenharGrade(); $("fr-lg-convite").hidden = true; });

    const nomeBase = () => (dados().nome || "logo").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "logo";
    $("fr-lg-svg").addEventListener("click", () => { if (svgFinal) baixar(`logo-${nomeBase()}.svg`, new Blob([svgFinal], { type: "image/svg+xml" })); });
    $("fr-lg-png").addEventListener("click", () => {
      if (!svgFinal) return;
      const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svgFinal) || [0, 520, 168], k = 1400 / Math.max(+vb[1], +vb[2]);
      const im = new Image(), url = URL.createObjectURL(new Blob([svgFinal], { type: "image/svg+xml" }));
      im.onload = () => {
        const c = document.createElement("canvas"); c.width = Math.round(vb[1] * k); c.height = Math.round(vb[2] * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob((b) => { if (b) baixar(`logo-${nomeBase()}.png`, b); else aviso("Não consegui montar o PNG. Use o SVG."); }, "image/png");
      };
      im.onerror = () => { URL.revokeObjectURL(url); aviso("Não consegui montar o PNG. Use o SVG."); };
      im.src = url;
    });

    async function situacao() {
      if (!FR.lerToken()) return;
      try { const r = await FR.chamar("GET", "/ferramentas/logo/situacao"); if (r.status === 200) { assinante = !!r.corpo.assinante; mostrarLimite(r.corpo); } else if (r.status === 401) FR.guardarToken(""); } catch { /* sem internet */ }
    }

    let carregou = false, carregando = false;
    async function carregar() { // só quando a aba abre: são 48 imagens e muita gente nem vai olhar
      if (carregou || carregando) return;
      carregando = true;
      try {
        const r = await fetch(`${API}/ferramentas/logo/modelos`);
        if (!r.ok) throw new Error("modelos");
        const j = await r.json(); modelos = j.modelos; todasCategorias = j.categorias;
        $("fr-lg-carregando").hidden = true; desenharChips(todasCategorias); desenharGrade(); carregou = true;
      } catch { $("fr-lg-carregando").hidden = false; $("fr-lg-carregando").textContent = "Não consegui carregar os modelos agora. Confira a internet e abra a aba de novo."; }
      carregando = false;
      situacao();
    }
    $("aba-logo").addEventListener("click", carregar);
    if (!$("painel-logo").hidden) carregar();
  };
  if (window.FR) iniciar(); else document.addEventListener("fr-pronto", iniciar, { once: true });
})();
