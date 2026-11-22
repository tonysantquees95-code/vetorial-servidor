// Panfleto grátis: o desenho é montado AQUI, no navegador (nada do que a pessoa digita ou a foto sai do aparelho).
// O servidor só conta quantos panfletos a conta gerou no dia (/panfleto/uso). Textos entram sempre como texto no canvas.
(() => {
  const iniciar = () => {
    const FR = window.FR;
    const { $, dizer, baixar } = FR;
    const API = FR.API;
    const FONTE = '"Segoe UI", Roboto, Arial, sans-serif';
    const FORMATOS = { a4: { w: 1240, h: 1754, pdf: [595.28, 841.89] }, quadrado: { w: 1080, h: 1080, pdf: [595.28, 595.28] } };
    const MAX_FOTO = 3 * 1024 * 1024;

    const marcado = (nome) => document.querySelector(`input[name="${nome}"]:checked`).value;
    const canvas = $("fr-pf-canvas");
    let foto = null;          // canvas já reduzido
    let qrImg = null, qrDe = ""; // QR do WhatsApp (imagem) e para qual link foi baixado
    let ilimitado = false;    // plano pago: sem marca "Feito com a Vênus"
    let gerado = false;       // já passou pelo "Gerar panfleto" (login + contagem)

    // ------------------------------------------------------------ texto dos campos
    const apenasDigitos = (t) => String(t || "").replace(/\D/g, "");
    const preco = (t) => { const v = String(t || "").trim(); return !v ? "" : /^\d/.test(v) ? "R$ " + v : v; };
    const telefone = (t) => {
      const d = apenasDigitos(t).replace(/^55(?=\d{10,11}$)/, "");
      if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
      if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return "";
    };
    const arroba = (t) => { const v = String(t || "").trim().replace(/^@+/, "").replace(/\s+/g, ""); return v ? "@" + v : ""; };
    const lerDados = () => ({
      modelo: marcado("fr-pf-modelo"), formato: marcado("fr-pf-formato"), cor: marcado("fr-pf-cor"),
      loja: $("fr-pf-loja").value.trim(), titulo: $("fr-pf-titulo").value.trim(), desc: $("fr-pf-desc").value.trim(),
      de: preco($("fr-pf-de").value), por: preco($("fr-pf-por").value),
      whats: apenasDigitos($("fr-pf-whats").value), fone: telefone($("fr-pf-whats").value),
      insta: arroba($("fr-pf-insta").value), validade: $("fr-pf-valid").value.trim(),
    });
    const linkDoWhats = (d) => { let n = d.whats; if (n.length < 10) return ""; if (n.length <= 11) n = "55" + n; return `https://wa.me/${n}`; };

    // ------------------------------------------------------------ desenho
    function caixa(x, c, x0, y0, w, h, r) {
      x.beginPath(); x.moveTo(x0 + r, y0); x.arcTo(x0 + w, y0, x0 + w, y0 + h, r); x.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
      x.arcTo(x0, y0 + h, x0, y0, r); x.arcTo(x0, y0, x0 + w, y0, r); x.closePath();
    }
    function quebrar(x, texto, larg) {
      const linhas = []; let atual = "";
      for (const palavra of String(texto).split(/\s+/).filter(Boolean)) {
        let p = palavra;
        while (x.measureText(p).width > larg) { // palavra maior que a linha: corta
          let n = p.length; while (n > 1 && x.measureText(p.slice(0, n)).width > larg) n--;
          if (atual) { linhas.push(atual); atual = ""; }
          linhas.push(p.slice(0, n)); p = p.slice(n);
        }
        const t = atual ? atual + " " + p : p;
        if (atual && x.measureText(t).width > larg) { linhas.push(atual); atual = p; } else atual = t;
      }
      if (atual) linhas.push(atual);
      return linhas;
    }
    /** Escreve texto com quebra e no máximo `max` linhas (o resto vira “…”). Devolve o y logo abaixo. */
    function escrever(x, texto, px, py, larg, { tam, peso = 700, cor = "#000", alinhar = "left", max = 3, ent = 1.15 }) {
      if (!texto) return py;
      x.font = `${peso} ${tam}px ${FONTE}`; x.fillStyle = cor; x.textAlign = alinhar; x.textBaseline = "top";
      let linhas = quebrar(x, texto, larg);
      if (linhas.length > max) {
        linhas = linhas.slice(0, max);
        let u = linhas[max - 1];
        while (u.length > 1 && x.measureText(u + "…").width > larg) u = u.slice(0, -1);
        linhas[max - 1] = u.replace(/[\s.,;:!-]+$/, "") + "…";
      }
      const ax = alinhar === "center" ? px + larg / 2 : alinhar === "right" ? px + larg : px;
      linhas.forEach((l, i) => x.fillText(l, ax, py + i * tam * ent));
      return py + linhas.length * tam * ent;
    }
    function fotoEm(x, img, x0, y0, w, h, r) {
      x.save(); caixa(x, null, x0, y0, w, h, r); x.clip();
      const e = Math.max(w / img.width, h / img.height), dw = img.width * e, dh = img.height * e;
      x.drawImage(img, x0 + (w - dw) / 2, y0 + (h - dh) / 2, dw, dh); x.restore();
    }
    function riscado(x, texto, px, py, tam, cor, alinhar = "left") {
      x.font = `600 ${tam}px ${FONTE}`; x.fillStyle = cor; x.textAlign = alinhar; x.textBaseline = "top";
      x.fillText(texto, px, py);
      const w = x.measureText(texto).width, ini = alinhar === "center" ? px - w / 2 : px;
      x.strokeStyle = cor; x.lineWidth = Math.max(3, tam / 14); x.beginPath(); x.moveTo(ini - 4, py + tam * 0.55); x.lineTo(ini + w + 4, py + tam * 0.55); x.stroke();
    }

    /** Rodapé: contatos à esquerda, QR do WhatsApp à direita, marca da Vênus por último. Devolve a altura usada. */
    function rodape(x, W, H, d, fundo, texto, destaque, marca) {
      const u = W / 1000, fh = (H > W * 1.2 ? 190 : 170) * u;
      x.fillStyle = fundo; x.fillRect(0, H - fh, W, fh);
      const m = 50 * u, qr = fh - 50 * u;
      const temQr = !!(qrImg && linkDoWhats(d));
      const larg = W - m * 2 - (temQr ? qr + 24 * u : 0);
      let y = H - fh + 30 * u;
      if (d.fone) y = escrever(x, "WhatsApp  " + d.fone, m, y, larg, { tam: 34 * u, peso: 800, cor: destaque, max: 1 }) + 6 * u;
      if (d.insta) y = escrever(x, "Instagram  " + d.insta, m, y, larg, { tam: 28 * u, peso: 600, cor: texto, max: 1 }) + 4 * u;
      if (d.validade) escrever(x, d.validade, m, y, larg, { tam: 24 * u, peso: 500, cor: texto, max: 2, ent: 1.2 });
      if (temQr) {
        const qx = W - m - qr, qy = H - fh + 25 * u;
        x.fillStyle = "#fff"; caixa(x, null, qx - 8 * u, qy - 8 * u, qr + 16 * u, qr + 16 * u, 14 * u); x.fill();
        x.drawImage(qrImg, qx, qy, qr, qr);
      }
      if (marca) escrever(x, "Feito com a Vênus", 0, H - 30 * u, W - m, { tam: 18 * u, peso: 600, cor: texto, alinhar: "right", max: 1 });
      return fh;
    }

    function desenhar(x, d, marca) {
      const { w: W, h: H } = FORMATOS[d.formato];
      const u = W / 1000, alto = H > W * 1.2, m = 60 * u;
      x.clearRect(0, 0, W, H);

      if (d.modelo === "promo") {
        x.fillStyle = d.cor; x.fillRect(0, 0, W, H);
        let y = m;
        y = escrever(x, d.loja.toUpperCase(), m, y, W - m * 2, { tam: 34 * u, peso: 800, cor: "#ffffffcc", max: 1 }) + 18 * u;
        y = escrever(x, d.titulo || "Sua oferta aqui", m, y, W - m * 2, { tam: (alto ? 112 : 84) * u, peso: 900, cor: "#fff", max: alto ? 3 : 2, ent: 1.05 }) + 14 * u;
        y = escrever(x, d.desc, m, y, W - m * 2, { tam: 36 * u, peso: 500, cor: "#fff", max: 3 }) + 24 * u;
        const fh = rodape(x, W, H, d, "#ffffff", "#444", d.cor, marca);
        const cartaoH = (d.de ? 330 : 250) * u * (alto ? 1 : 0.85), cy = H - fh - cartaoH - 30 * u;
        if (foto && cy - y > 160 * u) fotoEm(x, foto, m, y, W - m * 2, cy - y - 24 * u, 28 * u);
        x.fillStyle = "#fff"; caixa(x, null, m, cy, W - m * 2, cartaoH, 30 * u); x.fill();
        let py = cy + 26 * u;
        if (d.de) { riscado(x, "de " + d.de, W / 2, py, 40 * u, "#888", "center"); py += 58 * u; }
        if (d.por) {
          escrever(x, "POR APENAS", m, py, W - m * 2, { tam: 28 * u, peso: 700, cor: "#666", alinhar: "center", max: 1 });
          let t = 150 * u; x.font = `900 ${t}px ${FONTE}`;
          while (t > 40 * u && x.measureText(d.por).width > W - m * 2 - 40 * u) { t -= 4 * u; x.font = `900 ${t}px ${FONTE}`; }
          escrever(x, d.por, m, py + 34 * u, W - m * 2, { tam: t, peso: 900, cor: d.cor, alinhar: "center", max: 1, ent: 1 });
        } else {
          escrever(x, "Fale com a gente", m, py + 40 * u, W - m * 2, { tam: 60 * u, peso: 900, cor: d.cor, alinhar: "center", max: 1 });
        }
      } else if (d.modelo === "lanc") {
        x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
        const fh = rodape(x, W, H, d, d.cor, "#ffffffdd", "#fff", marca);
        const fotoH = (alto ? 0.46 : 0.42) * H;
        if (foto) fotoEm(x, foto, 0, 0, W, fotoH, 0);
        else { x.fillStyle = d.cor; x.fillRect(0, 0, W, fotoH); escrever(x, d.loja || "Novidade", m, fotoH / 2 - 50 * u, W - m * 2, { tam: 96 * u, peso: 900, cor: "#ffffffee", alinhar: "center", max: 2 }); }
        let y = fotoH + 34 * u;
        x.fillStyle = d.cor; caixa(x, null, m, y, 250 * u, 52 * u, 26 * u); x.fill();
        escrever(x, "LANÇAMENTO", m, y + 11 * u, 250 * u, { tam: 28 * u, peso: 800, cor: "#fff", alinhar: "center", max: 1 });
        y += 78 * u;
        y = escrever(x, d.titulo || "Novidade chegando", m, y, W - m * 2, { tam: (alto ? 84 : 66) * u, peso: 900, cor: "#1b1b24", max: 2, ent: 1.05 }) + 10 * u;
        y = escrever(x, d.desc, m, y, W - m * 2, { tam: 32 * u, peso: 500, cor: "#555", max: 2 }) + 14 * u;
        if (d.de) { riscado(x, "de " + d.de, m, y, 32 * u, "#999"); y += 46 * u; }
        if (d.por && y + 80 * u < H - fh) escrever(x, d.por, m, y, W - m * 2, { tam: 92 * u, peso: 900, cor: d.cor, max: 1, ent: 1 });
      } else {
        x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
        x.fillStyle = d.cor; x.fillRect(0, 0, W, (alto ? 170 : 130) * u);
        escrever(x, d.loja || "Sua loja", m, (alto ? 170 : 130) * u / 2 - 22 * u, W - m * 2, { tam: 44 * u, peso: 900, cor: "#fff", alinhar: "center", max: 1 });
        const fh = rodape(x, W, H, d, "#f3f3f6", "#555", d.cor, marca);
        let y = (alto ? 300 : 200) * u;
        y = escrever(x, d.titulo || "Sua oferta aqui", m, y, W - m * 2, { tam: (alto ? 120 : 88) * u, peso: 900, cor: "#1b1b24", alinhar: "center", max: alto ? 3 : 2, ent: 1.05 }) + 28 * u;
        y = escrever(x, d.desc, m, y, W - m * 2, { tam: 40 * u, peso: 500, cor: "#555", alinhar: "center", max: 4, ent: 1.25 }) + 40 * u;
        if (d.de) { riscado(x, "de " + d.de, W / 2, y, 40 * u, "#999", "center"); y += 60 * u; }
        if (d.por && y + 100 * u < H - fh) {
          let t = 170 * u; x.font = `900 ${t}px ${FONTE}`;
          while (t > 40 * u && x.measureText(d.por).width > W - m * 2) { t -= 4 * u; x.font = `900 ${t}px ${FONTE}`; }
          escrever(x, d.por, m, y, W - m * 2, { tam: t, peso: 900, cor: d.cor, alinhar: "center", max: 1, ent: 1 });
        }
      }
    }

    function redesenhar() {
      const d = lerDados(), f = FORMATOS[d.formato];
      if (canvas.width !== f.w || canvas.height !== f.h) { canvas.width = f.w; canvas.height = f.h; }
      desenhar(canvas.getContext("2d"), d, !ilimitado);
    }
    let espera = 0;
    const adiar = () => { clearTimeout(espera); espera = setTimeout(redesenhar, 120); };

    // ------------------------------------------------------------ QR do WhatsApp (o mesmo gerador livre do site)
    let vezQr = 0;
    async function atualizarQr() {
      const link = linkDoWhats(lerDados());
      if (link === qrDe) return;
      qrDe = link;
      const minha = ++vezQr;
      if (!link) { qrImg = null; return redesenhar(); }
      try {
        const r = await fetch(`${API}/ferramentas/qr?texto=${encodeURIComponent(link)}&cor=%23000000`);
        if (!r.ok || minha !== vezQr) return;
        const url = URL.createObjectURL(new Blob([await r.text()], { type: "image/svg+xml" }));
        const im = new Image();
        im.onload = () => { if (minha === vezQr) { qrImg = im; redesenhar(); } URL.revokeObjectURL(url); };
        im.onerror = () => URL.revokeObjectURL(url);
        im.src = url;
      } catch { /* sem internet: o panfleto sai sem QR */ }
    }

    // ------------------------------------------------------------ foto (só no aparelho; reduzida antes de entrar no desenho)
    $("fr-pf-foto").addEventListener("change", async (e) => {
      const arq = e.target.files && e.target.files[0], info = $("fr-pf-foto-info");
      foto = null;
      if (!arq) { info.textContent = "JPG ou PNG de até 3 MB. A foto fica só no seu aparelho."; return redesenhar(); }
      if (!/^image\/(png|jpeg)$/.test(arq.type)) { e.target.value = ""; info.textContent = "Use uma foto JPG ou PNG."; return redesenhar(); }
      if (arq.size > MAX_FOTO) { e.target.value = ""; info.textContent = "Essa foto passa de 3 MB. Escolha uma menor."; return redesenhar(); }
      const url = URL.createObjectURL(arq), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1400 / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        foto = c; URL.revokeObjectURL(url); info.textContent = "Foto pronta. Escolha outra para trocar."; redesenhar();
      };
      im.onerror = () => { URL.revokeObjectURL(url); e.target.value = ""; info.textContent = "Não consegui abrir essa foto. Tente outra."; };
      im.src = url;
    });

    // ------------------------------------------------------------ gerar (login + contagem) e baixar
    const aviso = (t) => dizer("fr-pf-aviso", t);
    function mostrarLimite(s) {
      const e = $("fr-pf-limite");
      if (!s || s.ilimitado) { e.hidden = true; return; }
      e.textContent = s.restantes === 0 ? "Você já gerou os 2 panfletos de hoje. Volte amanhã ou conheça os planos da Vênus." : s.restantes === 1 ? "Você ainda pode gerar 1 panfleto hoje." : "Você pode gerar 2 panfletos por dia, de graça.";
      e.hidden = false;
    }
    async function gerar() {
      aviso("");
      const d = lerDados();
      if (!d.titulo && !d.loja) return aviso("Preencha pelo menos o nome da loja ou o título da oferta.");
      if (!FR.lerToken()) return FR.pedirEntrada(gerar, "", "Seu panfleto está quase pronto! Entre com o seu Vetorial ID para gerar e baixar. É grátis, uma conta só serve para todos os nossos apps e assim a gente melhora as ferramentas.");
      const botao = $("fr-pf-gerar"); botao.disabled = true;
      try {
        const r = await FR.chamar("POST", "/panfleto/uso");
        if (r.status === 401) { FR.guardarToken(""); return FR.pedirEntrada(gerar, "Sua sessão venceu. Entre de novo para continuar."); }
        if (r.status === 429) { mostrarLimite(r.corpo); return aviso("Você já gerou os 2 panfletos grátis de hoje. Volte amanhã ou conheça os planos da Vênus."); }
        if (r.status !== 200) return aviso(r.corpo.error || "Não consegui gerar agora. Tente de novo.");
        ilimitado = !!r.corpo.ilimitado; gerado = true;
        mostrarLimite(r.corpo); redesenhar();
        $("fr-pf-baixar").hidden = false;
      } catch {
        aviso("Sem internet para gerar o panfleto. Conecte-se e tente de novo.");
      } finally { botao.disabled = false; }
    }
    $("fr-pf-gerar").addEventListener("click", gerar);

    const nomeBase = () => (lerDados().titulo || lerDados().loja || "panfleto").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "panfleto";
    $("fr-pf-png").addEventListener("click", () => {
      if (!gerado) return;
      canvas.toBlob((b) => { if (b) baixar(`panfleto-${nomeBase()}.png`, b); else aviso("Não consegui montar a imagem agora."); }, "image/png");
    });
    $("fr-pf-pdf").addEventListener("click", () => {
      if (!gerado) return;
      canvas.toBlob(async (b) => {
        if (!b) return aviso("Não consegui montar o PDF agora.");
        const f = FORMATOS[lerDados().formato];
        baixar(`panfleto-${nomeBase()}.pdf`, new Blob([pdfComJpeg(await jpegDoCanvas(), canvas.width, canvas.height, f.pdf[0], f.pdf[1])], { type: "application/pdf" }));
      }, "image/jpeg", 0.92);
    });
    async function jpegDoCanvas() { // fundo branco por baixo (JPEG não tem transparência)
      const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0);
      const b = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.92));
      return new Uint8Array(await b.arrayBuffer());
    }

    /** PDF de uma página só, com a imagem JPEG ocupando a folha toda. */
    function pdfComJpeg(jpeg, pw, ph, largPt, altPt) {
      const enc = new TextEncoder(), partes = [], pos = []; let tam = 0;
      const add = (p) => { const b = typeof p === "string" ? enc.encode(p) : p; partes.push(b); tam += b.length; };
      const obj = (n, corpo) => { pos[n] = tam; add(`${n} 0 obj\n`); corpo(); add("\nendobj\n"); };
      add("%PDF-1.4\n%âãÏÓ\n");
      obj(1, () => add("<< /Type /Catalog /Pages 2 0 R >>"));
      obj(2, () => add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
      obj(3, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${largPt.toFixed(2)} ${altPt.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
      obj(4, () => { add(`<< /Type /XObject /Subtype /Image /Width ${pw} /Height ${ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); add(jpeg); add("\nendstream"); });
      const conteudo = `q ${largPt.toFixed(2)} 0 0 ${altPt.toFixed(2)} 0 0 cm /Im0 Do Q`;
      obj(5, () => add(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`));
      const xref = tam;
      add(`xref\n0 6\n0000000000 65535 f \n` + [1, 2, 3, 4, 5].map((n) => String(pos[n]).padStart(10, "0") + " 00000 n \n").join(""));
      add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      const saida = new Uint8Array(tam); let o = 0;
      for (const p of partes) { saida.set(p, o); o += p.length; }
      return saida;
    }

    // ------------------------------------------------------------ eventos
    for (const id of ["fr-pf-loja", "fr-pf-titulo", "fr-pf-desc", "fr-pf-de", "fr-pf-por", "fr-pf-insta", "fr-pf-valid"]) $(id).addEventListener("input", adiar);
    $("fr-pf-whats").addEventListener("input", () => { adiar(); clearTimeout(atualizarQr.t); atualizarQr.t = setTimeout(atualizarQr, 500); });
    for (const n of ["fr-pf-modelo", "fr-pf-formato", "fr-pf-cor"]) for (const r of document.querySelectorAll(`input[name="${n}"]`)) r.addEventListener("change", redesenhar);

    // se a pessoa já entrou antes, mostra quantos ainda restam e já tira a marca quando o plano permite
    (async () => {
      if (!FR.lerToken()) return;
      try { const r = await FR.chamar("GET", "/panfleto/uso"); if (r.status === 200) { ilimitado = !!r.corpo.ilimitado; mostrarLimite(r.corpo); } else if (r.status === 401) FR.guardarToken(""); } catch { /* sem internet */ }
      redesenhar();
    })();

    window.__panfleto = { redesenhar, pdfComJpeg }; // usado só pelo teste visual
    redesenhar();
  };
  if (window.FR) iniciar(); else document.addEventListener("fr-pronto", iniciar, { once: true });
})();
