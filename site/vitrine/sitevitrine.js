// Aba "Site" da Vênus Vitrine: monta o site do negócio com prévia ao vivo e publica (Vetorial ID só ao publicar).
(() => {
  const arrancar = () => {
    const FR = window.FR, { $ } = FR, API = FR.API;
    const CORES = ["#c2185b", "#1d4ed8", "#15803d", "#c2410c", "#6d4aff", "#0e9f8e"];
    let cfg = { limites: { gratis: { fotos: 6, servicos: 8 }, pago: { fotos: 9, servicos: 20 } }, nichos: [], temas: [], logos: [], textos: {} };
    let nicho = "salao", tema = "creme", cor = CORES[0], logo = "", assinante = false, slug = "", carregado = false, tempo = 0;
    let textoAuto = { slogan: true, sobre: true };
    const servicos = [], fotos = []; // fotos: { foto(id) | fotoNova(base64), miniatura }
    const frame = $("fr-st-frame"), aviso = $("fr-st-aviso");
    const lim = () => (assinante ? cfg.limites.pago : cfg.limites.gratis);
    const centavos = (t) => { const n = Number(String(t).replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
    const emReais = (c) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
    const mostrarAviso = (t) => { aviso.textContent = t || ""; aviso.hidden = !t; };
    const v = (id) => $(id).value;

    function dados() {
      return {
        nicho, nome: v("fr-st-nome"), whats: v("fr-st-whats"), tema, cor, logoModelo: logo, slug,
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

    const chips = (caixa, lista, atual, aoEscolher, rotulo) => {
      caixa.textContent = "";
      for (const it of lista) {
        const b = document.createElement("button"); b.type = "button"; b.className = "fr-lg-chip"; b.setAttribute("aria-pressed", String(it.id === atual));
        b.textContent = rotulo(it); b.addEventListener("click", () => aoEscolher(it)); caixa.append(b);
      }
    };
    function desenharEscolhas() {
      chips($("fr-st-temas"), cfg.temas, tema, (t) => { tema = t.id; $("fr-st-convite").hidden = t.gratis || assinante; desenharEscolhas(); previa(); }, (t) => (t.gratis || assinante ? "" : "🔒 ") + t.nome + (t.gratis ? " · grátis" : ""));
      chips($("fr-st-logos"), [{ id: "", nome: "Sem logo" }, ...cfg.logos], logo, (l) => { logo = l.id; desenharEscolhas(); previa(); }, (l) => l.nome);
      const caixa = $("fr-st-cores"); caixa.textContent = "";
      for (const c of CORES) { const b = document.createElement("button"); b.type = "button"; b.className = "fr-ct-cor"; b.style.background = c; b.setAttribute("aria-label", "Cor " + c); b.setAttribute("aria-pressed", String(c === cor)); if (c === cor) b.classList.add("on"); b.addEventListener("click", () => { cor = c; desenharEscolhas(); previa(); }); caixa.append(b); }
    }

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

    function mostrarPronto(s) {
      slug = s.slug;
      $("fr-st-pronto").hidden = false; $("fr-st-link").textContent = s.link; $("fr-st-abrir").href = s.link;
      $("fr-st-whats-enviar").href = "https://wa.me/?text=" + encodeURIComponent(`Conheça o site da ${s.nome}: ${s.link}`);
      const qr = `${API}/ferramentas/qr?texto=${encodeURIComponent(s.link)}`; $("fr-st-qr").src = qr; $("fr-st-qr-baixar").href = qr;
      $("fr-st-pronto").scrollIntoView({ block: "nearest" });
    }
    function preencher(s) {
      nicho = s.nicho || "salao"; tema = s.cfg.tema; cor = s.cfg.cor; logo = s.logoModelo || ""; slug = s.slug; textoAuto = { slogan: false, sobre: false };
      $("fr-st-nicho").value = nicho; $("fr-st-nome").value = s.nome; $("fr-st-whats").value = s.whats;
      $("fr-st-slogan").value = s.cfg.slogan || ""; $("fr-st-sobre").value = s.cfg.sobre || ""; $("fr-st-horario").value = s.cfg.horario || ""; $("fr-st-endereco").value = s.cfg.endereco || ""; $("fr-st-insta").value = s.cfg.instagram || "";
      servicos.length = 0; for (const x of s.servicos) servicos.push({ nome: x.nome, descricao: x.descricao || "", preco: emReais(x.preco_centavos) });
      fotos.length = 0; for (const id of s.fotos) fotos.push({ foto: id, miniatura: `${API}/w/${s.slug}/foto/${id}` });
      desenharEscolhas(); desenharServicos(); desenharFotos(); previa(); mostrarPronto(s);
    }

    async function publicar() {
      mostrarAviso("");
      if (!v("fr-st-nome").trim()) return mostrarAviso("Escreva o nome do negócio.");
      const t = cfg.temas.find((x) => x.id === tema);
      if (t && !t.gratis && !assinante && !FR.lerToken()) { $("fr-st-convite").hidden = false; return $("fr-st-convite").scrollIntoView({ block: "nearest" }); }
      if (!FR.lerToken()) return FR.pedirEntrada(publicar, "", "Seu site está quase no ar! Entre com o seu Vetorial ID para publicar. É grátis, uma conta só serve para todos os nossos apps.");
      const b = $("fr-st-publicar"); b.disabled = true; b.textContent = "Publicando…";
      try {
        const r = await FR.chamar("POST", "/sitev", dados());
        if (r.status === 401) { FR.guardarToken(""); return FR.pedirEntrada(publicar, "Sua sessão venceu. Entre de novo para publicar."); }
        if (r.corpo && typeof r.corpo.assinante === "boolean") { assinante = r.corpo.assinante; desenharEscolhas(); }
        if (r.status === 403) { $("fr-st-convite").hidden = false; return mostrarAviso(r.corpo.error); }
        if (r.status !== 200) return mostrarAviso((r.corpo && r.corpo.error) || "Não deu para publicar agora. Tente de novo.");
        const s = r.corpo.site; fotos.length = 0; for (const id of s.fotos) fotos.push({ foto: id, miniatura: `${API}/w/${s.slug}/foto/${id}` });
        desenharFotos(); mostrarPronto(s);
      } catch { mostrarAviso("Sem conexão com o servidor. Confira a internet e tente de novo."); }
      finally { b.disabled = false; b.textContent = "Publicar meu site"; }
    }

    async function carregar() {
      if (carregado) return; carregado = true;
      try { const r = await fetch(API + "/sitev/modelos"); if (r.ok) cfg = await r.json(); } catch { /* usa o padrão */ }
      const sel = $("fr-st-nicho"); sel.textContent = "";
      for (const n of cfg.nichos) { const o = document.createElement("option"); o.value = n.id; o.textContent = n.nome; sel.append(o); }
      sel.value = nicho; textosDoRamo(); desenharEscolhas(); desenharServicos(); desenharFotos(); previa();
      if (FR.lerToken()) {
        try { const r = await FR.chamar("GET", "/sitev"); if (r.status === 200) { assinante = !!r.corpo.assinante; if (r.corpo.site) preencher(r.corpo.site); else { desenharEscolhas(); desenharServicos(); desenharFotos(); } } else if (r.status === 401) FR.guardarToken(""); } catch { /* sem internet */ }
      }
    }

    $("aba-site").addEventListener("click", carregar);
    $("fr-st-nicho").addEventListener("change", () => { nicho = v("fr-st-nicho"); textosDoRamo(); previa(); });
    $("fr-st-nome").addEventListener("input", () => { textosDoRamo(); previa(); });
    $("fr-st-slogan").addEventListener("input", () => { textoAuto.slogan = false; previa(); });
    $("fr-st-sobre").addEventListener("input", () => { textoAuto.sobre = false; previa(); });
    for (const id of ["fr-st-whats", "fr-st-horario", "fr-st-endereco", "fr-st-insta"]) $(id).addEventListener("input", previa);
    $("fr-st-add-serv").addEventListener("click", () => { if (servicos.length < lim().servicos) { servicos.push({ nome: "", descricao: "", preco: "" }); desenharServicos(); } });
    $("fr-st-publicar").addEventListener("click", publicar);
    $("fr-st-copiar").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("fr-st-link").textContent); $("fr-st-copiar").textContent = "Copiado!"; setTimeout(() => { $("fr-st-copiar").textContent = "Copiar link"; }, 1800); } catch { /* sem permissão */ } });
    $("fr-st-ja-assino").addEventListener("click", () => FR.pedirEntrada(async () => { try { const r = await FR.chamar("GET", "/sitev"); if (r.status === 200) { assinante = !!r.corpo.assinante; if (r.corpo.site && !v("fr-st-nome")) preencher(r.corpo.site); desenharEscolhas(); desenharServicos(); desenharFotos(); $("fr-st-convite").hidden = true; } } catch { /* sem internet */ } }, "", "Entre com o seu Vetorial ID para liberar os temas da sua assinatura."));
  };
  if (window.FR) arrancar(); else document.addEventListener("fr-pronto", arrancar, { once: true });
})();
