// Aba "Cardápio" da Vênus Vitrine: a pessoa manda foto(s) ou PDF, a IA lê os itens e eles caem no editor do Catálogo para conferir e publicar.
// O Vetorial ID só é pedido na hora de ler (a leitura por IA tem custo e limite diário). Nada do que vem do servidor entra como HTML.
(() => {
  const arrancar = () => {
    const FR = window.FR, { $ } = FR;
    const MAX_FOTOS = 4, MAX_PDF = 2.8 * 1024 * 1024, MAX_FOTO_B64 = 1_100_000;
    const FRASES = ["Lendo seu cardápio…", "Separando os pratos por categoria…", "Conferindo os preços…", "Quase lá: montando sua lista…"];
    let arquivos = []; // { nome, mime, dados(base64), miniatura }
    let ctl = null, relogio = 0, uso = null;

    const aviso = (t) => { $("fr-cd-aviso").textContent = t || ""; $("fr-cd-aviso").hidden = !t; };

    function lerComoBase64(arq) {
      return new Promise((ok, erro) => { const r = new FileReader(); r.onerror = () => erro(new Error("Não consegui abrir esse arquivo.")); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.readAsDataURL(arq); });
    }
    /** Foto vira JPEG de no máximo 1600 px (leve para enviar e boa para ler letra miúda). */
    function reduzir(arq) {
      return new Promise((ok, erro) => {
        const url = URL.createObjectURL(arq), img = new Image();
        img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("Não consegui abrir essa foto. Use JPG ou PNG.")); };
        img.onload = () => {
          URL.revokeObjectURL(url);
          const esc = Math.min(1, 1600 / Math.max(img.width, img.height));
          const cv = document.createElement("canvas"); cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
          const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
          for (const q of [0.85, 0.72, 0.6, 0.48]) {
            const d = cv.toDataURL("image/jpeg", q), b64 = d.split(",")[1];
            if (b64.length <= MAX_FOTO_B64) return ok({ dados: b64, miniatura: d });
          }
          erro(new Error("Essa foto ficou pesada demais. Tire outra mais perto do cardápio."));
        };
        img.src = url;
      });
    }

    function desenharLista() {
      const ul = $("fr-cd-arquivos"); ul.textContent = "";
      arquivos.forEach((a, i) => {
        const li = document.createElement("li");
        if (a.miniatura) { const im = document.createElement("img"); im.src = a.miniatura; im.alt = ""; li.append(im); } else { const ic = document.createElement("span"); ic.className = "fr-cd-pdf"; ic.textContent = "PDF"; li.append(ic); }
        const nome = document.createElement("span"); nome.className = "fr-cd-nome"; nome.textContent = a.nome;
        const x = document.createElement("button"); x.type = "button"; x.className = "fr-ct-x"; x.textContent = "×"; x.setAttribute("aria-label", "Tirar " + a.nome);
        x.addEventListener("click", () => { arquivos.splice(i, 1); desenharLista(); });
        li.append(nome, x); ul.append(li);
      });
      $("fr-cd-ler").disabled = !arquivos.length;
    }

    async function escolher(lista) {
      aviso("");
      const novos = [...lista];
      for (const f of novos) {
        try {
          const pdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
          if (pdf) {
            if (arquivos.length) { aviso("Mande um PDF sozinho, ou só fotos."); continue; }
            if (f.size > MAX_PDF) { aviso("Esse PDF é pesado demais (máx. 2,8 MB). Tire fotos das páginas ou comprima o PDF."); continue; }
            arquivos = [{ nome: f.name, mime: "application/pdf", dados: await lerComoBase64(f), miniatura: "" }];
            break;
          }
          if (!/^image\/(jpeg|png)$/.test(f.type) && !/\.(jpe?g|png)$/i.test(f.name)) { aviso("Escolha uma foto (JPG ou PNG) ou um PDF."); continue; }
          if (arquivos.some((a) => a.mime === "application/pdf")) { aviso("Mande um PDF sozinho, ou só fotos."); continue; }
          if (arquivos.length >= MAX_FOTOS) { aviso(`Até ${MAX_FOTOS} fotos por vez.`); break; }
          const r = await reduzir(f);
          arquivos.push({ nome: f.name || "foto.jpg", mime: "image/jpeg", dados: r.dados, miniatura: r.miniatura });
        } catch (e) { aviso(e.message); }
      }
      desenharLista();
    }

    function mostrarUso(s) {
      uso = s; const p = $("fr-cd-uso");
      if (!s) { p.hidden = true; return; }
      p.hidden = false; p.textContent = `Você tem ${s.restantes} ${s.restantes === 1 ? "leitura" : "leituras"} hoje (de ${s.limite}). Cabem até ${s.limiteProdutos} produtos na loja.`;
    }
    async function carregarUso() {
      if (!FR.lerToken()) return mostrarUso(null);
      try { const r = await FR.chamar("GET", "/catalogo/cardapio"); if (r.status === 200) mostrarUso(r.corpo); else if (r.status === 401) FR.guardarToken(""); } catch { /* sem internet */ }
    }

    function lendo(sim) {
      $("fr-cd-lendo").hidden = !sim; $("fr-cd-envio").hidden = sim;
      clearInterval(relogio);
      if (!sim) return;
      let n = 0; const ini = Date.now();
      $("fr-cd-frase").textContent = FRASES[0]; $("fr-cd-tempo").textContent = "";
      relogio = setInterval(() => { n++; $("fr-cd-frase").textContent = FRASES[Math.min(FRASES.length - 1, Math.floor(n / 3))]; $("fr-cd-tempo").textContent = `${Math.round((Date.now() - ini) / 1000)} s`; }, 1000);
    }

    async function ler() {
      aviso("");
      if (!arquivos.length) return;
      if (!FR.lerToken()) return FR.pedirEntrada(ler, "", "Sua loja está quase saindo! Entre com o seu Vetorial ID para a Vênus ler o cardápio. É grátis, e uma conta só serve para todos os nossos apps.");
      ctl = new AbortController(); lendo(true);
      try {
        const r = await fetch(FR.API + "/catalogo/cardapio/ler", { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", authorization: `Bearer ${FR.lerToken()}` }, body: JSON.stringify({ arquivos: arquivos.map((a) => ({ mime: a.mime, dados: a.dados })) }) });
        const j = await r.json().catch(() => ({}));
        lendo(false);
        if (r.status === 401) { FR.guardarToken(""); return FR.pedirEntrada(ler, "Sua sessão venceu. Entre de novo para continuar."); }
        if (!r.ok) { if (j.limite !== undefined) mostrarUso(j); return aviso(j.error || "Não deu para ler agora. Tente de novo."); }
        mostrarUso(j);
        arquivos = []; desenharLista();
        $("aba-catalogo").click();
        await FR.aplicarCardapio({ itens: j.itens, nome: j.nome, cortados: j.cortados });
      } catch (e) {
        lendo(false);
        if (e && e.name === "AbortError") return aviso("Leitura cancelada.");
        aviso("Sem conexão com o servidor. Confira a internet e tente de novo.");
      } finally { ctl = null; }
    }

    $("fr-cd-arquivo").addEventListener("change", (e) => { escolher(e.target.files || []); e.target.value = ""; });
    $("fr-cd-ler").addEventListener("click", ler);
    $("fr-cd-cancelar").addEventListener("click", () => { if (ctl) ctl.abort(); });
    $("aba-cardapio").addEventListener("click", carregarUso);
    $("fr-cd-cta").addEventListener("click", () => { FR.modo(true, "aba-cardapio"); $("painel-cardapio").scrollIntoView({ block: "start" }); });
  };
  if (window.FR) arrancar(); else document.addEventListener("fr-pronto", arrancar, { once: true });
})();
