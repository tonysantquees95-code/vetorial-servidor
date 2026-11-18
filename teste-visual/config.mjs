// Telas do site que o teste visual visita: [nome, página, passos].
const APPS = ["venus", "vindex", "vortex", "velox", "vyntem", "voxix"];
const ABA = (p, id) => p.locator("#abas button").nth(APPS.indexOf(id));
const ESPERA = (p) => p.waitForTimeout(350);
const pagina = (nome, arq) => [nome, arq, async (p) => { await p.evaluate(() => document.querySelectorAll(".rev").forEach((e) => e.classList.add("on", "in", "visivel"))); }];

export default {
  porta: 4191,
  cenarios: [
    ["home", "", async () => {}],
    ["home-simulador-venus", "", async (p) => {
      await p.locator("#simulador").scrollIntoViewIfNeeded();
      const campo = p.locator("#tela button").first(); await campo.click(); await ESPERA(p);
    }],
    ...APPS.map((id) => [`home-simulador-${id}`, "", async (p) => {
      await p.locator("#simulador").scrollIntoViewIfNeeded();
      await ABA(p, id).click(); await ESPERA(p);
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
    ...["vindex", "vortex", "velox", "vyntem", "voxix", "quem-somos", "seguranca", "conta", "proposta"].map((n) => pagina(n, `${n}.html`)),
  ],
};
