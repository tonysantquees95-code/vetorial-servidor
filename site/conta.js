(() => {
  const $ = (id) => document.getElementById(id);
  const A = window.VENUS;
  const guardar = (t) => { try { sessionStorage.setItem("vid", t); } catch (e) {} };
  const ler = () => { try { return sessionStorage.getItem("vid") || ""; } catch (e) { return ""; } };
  const apagar = () => { try { sessionStorage.removeItem("vid"); } catch (e) {} };

  // o Vetorial ID devolve o login em #vid=…; tiramos da barra de endereço na hora
  const m = /[#&]vid=([^&]+)/.exec(location.hash);
  if (m) { guardar(decodeURIComponent(m[1])); history.replaceState(null, "", location.pathname + location.search); }

  $("entrar").href = A.entrar("conta.html");
  $("dl-android").href = A.baixarAndroid;
  $("dl-windows").href = A.baixarWindows;
  $("dl-android2").href = A.baixarAndroid;
  $("dl-windows2").href = A.baixarWindows;
  $("dl-mac").href = A.baixarMac;
  $("dl-mac2").href = A.baixarMac;
  $("dl-web").href = A.web;
  $("dl-web2").href = A.web;
  $("dl-vindex-a").href = A.api + "/vindex/android";
  $("dl-vindex-w").href = A.api + "/vindex/windows";
  const escolhido = new URLSearchParams(location.search).get("pacote") || "";

  const NOMES = { venus: "Vênus", venus_vindex: "Vênus + Vindex", venus_vortex: "Vênus + Vortex", completo: "Completo (Vênus + Vindex + Vortex)", vortex: "Vortex", vindex: "Vindex", vindex_vortex: "Vindex + Vortex" };
  const mostrar = (qual) => { $("carregando").hidden = true; $("deslogado").hidden = qual !== "d"; $("logado").hidden = qual !== "l"; $("sair").hidden = qual !== "l"; };
  async function api(caminho, token) {
    const r = await fetch(A.api + caminho, { headers: { authorization: "Bearer " + token } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || j.mensagem || "Erro " + r.status), { status: r.status });
    return j;
  }

  const reais = (c) => "R$ " + (c % 100 ? (c / 100).toFixed(2).replace(".", ",") : String(c / 100));
  /** Preços vindos do servidor (promoção de lançamento inclusa), iguais aos da página principal. */
  function precos(l) {
    (l && l.pacotes || []).forEach((p) => {
      const card = document.querySelector(`#pacotes .plano[data-pacote="${p.chave}"]`);
      const v = card && card.querySelector(".v");
      if (!v) return;
      v.innerHTML = "";
      if (p.promocao && p.precoCheioCentavos) { const r = document.createElement("s"); r.style.cssText = "display:block;font-size:.45em;line-height:1.2;opacity:.6"; r.textContent = reais(p.precoCheioCentavos); v.appendChild(r); }
      const n = document.createElement("span"); n.style.whiteSpace = "nowrap"; n.textContent = reais(p.precoCentavos);
      const m = document.createElement("small"); m.textContent = "/mês"; n.appendChild(m); v.appendChild(n);
    });
    const aviso = $("promo");
    if (aviso && l && l.promocao) { aviso.hidden = false; aviso.textContent = `🎉 Promoção de lançamento: a suíte completa por ${reais(l.promocao.precoCentavos)}/mês. Quem assinar até ${new Date(l.promocao.fim).toLocaleDateString("pt-BR")} mantém esse preço por ${l.promocao.meses} meses.`; }
  }

  function estado(l) {
    const e = $("estado");
    $("liberar").hidden = !(l && l.pagamentoAguardandoLiberacao);
    const pacote = l && l.pacote && NOMES[l.pacote] ? NOMES[l.pacote] : "Vênus";
    if (!l || l.plano === "sem_loja") { e.className = "aviso"; e.textContent = "Sua conta está pronta. Abra a Vênus e entre para começar o teste grátis."; return; }
    if (l.plano === "dono") { e.className = "aviso ok"; e.textContent = "Conta do dono da Vetorial Tech: acesso total, sem limites."; $("acoes").hidden = true; return; }
    if (l.emTeste) { e.className = "aviso ok"; e.innerHTML = `🎁 Você está nos <b>7 dias grátis</b> com Vênus, Vindex e Vortex: faltam ${l.diasDeTesteRestantes} dia(s).`; return; }
    if (l.acesso) { e.className = "aviso ok"; e.textContent = `Assinatura ativa: ${pacote}. Faltam ${l.diasPagosRestantes} dia(s) pagos.`; return; }
    e.className = "aviso al"; e.textContent = "O seu período grátis acabou. Escolha um pacote para continuar.";
  }

  function recuperacaoEstado(r) {
    const e = $("rec-estado"), ok = !!(r && r.configurada);
    e.className = ok ? "aviso ok" : "aviso al";
    e.textContent = ok ? "Recuperação configurada. Para trocar o PIN ou a pergunta, preencha de novo abaixo." : "Você ainda não configurou a recuperação de senha. Faça agora, leva um minuto.";
    $("rec-botao").textContent = ok ? "Trocar recuperação" : "Salvar recuperação";
  }

  async function iniciar() {
    const t = ler();
    if (!t) return mostrar("d");
    try {
      const c = await api("/id/conta", t);
      const u = c.usuario || {};
      $("nome").textContent = u.nome || u.email || "Minha conta";
      $("email").textContent = u.email || "";
      $("inicial").textContent = String(u.nome || u.email || "V").trim().charAt(0).toUpperCase();
      $("novo-nome").value = u.nome || "";
      estado(c.licenca);
      recuperacaoEstado(c.recuperacao);
      precos(c.licenca);
      document.querySelectorAll("#pacotes .plano").forEach((p) => p.classList.toggle("sel", p.dataset.pacote === escolhido));
      mostrar("l");
    } catch (e) {
      apagar();
      mostrar("d");
    }
  }

  document.querySelectorAll("#pacotes .plano").forEach((card) => {
    card.querySelector("button").addEventListener("click", async (ev) => {
      const b = ev.currentTarget, msg = $("msg");
      b.disabled = true; msg.textContent = "Abrindo o Mercado Pago…";
      try {
        const r = await api(`/id/licenca?gerar=1&gateway=mercadopago&pacote=${encodeURIComponent(card.dataset.pacote)}`, ler());
        const url = r.cobranca && r.cobranca.url;
        if (!url) throw new Error("O Mercado Pago não devolveu o link.");
        location.href = url;
      } catch (e) {
        msg.textContent = e.message || "Não consegui abrir o pagamento. Tente de novo.";
        b.disabled = false;
      }
    });
  });
  $("perfil").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = $("msg-perfil");
    try {
      const r = await fetch(A.api + "/id/perfil", { method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer " + ler() }, body: JSON.stringify({ nome: $("novo-nome").value }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Não consegui salvar.");
      const j = await r.json();
      $("nome").textContent = j.usuario.nome || $("email").textContent;
      msg.textContent = "Nome atualizado.";
    } catch (e) { msg.textContent = e.message; }
  });
  $("rec").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = $("msg-rec"), botao = $("rec-botao");
    const pin = $("rec-pin").value.replace(/\D/g, ""), pin2 = $("rec-pin2").value.replace(/\D/g, "");
    if (pin.length !== 6) { msg.textContent = "O PIN tem 6 números."; return; }
    if (pin !== pin2) { msg.textContent = "Os dois PINs não são iguais."; return; }
    if ($("rec-resp").value.trim().toLowerCase() !== $("rec-resp2").value.trim().toLowerCase()) { msg.textContent = "As duas respostas não são iguais."; return; }
    botao.disabled = true; msg.textContent = "Salvando…";
    try {
      const r = await fetch(A.api + "/id/recuperacao", { method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer " + ler() }, body: JSON.stringify({ senhaAtual: $("rec-senha").value, pin, pinConfirma: pin2, pergunta: $("rec-pergunta").value, resposta: $("rec-resp").value, respostaConfirma: $("rec-resp2").value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não consegui salvar.");
      $("rec").reset(); recuperacaoEstado({ configurada: true }); msg.textContent = "Pronto! A recuperação de senha foi salva.";
    } catch (e) { msg.textContent = e.message; } finally { botao.disabled = false; }
  });
  $("sair").addEventListener("click", (ev) => { ev.preventDefault(); apagar(); mostrar("d"); });
  iniciar();
})();
