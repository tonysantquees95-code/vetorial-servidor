// Carrinho do catálogo público (/c/<nome>). Sem isso a página funciona do mesmo jeito: cada produto tem o seu "Pedir no WhatsApp".
// Tudo entra como texto (textContent); o pedido sai por link wa.me com a lista e o total.
(() => {
  const raiz = document.body;
  const whats = raiz.dataset.whats, loja = raiz.dataset.loja || "";
  if (!whats) return;
  document.documentElement.classList.add("js");
  const reais = (c) => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const itens = [];
  const barra = document.getElementById("barra"), txt = document.getElementById("barra-txt"), pedir = document.getElementById("barra-pedir");

  function atualizar() {
    const sel = itens.filter((i) => i.qtd > 0);
    if (!sel.length) { barra.classList.remove("on"); return; }
    const total = sel.reduce((s, i) => s + i.qtd * i.preco, 0), n = sel.reduce((s, i) => s + i.qtd, 0);
    txt.textContent = `${n} ${n === 1 ? "item" : "itens"}${total ? " · " + reais(total) : ""}`;
    const linhas = sel.map((i) => `• ${i.qtd}x ${i.nome}${i.preco ? " — " + reais(i.qtd * i.preco) : ""}`);
    const msg = `Olá, ${loja}! Quero fazer um pedido:\n${linhas.join("\n")}${total ? `\nTotal: ${reais(total)}` : ""}`;
    pedir.href = `https://wa.me/${whats}?text=${encodeURIComponent(msg)}`;
    barra.classList.add("on");
  }

  for (const li of document.querySelectorAll("[data-produto]")) {
    const item = { nome: li.dataset.nome, preco: Number(li.dataset.preco) || 0, qtd: 0 };
    itens.push(item);
    const caixa = li.querySelector(".i"), link = li.querySelector(".pedir");
    const qtd = document.createElement("div"); qtd.className = "qtd";
    const menos = document.createElement("button"); menos.type = "button"; menos.textContent = "−"; menos.setAttribute("aria-label", "Tirar um de " + item.nome);
    const num = document.createElement("b"); num.textContent = "0";
    const mais = document.createElement("button"); mais.type = "button"; mais.textContent = "+"; mais.setAttribute("aria-label", "Pôr mais um de " + item.nome);
    qtd.append(menos, num, mais);
    const add = document.createElement("button"); add.type = "button"; add.className = "add"; add.textContent = "Adicionar ao pedido";
    link.after(qtd, add);
    const mudar = (d) => { item.qtd = Math.max(0, Math.min(99, item.qtd + d)); num.textContent = String(item.qtd); qtd.classList.toggle("on", item.qtd > 0); atualizar(); };
    add.addEventListener("click", () => mudar(1)); mais.addEventListener("click", () => mudar(1)); menos.addEventListener("click", () => mudar(-1));
  }
})();
