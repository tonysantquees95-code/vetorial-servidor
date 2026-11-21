import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { ErroLoja, registrarLoja } from "../src/loja/lojas.js";
import { tratarLoja } from "../src/loja/rotas.js";
import { tratarAgendaDaLoja } from "../src/agenda/rotas.js";
import { tratarSite } from "../src/meusite/rotas.js";
import { FONTES, gerarOpcoes, logoSvg, normalizarEspec, PALETAS, SIMBOLOS } from "../src/meusite/logos.js";
import { corSobre, normalizarSite, renderizarSite, secoesDoRamo, siteInicial, textosModelo } from "../src/meusite/site.js";

process.removeAllListeners("warning");
const mk = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123" });

test("logos: espec normaliza o que vier de fora e o SVG nunca carrega marcação alheia", () => {
  const e = normalizarEspec({ nome: '<script>alert(1)</script> Bela', simbolo: "xuxu", layout: "nada", fonte: "comic", nicho: "salao", cores: { principal: "red", fundo: "#ffffff" } });
  assert.equal(e.simbolo, "tesoura"); // padrão do ramo
  assert.equal(e.layout, "horizontal");
  assert.equal(e.fonte, "moderna");
  assert.equal(e.cores.fundo, "#FFFFFF");
  assert.match(e.cores.principal, /^#[0-9A-F]{6}$/);
  const svg = logoSvg({ ...e, nome: '</text><script>alert(1)</script>"onload="x' });
  assert.ok(!svg.includes("<script") && !svg.includes('"onload'));
  assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
});

test("logos: todos os símbolos, formatos, fontes e paletas geram SVG válido", () => {
  for (const simbolo of Object.keys(SIMBOLOS)) for (const layout of ["horizontal", "vertical", "selo", "tipografico"]) {
    const s = logoSvg({ nome: "Studio Bela Estética Avançada", subtitulo: "Cabelo e unhas", simbolo, layout });
    assert.ok(s.includes("viewBox") && s.length > 300, `${simbolo}/${layout}`);
  }
  for (const fonte of Object.keys(FONTES)) assert.ok(logoSvg({ nome: "X", fonte }).includes("font-family"));
  assert.equal(PALETAS.length, new Set(PALETAS.map((p) => p.id)).size);
  assert.ok(PALETAS.every((p) => /^#[0-9A-F]{6}$/i.test(p.principal)));
});

test("logos: as opções são estáveis, variadas e do ramo", () => {
  const a = gerarOpcoes({ nome: "Barbearia do Zé", nicho: "barbearia" });
  const b = gerarOpcoes({ nome: "Barbearia do Zé", nicho: "barbearia" });
  assert.deepEqual(a, b);
  assert.equal(a.length, 12);
  assert.equal(new Set(a.map((x) => `${x.simbolo}${x.layout}${x.fonte}${x.paleta}`)).size, 12);
  assert.ok(new Set(a.map((x) => x.layout)).size === 4);
  assert.ok(a.filter((x) => ["tesoura", "poste", "pente", "bigode", "coroa"].includes(x.simbolo)).length >= 5);
  const outras = gerarOpcoes({ nome: "Barbearia do Zé", nicho: "barbearia" }, { variacao: 1 });
  assert.notDeepEqual(a, outras);
  const fixa = gerarOpcoes({ nome: "Bela", nicho: "salao", paleta: "ouro", simbolo: "coroa" }, { quantidade: 6 });
  assert.ok(fixa.every((x) => x.simbolo === "coroa" && x.paleta === "ouro"));
});

test("site: normaliza escolhas e mantém o que não veio", () => {
  const base = siteInicial("barbearia");
  assert.equal(base.tema, "escuro");
  const c = normalizarSite({ tema: "inexistente", cor: "azul", slogan: "  Corte   na régua  ", instagram: "https://instagram.com/barbearia.ze/?hl=pt", depoimentos: [{ nome: "João", texto: "Ótimo" }, { nome: "", texto: "sem nome" }], secoes: [{ id: "sobre", ativa: true }, { id: "xis" }, { id: "sobre" }] }, base);
  assert.equal(c.tema, "escuro");
  assert.equal(c.cor, base.cor);
  assert.equal(c.slogan, "Corte na régua");
  assert.equal(c.instagram, "barbearia.ze");
  assert.equal(c.depoimentos.length, 1);
  assert.deepEqual(c.secoes.filter((s) => s.ativa).map((s) => s.id), ["sobre"]);
  assert.equal(c.secoes.length, 7);
  assert.equal(normalizarSite({ instagram: "@@@ruim!!" }, base).instagram, "");
  assert.deepEqual(secoesDoRamo("loja").filter((s) => s.ativa).map((s) => s.id), ["produtos", "sobre", "galeria", "depoimentos", "contato"]);
  assert.ok(textosModelo("salao", "Studio Bela", "Porto Alegre").sobre.includes("Porto Alegre"));
  assert.equal(corSobre("#FFFFFF"), "#1A1416");
  assert.equal(corSobre("#1B1B1B"), "#FFFFFF");
});

test("site: a página escapa HTML, mostra serviços com link da agenda e não tem script", () => {
  const cfg = { ...siteInicial("salao"), slogan: '<b>x</b> "oi"', sobre: "Linha 1\nLinha 2", endereco: "Rua A, 10", horario: "Seg a sáb", instagram: "studiobela", publicado: true, depoimentos: [{ nome: "Ana", texto: "Amei <3" }], logo: normalizarEspec({ nome: "Studio Bela", nicho: "salao" }) };
  const html = renderizarSite({
    loja: { titulo: "Studio <Bela>", whatsapp: "51999990000" }, cfg,
    servicos: [{ id: "abc", nome: "Corte <i>", descricao: "", duracao_min: 90, preco_centavos: 8000 }], equipe: [{ nome: "Ana", funcao: "Cabeleireira" }], fotos: [1, 2],
    base: "https://v.test/s/studio-bela", agenda: "https://v.test/agenda/studio-bela", produtos: [], vitrine: null,
  });
  assert.ok(!html.includes("<b>x</b>") && !html.includes("<i>") && !html.includes("Studio <Bela>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(html.includes("https://v.test/agenda/studio-bela?s=abc"));
  assert.ok(html.includes("1 h 30 min") && html.includes("R$") && html.includes("80,00"));
  assert.ok(html.includes("https://wa.me/5551999990000"));
  assert.ok(html.includes("/s/studio-bela/foto/2") && html.includes("/s/studio-bela/logo.svg"));
  assert.ok(html.includes("https://instagram.com/studiobela"));
  assert.ok(!/<script(?![^>]*ld\+json)/.test(html), "sem JavaScript");
  assert.ok(html.includes("VETORIAL TECH"));
  const sem = renderizarSite({ loja: { nome: "Sem agenda" }, cfg: { ...siteInicial("salao"), publicado: true }, servicos: [], base: "https://v.test/s/x" });
  assert.ok(!html.includes("undefined") && !sem.includes("undefined") && !sem.includes("Agendar horário"));
});

async function montar(env) {
  const reg = await registrarLoja(env, { nome: "Studio Bela", slug: "studio-bela" });
  const chamar = async (metodo, caminho, corpo) => {
    const q = new Request(`https://venus.test${caminho}`, { method: metodo, headers: { authorization: `Bearer ${reg.token}` }, body: corpo ? JSON.stringify(corpo) : undefined });
    const u = new URL(q.url);
    return tratarLoja(q, env, {}, u, u.pathname);
  };
  const publico = (caminho) => { const q = new Request(`https://venus.test${caminho}`); const u = new URL(q.url); return tratarSite(q, env, {}, u, u.pathname); };
  return { reg, chamar, publico };
}

test("meu site: do zero até publicar, com logo, fotos, serviços e agenda", async () => {
  const env = mk();
  const { chamar, publico, reg } = await montar(env);
  const antes = await (await chamar("GET", "/loja/site")).json();
  assert.equal(antes.novo, true);
  assert.equal(antes.config.publicado, false);
  assert.ok(antes.opcoes.paletas.length >= 8 && antes.opcoes.simbolos.length >= 10);
  // ainda não publicado
  assert.equal((await publico("/s/studio-bela")).status, 404);

  const logos = await (await chamar("POST", "/loja/site/logos", { nome: "Studio Bela", nicho: "salao", subtitulo: "Cabelo" })).json();
  assert.equal(logos.opcoes.length, 12);
  assert.ok(logos.opcoes[0].svg.startsWith("<svg"));

  const salvo = await (await chamar("PUT", "/loja/site", { nicho: "salao", tema: "rosa", cor: "#C2185B", slogan: "Beleza do seu jeito", endereco: "Rua das Flores, 100", horario: "Seg a sáb, 9h às 19h", whatsapp: "(51) 99999-0000", nome: "Studio Bela", logo: logos.opcoes[0].espec, publicado: true })).json();
  assert.equal(salvo.config.publicado, true);
  assert.equal(salvo.whatsapp, "51999990000");
  assert.ok(salvo.logoSvg.startsWith("<svg"));

  // serviços e equipe aparecem no site e liberam o botão da agenda
  const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(reg.id).first();
  const dono = async (m, c, corpo) => { const q = new Request(`https://venus.test${c}`, { method: m, body: corpo ? JSON.stringify(corpo) : undefined }); return (await tratarAgendaDaLoja(q, env, loja, new URL(q.url), new URL(q.url).pathname, { exigeAcesso: () => {} })).json(); };
  await dono("POST", "/loja/agenda/servicos", { nome: "Corte feminino", duracao_min: 60, preco_centavos: 9000 });
  await dono("POST", "/loja/agenda/equipe", { nome: "Ana", funcao: "Cabeleireira" });

  const pagina = await publico("/s/studio-bela");
  assert.equal(pagina.status, 200);
  assert.ok(pagina.headers.get("content-security-policy").includes("default-src 'none'"));
  const html = await pagina.text();
  assert.ok(html.includes("Corte feminino") && html.includes("Agendar horário") && html.includes("/agenda/studio-bela"));
  assert.ok(html.includes("Beleza do seu jeito") && html.includes("Rua das Flores"));

  const svg = await publico("/s/studio-bela/logo.svg");
  assert.equal(svg.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  assert.ok(svg.headers.get("content-security-policy").includes("default-src 'none'"));

  // foto da galeria
  const jpeg = "/9j/" + "A".repeat(200);
  assert.equal((await chamar("PUT", "/loja/site/foto/2", { dados: jpeg })).status, 200);
  assert.equal((await chamar("PUT", "/loja/site/foto/2", { dados: "nao-e-jpeg" })).status, 400);
  assert.equal((await chamar("PUT", "/loja/site/foto/0", { dados: jpeg })).status, 404);
  assert.equal((await publico("/s/studio-bela/foto/2")).headers.get("content-type"), "image/jpeg");
  assert.equal((await publico("/s/studio-bela/foto/3")).status, 404);
  assert.ok((await (await publico("/s/studio-bela")).text()).includes("/s/studio-bela/foto/2"));
  assert.deepEqual((await (await chamar("DELETE", "/loja/site/foto/2")).json()).fotos, []);

  // tirar do ar
  await chamar("PUT", "/loja/site", { publicado: false });
  assert.equal((await publico("/s/studio-bela")).status, 404);
});

test("meu site: prévia não grava nada; textos usam a IA e caem no modelo se ela falhar", async () => {
  const env = mk();
  const { chamar } = await montar(env);
  const p = await (await chamar("POST", "/loja/site/previa", { nicho: "barbearia", slogan: "Prévia", nome: "Barbearia Rei" })).json();
  assert.ok(p.html.includes("Barbearia Rei") && p.html.includes("Prévia") && p.html.includes('name="robots"'));
  assert.equal((await (await chamar("GET", "/loja/site")).json()).novo, true);

  env.GERADOR_DE_TESTE = async () => ({ texto: 'Claro! {"slogan":"Seu cabelo, nosso orgulho","sobre":"Atendimento caprichado com hora marcada."}' });
  const ia = await (await chamar("POST", "/loja/site/textos", { nicho: "salao", nome: "Studio Bela", cidade: "Porto Alegre", servicos: ["Corte", "Escova"] })).json();
  assert.equal(ia.origem, "ia");
  assert.equal(ia.slogan, "Seu cabelo, nosso orgulho");
  env.GERADOR_DE_TESTE = async () => { throw new Error("sem chave"); };
  const modelo = await (await chamar("POST", "/loja/site/textos", { nicho: "barbearia", nome: "Rei", cidade: "Canoas" })).json();
  assert.equal(modelo.origem, "modelo");
  assert.ok(modelo.sobre.includes("Canoas"));
  env.GERADOR_DE_TESTE = async () => ({ texto: "texto solto sem json" });
  assert.equal((await (await chamar("POST", "/loja/site/textos", { nicho: "salao", nome: "X" })).json()).origem, "modelo");
});

test("meu site: loja sem acesso não abre e nome inexistente dá 404 amigável", async () => {
  const env = mk();
  const { publico, reg, chamar } = await montar(env);
  await chamar("PUT", "/loja/site", { nicho: "salao", publicado: true });
  assert.equal((await publico("/s/studio-bela")).status, 200);
  await env.DB.prepare("UPDATE lojas SET trial_fim = 1, ativo_ate = 0 WHERE id = ?").bind(reg.id).run();
  assert.equal((await publico("/s/studio-bela")).status, 404);
  assert.equal((await publico("/s/nao-existe")).status, 404);
  assert.equal((await publico("/s/studio-bela/foto/10")).status, 404);
  assert.ok(ErroLoja);
});

test("testador: acesso livre por tempo indeterminado, sem virar administrador", async () => {
  const { comPrivilegios } = await import("../src/loja/lojas.js");
  const { appsLiberados } = await import("../src/loja/assinatura.js");
  const env = mk();
  const reg = await registrarLoja(env, { nome: "Teste Gui", slug: "teste-gui" });
  await env.DB.prepare("INSERT INTO usuarios (id, email, senha_hash, salt, loja, criado) VALUES ('u-gui', 'Outra.Pessoa@Hotmail.com', 'x', 'y', ?, 1)").bind(reg.id).run();
  const antes = await comPrivilegios(env, await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(reg.id).first());
  assert.notEqual(antes.plano, "testador");
  await env.DB.prepare("UPDATE usuarios SET email = 'Guilherme.Gewehr@Hotmail.com' WHERE id = 'u-gui'").run(); // vem da migração 0037
  const l = await comPrivilegios(env, await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(reg.id).first());
  assert.equal(l.plano, "testador");
  assert.ok(l.ativo_ate > Date.now() + 5 * 365 * 864e5);
  assert.deepEqual(appsLiberados(l), { vindex: true, vortex: true, vyntem: true });
});
