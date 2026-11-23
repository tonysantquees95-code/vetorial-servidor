// "Criar meu site" da Vênus Vitrine: assistente em 6 passos (negócio, logo, formato, conteúdo, publicar, kit).
// Prévia ao vivo ao lado; o Vetorial ID só é pedido ao publicar. Tudo entra na página como texto (textContent).
(() => {
  const arrancar = () => {
    const FR = window.FR, { $ } = FR, API = FR.API;
    const CORES = ["#c2185b", "#1d4ed8", "#15803d", "#c2410c", "#6d4aff", "#0e9f8e"];
    const NOMES = { 1: "Negócio", 2: "Logo", 3: "Formato", 4: "Conteúdo", 5: "Publicar", 6: "Kit" };
    let cfg = { layouts: [], limites: { gratis: { fotos: 6, servicos: 8 }, pago: { fotos: 9, servicos: 20 } }, nichos: [], temas: [], logos: [], textos: {} };
    let nicho = "salao", layout = "banner", tema = "creme", fonte = "moderna", cor = CORES[0], logo = "", logoEspec = null, logoSvgUrl = "", assinante = false, slug = "", publicado = false, link = "";
    let passo = 1, carregado = false, tempo = 0, textoAuto = { slogan: true, sobre: true };
    const servicos = [], fotos = [];
    const frame = $("fr-st-frame"), aviso = $("fr-st-aviso");
    const FONTES = [["moderna", "Moderna"], ["elegante", "Elegante"], ["classica", "Clássica"], ["arredondada", "Redonda"], ["forte", "Forte"], ["cursiva", "Cursiva"]];
    const lim = () => (assinante ? cfg.limites.pago : cfg.limites.gratis);
    const centavos = (t) => { const n = Number(String(t).replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
    const emReais = (c) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
    const v = (id) => $(id).value;
    const mostrarAviso = (t) => { aviso.textContent = t || ""; aviso.hidden = !t; };
    const logoPago = () => !!logo && !(cfg.logos.find((l) => l.id === logo) || { gratis: true }).gratis;
    const neonLogo = () => !!(logoEspec && logoEspec.neon && logoEspec.neon.ativo);
    const trancado = () => !assinante && (logoPago() || neonLogo() || !(cfg.layouts.find((l) => l.id === layout) || { gratis: true }).gratis || !(cfg.temas.find((t) => t.id === tema) || { gratis: true }).gratis);

    function dados() {
      return {
        nicho, layout, nome: v("fr-st-nome"), whats: v("fr-st-whats"), cidade: v("fr-st-cidade"), tema, fonte, cor, logoModelo: logo, logoEspec, casarLogo: $("fr-st-casar").checked, slug,
        slogan: v("fr-st-slogan"), sobre: v("fr-st-sobre"), horario: v("fr-st-horario"), endereco: v("fr-st-endereco"), instagram: v("fr-st-insta"),
        servicos: servicos.map((s) => ({ nome: s.nome, descricao: s.descricao, preco: centavos(s.preco) })),
        fotos: fotos.map((f) => (f.fotoNova ? { fotoNova: f.fotoNova } : { foto: f.foto })),
      };
    }
    function previa() {
      clearTimeout(tempo);
      tempo = setTimeout(async () => {
        try {
          const r = await fetch(API + "/sitev/previa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados()) });
          const j = await r.json();
          frame.srcdoc = j.html || '<body style="font-family:system-ui;color:#888;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:20px">Escreva o nome do negócio<br>e a prévia aparece aqui.</body>';
        } catch { /* sem internet */ }
      }, 450);
    }
    function textosDoRamo() {
      const t = cfg.textos[nicho]; if (!t) return;
      const nome = v("fr-st-nome").trim() || "seu negócio";
      if (textoAuto.slogan) $("fr-st-slogan").value = t.slogan.replaceAll("{nome}", nome);
      if (textoAuto.sobre) $("fr-st-sobre").value = t.sobre.replaceAll("{nome}", nome);
    }

    // ------------------------------------------------------------ escolhas visuais
    const chips = (caixa, lista, atual, aoEscolher, rotulo) => {
      caixa.textContent = "";
      for (const it of lista) { const b = document.createElement("button"); b.type = "button"; b.className = "fr-lg-chip"; b.setAttribute("aria-pressed", String(it.id === atual)); b.textContent = rotulo(it); b.addEventListener("click", () => aoEscolher(it)); caixa.append(b); }
    };
    function desenharLayouts() {
      const caixa = $("fr-st-layouts"); caixa.textContent = "";
      for (const l of cfg.layouts) {
        const b = document.createElement("button"); b.type = "button"; b.className = "fr-st-layout"; b.setAttribute("aria-pressed", String(l.id === layout));
        const t = document.createElement("b"); t.textContent = (l.gratis || assinante ? "" : "🔒 ") + l.nome;
        const d = document.createElement("small"); d.textContent = l.desc;
        b.append(t, d); b.addEventListener("click", () => { layout = l.id; desenharEscolhas(); previa(); }); caixa.append(b);
      }
    }
    async function abrirEditor() {
      const nome = v("fr-st-nome").trim() || "Meu negócio";
      let base = logoEspec;
      if (!base && logo) base = await FR.especDoModelo(logo, nome);
      FR.editarLogo({ espec: base ? { ...base, nome: base.nome || nome } : { nome, simbolo: "estrela", layout: "horizontal", fonte: "moderna", paleta: "rose" }, nome: base ? undefined : nome, assinante, textoBotao: "Usar no meu site", aoUsar: (espec, svg) => { logoEspec = espec; logo = ""; logoSvgUrl = FR.imgDeSvg(svg); desenharLogos(); previa(); } });
    }
    function desenharLogos() {
      const caixa = $("fr-st-logos"); caixa.textContent = "";
      const nome = encodeURIComponent(v("fr-st-nome").trim() || "Seu negócio");
      const per = document.createElement("button"); per.type = "button"; per.className = "fr-st-logo fr-st-logo-novo"; per.setAttribute("aria-pressed", String(!!logoEspec)); per.setAttribute("aria-label", "Personalizar meu logo");
      if (logoEspec && logoSvgUrl) { const im = document.createElement("img"); im.alt = ""; im.width = 120; im.height = 120; im.src = logoSvgUrl; per.append(im); }
      else { const s = document.createElement("span"); s.textContent = "Personalizar o meu"; per.append(s); }
      per.addEventListener("click", abrirEditor); caixa.append(per);
      for (const l of [{ id: "", nome: "Sem logo" }, ...cfg.logos]) {
        const b = document.createElement("button"); b.type = "button"; b.className = "fr-st-logo"; b.setAttribute("aria-pressed", String(l.id === logo)); b.setAttribute("aria-label", l.nome);
        if (l.id && l.gratis === false) { b.classList.add("tranca"); const cd = document.createElement("span"); cd.className = "fr-cad"; cd.textContent = "Assinatura"; b.append(cd); }
        if (l.id) { const im = document.createElement("img"); im.alt = ""; im.loading = "lazy"; im.width = 120; im.height = 120; im.src = `${API}/ferramentas/logo/previa?modelo=${encodeURIComponent(l.id)}&nome=${nome}`; b.append(im); }
        else { const s = document.createElement("span"); s.textContent = "Sem logo"; b.append(s); }
        b.addEventListener("click", () => { logo = l.id; logoEspec = null; desenharLogos(); previa(); }); caixa.append(b);
      }
    }
    function desenharEscolhas() {
      desenharLayouts();
      chips($("fr-st-temas"), cfg.temas, tema, (t) => { tema = t.id; desenharEscolhas(); previa(); }, (t) => (t.gratis || assinante ? "" : "🔒 ") + t.nome + (t.gratis ? " · grátis" : ""));
      chips($("fr-st-fontes"), FONTES.map(([id, nome]) => ({ id, nome })), fonte, (f) => { fonte = f.id; desenharEscolhas(); previa(); }, (f) => f.nome);
      const caixa = $("fr-st-cores"); caixa.textContent = "";
      for (const c of CORES) { const b = document.createElement("button"); b.type = "button"; b.className = "fr-ct-cor"; b.style.background = c; b.setAttribute("aria-label", "Cor " + c); b.setAttribute("aria-pressed", String(c === cor)); if (c === cor) b.classList.add("on"); b.addEventListener("click", () => { cor = c; desenharEscolhas(); previa(); }); caixa.append(b); }
      $("fr-st-convite").hidden = !trancado();
    }

    // ------------------------------------------------------------ serviços e fotos
    function reduzirFoto(arq) {
      return new Promise((ok, erro) => {
        const url = URL.createObjectURL(arq), img = new Image();
        img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("Não consegui abrir essa foto. Use JPG ou PNG.")); };
        img.onload = () => {
          URL.revokeObjectURL(url);
          const esc = Math.min(1, 700 / Math.max(img.width, img.height));
          const cv = document.createElement("canvas"); cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
          const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
          for (const q of [0.82, 0.7, 0.58, 0.45]) { const d = cv.toDataURL("image/jpeg", q), b64 = d.split(",")[1]; if (b64.length * 0.75 <= 120 * 1024) return ok({ miniatura: d, base64: b64 }); }
          erro(new Error("Essa foto ficou pesada demais. Tente outra."));
        };
        img.src = url;
      });
    }
    function desenharServicos() {
      const lista = $("fr-st-servicos"); lista.textContent = "";
      servicos.forEach((s, i) => {
        const li = document.createElement("li"); li.className = "fr-ct-prod"; li.style.gridTemplateColumns = "minmax(0,1fr) 32px";
        const campos = document.createElement("div"); campos.className = "fr-ct-campos";
        const mk = (ph, chave, max, modo) => { const c = document.createElement("input"); c.className = "fr-campo"; c.type = "text"; c.placeholder = ph; c.maxLength = max; c.value = s[chave]; if (modo) c.inputMode = modo; c.setAttribute("aria-label", ph); c.addEventListener("input", () => { s[chave] = c.value; previa(); }); return c; };
        const linha = document.createElement("div"); linha.className = "fr-ct-linha2"; linha.append(mk("Nome do serviço", "nome", 50), mk("Preço (R$)", "preco", 12, "decimal"));
        campos.append(linha, mk("Detalhes (opcional)", "descricao", 120));
        const x = document.createElement("button"); x.type = "button"; x.className = "fr-ct-x"; x.textContent = "×"; x.setAttribute("aria-label", "Remover serviço " + (i + 1));
        x.addEventListener("click", () => { servicos.splice(i, 1); desenharServicos(); previa(); });
        li.append(campos, x); lista.append(li);
      });
      $("fr-st-cont-serv").textContent = `${servicos.length} de ${lim().servicos}`;
      $("fr-st-add-serv").disabled = servicos.length >= lim().servicos;
    }
    function desenharFotos() {
      const caixa = $("fr-st-fotos"); caixa.textContent = "";
      fotos.forEach((f, i) => {
        const d = document.createElement("div"); d.className = "fr-st-foto";
        const im = document.createElement("img"); im.src = f.miniatura; im.alt = "Foto " + (i + 1);
        const x = document.createElement("button"); x.type = "button"; x.className = "fr-ct-x"; x.textContent = "×"; x.setAttribute("aria-label", "Remover foto " + (i + 1));
        x.addEventListener("click", () => { fotos.splice(i, 1); desenharFotos(); previa(); });
        d.append(im, x); caixa.append(d);
      });
      if (fotos.length < lim().fotos) {
        const l = document.createElement("label"); l.className = "fr-st-foto"; l.textContent = "+ foto"; l.setAttribute("aria-label", "Adicionar foto");
        const arq = document.createElement("input"); arq.type = "file"; arq.accept = "image/jpeg,image/png"; arq.multiple = true; arq.hidden = true;
        arq.addEventListener("change", async () => {
          for (const f of Array.from(arq.files || [])) {
            if (fotos.length >= lim().fotos) break;
            if (f.size > 8 * 1024 * 1024) { mostrarAviso("Foto grande demais (máx. 8 MB)."); continue; }
            try { const r = await reduzirFoto(f); fotos.push({ fotoNova: r.base64, miniatura: r.miniatura }); mostrarAviso(""); } catch (e) { mostrarAviso(e.message); }
          }
          desenharFotos(); previa();
        });
        l.append(arq); caixa.append(l);
      }
      $("fr-st-cont-fotos").textContent = `${fotos.length} de ${lim().fotos}`;
    }

    // ------------------------------------------------------------ passos
    function revisao() {
      const lista = $("fr-st-revisao"); lista.textContent = "";
      const ramo = (cfg.nichos.find((n) => n.id === nicho) || {}).nome || "";
      const nl = (cfg.layouts.find((l) => l.id === layout) || {}).nome || "";
      const itens = [[!!v("fr-st-nome").trim(), `Negócio: ${v("fr-st-nome").trim() || "falta o nome"} (${ramo})`], [!!v("fr-st-whats").trim(), `WhatsApp: ${v("fr-st-whats").trim() || "falta o número"}`], [true, `Formato: ${nl}`], [!!logo, logo ? "Logo escolhido" : "Sem logo (dá para voltar e escolher)"], [servicos.some((s) => s.nome.trim()), `${servicos.filter((s) => s.nome.trim()).length} serviço(s)`], [fotos.length > 0, `${fotos.length} foto(s)`]];
      for (const [ok, t] of itens) { const li = document.createElement("li"); li.className = ok ? "ok" : "falta"; li.textContent = (ok ? "✓ " : "• ") + t; lista.append(li); }
    }
    function ir(n, rolar = true) {
      if (n === 6 && !publicado) n = 5;
      passo = Math.max(1, Math.min(6, n));
      for (const s of document.querySelectorAll(".fr-passo")) s.hidden = Number(s.dataset.passo) !== passo;
      document.querySelectorAll("#fr-st-passos button").forEach((b) => { const k = Number(b.dataset.ir); if (k === passo) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); b.classList.toggle("feito", k < passo || (k === 6 && publicado)); });
      $("fr-st-volta").hidden = passo === 1; $("fr-st-segue").hidden = passo >= 5;
      $("fr-st-segue").textContent = passo === 4 ? "Revisar" : "Continuar";
      if (passo === 2) desenharLogos();
      if (passo === 5) revisao();
      mostrarAviso("");
      if (rolar) $("painel-site").scrollIntoView({ block: "start", behavior: "smooth" });
    }
    function recursoTrancado() {
      if (neonLogo()) return "O efeito neon no logo";
      if (logoPago()) return "Este logo";
      if (!(cfg.layouts.find((l) => l.id === layout) || { gratis: true }).gratis) return "Este formato de página";
      return "Este tema";
    }
    function convidar() {
      FR.convidarAssinar({ recurso: recursoTrancado(), aoEntrar: async () => { const r = await FR.chamar("GET", "/sitev"); if (r.status === 200) { assinante = !!r.corpo.assinante; desenharEscolhas(); desenharLogos(); previa(); if (!trancado()) seguir(); } } });
    }
    function seguir() {
      if (trancado()) return convidar();
      if (passo === 1) {
        if (!v("fr-st-nome").trim()) return mostrarAviso("Escreva o nome do negócio para continuar."), ($("fr-st-nome").focus());
        if (v("fr-st-whats").replace(/\D/g, "").length < 10) return mostrarAviso("Coloque o WhatsApp com DDD para continuar."), ($("fr-st-whats").focus());
      }
      ir(passo + 1);
    }

    function mostrarPronto(s) {
      slug = s.slug; link = s.link; publicado = true;
      $("fr-st-kit-vazio").hidden = true; $("fr-st-pronto").hidden = false;
      $("fr-st-link").textContent = s.link; $("fr-st-abrir").href = s.link;
      $("fr-kit-cartao").href = `${s.link}/cartao`;
      $("fr-st-whats-enviar").href = "https://wa.me/?text=" + encodeURIComponent(`Conheça o site da ${s.nome}: ${s.link}`);
      const qr = `${API}/ferramentas/qr?texto=${encodeURIComponent(s.link)}`; $("fr-st-qr").src = qr; $("fr-st-qr-baixar").href = qr;
    }
    function preencher(s) {
      $("fr-st-casar").checked = s.casarLogo !== false; nicho = s.nicho || "salao"; layout = s.cfg.layout || "banner"; tema = s.cfg.tema; fonte = s.cfg.fonte || "moderna"; cor = s.cfg.cor; logo = s.logoModelo || ""; logoEspec = s.logoEspec || null; logoSvgUrl = s.logoEspec && s.slug ? `${API}/w/${s.slug}/logo.svg` : ""; slug = s.slug; textoAuto = { slogan: false, sobre: false };
      $("fr-st-nicho").value = nicho; $("fr-st-nome").value = s.nome; $("fr-st-whats").value = s.whats; $("fr-st-cidade").value = s.cidade || "";
      $("fr-st-slogan").value = s.cfg.slogan || ""; $("fr-st-sobre").value = s.cfg.sobre || ""; $("fr-st-horario").value = s.cfg.horario || ""; $("fr-st-endereco").value = s.cfg.endereco || ""; $("fr-st-insta").value = s.cfg.instagram || "";
      servicos.length = 0; for (const x of s.servicos) servicos.push({ nome: x.nome, descricao: x.descricao || "", preco: emReais(x.preco_centavos) });
      fotos.length = 0; for (const id of s.fotos) fotos.push({ foto: id, miniatura: `${API}/w/${s.slug}/foto/${id}` });
      desenharEscolhas(); desenharServicos(); desenharFotos(); desenharLogos(); previa(); mostrarPronto(s); ir(6, false);
    }

    async function publicar() {
      mostrarAviso("");
      if (!v("fr-st-nome").trim()) return ir(1), mostrarAviso("Escreva o nome do negócio.");
      if (trancado()) { convidar(); return; }
      if (!FR.lerToken()) return FR.pedirEntrada(publicar, "", "Seu site está quase no ar! Entre com o seu Vetorial ID para publicar. É grátis, uma conta só serve para todos os nossos apps.");
      const b = $("fr-st-publicar"); b.disabled = true; b.textContent = "Publicando…";
      try {
        const r = await FR.chamar("POST", "/sitev", dados());
        if (r.status === 401) { FR.guardarToken(""); return FR.pedirEntrada(publicar, "Sua sessão venceu. Entre de novo para publicar."); }
        if (r.corpo && typeof r.corpo.assinante === "boolean") { assinante = r.corpo.assinante; desenharEscolhas(); }
        if (r.status === 403) { convidar(); return; }
        if (r.status !== 200) return mostrarAviso((r.corpo && r.corpo.error) || "Não deu para publicar agora. Tente de novo.");
        const s = r.corpo.site; fotos.length = 0; for (const id of s.fotos) fotos.push({ foto: id, miniatura: `${API}/w/${s.slug}/foto/${id}` });
        desenharFotos(); mostrarPronto(s); ir(6);
      } catch { mostrarAviso("Sem conexão com o servidor. Confira a internet e tente de novo."); }
      finally { b.disabled = false; b.textContent = "Publicar meu site"; }
    }

    // ------------------------------------------------------------ kit: as outras ferramentas já preenchidas
    function preencherCampo(id, valor) { const e = $(id); if (!e) return; e.value = valor; e.dispatchEvent(new Event("input", { bubbles: true })); }
    function kit(qual) {
      const nome = v("fr-st-nome").trim(), whats = v("fr-st-whats");
      if (qual === "panfleto") { FR.modo(true, "aba-panfleto"); preencherCampo("fr-pf-loja", nome); preencherCampo("fr-pf-whats", whats); if (v("fr-st-insta")) preencherCampo("fr-pf-insta", v("fr-st-insta")); }
      else if (qual === "qr") { FR.modo(true, "aba-qr"); const r = document.querySelector('input[name="fr-tipo"][value="link"]'); if (r) r.click(); preencherCampo("fr-q-url", link); }
      else if (qual === "link") { FR.modo(true, "aba-link"); preencherCampo("fr-destino", link); }
      else if (qual === "catalogo") { FR.modo(true, "aba-catalogo"); setTimeout(() => { preencherCampo("fr-ct-nome", nome); preencherCampo("fr-ct-whats", whats); }, 50); }
      window.scrollTo({ top: $("fr-soltas").offsetTop - 70, behavior: "smooth" });
    }

    async function carregar() {
      if (carregado) return; carregado = true;
      try { const r = await fetch(API + "/sitev/modelos"); if (r.ok) cfg = await r.json(); } catch { /* usa o padrão */ }
      const sel = $("fr-st-nicho"); sel.textContent = "";
      for (const n of cfg.nichos) { const o = document.createElement("option"); o.value = n.id; o.textContent = n.nome; sel.append(o); }
      sel.value = nicho; textosDoRamo(); desenharEscolhas(); desenharServicos(); desenharFotos(); previa(); ir(1, false);
      if (FR.lerToken()) {
        try { const r = await FR.chamar("GET", "/sitev"); if (r.status === 200) { assinante = !!r.corpo.assinante; if (r.corpo.site) preencher(r.corpo.site); else { desenharEscolhas(); desenharServicos(); desenharFotos(); } } else if (r.status === 401) FR.guardarToken(""); } catch { /* sem internet */ }
      }
    }

    $("fr-st-nicho").addEventListener("change", () => { nicho = v("fr-st-nicho"); textosDoRamo(); previa(); });
    $("fr-st-casar").addEventListener("change", previa);
    $("fr-st-nome").addEventListener("input", () => { textosDoRamo(); previa(); });
    $("fr-st-nome").addEventListener("change", () => { if (passo === 2) desenharLogos(); });
    $("fr-st-slogan").addEventListener("input", () => { textoAuto.slogan = false; previa(); });
    $("fr-st-sobre").addEventListener("input", () => { textoAuto.sobre = false; previa(); });
    for (const id of ["fr-st-whats", "fr-st-cidade", "fr-st-horario", "fr-st-endereco", "fr-st-insta"]) $(id).addEventListener("input", previa);
    $("fr-st-add-serv").addEventListener("click", () => { if (servicos.length < lim().servicos) { servicos.push({ nome: "", descricao: "", preco: "" }); desenharServicos(); } });
    $("fr-st-publicar").addEventListener("click", publicar);
    $("fr-st-segue").addEventListener("click", seguir);
    $("fr-st-volta").addEventListener("click", () => ir(passo - 1));
    document.querySelectorAll("#fr-st-passos button").forEach((b) => b.addEventListener("click", () => { const n = Number(b.dataset.ir); if (n > 1 && passo === 1 && (!v("fr-st-nome").trim() || v("fr-st-whats").replace(/\D/g, "").length < 10)) return seguir(); ir(n); }));
    document.querySelectorAll(".fr-kit-c[data-kit]").forEach((b) => b.addEventListener("click", () => kit(b.dataset.kit)));
    $("fr-st-ap-cel").addEventListener("click", () => { $("fr-st-moldura").classList.remove("pc"); $("fr-st-ap-cel").setAttribute("aria-pressed", "true"); $("fr-st-ap-pc").setAttribute("aria-pressed", "false"); });
    $("fr-st-ap-pc").addEventListener("click", () => { $("fr-st-moldura").classList.add("pc"); $("fr-st-ap-pc").setAttribute("aria-pressed", "true"); $("fr-st-ap-cel").setAttribute("aria-pressed", "false"); });
    if (window.matchMedia && matchMedia("(min-width:1000px)").matches) $("fr-st-ap-pc").click(); // no computador a prévia já abre grande
    $("fr-st-copiar").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("fr-st-link").textContent); $("fr-st-copiar").textContent = "Copiado!"; setTimeout(() => { $("fr-st-copiar").textContent = "Copiar link"; }, 1800); } catch { /* sem permissão */ } });
    $("fr-st-ja-assino").addEventListener("click", () => FR.pedirEntrada(async () => { try { const r = await FR.chamar("GET", "/sitev"); if (r.status === 200) { assinante = !!r.corpo.assinante; if (r.corpo.site && !v("fr-st-nome")) preencher(r.corpo.site); desenharEscolhas(); desenharServicos(); desenharFotos(); } } catch { /* sem internet */ } }, "", "Entre com o seu Vetorial ID para liberar os formatos e temas da sua assinatura."));
    carregar();
  };
  if (window.FR) arrancar(); else document.addEventListener("fr-pronto", arrancar, { once: true });
})();
