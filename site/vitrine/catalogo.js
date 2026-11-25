// Aba "Catálogo" da Vênus Vitrine: monta o catálogo, mostra a prévia ao vivo e publica (Vetorial ID só ao publicar).
(() => {
  const arrancar = () => {
    const FR = window.FR, { $, dizer } = FR, API = FR.API;
    let cfg = { limiteGratis: 12, limitePago: 60, cores: ["#c2185b"], temas: [{ id: "claro", nome: "Claro", gratis: true }] };
    let tema = "claro", cor = "", assinante = false, slug = "", carregado = false, tempo = 0;
    const produtos = []; // { nome, preco(texto), desc, foto(id guardado), fotoNova(base64), miniatura(dataURL) }
    const lista = $("fr-ct-produtos"), frame = $("fr-ct-frame"), aviso = $("fr-ct-aviso");
    const limite = () => (assinante ? cfg.limitePago : cfg.limiteGratis);
    const centavos = (t) => { const n = Number(String(t).replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
    const emReais = (c) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
    const mostrarAviso = (t) => { aviso.textContent = t || ""; aviso.hidden = !t; };

    function dados() {
      return {
        nome: $("fr-ct-nome").value, whats: $("fr-ct-whats").value, descricao: $("fr-ct-desc").value, tema, cor, slug,
        produtos: produtos.map((p) => ({ nome: p.nome, preco: centavos(p.preco), desc: p.desc, foto: p.foto || "", ...(p.fotoNova ? { fotoNova: p.fotoNova } : {}) })),
      };
    }

    function previa() {
      clearTimeout(tempo);
      tempo = setTimeout(async () => {
        try {
          const r = await fetch(API + "/catalogo/previa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados()) });
          const j = await r.json();
          frame.srcdoc = j.html || '<body style="font-family:system-ui;color:#888;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:20px">Dê um nome aos seus produtos<br>e a prévia aparece aqui.</body>';
        } catch { /* sem internet: mantém a prévia anterior */ }
      }, 450);
    }

    function desenharTemas() {
      const caixa = $("fr-ct-temas"); caixa.textContent = "";
      for (const t of cfg.temas) {
        const b = document.createElement("button"); b.type = "button"; b.className = "fr-lg-chip" + (t.id === tema ? " on" : ""); b.setAttribute("aria-pressed", String(t.id === tema));
        b.textContent = (t.gratis || assinante ? "" : "🔒 ") + t.nome + (t.gratis ? " · grátis" : "");
        b.addEventListener("click", () => { tema = t.id; $("fr-ct-convite").hidden = t.gratis || assinante; desenharTemas(); previa(); });
        caixa.append(b);
      }
    }
    function desenharCores() {
      const caixa = $("fr-ct-cores"); caixa.textContent = "";
      for (const c of cfg.cores) {
        const b = document.createElement("button"); b.type = "button"; b.className = "fr-ct-cor" + (c === cor ? " on" : ""); b.style.background = c; b.setAttribute("aria-label", "Cor " + c); b.setAttribute("aria-pressed", String(c === cor));
        b.addEventListener("click", () => { cor = c; desenharCores(); previa(); });
        caixa.append(b);
      }
    }

    function reduzirFoto(arq) {
      return new Promise((ok, erro) => {
        const url = URL.createObjectURL(arq), img = new Image();
        img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("Não consegui abrir essa foto. Use JPG ou PNG.")); };
        img.onload = () => {
          URL.revokeObjectURL(url);
          const lado = 700, esc = Math.min(1, lado / Math.max(img.width, img.height));
          const cv = document.createElement("canvas"); cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
          const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
          for (const q of [0.82, 0.7, 0.58, 0.45]) {
            const d = cv.toDataURL("image/jpeg", q), b64 = d.split(",")[1];
            if (b64.length * 0.75 <= 120 * 1024) return ok({ miniatura: d, base64: b64 });
          }
          erro(new Error("Essa foto ficou pesada demais. Tente outra."));
        };
        img.src = url;
      });
    }

    function desenharProdutos() {
      lista.textContent = "";
      produtos.forEach((p, i) => {
        const li = document.createElement("li"); li.className = "fr-ct-prod";
        const foto = document.createElement("label"); foto.className = "fr-ct-foto"; foto.setAttribute("aria-label", "Foto do produto " + (i + 1));
        if (p.miniatura) { const im = document.createElement("img"); im.src = p.miniatura; im.alt = ""; foto.append(im); } else foto.textContent = "+ foto";
        const arq = document.createElement("input"); arq.type = "file"; arq.accept = "image/jpeg,image/png"; arq.hidden = true;
        arq.addEventListener("change", async () => {
          const f = arq.files && arq.files[0]; if (!f) return;
          if (f.size > 8 * 1024 * 1024) return mostrarAviso("Foto grande demais (máx. 8 MB).");
          try { const r = await reduzirFoto(f); p.fotoNova = r.base64; p.miniatura = r.miniatura; p.foto = ""; mostrarAviso(""); desenharProdutos(); previa(); } catch (e) { mostrarAviso(e.message); }
        });
        foto.append(arq);
        const campos = document.createElement("div"); campos.className = "fr-ct-campos";
        const mk = (ph, chave, max, modo) => { const c = document.createElement("input"); c.className = "fr-campo"; c.type = "text"; c.placeholder = ph; c.maxLength = max; c.value = p[chave]; if (modo) c.inputMode = modo; c.setAttribute("aria-label", ph); c.addEventListener("input", () => { p[chave] = c.value; previa(); }); return c; };
        const linha = document.createElement("div"); linha.className = "fr-ct-linha2";
        linha.append(mk("Nome do produto", "nome", 60), mk("Preço (R$)", "preco", 12, "decimal"));
        campos.append(linha, mk("Detalhes (opcional)", "desc", 140));
        const tirar = document.createElement("button"); tirar.type = "button"; tirar.className = "fr-ct-x"; tirar.textContent = "×"; tirar.setAttribute("aria-label", "Remover produto " + (i + 1));
        tirar.addEventListener("click", () => { produtos.splice(i, 1); desenharProdutos(); previa(); });
        li.append(foto, campos, tirar); lista.append(li);
      });
      $("fr-ct-contagem").textContent = `${produtos.length} de ${limite()}`;
      $("fr-ct-add").disabled = produtos.length >= limite();
    }

    function mostrarPronto(c) {
      slug = c.slug;
      $("fr-ct-pronto").hidden = false;
      $("fr-ct-link").textContent = c.link;
      $("fr-ct-abrir").href = c.link;
      $("fr-ct-whats-enviar").href = "https://wa.me/?text=" + encodeURIComponent(`Veja o catálogo da ${c.nome}: ${c.link}`);
      const qr = `${API}/ferramentas/qr?texto=${encodeURIComponent(c.link)}`;
      $("fr-ct-qr").src = qr; $("fr-ct-qr-baixar").href = qr;
      $("fr-ct-pronto").scrollIntoView({ block: "nearest" });
    }

    function preencher(c) {
      $("fr-ct-nome").value = c.nome; $("fr-ct-whats").value = c.whats; $("fr-ct-desc").value = c.descricao || "";
      tema = c.tema; cor = c.cor; slug = c.slug;
      produtos.length = 0;
      for (const p of c.produtos) produtos.push({ nome: p.nome, preco: emReais(p.preco), desc: p.desc || "", foto: p.foto || "", fotoNova: "", miniatura: p.foto ? `${API}/c/${c.slug}/f/${p.foto}` : "" });
      desenharTemas(); desenharCores(); desenharProdutos(); previa(); mostrarPronto(c);
    }

    async function publicar() {
      mostrarAviso("");
      if (!produtos.some((p) => p.nome.trim())) return mostrarAviso("Coloque pelo menos um produto com nome.");
      const t = cfg.temas.find((x) => x.id === tema);
      if (t && !t.gratis && !assinante) return FR.convidarAssinar({ recurso: "Este tema", aoEntrar: async () => { const r = await FR.chamar("GET", "/catalogo"); if (r.status === 200) assinante = !!r.corpo.assinante; } });
      if (!FR.lerToken()) return FR.pedirEntrada(publicar, "", "Seu catálogo está quase no ar! Entre com o seu Vetorial ID para publicar. É grátis, uma conta só serve para todos os nossos apps.");
      const b = $("fr-ct-publicar"); b.disabled = true; b.textContent = "Publicando…";
      try {
        const r = await FR.chamar("POST", "/catalogo", dados());
        if (r.status === 401) { FR.guardarToken(""); return FR.pedirEntrada(publicar, "Sua sessão venceu. Entre de novo para publicar."); }
        if (r.corpo && typeof r.corpo.assinante === "boolean") { assinante = r.corpo.assinante; desenharTemas(); }
        if (r.status === 403) return FR.convidarAssinar({ recurso: "Este tema", aoEntrar: async () => { const r2 = await FR.chamar("GET", "/catalogo"); if (r2.status === 200) assinante = !!r2.corpo.assinante; } });
        if (r.status !== 200) return mostrarAviso((r.corpo && r.corpo.error) || "Não deu para publicar agora. Tente de novo.");
        const c = r.corpo.catalogo;
        // fotos novas viram fotos guardadas
        c.produtos.forEach((p, i) => { if (produtos[i]) { produtos[i].foto = p.foto; produtos[i].fotoNova = ""; } });
        mostrarPronto(c);
      } catch { mostrarAviso("Sem conexão com o servidor. Confira a internet e tente de novo."); }
      finally { b.disabled = false; b.textContent = "Publicar meu catálogo"; }
    }

    async function carregar() {
      if (carregado) return; carregado = true;
      try { const r = await fetch(API + "/catalogo/modelos"); if (r.ok) cfg = await r.json(); } catch { /* usa o padrão */ }
      cor = cfg.cores[0]; desenharTemas(); desenharCores();
      if (!produtos.length) produtos.push({ nome: "", preco: "", desc: "", foto: "", fotoNova: "", miniatura: "" });
      desenharProdutos(); previa();
      if (FR.lerToken()) {
        try { const r = await FR.chamar("GET", "/catalogo"); if (r.status === 200) { assinante = !!r.corpo.assinante; if (r.corpo.catalogo) preencher(r.corpo.catalogo); else { desenharTemas(); desenharProdutos(); } } else if (r.status === 401) FR.guardarToken(""); } catch { /* sem internet */ }
      }
    }

    /** Itens lidos do cardápio pela IA: entram no editor (linhas vazias primeiro, depois o resto até o limite) e a pessoa confere antes de publicar. */
    async function aplicarCardapio({ itens, nome, cortados }) {
      await carregar();
      const livres = produtos.filter((p) => p.nome.trim());
      produtos.length = 0; produtos.push(...livres);
      let entrou = 0;
      for (const it of itens) {
        if (produtos.length >= limite()) break;
        produtos.push({ nome: it.nome, preco: emReais(it.preco), desc: it.desc || it.categoria || "", foto: "", fotoNova: "", miniatura: "" });
        entrou++;
      }
      if (nome && !$("fr-ct-nome").value.trim()) $("fr-ct-nome").value = nome;
      desenharProdutos(); previa();
      const fora = Math.max(0, itens.length - entrou) + (cortados || 0);
      $("fr-ct-revisar-t").textContent = `Encontrei ${entrou} ${entrou === 1 ? "item" : "itens"} no seu cardápio.`;
      $("fr-ct-revisar-p").textContent = "Confira cada nome e preço: a inteligência artificial pode errar. Corrija aqui mesmo, ponha fotos se quiser e publique." + (fora ? ` ${fora} ${fora === 1 ? "item ficou" : "itens ficaram"} de fora porque o seu plano mostra até ${limite()} produtos.` : "") + (nome ? "" : " Falta só o nome da loja e o WhatsApp.");
      $("fr-ct-revisar").hidden = false;
      $("fr-ct-revisar").scrollIntoView({ block: "start" });
    }
    FR.aplicarCardapio = aplicarCardapio;
    $("fr-ct-revisar-ok").addEventListener("click", () => { $("fr-ct-revisar").hidden = true; });
    $("aba-catalogo").addEventListener("click", carregar);
    for (const id of ["fr-ct-nome", "fr-ct-whats", "fr-ct-desc"]) $(id).addEventListener("input", previa);
    $("fr-ct-add").addEventListener("click", () => { if (produtos.length < limite()) { produtos.push({ nome: "", preco: "", desc: "", foto: "", fotoNova: "", miniatura: "" }); desenharProdutos(); } });
    $("fr-ct-publicar").addEventListener("click", publicar);
    $("fr-ct-copiar").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("fr-ct-link").textContent); $("fr-ct-copiar").textContent = "Copiado!"; setTimeout(() => { $("fr-ct-copiar").textContent = "Copiar link"; }, 1800); } catch { /* sem permissão */ } });
    $("fr-ct-ja-assino").addEventListener("click", () => FR.pedirEntrada(async () => { try { const r = await FR.chamar("GET", "/catalogo"); if (r.status === 200) { assinante = !!r.corpo.assinante; if (r.corpo.catalogo && !produtos.some((p) => p.nome)) preencher(r.corpo.catalogo); desenharTemas(); desenharProdutos(); $("fr-ct-convite").hidden = true; } } catch { /* sem internet */ } }, "", "Entre com o seu Vetorial ID para liberar os temas da sua assinatura."));
  };
  if (window.FR) arrancar(); else document.addEventListener("fr-pronto", arrancar, { once: true });
})();
