// Baixar os apps pede o Vetorial ID (conta grátis). Vale para todo link de download do site: ao tocar, se a pessoa
// ainda não entrou, abre a janela do Vetorial ID; com a conta, o servidor confere, conta o download e entrega o arquivo.
// Os apps continuam se atualizando por dentro pela rota /atualizacao (não passa por aqui).
(function () {
  var API = (window.VENUS && window.VENUS.api) || "";
  var CHAVE = "baixar.token";
  var mesmaOrigem = false;
  try { mesmaOrigem = location.origin === new URL(API).origin; } catch (e) { /* ok */ }

  function token() {
    try { return localStorage.getItem(CHAVE) || (mesmaOrigem ? localStorage.getItem("vid_token") : "") || ""; } catch (e) { return ""; }
  }
  function guardar(t) { try { if (t) localStorage.setItem(CHAVE, t); else localStorage.removeItem(CHAVE); } catch (e) { /* sem armazenamento */ } }

  /** Abre a janela do Vetorial ID. Precisa rodar dentro do toque, senão o navegador bloqueia. Devolve uma promessa (true = entrou). */
  function entrar(nome) {
    return new Promise(function (resolve) {
      var j = window.open(API + "/id?plataforma=web&nome=" + encodeURIComponent(nome), "vetorial-id", "width=460,height=720");
      if (!j) return resolve(false);
      var feito = false, t;
      function fim(ok) { if (feito) return; feito = true; window.removeEventListener("message", ouvir); clearInterval(t); resolve(ok); }
      function ouvir(e) {
        var origem; try { origem = new URL(API).origin; } catch (x) { return; }
        if (e.origin !== origem) return;
        var tk = e.data && e.data.vetorialId;
        if (typeof tk === "string" && tk) { guardar(tk); try { j.close(); } catch (x) { /* ok */ } fim(true); }
      }
      window.addEventListener("message", ouvir);
      t = setInterval(function () { if (j.closed) fim(!!token()); }, 600);
    });
  }

  function aviso(texto) {
    var d = document.getElementById("baixar-aviso");
    if (!d) {
      d = document.createElement("div");
      d.id = "baixar-aviso";
      d.setAttribute("role", "status");
      d.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:92vw;padding:12px 18px;border-radius:14px;background:#120e22;color:#e8ecf4;border:1px solid #2c2546;font:15px system-ui,sans-serif;z-index:99999;text-align:center";
      document.body.appendChild(d);
    }
    d.textContent = texto;
    d.hidden = false;
    clearTimeout(d._t);
    d._t = setTimeout(function () { d.hidden = true; }, 6000);
  }

  function baixar(app) {
    return fetch(API + "/baixar?app=" + encodeURIComponent(app), { method: "POST", headers: { authorization: "Bearer " + token() } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (c) { return { status: r.status, corpo: c }; }); });
  }

  function iniciar(app, nome) {
    baixar(app).then(function (r) {
      if (r.status === 200 && r.corpo.url) { location.href = r.corpo.url; return; }
      if (r.status === 401) { guardar(""); aviso("Sua sessão venceu. Toque em baixar de novo para entrar."); return; }
      aviso(r.corpo.error || "Não consegui iniciar o download agora. Tente de novo.");
    }).catch(function () { aviso("Sem internet para confirmar a sua conta. Conecte-se e tente de novo."); });
  }

  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (x) { return; }
    if (u.pathname !== "/atualizacao" || u.searchParams.get("baixar") !== "1") return;
    var app = u.searchParams.get("app");
    if (!app) return;
    e.preventDefault();
    var nome = (a.getAttribute("data-app") || document.title || "Vetorial Tech").split("·")[0].trim().slice(0, 40);
    if (token()) return iniciar(app, nome);
    aviso("Para baixar, entre com o Vetorial ID (conta grátis).");
    entrar(nome).then(function (ok) { if (ok) iniciar(app, nome); else aviso("Entre ou crie a conta grátis para baixar."); });
  }, true);
})();
