// Cartão de visita online: uma página curta com logo, nome, botões (WhatsApp, Instagram, site, mapa) e "Salvar contato" (.vcf).
// Sai dos MESMOS dados do site da pessoa (nada novo para preencher). HTML puro, sem JavaScript, tudo escapado.
import { esc } from "../catalogo/dados.js";
import { TEMAS } from "../meusite/site.js";
import { logoSvg } from "../meusite/logos.js";

const COR = (c, p) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? c : p);
const arroba = (t) => String(t || "").trim().replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, 30);
const fone = (n) => { const d = String(n || "").replace(/\D/g, ""); return d.startsWith("55") ? d : `55${d}`; };

/** `s`: dados do site (doBanco); `logoEspec`: receita do logo ou null; `base`: https://host/w/<slug>. */
export function cartaoHtml(s, { logoEspec = null, base, marca = true } = {}) {
  const c = s.cfg || {}, t = TEMAS[c.tema] || TEMAS.creme, cor = COR(c.cor, "#C2185B");
  const wa = `https://wa.me/${fone(s.whats)}?text=${encodeURIComponent(`Oi! Vi o cartão do(a) ${s.nome} e quero falar com vocês.`)}`;
  const ig = arroba(c.instagram);
  const mapa = c.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.endereco} ${s.cidade || ""}`.trim())}` : "";
  const logo = logoEspec ? `<img class="logo" alt="${esc(s.nome)}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg(logoEspec, "c"))}">` : `<div class="ini" aria-hidden="true">${esc([...String(s.nome)][0] || "V")}</div>`;
  const botao = (href, rotulo, forte) => `<a class="b${forte ? " f" : ""}" href="${esc(href)}" rel="noopener">${esc(rotulo)}</a>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${esc(t.fundo)}"><meta name="robots" content="noindex"><title>${esc(s.nome)} · cartão de visita</title><meta property="og:title" content="${esc(s.nome)}">
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:${t.fundo};color:${t.texto};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.cartao{width:100%;max-width:400px;background:${t.painel};border:1px solid ${t.borda};border-radius:28px;padding:30px 22px;text-align:center;box-shadow:0 18px 50px #0000001f;border-top:6px solid ${cor}}
.logo{display:block;margin:0 auto 14px;max-width:100%;max-height:150px;height:auto}.ini{width:84px;height:84px;margin:0 auto 14px;border-radius:50%;background:${cor};color:#fff;font-size:40px;font-weight:800;display:grid;place-items:center}
h1{margin:0 0 6px;font-size:26px;line-height:1.2;overflow-wrap:anywhere}p{margin:0 0 6px;color:${t.suave};overflow-wrap:anywhere}.hor{font-size:14px}
.bs{display:grid;gap:12px;margin:22px 0 4px}.b{display:block;padding:15px 16px;border-radius:16px;border:2px solid ${cor};color:${t.texto};text-decoration:none;font-weight:700;font-size:17px}
.b.f{background:${cor};color:#fff}.rod{margin-top:20px;font-size:13px;color:${t.suave}}.rod a{color:inherit}</style></head><body>
<main class="cartao">${logo}<h1>${esc(s.nome)}</h1>${c.slogan ? `<p>${esc(c.slogan)}</p>` : ""}${c.endereco ? `<p class="hor">${esc(c.endereco)}${s.cidade ? `, ${esc(s.cidade)}` : ""}</p>` : ""}${c.horario ? `<p class="hor">${esc(c.horario)}</p>` : ""}
<div class="bs">${botao(wa, "Chamar no WhatsApp", true)}${ig ? botao(`https://instagram.com/${ig}`, `Instagram @${ig}`) : ""}${botao(base, "Ver o site")}${mapa ? botao(mapa, "Como chegar") : ""}${botao(`${base}/contato.vcf`, "Salvar contato")}</div>
${marca ? `<p class="rod">Feito com a <a href="https://vetorialtech.com/vitrine/">Vênus Vitrine</a></p>` : ""}</main></body></html>`;
}

const vlinha = (t) => String(t ?? "").replace(/[\r\n]+/g, " ").replace(/([,;\\])/g, "\\$1");
/** Contato para a agenda do celular (vCard 3.0). */
export function vcard(s, base) {
  const c = s.cfg || {};
  const l = ["BEGIN:VCARD", "VERSION:3.0", `FN:${vlinha(s.nome)}`, `ORG:${vlinha(s.nome)}`, `TEL;TYPE=CELL,VOICE:+${fone(s.whats)}`, `URL:${vlinha(base)}`];
  if (c.endereco) l.push(`ADR;TYPE=WORK:;;${vlinha(c.endereco)};${vlinha(s.cidade || "")};;;Brasil`);
  const ig = arroba(c.instagram); if (ig) l.push(`X-SOCIALPROFILE;TYPE=instagram:https://instagram.com/${ig}`);
  l.push("END:VCARD");
  return l.join("\r\n") + "\r\n";
}
