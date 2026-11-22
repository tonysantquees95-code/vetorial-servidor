// Telas do site que o teste visual visita: [nome, página, passos].
const REAIS = ["venus", "vindex", "vortex", "vyntem"];
const APPS = ["venus", "vindex", "vortex", "velox", "vyntem", "voxix"];
const ABA = (p, id) => p.locator("#abas button").nth(APPS.indexOf(id));
const ESPERA = (p) => p.waitForTimeout(350);
const pagina = (nome, arq) => [nome, arq, async (p) => { await p.evaluate(() => document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel"))); }];

export default {
  porta: 4191,
  cenarios: [
    ["home", "", async () => {}],
    ...APPS.map((id) => [`home-simulador-${id}`, "", async (p) => {
      await p.locator("#simulador").scrollIntoViewIfNeeded();
      await ABA(p, id).click(); await ESPERA(p);
      if ((await ABA(p, id).getAttribute("aria-selected")) !== "true") throw new Error(`a aba de ${id} não ficou selecionada`);
      if (REAIS.includes(id) && (await p.locator("#tela iframe").count())) { // o app de verdade, em /demo/<app>/, dentro do celular
        const f = p.frameLocator("#tela iframe"); await f.locator("body").waitFor();
        await p.waitForFunction(() => { const d = document.querySelector("#tela iframe")?.contentDocument; return d && d.body && d.body.innerText.trim().length > 20; }, null, { timeout: 15000 }).catch(() => { throw new Error(`o app ${id} não abriu dentro do celular`); });
        if (id === "venus") { // pergunta de verdade à Vênus e espera a resposta pronta
          const campo = f.locator("input, textarea").first(); await campo.fill("Qual o prazo de entrega?"); await campo.press("Enter");
          await f.getByText("dias úteis").first().waitFor({ timeout: 8000 }).catch(() => { throw new Error("a Vênus da demonstração não respondeu"); });
          return;
        }
        const abas = await f.locator("nav button:visible").all();
        for (const b of abas.slice(0, 4)) { await b.click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(250); }
        await p.locator("#simulador").scrollIntoViewIfNeeded();
        return;
      }
      if (!(await p.locator("#tela").innerText()).trim()) throw new Error(`a tela de ${id} ficou vazia`);
      for (const b of await p.locator("#tela button:visible").all()) { await b.click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(120); }
      await p.locator("#simulador").scrollIntoViewIfNeeded();
    }]),
    ["home-video-venus", "", async (p) => {
      await p.locator("#video-venus").scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
      const ok = await p.evaluate(() => { const v = document.getElementById("video-venus-el"); return v && v.readyState >= 1 && v.videoWidth > 0; });
      if (!ok) throw new Error("o vídeo da Vênus não carregou");
      await p.locator("#video-venus-bt").click();
    }],
    ["home-guia-android", "", async (p) => {
      await p.locator("#dl-android").scrollIntoViewIfNeeded(); await p.locator("#dl-android").click(); await ESPERA(p);
      if (!(await p.locator("#guia").isVisible())) throw new Error("a janelinha do Android não abriu");
    }],
    ["home-guia-fecha", "", async (p) => {
      await p.locator("#dl-android").scrollIntoViewIfNeeded(); await p.locator("#dl-android").click(); await ESPERA(p);
      await p.keyboard.press("Escape"); await ESPERA(p);
      if (await p.locator("#guia").isVisible()) throw new Error("Esc não fechou a janelinha");
    }],
    ["home-precos", "", async (p) => { await p.locator("#preco").scrollIntoViewIfNeeded(); }],
    ["home-baixar", "", async (p) => { await p.locator("#baixar").scrollIntoViewIfNeeded(); }],
    ["voxix-espera-erro", "voxix.html", async (p) => {
      await p.evaluate(() => document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel", "v")));
      await p.locator("#espera").scrollIntoViewIfNeeded();
      await p.fill("#espera-email", "isso-nao-e-email"); await p.click("#form-espera button");
      await ESPERA(p);
      if (!/não parece certo/.test(await p.locator("#espera-msg").innerText())) throw new Error("e-mail errado não mostrou o aviso");
    }],
    ["voxix-espera-ok", "voxix.html", async (p) => {
      await p.evaluate(() => document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel", "v")));
      let enviado = null;
      await p.route("**/voxix/espera", async (r) => {
        if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" } });
        enviado = JSON.parse(r.request().postData() || "{}");
        return r.fulfill({ status: 201, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"ok":true}' });
      });
      await p.locator("#espera").scrollIntoViewIfNeeded();
      await p.fill("#espera-email", "pessoa@exemplo.com"); await p.click("#form-espera button");
      await ESPERA(p);
      if (!/Pronto/.test(await p.locator("#espera-msg").innerText())) throw new Error("o aviso de sucesso não apareceu");
      if (!enviado || enviado.email !== "pessoa@exemplo.com" || enviado.site !== "") throw new Error("o pedido saiu errado");
    }],
    ["ferramentas-qr", "vitrine/#ferramentas", async (p) => {
      await p.evaluate(() => document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel", "v")));
      let pedido = "";
      await p.route("**/ferramentas/qr**", async (r) => {
        pedido = r.request().url();
        return r.fulfill({ status: 200, contentType: "image/svg+xml", headers: { "access-control-allow-origin": "*" }, body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><rect width="29" height="29" fill="#fff"/><path d="M4,4h7v7h-7z M18,4h7v7h-7z M4,18h7v7h-7z" fill="#000"/></svg>' });
      });
      await p.click("#aba-qr");
      if (!(await p.locator("#painel-qr").isVisible())) throw new Error("a aba do QR code não abriu");
      await p.fill("#fr-q-url", "minhaloja.com.br"); await p.waitForTimeout(900);
      if (!(await p.locator("#fr-qr-img").isVisible())) throw new Error("a prévia do QR code não apareceu");
      if (await p.locator("#fr-baixar-png").isDisabled()) throw new Error("o botão de baixar ficou desligado");
      if (!pedido.includes(encodeURIComponent("https://minhaloja.com.br"))) throw new Error("o QR foi pedido com o endereço errado: " + pedido);
      await p.click('label.fr-op:has(input[value="whats"])'); await p.fill("#fr-q-fone", "(51) 99999-8888"); await p.waitForTimeout(900);
      if (!decodeURIComponent(pedido).includes("https://wa.me/5551999998888")) throw new Error("o QR do WhatsApp saiu errado: " + pedido);
    }],
    ["ferramentas-pede-id", "vitrine/#ferramentas", async (p) => {
      await p.evaluate(() => { document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel", "v")); try { localStorage.clear(); } catch {} });
      await p.fill("#fr-destino", "minhaloja.com.br/promocao"); await p.click("#fr-encurtar"); await ESPERA(p);
      if (!(await p.locator("#fr-janela").isVisible())) throw new Error("sem login, a janela do Vetorial ID não apareceu");
      if (!(await p.locator("#fr-j-entrar").isVisible())) throw new Error("o botão de entrar não está visível");
      await p.keyboard.press("Escape"); await ESPERA(p);
      if (await p.locator("#fr-janela").isVisible()) throw new Error("Esc não fechou a janela");
    }],
    ["panfleto-pede-id", "vitrine/#ferramentas", async (p) => {
      await p.evaluate(() => { document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel", "v")); try { localStorage.clear(); } catch {} });
      await p.click("#aba-panfleto");
      if (!(await p.locator("#painel-panfleto").isVisible())) throw new Error("a aba do panfleto não abriu");
      await p.fill("#fr-pf-loja", "Loja da Ana"); await p.fill("#fr-pf-titulo", "Semana do Cliente com descontos de verdade em toda a loja"); await p.fill("#fr-pf-por", "49,90"); await p.fill("#fr-pf-de", "79,90");
      await p.fill("#fr-pf-whats", "(51) 99999-8888"); await p.fill("#fr-pf-insta", "lojadaana"); await p.waitForTimeout(400);
      if (await p.locator("#fr-pf-baixar").isVisible()) throw new Error("os botões de baixar apareceram antes de gerar");
      await p.click("#fr-pf-gerar"); await ESPERA(p);
      if (!(await p.locator("#fr-janela").isVisible())) throw new Error("sem login, a janela do Vetorial ID não apareceu ao gerar");
      if (!/panfleto/i.test(await p.locator("#fr-j-texto").innerText())) throw new Error("a janela não explica que é para o panfleto");
    }],
    ...["promo", "lanc", "simples"].flatMap((modelo) => ["a4", "quadrado"].map((formato) => [`panfleto-${modelo}-${formato}`, "vitrine/#ferramentas", async (p) => {
      await p.evaluate(() => { document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel", "v")); localStorage.setItem("ferramentas.token", "token-de-teste"); });
      let uso = 0;
      await p.route("**/panfleto/uso", async (r) => {
        const cab = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
        const m = r.request().method();
        if (m === "OPTIONS") return r.fulfill({ status: 204, headers: cab });
        if (m === "POST") uso++;
        return r.fulfill({ status: 200, contentType: "application/json", headers: cab, body: JSON.stringify({ ok: true, ilimitado: false, limite: 2, usados: uso, restantes: 2 - uso }) });
      });
      await p.route("**/ferramentas/qr**", async (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", headers: { "access-control-allow-origin": "*" }, body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><rect width="29" height="29" fill="#fff"/><path d="M4,4h7v7h-7z M18,4h7v7h-7z M4,18h7v7h-7z" fill="#000"/></svg>' }));
      await p.click("#aba-panfleto");
      await p.click(`label.fr-op:has(input[value="${modelo}"])`); await p.click(`label.fr-op:has(input[value="${formato}"])`);
      await p.fill("#fr-pf-loja", "Loja da Ana"); await p.fill("#fr-pf-titulo", "Semana do Cliente"); await p.fill("#fr-pf-desc", "Todos os produtos com frete grátis para Porto Alegre.");
      await p.fill("#fr-pf-por", "49,90"); await p.fill("#fr-pf-de", "79,90"); await p.fill("#fr-pf-whats", "(51) 99999-8888"); await p.fill("#fr-pf-insta", "lojadaana"); await p.fill("#fr-pf-valid", "Até 30/11 ou enquanto durar o estoque");
      await p.waitForTimeout(900);
      await p.click("#fr-pf-gerar"); await ESPERA(p);
      if (uso !== 1) throw new Error("o uso do panfleto não foi contado uma vez");
      if (!(await p.locator("#fr-pf-baixar").isVisible())) throw new Error("os botões de baixar não apareceram depois de gerar");
      const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 8000 }), p.click("#fr-pf-pdf")]);
      if (!/^panfleto-.*\.pdf$/.test(dl.suggestedFilename())) throw new Error("nome do PDF estranho: " + dl.suggestedFilename());
      const [dl2] = await Promise.all([p.waitForEvent("download", { timeout: 8000 }), p.click("#fr-pf-png")]);
      if (!/\.png$/.test(dl2.suggestedFilename())) throw new Error("nome da imagem estranho: " + dl2.suggestedFilename());
      if (uso !== 1) throw new Error("baixar de novo não deveria gastar outro panfleto");
      await p.locator("#painel-panfleto").scrollIntoViewIfNeeded();
    }])),
    ...[["logo-vitrine", false], ["logo-bloqueado", true], ["logo-criar", false]].map(([nome, bloqueado]) => [nome, "vitrine/#ferramentas", async (p) => {
      const cab = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
      const cats = ["moderno", "elegante", "classico", "divertido", "forte", "natural", "luxo", "minimalista"].map((id) => ({ id, nome: id[0].toUpperCase() + id.slice(1) }));
      const modelos = cats.flatMap((c) => [1, 2, 3, 4, 5, 6].map((n) => ({ id: `${c.id}-${n}`, nome: `${c.nome} ${n}`, categoria: c.id, gratis: n === 1 || (c.id === "elegante" && n === 2) })));
      const svg = (cor) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" width="360" height="360"><rect width="360" height="360" rx="34" fill="${cor}"/><circle cx="180" cy="130" r="70" fill="#fff" fill-opacity=".3"/><text x="180" y="260" text-anchor="middle" font-size="46" font-weight="800" fill="#fff">Logo</text></svg>`;
      let criou = 0, corpoPost = null;
      await p.route(/\/ferramentas\/logo/, async (r) => {
        const u = new URL(r.request().url()), m = r.request().method();
        if (m === "OPTIONS") return r.fulfill({ status: 204, headers: cab });
        if (u.pathname.endsWith("/modelos")) return r.fulfill({ status: 200, contentType: "application/json", headers: cab, body: JSON.stringify({ limite: 2, categorias: cats, modelos }) });
        if (u.pathname.endsWith("/previa")) return r.fulfill({ status: 200, contentType: "image/svg+xml", headers: cab, body: svg(["#c2185b", "#1d4ed8", "#15803d", "#c2410c", "#6d4aff", "#0e9f8e"][u.searchParams.get("modelo").length % 6]) });
        if (u.pathname.endsWith("/situacao")) return r.fulfill({ status: 200, contentType: "application/json", headers: cab, body: JSON.stringify({ ilimitado: false, assinante: false, limite: 2, usados: criou, restantes: 2 - criou }) });
        criou++; corpoPost = JSON.parse(r.request().postData() || "{}");
        return r.fulfill({ status: 200, contentType: "application/json", headers: cab, body: JSON.stringify({ ok: true, ilimitado: false, assinante: false, limite: 2, usados: criou, restantes: 2 - criou, svg: svg("#c2185b") }) });
      });
      await p.evaluate(() => { document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel", "v")); try { localStorage.clear(); } catch {} });
      if (nome === "logo-criar") await p.evaluate(() => localStorage.setItem("ferramentas.token", "token-de-teste"));
      await p.click("#aba-logo");
      await p.waitForSelector(".fr-lg-modelo");
      const total = await p.locator(".fr-lg-modelo").count();
      if (total !== 48) throw new Error("a vitrine deveria mostrar 48 modelos e mostrou " + total);
      if ((await p.locator(".fr-lg-selo.tranca").count()) !== 39) throw new Error("deveria haver 39 modelos bloqueados à mostra (mock)");
      await p.fill("#fr-lg-nome", "Loja da Ana"); await p.fill("#fr-lg-sub", "Moda e presentes");
      await p.click('#fr-lg-cats button:has-text("Só os grátis")');
      if ((await p.locator(".fr-lg-modelo").count()) !== 9) throw new Error("o filtro de grátis deveria mostrar só os livres (mock: 9)");
      await p.click('#fr-lg-cats button:has-text("Todos")');
      if (bloqueado) {
        await p.click('.fr-lg-modelo[aria-label^="Luxo 3,"]'); await ESPERA(p);
        if (!(await p.locator("#fr-lg-convite").isVisible())) throw new Error("o convite da assinatura não apareceu no modelo bloqueado");
        if ((await p.locator('.fr-lg-modelo[aria-pressed="true"]').count()) !== 1) throw new Error("o modelo escolhido não ficou marcado");
        await p.click("#fr-lg-criar"); await ESPERA(p);
        if (criou) throw new Error("modelo bloqueado não deveria tentar criar sem assinatura");
        await p.locator("#fr-lg-convite").scrollIntoViewIfNeeded();
      } else if (nome === "logo-criar") {
        await p.click('.fr-lg-modelo[aria-label^="Moderno 1,"]'); await p.click("#fr-lg-criar"); await ESPERA(p);
        if (criou !== 1 || !corpoPost || corpoPost.modelo !== "moderno-1" || corpoPost.nome !== "Loja da Ana" || corpoPost.subtitulo !== "Moda e presentes") throw new Error("o pedido de criação saiu errado");
        if (!(await p.locator("#fr-lg-pronto").isVisible())) throw new Error("o logo pronto não apareceu");
        const [d1] = await Promise.all([p.waitForEvent("download", { timeout: 8000 }), p.click("#fr-lg-svg")]);
        if (!/^logo-loja-da-ana\.svg$/.test(d1.suggestedFilename())) throw new Error("nome do SVG estranho: " + d1.suggestedFilename());
        const [d2] = await Promise.all([p.waitForEvent("download", { timeout: 8000 }), p.click("#fr-lg-png")]);
        if (!/\.png$/.test(d2.suggestedFilename())) throw new Error("nome do PNG estranho: " + d2.suggestedFilename());
        if (criou !== 1) throw new Error("baixar não deveria gastar outro logo");
        await p.locator("#fr-lg-pronto").scrollIntoViewIfNeeded();
      } else {
        await p.click('.fr-lg-modelo[aria-label^="Moderno 1,"]'); await p.click("#fr-lg-criar"); await ESPERA(p);
        if (!(await p.locator("#fr-janela").isVisible())) throw new Error("sem login, a janela do Vetorial ID não apareceu ao criar o logo");
        if (!/logo/i.test(await p.locator("#fr-j-texto").innerText())) throw new Error("a janela não explica que é para o logo");
        await p.keyboard.press("Escape");
        await p.locator("#fr-lg-grade").scrollIntoViewIfNeeded();
      }
    }]),
    ...[["catalogo-login", false], ["catalogo-publicar", true]].map(([nome, logado]) => [nome, "vitrine/#ferramentas", async (p) => {
      const cab = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
      const cores = ["#c2185b", "#1d4ed8", "#15803d", "#c2410c", "#6d4aff", "#0e9f8e"];
      const temas = [["claro", "Claro", true], ["escuro", "Escuro", true], ["boutique", "Boutique", false], ["gourmet", "Gourmet", false], ["tech", "Tech", false], ["natural", "Natural", false]].map(([id, nome, gratis]) => ({ id, nome, gratis }));
      let postado = null;
      await p.route(/\/catalogo(\/|$)/, async (r) => {
        const u = new URL(r.request().url()), m = r.request().method();
        if (m === "OPTIONS") return r.fulfill({ status: 204, headers: cab });
        const j = (status, corpo) => r.fulfill({ status, contentType: "application/json", headers: cab, body: JSON.stringify(corpo) });
        if (u.pathname.endsWith("/modelos")) return j(200, { limiteGratis: 12, limitePago: 60, cores, temas });
        if (u.pathname.endsWith("/previa")) return j(200, { html: '<body style="font-family:system-ui;margin:0;padding:24px"><h1>Loja da Ana</h1><p>Prévia do catálogo</p></body>', erros: [] });
        if (m === "GET") return j(200, { catalogo: null, assinante: false, limiteProdutos: 12 });
        postado = JSON.parse(r.request().postData() || "{}");
        return j(200, { ok: true, assinante: false, limiteProdutos: 12, catalogo: { slug: "loja-da-ana", nome: postado.nome, whats: "5551999998888", descricao: "", tema: postado.tema, cor: postado.cor, produtos: postado.produtos.map((x) => ({ ...x, foto: "" })), visitas: 0, link: "https://v.test/c/loja-da-ana" } });
      });
      await p.evaluate(() => { document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel", "v")); try { localStorage.clear(); } catch {} });
      if (logado) await p.evaluate(() => localStorage.setItem("ferramentas.token", "token-de-teste"));
      await p.click("#aba-catalogo");
      await p.waitForSelector("#fr-ct-temas button");
      if ((await p.locator("#fr-ct-temas button").count()) !== 6) throw new Error("deveriam aparecer os 6 temas (grátis e bloqueados)");
      if ((await p.locator("#fr-ct-cores button").count()) !== 6) throw new Error("deveriam aparecer as 6 cores");
      await p.fill("#fr-ct-nome", "Loja da Ana"); await p.fill("#fr-ct-whats", "(51) 99999-8888");
      await p.fill('#fr-ct-produtos input[aria-label="Nome do produto"]', "Vestido azul"); await p.fill('#fr-ct-produtos input[aria-label="Preço (R$)"]', "129,90");
      await p.click("#fr-ct-add");
      if ((await p.locator("#fr-ct-produtos li").count()) !== 2) throw new Error("o segundo produto não apareceu");
      await p.click('#fr-ct-temas button:has-text("Boutique")'); await ESPERA(p);
      if (!logado && !(await p.locator("#fr-ct-convite").isVisible())) throw new Error("o convite do tema bloqueado não apareceu");
      await p.click('#fr-ct-temas button:has-text("Claro")');
      await p.click("#fr-ct-publicar"); await ESPERA(p);
      if (!logado) {
        if (!(await p.locator("#fr-janela").isVisible())) throw new Error("sem login, a janela do Vetorial ID não apareceu ao publicar");
        if (!/cat[aá]logo/i.test(await p.locator("#fr-j-texto").innerText())) throw new Error("a janela não explica que é para o catálogo");
        await p.keyboard.press("Escape");
      } else {
        if (!postado || postado.nome !== "Loja da Ana" || postado.produtos[0].preco !== 12990) throw new Error("o pedido de publicar saiu errado");
        if (!(await p.locator("#fr-ct-pronto").isVisible())) throw new Error("o catálogo publicado não apareceu");
        if (!/\/c\/loja-da-ana/.test(await p.locator("#fr-ct-link").innerText())) throw new Error("o link do catálogo não apareceu");
        await p.locator("#fr-ct-pronto").scrollIntoViewIfNeeded();
      }
    }]),
    ...[["site-login", false], ["site-publicar", true]].map(([nome, logado]) => [nome, "vitrine/", async (p) => {
      const cab = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
      const temas = [["creme", "Creme", true], ["claro", "Claro", true], ["rosa", "Rosa suave", false], ["escuro", "Escuro", false], ["noite", "Azul noite", false]].map(([id, nome, gratis]) => ({ id, nome, gratis, fundo: "#fff", texto: "#000" }));
      const layouts = [["banner", "Banner no topo", true], ["servicos", "Serviços em lista", true], ["loja", "Vitrine de produtos", false], ["cartao", "Cartão de visita", false], ["galeria", "Galeria de fotos", false]].map(([id, nome, gratis]) => ({ id, nome, gratis, desc: "Descrição do formato " + nome }));
      const textos = Object.fromEntries(["salao", "barbearia", "manicure", "estetica", "loja", "outro"].map((id) => [id, { slogan: "Beleza e cuidado do seu jeito", sobre: "{nome} é um espaço pensado para você." }]));
      let postado = null;
      await p.route(/\/sitev(\/|$)/, async (r) => {
        const u = new URL(r.request().url()), m = r.request().method();
        if (m === "OPTIONS") return r.fulfill({ status: 204, headers: cab });
        const j = (status, corpo) => r.fulfill({ status, contentType: "application/json", headers: cab, body: JSON.stringify(corpo) });
        if (u.pathname.endsWith("/modelos")) return j(200, { layouts, limites: { gratis: { fotos: 6, servicos: 8 }, pago: { fotos: 9, servicos: 20 } }, nichos: [{ id: "salao", nome: "Salão de beleza" }, { id: "loja", nome: "Loja" }, { id: "outro", nome: "Outro negócio" }], temas, logos: [{ id: "mod-1", nome: "Moderno 1", gratis: true }, { id: "mod-3", nome: "Moderno 3", gratis: true }], textos });
        if (u.pathname.endsWith("/previa")) return j(200, { html: '<body style="font-family:system-ui;margin:0;padding:24px"><h1>Studio da Ana</h1><p>Prévia do site</p></body>', erros: [] });
        if (m === "GET") return j(200, { site: null, assinante: false, limites: { fotos: 6, servicos: 8 } });
        postado = JSON.parse(r.request().postData() || "{}");
        return j(200, { ok: true, assinante: false, site: { slug: "studio-da-ana", link: "https://v.test/w/studio-da-ana", nome: postado.nome, whats: "5551999998888", nicho: "salao", cidade: "", cfg: { tema: postado.tema, cor: postado.cor, layout: postado.layout, fonte: postado.fonte, slogan: "", sobre: "" }, servicos: [], fotos: [], logoModelo: postado.logoModelo || "", visitas: 0 } });
      });
      await p.route(/\/ferramentas\/logo\/previa/, (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", headers: cab, body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c2185b"/></svg>' }));
      await p.evaluate(() => { try { localStorage.clear(); } catch {} });
      if (logado) await p.evaluate(() => localStorage.setItem("ferramentas.token", "token-de-teste"));
      await p.reload(); // o assistente já carrega as opções ao abrir a página: precisa abrir com os mocks de pé
      await p.waitForSelector("#fr-st-nicho option", { state: "attached" });
      await p.evaluate(() => { document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel", "v")); });
      if (!(await p.locator('.fr-passo[data-passo="1"]').isVisible())) throw new Error("o assistente deveria abrir no passo 1");
      // passo 1 não avança sem nome e WhatsApp
      await p.click("#fr-st-segue"); await ESPERA(p);
      if (!(await p.locator("#fr-st-aviso").isVisible())) throw new Error("deveria avisar que falta o nome");
      await p.fill("#fr-st-nome", "Studio da Ana"); await p.fill("#fr-st-whats", "(51) 99999-8888");
      if (!/Studio da Ana/.test(await p.inputValue("#fr-st-sobre"))) throw new Error("o texto pronto não usou o nome do negócio");
      await p.click("#fr-st-segue");
      if (!(await p.locator('.fr-passo[data-passo="2"]').isVisible())) throw new Error("não foi para o passo 2 (logo)");
      if ((await p.locator("#fr-st-logos button").count()) !== 3) throw new Error("deveriam aparecer 'sem logo' e os 2 modelos");
      await p.click('#fr-st-logos button[aria-label="Moderno 1"]');
      await p.click("#fr-st-segue");
      if ((await p.locator("#fr-st-layouts button").count()) !== 5) throw new Error("deveriam aparecer os 5 formatos");
      if ((await p.locator("#fr-st-fontes button").count()) !== 6) throw new Error("deveriam aparecer as 6 fontes");
      await p.click('#fr-st-layouts button:has-text("Vitrine de produtos")'); await ESPERA(p);
      if (!logado && !(await p.locator("#fr-st-convite").isVisible())) throw new Error("o convite do formato bloqueado não apareceu");
      await p.click('#fr-st-layouts button:has-text("Serviços em lista")');
      if (await p.locator("#fr-st-convite").isVisible()) throw new Error("o convite deveria sumir no formato grátis");
      await p.click('#fr-st-temas button:has-text("Azul noite")'); await ESPERA(p);
      if (!(await p.locator("#fr-st-convite").isVisible())) throw new Error("o convite do tema bloqueado não apareceu");
      await p.click('#fr-st-temas button:has-text("Creme")'); await p.click('#fr-st-fontes button:has-text("Cursiva")');
      await p.click("#fr-st-segue");
      await p.click("#fr-st-add-serv");
      await p.fill('#fr-st-servicos input[aria-label="Nome do serviço"]', "Corte"); await p.fill('#fr-st-servicos input[aria-label="Preço (R$)"]', "60,00");
      await p.click("#fr-st-segue");
      if (!(await p.locator('.fr-passo[data-passo="5"]').isVisible())) throw new Error("não chegou no passo de publicar");
      if ((await p.locator("#fr-st-revisao li").count()) < 5) throw new Error("a revisão não apareceu");
      await p.click("#fr-st-publicar"); await ESPERA(p);
      if (!logado) {
        if (!(await p.locator("#fr-janela").isVisible())) throw new Error("sem login, a janela do Vetorial ID não apareceu ao publicar o site");
        if (!/site/i.test(await p.locator("#fr-j-texto").innerText())) throw new Error("a janela não explica que é para o site");
        await p.keyboard.press("Escape");
        if (await p.locator('.fr-passo[data-passo="6"]').isVisible()) throw new Error("o kit não deveria abrir antes de publicar");
      } else {
        if (!postado || postado.nome !== "Studio da Ana" || postado.servicos[0].preco !== 6000 || postado.layout !== "servicos" || postado.fonte !== "cursiva" || postado.logoModelo !== "mod-1") throw new Error("o pedido de publicar saiu errado: " + JSON.stringify(postado));
        if (!(await p.locator("#fr-st-pronto").isVisible())) throw new Error("o site publicado e o kit não apareceram");
        if ((await p.locator(".fr-kit-c[data-kit]").count()) !== 4) throw new Error("o kit deveria ter 4 ferramentas");
        await p.click('.fr-kit-c[data-kit="panfleto"]'); await ESPERA(p);
        if (!(await p.locator("#painel-panfleto").isVisible())) throw new Error("o kit não abriu o panfleto");
        if ((await p.inputValue("#fr-pf-loja")) !== "Studio da Ana") throw new Error("o panfleto não veio com o nome do negócio");
        await p.click("#modo-criar"); await p.locator("#fr-st-pronto").scrollIntoViewIfNeeded();
      }
    }]),
    ["menu-topo", "", async (p) => {
      const largura = await p.evaluate(() => window.innerWidth);
      if (largura <= 1000) return; // no celular quem manda são as abas de baixo
      const itens = await p.locator(".topo nav > a:visible, .topo nav > details:visible").count();
      if (itens > 6) throw new Error("o menu do topo está com itens demais na mesma linha: " + itens);
      await p.click(".topo details.mn:nth-of-type(1) summary");
      if (!(await p.locator(".topo details.mn[open] .mn-lista").isVisible())) throw new Error("a lista de Apps não abriu");
      if ((await p.locator(".topo details.mn[open] .mn-lista a").count()) < 5) throw new Error("a lista de Apps está incompleta");
      await p.click(".topo details.mn:nth-of-type(2) summary");
      if ((await p.locator(".topo details.mn[open]").count()) !== 1) throw new Error("só um menu deveria ficar aberto");
      if (!(await p.locator('.topo details.mn[open] a[href="vitrine/"]').isVisible())) throw new Error("a Vitrine não está na lista Grátis");
    }],
    ["ferramentas-link-ok", "vitrine/#ferramentas", async (p) => {
      await p.evaluate(() => { document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel", "v")); localStorage.setItem("ferramentas.token", "token-de-teste"); });
      const meu = { codigo: "abc234", curto: "https://v.test/l/abc234", destino: "https://minhaloja.com.br/promocao-do-mes-com-um-endereco-bem-comprido-para-testar", criado: 1, cliques: 7, ultimoClique: null, ativo: true };
      let corpo = null;
      await p.route("**/links", async (r) => {
        const cab = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" };
        const m = r.request().method();
        if (m === "OPTIONS") return r.fulfill({ status: 204, headers: cab });
        if (m === "POST") { corpo = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ status: 201, contentType: "application/json", headers: cab, body: JSON.stringify({ ok: true, link: meu }) }); }
        return r.fulfill({ status: 200, contentType: "application/json", headers: cab, body: JSON.stringify({ limite: 20, ilimitado: false, links: [meu] }) });
      });
      await p.fill("#fr-destino", "minhaloja.com.br/promocao"); await p.click("#fr-encurtar"); await ESPERA(p);
      if (!/\/l\/abc234/.test(await p.locator("#fr-curto").innerText())) throw new Error("o link curto não apareceu");
      if (!corpo || corpo.destino !== "minhaloja.com.br/promocao") throw new Error("o pedido saiu errado");
      if (!(await p.locator("#fr-lista .fr-item").count())) throw new Error("a lista de links não apareceu");
      if (!/7 cliques/.test(await p.locator("#fr-lista").innerText())) throw new Error("a contagem de cliques não apareceu");
      await p.locator("#fr-resultado").scrollIntoViewIfNeeded();
    }],
    ...["vindex", "vortex", "velox", "vyntem", "voxix", "quem-somos", "seguranca", "conta", "proposta"].map((n) => pagina(n, `${n}.html`)),
    ["vitrine", "vitrine/", async (p) => {
      await p.evaluate(() => document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel")));
      if (await p.locator("nav.abas-m, header.topo, .faixa-ig").count()) throw new Error("a Vênus Vitrine ainda mostra o menu do site da Vetorial Tech");
      if (!(await p.locator(".vv-topo").isVisible()) || !(await p.locator(".vv-rodape").isVisible())) throw new Error("falta o cabeçalho ou o rodapé próprios da Vitrine");
    }],
    pagina("ferramentas-redireciona", "ferramentas.html"),
    ["home-faixa-vitrine", "", async (p) => {
      const f = p.locator("a.vv-faixa"); await f.scrollIntoViewIfNeeded();
      if (!(await f.isVisible())) throw new Error("a faixa da Vênus Vitrine não aparece na home");
      if (!/vitrine\/$/.test(await f.getAttribute("href"))) throw new Error("a faixa da Vitrine aponta para o lugar errado");
    }],
    ["vindex-faixa-pdf", "vindex.html", async (p) => {
      const f = p.locator("a.vv-faixa"); await f.scrollIntoViewIfNeeded();
      if (!(await f.isVisible())) throw new Error("a faixa do Vindex PDF não aparece na página do Vindex");
      if (!/pdf\/$/.test(await f.getAttribute("href"))) throw new Error("a faixa do PDF aponta para o lugar errado");
    }],
  ],
};
