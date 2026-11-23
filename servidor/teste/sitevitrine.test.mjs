import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { cadastrar } from "../src/id/conta.js";
import { tratarSiteVitrine, normalizarSiteVitrine, LIMITES } from "../src/sitevitrine/rotas.js";

process.removeAllListeners("warning");
const ENV = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123", ORIGENS_PERMITIDAS: "https://app.exemplo" });
const T0 = Date.now();
async function usuario(env, email = "ana@exemplo.com") {
  const r = await cadastrar(env, { email, senha: "senha-forte-1", nome: "Ana", dispositivo: { id: `aparelho-${email}-xxxxxxxx`, nome: "Navegador", plataforma: "web" } }, T0);
  return { token: r.token, usuario: await env.DB.prepare("SELECT * FROM usuarios WHERE id = ?").bind(r.usuario.id).first() };
}
const chamar = (env, metodo, caminho, { token, corpo } = {}) => {
  const url = new URL("https://v.test" + caminho);
  return tratarSiteVitrine(new Request(url, { method: metodo, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, url, url.pathname);
};
const JPEG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9));
const base = (extra = {}) => ({ nome: "Studio da Ana", whats: "(51) 99999-8888", nicho: "salao", cidade: "Porto Alegre", tema: "creme", cor: "#C2185B", slogan: "Beleza do seu jeito", sobre: "Atendimento com carinho.", horario: "Seg a sáb, 9h às 19h", instagram: "@studiodaana", servicos: [{ nome: "Corte", preco: 6000 }, { nome: "Escova", preco: 4500, descricao: "Com finalização" }], fotos: [], ...extra });

test("conferir: nome e WhatsApp obrigatórios, limites do plano", () => {
  assert.ok(normalizarSiteVitrine({}).erros.length >= 2);
  assert.deepEqual(normalizarSiteVitrine(base()).erros, []);
  const muitos = Array.from({ length: LIMITES.gratis.servicos + 1 }, (_, i) => ({ nome: `S${i}` }));
  assert.match(normalizarSiteVitrine(base({ servicos: muitos })).erros[0], /até 8 serviços/);
  assert.deepEqual(normalizarSiteVitrine(base({ servicos: muitos }), { assinante: true }).erros, []);
  const fotos = Array.from({ length: 7 }, () => ({ fotoNova: JPEG }));
  assert.match(normalizarSiteVitrine(base({ fotos })).erros[0], /até 6 fotos/);
  assert.match(normalizarSiteVitrine(base({ fotos: [{ fotoNova: btoa("texto") }] })).erros[0], /JPEG/);
});

test("público: opções e prévia (com HTML escapado)", async () => {
  const env = ENV();
  const m = await (await chamar(env, "GET", "/sitev/modelos")).json();
  assert.equal(m.temas.filter((t) => t.gratis).length, 2); assert.ok(m.logos.length >= 1 && m.logos.every((l) => l.gratis));
  const p = await (await chamar(env, "POST", "/sitev/previa", { corpo: base({ nome: "<script>alert(1)</script>", servicos: [{ nome: "<b>x</b>" }], fotos: [{ fotoNova: JPEG }] }) })).json();
  assert.ok(!/<script>alert|<b>x<\/b>/.test(p.html)); assert.ok(p.html.includes("data:image/jpeg;base64,")); assert.ok(p.html.includes("Vênus Vitrine"));
  assert.equal((await (await chamar(env, "POST", "/sitev/previa", { corpo: {} })).json()).html, "");
});

test("sem login não publica", async () => {
  const env = ENV();
  assert.equal((await chamar(env, "POST", "/sitev", { corpo: base() })).status, 401);
  assert.equal((await chamar(env, "GET", "/sitev")).status, 401);
});

test("publicar, ver a página, foto, logo, visita, atualizar mantendo o endereço", async () => {
  const env = ENV(), u = await usuario(env);
  const r = await chamar(env, "POST", "/sitev", { token: u.token, corpo: base({ logoModelo: "mod-1", fotos: [{ fotoNova: JPEG }] }) });
  assert.equal(r.status, 200);
  const s = (await r.json()).site;
  assert.equal(s.slug, "studio-da-ana"); assert.equal(s.link, "https://v.test/w/studio-da-ana"); assert.equal(s.fotos.length, 1);
  const pag = await chamar(env, "GET", "/w/studio-da-ana");
  assert.equal(pag.status, 200); assert.match(pag.headers.get("content-security-policy"), /default-src 'none'/);
  const html = await pag.text();
  assert.ok(html.includes("Corte") && html.includes("R$") && html.includes("Vênus Vitrine</a>") && html.includes(`/w/studio-da-ana/foto/${s.fotos[0]}`) && html.includes("wa.me/5551999998888") && html.includes("/w/studio-da-ana/logo.svg"));
  assert.ok(!/<script(?! type="application\/ld\+json")/.test(html));
  assert.equal((await chamar(env, "GET", `/w/studio-da-ana/foto/${s.fotos[0]}`)).headers.get("content-type"), "image/jpeg");
  const logo = await chamar(env, "GET", "/w/studio-da-ana/logo.svg"); assert.equal(logo.status, 200); assert.match(await logo.text(), /<svg/);
  assert.equal((await chamar(env, "GET", "/w/nao-existe-mesmo")).status, 404);
  assert.equal((await (await chamar(env, "GET", "/sitev", { token: u.token })).json()).site.visitas, 1);
  const r2 = await (await chamar(env, "POST", "/sitev", { token: u.token, corpo: base({ nome: "Outro nome", fotos: [] }) })).json();
  assert.equal(r2.site.slug, "studio-da-ana"); assert.equal(r2.site.fotos.length, 0);
  assert.equal((await chamar(env, "GET", `/w/studio-da-ana/foto/${s.fotos[0]}`)).status, 404);
});

test("catálogo da pessoa vira botão no site", async () => {
  const env = ENV(), u = await usuario(env);
  await env.DB.prepare("INSERT INTO catalogos (id, usuario, slug, nome, whats, descricao, cor, tema, produtos, sem_marca, criado, atualizado) VALUES ('c1', ?, 'loja-ana', 'Loja', '5551999998888', '', '#c2185b', 'claro', '[]', 0, 1, 1)").bind(u.usuario.id).run();
  await chamar(env, "POST", "/sitev", { token: u.token, corpo: base() });
  assert.ok((await (await chamar(env, "GET", "/w/studio-da-ana")).text()).includes("https://v.test/c/loja-ana"));
});

test("foto alheia, endereço repetido, nome reservado, tema/logo com assinatura", async () => {
  const env = ENV(), a = await usuario(env, "a@exemplo.com"), b = await usuario(env, "b@exemplo.com");
  const sa = (await (await chamar(env, "POST", "/sitev", { token: a.token, corpo: base({ fotos: [{ fotoNova: JPEG }] }) })).json()).site;
  const sb = (await (await chamar(env, "POST", "/sitev", { token: b.token, corpo: base({ fotos: [{ foto: sa.fotos[0] }] }) })).json()).site;
  assert.equal(sb.fotos.length, 0); assert.match(sb.slug, /^studio-da-ana-[a-z0-9]{3}$/);
  const c = await usuario(env, "c@exemplo.com");
  assert.match((await (await chamar(env, "POST", "/sitev", { token: c.token, corpo: base({ nome: "Admin" }) })).json()).site.slug, /^admin-[a-z0-9]{3}$/);
  const t = await chamar(env, "POST", "/sitev", { token: a.token, corpo: base({ tema: "noite" }) });
  assert.equal(t.status, 403); assert.equal((await t.json()).codigo, "assinatura");
  const l = await chamar(env, "POST", "/sitev", { token: a.token, corpo: base({ logoModelo: "mod-2" }) });
  assert.equal(l.status, 403);
});

test("plano pago: tema bloqueado, mais fotos e sem a marca", async () => {
  const env = ENV(), u = await usuario(env), agora = Date.now();
  await env.DB.prepare("UPDATE lojas SET ativo_ate = ?, trial_fim = ? WHERE id = ?").bind(agora + 30 * 86_400_000, agora - 86_400_000, u.usuario.loja).run();
  const r = await chamar(env, "POST", "/sitev", { token: u.token, corpo: base({ tema: "noite", fotos: Array.from({ length: 8 }, () => ({ fotoNova: JPEG })) }) });
  assert.equal(r.status, 200);
  const j = await r.json(); assert.equal(j.assinante, true); assert.equal(j.site.fotos.length, 8);
  assert.ok(!(await (await chamar(env, "GET", `/w/${j.site.slug}`)).text()).includes("Vênus Vitrine</a>"));
});

test("formatos de página: cada um muda a estrutura; os de assinatura ficam bloqueados no grátis", async () => {
  const env = ENV(), u = await usuario(env);
  const m = await (await chamar(env, "GET", "/sitev/modelos")).json();
  assert.deepEqual(m.layouts.map((l) => l.id), ["banner", "servicos", "loja", "cartao", "galeria"]);
  assert.deepEqual(m.layouts.filter((l) => l.gratis).map((l) => l.id), ["banner", "servicos"]);
  const previa = async (layout, extra = {}) => (await (await chamar(env, "POST", "/sitev/previa", { corpo: base({ layout, ...extra }) })).json()).html;
  const banner = await previa("banner"), cartao = await previa("cartao"), loja = await previa("loja");
  assert.ok(banner.includes('class="banner"') && banner.includes("data:image/svg+xml")); assert.ok(!banner.includes('<div class="pagina">'));
  assert.ok(cartao.includes('<div class="pagina">') && !cartao.includes('class="banner"'));
  assert.ok(loja.includes("Pedir no WhatsApp") && loja.includes("Quero%3A%20Corte"));
  // a ordem das seções muda: na galeria as fotos vêm antes dos serviços
  const gal = await previa("galeria", { fotos: [{ fotoNova: JPEG }] });
  assert.ok(gal.indexOf('id="galeria"') < gal.indexOf('id="servicos"'));
  // banner diferente por ramo, igual para o mesmo ramo
  const a = await previa("banner", { nicho: "barbearia" }), b = await previa("banner", { nicho: "manicure" }), a2 = await previa("banner", { nicho: "barbearia" });
  assert.notEqual(a.match(/data:image\/svg\+xml[^"]*/)[0], b.match(/data:image\/svg\+xml[^"]*/)[0]); assert.equal(a.match(/data:image\/svg\+xml[^"]*/)[0], a2.match(/data:image\/svg\+xml[^"]*/)[0]);
  // publicar: livre passa, de assinatura é 403
  assert.equal((await chamar(env, "POST", "/sitev", { token: u.token, corpo: base({ layout: "servicos" }) })).status, 200);
  const t = await chamar(env, "POST", "/sitev", { token: u.token, corpo: base({ layout: "cartao" }) });
  assert.equal(t.status, 403); assert.equal((await t.json()).codigo, "assinatura");
  assert.ok((await (await chamar(env, "GET", "/w/studio-da-ana")).text()).includes('class="banner"'));
});

test("fonte nova e layout inválido caem no padrão", async () => {
  const env = ENV(), u = await usuario(env);
  const r = await (await chamar(env, "POST", "/sitev", { token: u.token, corpo: base({ layout: "inventado", fonte: "cursiva" }) })).json();
  assert.equal(r.site.cfg.layout, "banner"); assert.equal(r.site.cfg.fonte, "cursiva");
});

test("logo do editor: vale no site e na rota do logo, valida a espec e barra neon no plano grátis", async () => {
  const env = ENV(), u = await usuario(env);
  const espec = { nome: "Studio da Ana", simbolo: "pizza", fonte: "maquina", layout: "selo", cores: { principal: "#ff2bd6", fundo: "<x>" } };
  const r = await chamar(env, "POST", "/sitev", { token: u.token, corpo: base({ logoModelo: "mod-1", logoEspec: espec }) });
  assert.equal(r.status, 200);
  const s = (await r.json()).site;
  assert.equal(s.logoModelo, ""); assert.equal(s.logoEspec.simbolo, "pizza");
  const svg = await (await chamar(env, "GET", `/w/${s.slug}/logo.svg`)).text();
  assert.ok(svg.includes("#FF2BD6") && svg.includes("Courier") && !svg.includes("<x>"));
  const html = await (await chamar(env, "GET", `/w/${s.slug}`)).text();
  assert.ok(html.includes("Courier") || html.includes("data:image/svg+xml") || html.includes("logo.svg"));
  const n = await chamar(env, "POST", "/sitev", { token: u.token, corpo: base({ logoEspec: { ...espec, neon: { ativo: true } } }) });
  assert.equal(n.status, 403); assert.equal((await n.json()).codigo, "assinatura");
});

test("cartão de visita online e contato .vcf saem dos dados do site, escapados e sem script", async () => {
  const env = ENV(), u = await usuario(env);
  const r = await chamar(env, "POST", "/sitev", { token: u.token, corpo: base({ nome: "Studio <b>Ana</b>", instagram: "@studio.ana", logoEspec: { nome: "Studio", simbolo: "pizza" } }) });
  const s = (await r.json()).site;
  const res = await chamar(env, "GET", `/w/${s.slug}/cartao`);
  assert.equal(res.status, 200); assert.match(res.headers.get("content-security-policy"), /default-src 'none'/);
  const html = await res.text();
  assert.ok(html.includes("wa.me/5551999998888") && html.includes("instagram.com/studio.ana") && html.includes("contato.vcf") && html.includes("Vênus Vitrine"));
  assert.ok(!html.includes("<b>Ana") && !/<script/i.test(html));
  const v = await chamar(env, "GET", `/w/${s.slug}/contato.vcf`);
  assert.match(v.headers.get("content-type"), /text\/vcard/);
  const txt = await v.text(); assert.ok(txt.startsWith("BEGIN:VCARD") && txt.includes("TEL;TYPE=CELL,VOICE:+5551999998888") && txt.includes("END:VCARD"));
  assert.equal((await chamar(env, "GET", "/w/nao-existe-mesmo/cartao")).status, 404);
});
