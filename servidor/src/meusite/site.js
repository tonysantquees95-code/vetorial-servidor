// Meu site: a página do negócio (serviços, agenda, sobre, equipe, fotos, contato) montada a partir de poucas escolhas.
// Não tem JavaScript: é HTML puro, rápido no celular, e quem edita nunca escreve HTML (tudo é texto escapado).
import { FONTES, logoSvg, NICHOS, normalizarEspec } from "./logos.js";
import { bannerSvg } from "./banners.js";

export const TEMAS = {
  claro: { nome: "Claro", fundo: "#FFFFFF", painel: "#F6F3F1", texto: "#241B1F", suave: "#6E6469", borda: "#0000001a" },
  creme: { nome: "Creme", fundo: "#FBF4EA", painel: "#FFFFFF", texto: "#2F2320", suave: "#7A6B63", borda: "#00000014" },
  rosa: { nome: "Rosa suave", fundo: "#FFF3F6", painel: "#FFFFFF", texto: "#4A1230", suave: "#8A5A70", borda: "#4a123018" },
  escuro: { nome: "Escuro", fundo: "#0E0F14", painel: "#171922", texto: "#F4F1EC", suave: "#A09DAA", borda: "#ffffff1a" },
  noite: { nome: "Azul noite", fundo: "#0B1530", painel: "#13204A", texto: "#EAF2FF", suave: "#9FB0D8", borda: "#ffffff1a" },
};
export const SECOES = {
  servicos: "Serviços e preços",
  produtos: "Produtos da loja",
  sobre: "Sobre nós",
  equipe: "Equipe",
  galeria: "Galeria de fotos",
  depoimentos: "Depoimentos",
  contato: "Contato e horário",
};
const ORDEM_PADRAO = ["servicos", "produtos", "sobre", "equipe", "galeria", "depoimentos", "contato"];
const FONTES_DO_SITE = ["moderna", "elegante", "classica", "arredondada", "forte", "cursiva"];
/** Formatos de página. "classico" é o do Meu site das lojas; os outros são do site da Vitrine. */
export const LAYOUTS_SITE = ["classico", "banner", "servicos", "loja", "cartao", "galeria", "destaque"];
export const MAX_FOTOS = 9;

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const texto = (v, max) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);
const linha = (v, max) => texto(v, max).replace(/\s+/g, " ");
const hex = (c, padrao) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c).toUpperCase() : padrao);
const reais = (c) => (c === null || c === undefined ? "" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const duracao = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
const soDigitos = (t) => String(t || "").replace(/\D/g, "");

/** Quais seções vêm ligadas para cada ramo. */
export function secoesDoRamo(nicho) {
  const ligadas = nicho === "loja" ? ["produtos", "sobre", "galeria", "depoimentos", "contato"] : nicho === "outro" ? ["servicos", "sobre", "contato"] : ["servicos", "sobre", "equipe", "galeria", "depoimentos", "contato"];
  return ORDEM_PADRAO.map((id) => ({ id, ativa: ligadas.includes(id) }));
}

export function siteInicial(nicho = "outro", paleta = null) {
  const n = NICHOS[nicho] ? nicho : "outro";
  return { nicho: n, tema: ["barbearia"].includes(n) ? "escuro" : "creme", fonte: "moderna", layout: "classico", cor: paleta?.principal || "#C2185B", slogan: "", sobre: "", endereco: "", horario: "", instagram: "", secoes: secoesDoRamo(n), depoimentos: [], publicado: false, logo: null };
}

/** Confere o que veio do editor, campo por campo. O que não vier fica como estava. */
export function normalizarSite(d = {}, anterior = null) {
  const base = anterior || siteInicial(NICHOS[d.nicho] ? d.nicho : "outro");
  const tem = (k) => d[k] !== undefined;
  const nicho = tem("nicho") && NICHOS[d.nicho] ? d.nicho : base.nicho;
  let secoes = base.secoes;
  if (Array.isArray(d.secoes)) {
    const vistas = new Set();
    secoes = [];
    for (const s of d.secoes) {
      const id = String(s?.id ?? s);
      if (!SECOES[id] || vistas.has(id)) continue;
      vistas.add(id);
      secoes.push({ id, ativa: typeof s === "object" ? s.ativa !== false : true });
    }
    for (const id of ORDEM_PADRAO) if (!vistas.has(id)) secoes.push({ id, ativa: false });
  }
  const depoimentos = Array.isArray(d.depoimentos)
    ? d.depoimentos.map((x) => ({ nome: linha(x?.nome, 40), texto: linha(x?.texto, 240) })).filter((x) => x.nome && x.texto).slice(0, 6)
    : base.depoimentos;
  let insta = tem("instagram") ? String(d.instagram ?? "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "") : base.instagram;
  if (!/^[A-Za-z0-9._]{1,30}$/.test(insta)) insta = "";
  return {
    nicho,
    tema: tem("tema") && TEMAS[d.tema] ? d.tema : base.tema,
    fonte: tem("fonte") && FONTES_DO_SITE.includes(d.fonte) ? d.fonte : base.fonte,
    layout: tem("layout") && LAYOUTS_SITE.includes(d.layout) ? d.layout : base.layout || "classico",
    cor: tem("cor") ? hex(d.cor, base.cor) : base.cor,
    slogan: tem("slogan") ? linha(d.slogan, 90) : base.slogan,
    sobre: tem("sobre") ? texto(d.sobre, 700) : base.sobre,
    endereco: tem("endereco") ? linha(d.endereco, 160) : base.endereco,
    horario: tem("horario") ? linha(d.horario, 160) : base.horario,
    instagram: insta,
    secoes,
    depoimentos,
    publicado: tem("publicado") ? !!d.publicado : base.publicado,
    logo: d.logo === null ? null : d.logo ? normalizarEspec(d.logo) : base.logo,
  };
}

/** Textos prontos (sem IA), para ninguém começar com a página vazia. */
export function textosModelo(nicho, nome, cidade = "") {
  const onde = cidade ? ` Venha nos conhecer em ${cidade}.` : "";
  const mapa = {
    salao: ["Beleza e cuidado do seu jeito", `${nome} é um espaço pensado para você se sentir bem. Atendimento com hora marcada, produtos de qualidade e uma equipe que cuida de cada detalhe.${onde}`],
    barbearia: ["Corte, barba e estilo", `Na ${nome} você encontra corte na régua, barba bem feita e um ambiente para relaxar. Marque o seu horário pelo site e chegue sem espera.${onde}`],
    manicure: ["Unhas lindas, do seu jeito", `A ${nome} cuida das suas mãos e pés com carinho, higiene e muito capricho. Escolha o serviço, marque o horário e pronto.${onde}`],
    estetica: ["Cuidado e bem-estar para o seu dia a dia", `${nome} oferece tratamentos pensados para a sua pele e para o seu bem-estar, com atendimento personalizado e horário marcado.${onde}`],
    loja: ["Peças escolhidas com carinho", `${nome} reúne produtos selecionados com atendimento próximo e entrega cuidadosa. Veja a vitrine e fale com a gente pelo WhatsApp.${onde}`],
    restaurante: ["Comida boa, feita com capricho", `${nome} serve pratos feitos na hora, com ingredientes frescos e preço justo. Veja o cardápio e faça o seu pedido pelo WhatsApp.${onde}`],
    pet: ["Cuidado de verdade para o seu bichinho", `${nome} cuida do seu pet com carinho, banho, tosa, consulta e tudo que ele precisa. Marque o horário pelo WhatsApp.${onde}`],
    oficina: ["Serviço bem feito, com garantia", `${nome} faz o conserto com peças de qualidade, orçamento claro e prazo combinado. Fale com a gente e peça o seu orçamento.${onde}`],
    fitness: ["Treino que cabe na sua rotina", `${nome} tem acompanhamento de perto, ambiente acolhedor e planos para cada objetivo. Venha conhecer e fazer uma aula experimental.${onde}`],
    saude: ["Atendimento com cuidado e atenção", `${nome} oferece atendimento humanizado, com horário marcado e uma equipe preparada para cuidar de você e da sua família.${onde}`],
    fotografia: ["Momentos que ficam para sempre", `${nome} registra os seus melhores momentos com olhar cuidadoso, entrega no prazo e atendimento próximo. Veja os pacotes e peça o seu orçamento.${onde}`],
    reformas: ["Reforma sem dor de cabeça", `${nome} cuida da sua obra do início ao fim, com orçamento detalhado, prazo combinado e acabamento caprichado.${onde}`],
    educacao: ["Aprender com quem entende", `${nome} oferece aulas e cursos com acompanhamento de perto e material de qualidade. Veja as turmas e tire suas dúvidas pelo WhatsApp.${onde}`],
    outro: ["Atendimento de confiança", `${nome} atende com qualidade, cuidado e respeito ao seu tempo. Veja os serviços e fale com a gente.${onde}`],
  };
  const [slogan, sobre] = mapa[mapa[nicho] ? nicho : "outro"];
  return { slogan, sobre };
}

function css(t, fonte, cor, layout = "classico") {
  const f = FONTES[fonte] || FONTES.moderna;
  const sobre = corSobre(cor);
  return `:root{--cor:${cor};--sobre:${sobre};--fundo:${t.fundo};--painel:${t.painel};--texto:${t.texto};--suave:${t.suave};--borda:${t.borda};--titulo:${f.familia}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--fundo);color:var(--texto);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.55;padding-bottom:84px}
a{color:inherit}.max{max-width:960px;margin:0 auto;padding:0 18px}
.topo{text-align:center;padding:44px 18px 34px;background:radial-gradient(900px 340px at 50% -10%,color-mix(in srgb,var(--cor) 26%,transparent),transparent 70%)}
.logo{max-width:min(78vw,340px);max-height:160px;width:auto;height:auto;border-radius:18px;margin-bottom:14px}
h1,h2{font-family:var(--titulo);font-weight:${f.peso > 700 ? 800 : 700};font-style:${f.estilo};margin:0}h1{font-size:clamp(28px,7vw,44px);line-height:1.12}
.slogan{color:var(--suave);font-size:clamp(16px,4vw,19px);max-width:560px;margin:10px auto 0}
.botoes{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:22px}
.bt{display:inline-block;padding:14px 24px;border-radius:30px;background:var(--cor);color:var(--sobre);font-weight:700;text-decoration:none;font-size:16px;min-height:48px}
.bt.sec{background:transparent;color:var(--texto);border:1.5px solid var(--borda);box-shadow:inset 0 0 0 1px var(--borda)}
section{padding:30px 0 6px}h2{font-size:clamp(22px,5vw,28px);margin-bottom:14px}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.cartao{background:var(--painel);border:1px solid var(--borda);border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:6px;text-decoration:none}
.cartao b{font-size:17px}.cartao small{color:var(--suave)}.preco{color:var(--cor);font-weight:800;font-size:18px}.linha{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.ag{margin-top:auto;font-weight:700;color:var(--cor);font-size:15px;padding-top:6px}
.prod{padding:0;overflow:hidden}.prod img,.sem{width:100%;aspect-ratio:1;object-fit:cover;background:var(--painel)}.prod .in{padding:12px 14px 14px}
.sobre{max-width:680px;white-space:pre-line;color:var(--texto)}
.equipe{display:flex;flex-wrap:wrap;gap:10px}.pessoa{background:var(--painel);border:1px solid var(--borda);border-radius:30px;padding:10px 18px}.pessoa small{color:var(--suave);display:block}
.fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.fotos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px;background:var(--painel)}
.dep{background:var(--painel);border:1px solid var(--borda);border-radius:18px;padding:16px}.dep p{margin:0 0 8px}.dep small{color:var(--suave)}
.contato{background:var(--painel);border:1px solid var(--borda);border-radius:20px;padding:18px;display:grid;gap:10px}.contato div{overflow-wrap:anywhere}.contato b{display:block;font-size:13px;color:var(--suave);font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.rodape{text-align:center;color:var(--suave);font-size:12px;padding:34px 12px 22px}.rodape b{letter-spacing:.12em}
.fixa{position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;justify-content:center;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:color-mix(in srgb,var(--fundo) 92%,transparent);backdrop-filter:blur(10px);border-top:1px solid var(--borda)}
.fixa .bt{flex:1;max-width:420px;text-align:center;padding:13px 10px}
@media(min-width:760px){.fixa{display:none}body{padding-bottom:0}}${camadaDoLayout(layout)}`;
}
/** O que muda de um formato para o outro (a ordem das seções vem do `cfg.secoes`). */
function camadaDoLayout(l) {
  const banner = `.topo.cb{position:relative;padding:0;background:none;text-align:left;overflow:hidden}.cb .banner{display:block;width:100%;height:clamp(170px,38vw,300px);object-fit:cover}.cb .miolo{position:relative;max-width:960px;margin:0 auto;padding:0 18px 26px}.cb .logo{margin-top:-46px;position:relative;background:var(--fundo);padding:8px;border-radius:20px;border:1px solid var(--borda);max-width:150px;max-height:100px}.cb h1{margin-top:12px}.cb .slogan{margin-left:0}.cb .botoes{justify-content:flex-start}`;
  if (l === "banner") return banner;
  if (l === "destaque") return banner + `.topo.cb{min-height:clamp(330px,70vw,520px);display:grid;align-items:center;text-align:center;color:#fff}.cb .banner{position:absolute;inset:0;height:100%}.cb::after{content:"";position:absolute;inset:0;background:linear-gradient(#00000040,#00000080)}.cb .miolo{position:relative;z-index:1;padding:44px 18px;width:100%}.cb .logo{margin:0 auto 6px;display:block;background:#ffffffee;border-radius:20px;padding:10px;max-width:190px;max-height:120px}.cb h1{color:#fff;text-shadow:0 2px 18px #0008;font-size:clamp(32px,8vw,56px)}.cb .slogan{color:#ffffffe6;margin:10px auto 0;max-width:560px;font-size:clamp(16px,3.6vw,20px)}.cb .botoes{justify-content:center;margin-top:18px}.cb .bt.sec{background:#ffffff26;color:#fff;border-color:#ffffff88}`;
  if (l === "servicos") return banner + `.cb .banner{height:clamp(110px,24vw,190px)}#servicos .grade{grid-template-columns:1fr}#servicos .cartao{flex-direction:row;flex-wrap:wrap;align-items:baseline;border-radius:14px}#servicos .linha{flex:1;min-width:60%}`;
  if (l === "galeria") return banner + `#galeria{padding-top:6px}.fotos{grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}.fotos img{aspect-ratio:4/3;border-radius:18px}.fotos img:first-child{grid-column:span 2;grid-row:span 2;aspect-ratio:auto;height:100%}`;
  if (l === "loja") return banner + `.grade{grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}#servicos .cartao{text-align:center;align-items:center;padding:22px 14px;border-radius:22px}#servicos .linha{flex-direction:column;align-items:center;gap:6px}.pedido{margin-top:8px;display:inline-block;padding:9px 16px;border-radius:30px;background:var(--cor);color:var(--sobre);font-weight:700;font-size:14px;text-decoration:none}.fotos{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}`;
  if (l === "cartao") return `body{display:flex;justify-content:center}.pagina{width:100%;max-width:480px;background:var(--fundo)}.topo{padding:36px 18px 18px}.logo{border-radius:50%;width:112px;height:112px;object-fit:contain;background:var(--painel);padding:10px;max-width:none;max-height:none;border:2px solid var(--cor)}.botoes{flex-direction:column;align-items:stretch}.botoes .bt{text-align:center;font-size:17px}.grade,.fotos{grid-template-columns:1fr 1fr}#servicos .grade{grid-template-columns:1fr}section{padding:20px 0 4px}.max{padding:0 16px}`;
  return "";
}
/** Texto branco ou preto por cima da cor do botão, o que tiver mais contraste. */
export function corSobre(cor) {
  const n = parseInt(cor.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#1A1416" : "#FFFFFF";
}

const urlHttps = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" ? x.toString() : null;
  } catch {
    return null;
  }
};
const zap = (tel, msg) => {
  const n = soDigitos(tel);
  return n.length >= 10 ? `https://wa.me/${n.length <= 11 ? "55" + n : n}?text=${encodeURIComponent(msg)}` : null;
};

/**
 * A página inteira. `dados`: {loja, cfg, servicos, equipe, produtos, fotos (números), base (/s/<loja>), agenda (link) ou null, vitrine (link)}.
 */
export function renderizarSite({ loja, cfg, servicos = [], equipe = [], produtos = [], fotos = [], base, agenda = null, vitrine = null, previa = false, marca = "venus", catalogo = null, fotoUrl = null }) {
  const tema = TEMAS[cfg.tema] || TEMAS.creme;
  const layout = LAYOUTS_SITE.includes(cfg.layout) ? cfg.layout : "classico";
  const cor = hex(cfg.cor, "#C2185B");
  const nome = loja.titulo || loja.nome || "Meu negócio";
  const modelo = textosModelo(cfg.nicho, nome);
  const slogan = cfg.slogan || modelo.slogan;
  const sobre = cfg.sobre || modelo.sobre;
  const whats = zap(loja.whatsapp, `Olá! Vim pelo site da ${nome}.`);
  const logo = cfg.logo ? `<img class="logo" src="${previa ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(logoSvg(cfg.logo, "p")) : esc(base) + "/logo.svg"}" alt="${esc(nome)}">` : loja.logo && urlHttps(loja.logo) ? `<img class="logo" src="${esc(loja.logo)}" alt="${esc(nome)}">` : "";
  const insta = cfg.instagram ? `https://instagram.com/${cfg.instagram}` : null;
  const botoes = [
    agenda ? `<a class="bt" href="${esc(agenda)}">Agendar horário</a>` : "",
    whats ? `<a class="bt${agenda ? " sec" : ""}" href="${esc(whats)}">Chamar no WhatsApp</a>` : "",
    catalogo ? `<a class="bt sec" href="${esc(catalogo)}">Ver catálogo</a>` : "",
    insta ? `<a class="bt sec" href="${esc(insta)}" rel="noopener">Instagram</a>` : "",
  ].join("");

  const partes = [];
  for (const s of cfg.secoes) {
    if (!s.ativa) continue;
    if (s.id === "servicos" && servicos.length) {
      partes.push(`<section id="servicos"><div class="max"><h2>${agenda ? "Serviços e preços" : "Serviços"}</h2><div class="grade">${servicos.map((x) => {
        const href = agenda ? `${agenda}${agenda.includes("?") ? "&" : "?"}s=${encodeURIComponent(x.id)}` : layout === "loja" ? zap(loja.whatsapp, `Olá! Quero: ${x.nome}`) : null;
        const miolo = `<div class="linha"><b>${esc(x.nome)}</b>${x.preco_centavos !== null && x.preco_centavos !== undefined ? `<span class="preco">${reais(x.preco_centavos)}</span>` : ""}</div>${x.descricao ? `<small>${esc(x.descricao)}</small>` : ""}${layout === "loja" && whats ? `<span class="pedido">Pedir no WhatsApp</span>` : ""}${x.duracao_min > 0 ? `<small>${duracao(x.duracao_min)}</small>` : ""}${href ? `<span class="ag">Agendar →</span>` : ""}`;
        return href ? `<a class="cartao" href="${esc(href)}">${miolo}</a>` : `<div class="cartao">${miolo}</div>`;
      }).join("")}</div></div></section>`);
    } else if (s.id === "produtos" && produtos.length) {
      const lista = produtos.slice(0, 6);
      partes.push(`<section id="produtos"><div class="max"><h2>Nossos produtos</h2><div class="grade" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${lista.map((p) => {
        const promo = p.promocao_centavos && p.promocao_centavos < p.preco_centavos;
        const img = p.imagem && urlHttps(p.imagem) ? `<img loading="lazy" src="${esc(p.imagem)}" alt="${esc(p.nome)}">` : `<div class="sem"></div>`;
        return `<a class="cartao prod" href="${esc(vitrine || "#")}">${img}<div class="in"><b>${esc(p.nome)}</b><div class="preco">${reais(promo ? p.promocao_centavos : p.preco_centavos)}</div></div></a>`;
      }).join("")}</div>${vitrine ? `<div class="botoes" style="justify-content:flex-start"><a class="bt sec" href="${esc(vitrine)}">Ver a loja completa</a></div>` : ""}</div></section>`);
    } else if (s.id === "sobre" && sobre) {
      partes.push(`<section id="sobre"><div class="max"><h2>Sobre nós</h2><p class="sobre">${esc(sobre)}</p></div></section>`);
    } else if (s.id === "equipe" && equipe.length) {
      partes.push(`<section id="equipe"><div class="max"><h2>Nossa equipe</h2><div class="equipe">${equipe.map((p) => `<div class="pessoa"><b>${esc(p.nome)}</b>${p.funcao ? `<small>${esc(p.funcao)}</small>` : ""}</div>`).join("")}</div></div></section>`);
    } else if (s.id === "galeria" && fotos.length) {
      partes.push(`<section id="galeria"><div class="max"><h2>Nosso trabalho</h2><div class="fotos">${fotos.map((n) => `<img loading="lazy" src="${esc(fotoUrl ? fotoUrl(n) : `${base}/foto/${n}`)}" alt="Foto ${n} de ${esc(nome)}">`).join("")}</div></div></section>`);
    } else if (s.id === "depoimentos" && cfg.depoimentos.length) {
      partes.push(`<section id="depoimentos"><div class="max"><h2>Quem já veio</h2><div class="grade">${cfg.depoimentos.map((d) => `<div class="dep"><p>“${esc(d.texto)}”</p><small>${esc(d.nome)}</small></div>`).join("")}</div></div></section>`);
    } else if (s.id === "contato" && (whats || cfg.endereco || cfg.horario || insta)) {
      const mapa = cfg.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cfg.endereco)}` : null;
      partes.push(`<section id="contato"><div class="max"><h2>Contato e horário</h2><div class="contato">${cfg.horario ? `<div><b>Horário</b>${esc(cfg.horario)}</div>` : ""}${cfg.endereco ? `<div><b>Endereço</b><a href="${esc(mapa)}" rel="noopener">${esc(cfg.endereco)}</a></div>` : ""}${whats ? `<div><b>WhatsApp</b><a href="${esc(whats)}">${esc(loja.whatsapp.length <= 11 ? "+55 " + loja.whatsapp : "+" + loja.whatsapp)}</a></div>` : ""}${insta ? `<div><b>Instagram</b><a href="${esc(insta)}" rel="noopener">@${esc(cfg.instagram)}</a></div>` : ""}</div></div></section>`);
    }
  }

  const ld = {
    "@context": "https://schema.org", "@type": "LocalBusiness", name: nome, url: base,
    ...(loja.whatsapp ? { telephone: `+${soDigitos(loja.whatsapp).length <= 11 ? "55" : ""}${soDigitos(loja.whatsapp)}` } : {}),
    ...(cfg.endereco ? { address: { "@type": "PostalAddress", streetAddress: cfg.endereco } } : {}),
  };
  const comBanner = ["banner", "servicos", "galeria", "loja", "destaque"].includes(layout);
  const cabeca = comBanner
    ? `<header class="topo cb"><img class="banner" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(bannerSvg(cfg.nicho, cor))}" alt=""><div class="miolo">${logo}<h1>${esc(nome)}</h1><p class="slogan">${esc(slogan)}</p><div class="botoes">${botoes}</div></div></header>`
    : `<header class="topo">${logo}<h1>${esc(nome)}</h1><p class="slogan">${esc(slogan)}</p><div class="botoes">${botoes}</div></header>`;
  const cta = agenda ? `<a class="bt" href="${esc(agenda)}">Agendar horário</a>` : "";
  const cta2 = whats ? `<a class="bt${agenda ? " sec" : ""}" href="${esc(whats)}">WhatsApp</a>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(nome)} · ${esc(slogan)}</title><meta name="description" content="${esc(`${slogan}. ${sobre}`.slice(0, 155))}"><meta property="og:title" content="${esc(nome)}"><meta property="og:description" content="${esc(slogan)}"><meta property="og:type" content="website">
<meta name="theme-color" content="${esc(tema.fundo)}">${previa ? '<meta name="robots" content="noindex">' : ""}<style>${css(tema, cfg.fonte, cor, layout)}</style>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script></head><body>${layout === "cartao" ? '<div class="pagina">' : ""}
${cabeca}
${partes.join("\n")}
${marca === "vitrine" ? '<footer class="rodape">Feito com a <a href="/vitrine/">Vênus Vitrine</a> · <b>VETORIAL TECH</b></footer>' : marca === false ? "" : '<footer class="rodape">Site feito com a Vênus · <b>VETORIAL TECH</b></footer>'}
${layout === "cartao" ? "</div>" : ""}${cta || cta2 ? `<div class="fixa">${cta}${cta2}</div>` : ""}</body></html>`;
}

