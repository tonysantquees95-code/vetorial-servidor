// Auditoria profunda do catálogo e BI financeiro (faturamento bruto × taxas das plataformas).
const DIA = 86_400_000;

export function auditar(produtos, vinculos = [], canais = []) {
  const lista = (f) => produtos.filter(f).slice(0, 50).map((p) => ({ id: p.id, sku: p.sku, nome: p.nome }));
  const comPreco = produtos.filter((p) => p.preco_centavos !== null && p.preco_centavos !== undefined && p.preco_centavos > 0);
  const caracteristicas = {};
  let semAtributos = 0;
  for (const p of produtos) {
    const a = typeof p.atributos === "string" ? JSON.parse(p.atributos || "{}") : p.atributos || {};
    const nomes = Object.keys(a);
    if (!nomes.length) semAtributos++;
    for (const n of nomes) caracteristicas[n] = (caracteristicas[n] || 0) + 1;
  }
  const porCanal = canais.map((c) => ({
    canal: c.id, plataforma: c.plataforma, produtos: new Set(vinculos.filter((v) => v.canal === c.id).map((v) => v.produto)).size,
  }));
  const semCanal = produtos.filter((p) => !vinculos.some((v) => v.produto === p.id)).length;
  const resumo = {
    total: produtos.length,
    ocultos: produtos.filter((p) => p.oculto).length,
    visiveis: produtos.filter((p) => !p.oculto).length,
    com_preco: comPreco.length,
    sem_preco: produtos.length - comPreco.length,
    sem_estoque: produtos.filter((p) => p.estoque <= 0).length,
    sem_imagem: produtos.filter((p) => !p.imagem).length,
    sem_categoria: produtos.filter((p) => !p.categoria).length,
    sem_atributos: semAtributos,
    sem_canal: semCanal,
  };
  return {
    resumo,
    // visíveis no catálogo mas impossíveis de vender (sem preço ou sem estoque) e produtos escondidos que têm saldo: o que mais pede atenção
    escondidos: lista((p) => p.oculto),
    escondidos_com_estoque: lista((p) => p.oculto && p.estoque > 0),
    sem_preco: lista((p) => !(p.preco_centavos > 0)),
    sem_estoque: lista((p) => p.estoque <= 0 && !p.oculto),
    sem_imagem: lista((p) => !p.imagem),
    caracteristicas: Object.entries(caracteristicas).sort((a, b) => b[1] - a[1]).map(([nome, produtos]) => ({ nome, produtos })),
    por_canal: porCanal,
    problemas: resumo.sem_preco + resumo.sem_imagem + produtos.filter((p) => p.oculto && p.estoque > 0).length,
  };
}

const diaDe = (ms) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10); // dia em Brasília

export function financeiro(pedidos, canais, dias = 30, agora = Date.now()) {
  const desde = agora - dias * DIA;
  const taxaPct = new Map(canais.map((c) => [c.id, Number(JSON.parse(c.config || "{}").taxa_percentual) || 0]));
  const serie = new Map();
  for (let i = dias - 1; i >= 0; i--) serie.set(diaDe(agora - i * DIA), { dia: diaDe(agora - i * DIA), bruto: 0, taxas: 0, pedidos: 0 });
  const porCanal = new Map(canais.map((c) => [c.id, { canal: c.id, plataforma: c.plataforma, nome: c.nome, bruto: 0, taxas: 0, pedidos: 0, taxas_estimadas: 0 }]));
  let pendente = 0, perdido = 0;
  for (const p of pedidos) {
    if (p.criado < desde) continue;
    if (p.status === "novo") { pendente += p.total_centavos; continue; }
    if (p.status !== "pago") { perdido += p.total_centavos; continue; } // cancelado, devolvido, reembolsado
    const real = p.taxa_centavos > 0;
    const taxa = real ? p.taxa_centavos : Math.round((p.total_centavos * (taxaPct.get(p.canal) || 0)) / 100);
    const d = serie.get(diaDe(p.criado));
    if (d) { d.bruto += p.total_centavos; d.taxas += taxa; d.pedidos++; }
    const c = porCanal.get(p.canal);
    if (c) { c.bruto += p.total_centavos; c.taxas += taxa; c.pedidos++; if (!real && taxa) c.taxas_estimadas += taxa; }
  }
  const canaisLista = [...porCanal.values()].map((c) => ({ ...c, liquido: c.bruto - c.taxas }));
  const bruto = canaisLista.reduce((s, c) => s + c.bruto, 0);
  const taxas = canaisLista.reduce((s, c) => s + c.taxas, 0);
  return {
    dias,
    totais: { bruto, taxas, liquido: bruto - taxas, pedidos: canaisLista.reduce((s, c) => s + c.pedidos, 0), pendente, perdido },
    canais: canaisLista,
    serie: [...serie.values()],
    atualizado: agora,
  };
}
