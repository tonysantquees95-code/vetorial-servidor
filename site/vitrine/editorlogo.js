// Editor de logo da Vênus Vitrine: fonte, ícone (com busca), layout, cores e neon. Janela única, usada no assistente e na aba Logo.
// O desenho sempre vem do servidor (SVG pronto) e entra só como imagem; aqui nunca montamos SVG nem HTML a partir de dados.
(() => {
  const iniciar = () => {
    const FR = window.FR, { $ } = FR, API = FR.API;
    let opcoes = null, urlAtual = "";
    const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
    const imgDeSvg = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    const aviso = { 403: "O efeito neon é só para quem tem assinatura da Vênus." };

    async function carregarOpcoes() {
      if (opcoes) return opcoes;
      const r = await fetch(`${API}/ferramentas/logo/editor/opcoes`);
      if (!r.ok) throw new Error("Não consegui abrir o editor agora.");
      opcoes = await r.json();
      return opcoes;
    }

    /** Janelinha "Assine a Vênus" (chamariz): vale para qualquer recurso de assinatura. */
    function convidarAssinar({ recurso = "Este recurso", aoEntrar } = {}) {
      if (document.getElementById("fr-assine")) return;
      const fundo = el("div", "fr-janela"); fundo.id = "fr-assine"; fundo.style.zIndex = "70"; fundo.setAttribute("role", "dialog"); fundo.setAttribute("aria-modal", "true"); fundo.setAttribute("aria-label", "Assine a Vênus");
      const caixa = el("div", "fr-caixa");
      caixa.append(el("h3", "", "Assine a Vênus e libere tudo"));
      caixa.append(el("p", "", `${recurso} é um recurso para assinantes da Vênus.`));
      const ul = el("ul", "fr-assine-lista");
      for (const t of ["Todos os logos, formatos de página e temas", "Efeito neon e cores livres no logo", "Mais fotos e serviços no site", "Sem a marca “Feito com a Vênus Vitrine”", "E ainda agenda, estoque, vendas e assistente na Vênus"]) ul.append(el("li", "", t));
      caixa.append(ul);
      const linha = el("div", "fr-linha"); const ver = el("a", "btn", "Ver planos"); ver.href = "../#preco";
      const jaAssino = el("button", "btn sec", "Já assino, entrar"); jaAssino.type = "button";
      const fecha = el("button", "btn sec", "Agora não, escolher um grátis"); fecha.type = "button";
      linha.append(ver, jaAssino); caixa.append(linha, fecha); fundo.append(caixa); document.body.append(fundo);
      const sair = () => { fundo.remove(); document.removeEventListener("keydown", tecla); };
      const tecla = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); sair(); } };
      document.addEventListener("keydown", tecla, true);
      fecha.addEventListener("click", sair); fundo.addEventListener("click", (ev) => { if (ev.target === fundo) sair(); });
      jaAssino.addEventListener("click", () => { sair(); FR.pedirEntrada(async () => { try { await aoEntrar?.(); } catch {} }, "", "Entre com o seu Vetorial ID para liberar o que a sua assinatura já inclui."); });
      ver.focus();
    }
    FR.convidarAssinar = convidarAssinar;

    /**
     * FR.editarLogo({ espec, nome, assinante, textoBotao, aoUsar(espec, svg) })
     * `espec` é a receita do logo (a mesma que o servidor valida); o editor devolve a nova receita.
     */
    async function editarLogo({ espec, nome, assinante: ehAssinante = false, textoBotao = "Usar este logo", aoUsar }) {
      let o;
      try { o = await carregarOpcoes(); } catch (e) { FR.dizer?.("fr-st-aviso", e.message); return; }
      let e = { nome: nome || "Meu negócio", subtitulo: "", simbolo: "estrela", layout: "horizontal", fonte: "moderna", paleta: "rose", ...(espec || {}) };
      e.cores = { ...(espec?.cores || {}) }; e.neon = { ativo: false, cor: "#FF2BD6", ...(espec?.neon || {}) };
      if (nome) e.nome = nome;
      let tempo = 0, busca = "", assinante = ehAssinante;

      const fundo = el("div", "fr-janela fr-ed"); fundo.setAttribute("role", "dialog"); fundo.setAttribute("aria-modal", "true"); fundo.setAttribute("aria-label", "Editor de logo");
      const caixa = el("div", "fr-caixa fr-ed-caixa");
      const topo = el("div", "fr-ed-topo"); topo.append(el("h3", "", "Editar meu logo"));
      const fechar = el("button", "btn sec p", "Fechar"); fechar.type = "button"; topo.append(fechar);
      const previa = el("div", "fr-ed-previa"); const im = el("img"); im.alt = "Prévia do logo"; previa.append(im);
      const msg = el("p", "fr-ed-msg", ""); msg.setAttribute("role", "status");
      const corpo = el("div", "fr-ed-corpo");
      const rodape = el("div", "fr-nav");
      const usar = el("button", "btn", textoBotao); usar.type = "button";
      const cancela = el("button", "btn sec", "Cancelar"); cancela.type = "button";
      rodape.append(cancela, usar);

      const grupo = (titulo) => { const g = el("section", "fr-ed-grupo"); g.append(el("h4", "", titulo)); corpo.append(g); return g; };
      const opcao = (pai, texto, ativo, aoTocar, estilo) => {
        const b = el("button", "fr-ed-op", texto); b.type = "button"; b.setAttribute("aria-pressed", String(!!ativo)); if (estilo) b.style.cssText = estilo; b.addEventListener("click", aoTocar); pai.append(b); return b;
      };

      // nome
      const gNome = grupo("Texto");
      const cNome = el("input", "fr-campo"); cNome.type = "text"; cNome.maxLength = 32; cNome.value = e.nome; cNome.setAttribute("aria-label", "Nome no logo");
      const cSub = el("input", "fr-campo"); cSub.type = "text"; cSub.maxLength = 40; cSub.value = e.subtitulo || ""; cSub.placeholder = "Frase curta (opcional)"; cSub.setAttribute("aria-label", "Frase abaixo do nome");
      cNome.addEventListener("input", () => { e.nome = cNome.value; agendar(); }); cSub.addEventListener("input", () => { e.subtitulo = cSub.value; agendar(); });
      gNome.append(cNome, cSub);

      // fontes
      const gFonte = grupo("Fonte"); const lFonte = el("div", "fr-ed-lista");
      const pintaFontes = () => { lFonte.textContent = ""; for (const f of o.fontes) opcao(lFonte, f.nome, e.fonte === f.id, () => { e.fonte = f.id; pintaFontes(); agendar(); }, `font-family:${f.familia.replace(/[;"<>]/g, "")};font-weight:${Number(f.peso) || 700};font-style:${f.estilo === "italic" ? "italic" : "normal"}`); };
      gFonte.append(lFonte); pintaFontes();

      // layout
      const gLay = grupo("Formato do logo"); const lLay = el("div", "fr-ed-lista");
      const pintaLay = () => { lLay.textContent = ""; for (const l of o.layouts) opcao(lLay, l.nome, e.layout === l.id, () => { e.layout = l.id; pintaLay(); agendar(); }); };
      gLay.append(lLay); pintaLay();

      // ícone com busca
      const gIc = grupo("Ícone");
      const cBusca = el("input", "fr-campo"); cBusca.type = "search"; cBusca.placeholder = "Buscar ícone: pizza, tesoura, casa, flor…"; cBusca.setAttribute("aria-label", "Buscar ícone");
      const gradeIc = el("div", "fr-ed-icones");
      const norm = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const pintaIc = () => {
        gradeIc.textContent = "";
        const q = norm(busca).trim();
        const lista = o.simbolos.filter((s) => !q || norm(s.palavras).includes(q) || norm(s.nome).includes(q));
        if (!lista.length) { gradeIc.append(el("p", "fr-peq", "Nenhum ícone com essa palavra. Tente outra, como “comida”, “beleza” ou “casa”.")); return; }
        for (const s of lista) {
          const b = el("button", "fr-ed-ic"); b.type = "button"; b.setAttribute("aria-pressed", String(e.simbolo === s.id)); b.setAttribute("aria-label", s.nome); b.title = s.nome;
          if (s.svg) { const i = el("img"); i.alt = ""; i.width = 34; i.height = 34; i.loading = "lazy"; i.src = imgDeSvg(s.svg); b.append(i); } else b.append(el("span", "", "A"));
          b.addEventListener("click", () => { e.simbolo = s.id; pintaIc(); agendar(); }); gradeIc.append(b);
        }
      };
      cBusca.addEventListener("input", () => { busca = cBusca.value; pintaIc(); });
      gIc.append(cBusca, gradeIc); pintaIc();

      // cores
      const gCor = grupo("Cores"); const lPal = el("div", "fr-ed-lista");
      const pintaPal = () => { lPal.textContent = ""; for (const p of o.paletas) { const b = opcao(lPal, p.nome, e.paleta === p.id && !Object.keys(e.cores).length, () => { e.paleta = p.id; e.cores = {}; pintaPal(); pintaCores(); agendar(); }); const bol = el("i", "fr-ed-bol"); bol.style.background = `linear-gradient(135deg,${p.fundo} 50%,${p.principal} 50%)`; b.prepend(bol); } };
      const lCor = el("div", "fr-ed-cores");
      const corAtual = (k) => e.cores[k] || (o.paletas.find((p) => p.id === e.paleta) || o.paletas[0])[k];
      const pintaCores = () => {
        lCor.textContent = "";
        for (const [k, nomeCor] of [["fundo", "Fundo"], ["principal", "Destaque"], ["apoio", "Apoio"], ["texto", "Texto"]]) {
          const l = el("label", "fr-ed-cor"); l.append(el("span", "", nomeCor));
          const c = el("input"); c.type = "color"; c.value = /^#[0-9a-f]{6}$/i.test(corAtual(k)) ? corAtual(k).toLowerCase() : "#000000";
          c.addEventListener("input", () => { e.cores[k] = c.value; pintaPal(); agendar(); }); l.append(c); lCor.append(l);
        }
      };
      gCor.append(lPal, lCor); pintaPal(); pintaCores();

      // neon
      const gNeon = grupo("Efeito neon"); const lNeon = el("div", "fr-ed-lista");
      const pintaNeon = () => {
        lNeon.textContent = "";
        opcao(lNeon, "Sem neon", !e.neon.ativo, () => { e.neon.ativo = false; pintaNeon(); agendar(); });
        const b = opcao(lNeon, assinante ? "Com neon" : "Com neon (assinatura)", e.neon.ativo, () => { e.neon.ativo = true; pintaNeon(); agendar(); });
        b.title = assinante ? "" : "O neon é um recurso da assinatura da Vênus; você pode ver na prévia, mas não usar no plano grátis.";
        if (e.neon.ativo) {
          const l = el("label", "fr-ed-cor"); l.append(el("span", "", "Cor do brilho"));
          const c = el("input"); c.type = "color"; c.value = /^#[0-9a-f]{6}$/i.test(e.neon.cor) ? e.neon.cor.toLowerCase() : "#ff2bd6";
          c.addEventListener("input", () => { e.neon.cor = c.value; agendar(); }); l.append(c); lNeon.append(l);
        }
      };
      gNeon.append(lNeon); pintaNeon();

      caixa.append(topo, previa, msg, corpo, rodape); fundo.append(caixa); document.body.append(fundo);
      document.body.style.overflow = "hidden";

      let ultimo = "";
      async function desenhar() {
        const pedido = JSON.stringify(e); ultimo = pedido;
        try {
          const r = await fetch(`${API}/ferramentas/logo/editor/previa`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ espec: e }) });
          const c = await r.json();
          if (ultimo !== pedido || !c.svg) return;
          im.src = imgDeSvg(c.svg);
          msg.textContent = e.neon.ativo && !assinante ? "Prévia com neon. Para usar o neon é preciso ter a assinatura da Vênus." : "";
        } catch { msg.textContent = "Sem conexão para atualizar a prévia."; }
      }
      function agendar() { clearTimeout(tempo); tempo = setTimeout(desenhar, 180); }
      const sair = () => { clearTimeout(tempo); fundo.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", tecla); };
      const tecla = (ev) => { if (ev.key === "Escape") sair(); };
      document.addEventListener("keydown", tecla);
      fechar.addEventListener("click", sair); cancela.addEventListener("click", sair);
      fundo.addEventListener("click", (ev) => { if (ev.target === fundo) sair(); });
      usar.addEventListener("click", async () => {
        if (e.neon.ativo && !assinante) { msg.textContent = aviso[403]; convidarAssinar({ recurso: "O efeito neon", aoEntrar: async () => { const r = await FR.chamar("GET", "/ferramentas/logo/situacao"); if (r.status === 200 && r.corpo.assinante) { assinante = true; pintaNeon(); msg.textContent = ""; } } }); return; }
        if (!String(e.nome).trim()) { msg.textContent = "Escreva o nome do seu negócio."; return; }
        usar.disabled = true;
        try {
          const r = await fetch(`${API}/ferramentas/logo/editor/previa`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ espec: e }) });
          const c = await r.json();
          const final = c.espec; sair(); aoUsar?.(final, c.svg);
        } catch { msg.textContent = "Sem conexão. Tente de novo."; usar.disabled = false; }
      });
      desenhar(); cNome.focus();
    }

    /** Receita de um modelo pronto, para abrir no editor já com o jeitão dele. */
    async function especDoModelo(id, nome) {
      const r = await fetch(`${API}/ferramentas/logo/editor/modelo?id=${encodeURIComponent(id)}&nome=${encodeURIComponent(nome || "Seu negócio")}`);
      if (!r.ok) return null;
      return (await r.json()).espec;
    }
    FR.editarLogo = editarLogo; FR.especDoModelo = especDoModelo; FR.imgDeSvg = imgDeSvg;
  };
  if (window.FR) iniciar(); else document.addEventListener("fr-pronto", iniciar, { once: true });
})();
