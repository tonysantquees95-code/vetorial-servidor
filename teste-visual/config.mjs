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
    ["ferramentas-qr", "ferramentas.html", async (p) => {
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
    ["ferramentas-pede-id", "ferramentas.html", async (p) => {
      await p.evaluate(() => { document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel", "v")); try { localStorage.clear(); } catch {} });
      await p.fill("#fr-destino", "minhaloja.com.br/promocao"); await p.click("#fr-encurtar"); await ESPERA(p);
      if (!(await p.locator("#fr-janela").isVisible())) throw new Error("sem login, a janela do Vetorial ID não apareceu");
      if (!(await p.locator("#fr-j-entrar").isVisible())) throw new Error("o botão de entrar não está visível");
      await p.keyboard.press("Escape"); await ESPERA(p);
      if (await p.locator("#fr-janela").isVisible()) throw new Error("Esc não fechou a janela");
    }],
    ["ferramentas-link-ok", "ferramentas.html", async (p) => {
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
    ...["vindex", "vortex", "velox", "vyntem", "voxix", "quem-somos", "seguranca", "conta", "proposta", "ferramentas"].map((n) => pagina(n, `${n}.html`)),
  ],
};
