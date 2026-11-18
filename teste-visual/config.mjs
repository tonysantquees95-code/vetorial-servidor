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
    ...["vindex", "vortex", "velox", "vyntem", "voxix", "quem-somos", "seguranca", "conta"].map((n) => pagina(n, `${n}.html`)),
  ],
};
