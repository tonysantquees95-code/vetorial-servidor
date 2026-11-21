// Rotas da agenda de serviços.
//   públicas  /agenda/<loja>                   página de agendamento do cliente (+ /info, /horarios, /reservar)
//             /agenda/r/<codigo>               a marcação do cliente (ver, cancelar, calendário .ics)
//             /agenda/equipe/<token>           agenda da equipe por link secreto (um profissional ou a recepção)
//   do lojista (token da loja / Vetorial ID)   /loja/agenda/*  e a página de gestão /agenda/painel
import { iguais } from "../loja/cripto.js";
import { acessoLiberado, comPrivilegios, ErroLoja } from "../loja/lojas.js";
import * as D from "./dados.js";
import { agoraLocal, dataBonita, dataValida, hhmm, somarDias } from "./horarios.js";
import { calendario } from "./ics.js";
import { paginaDaEquipe, paginaDaMarcacao, paginaDeAgendamento, PAINEL_AGENDA } from "./paginas.js";

const CAB = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...CAB } });
const html = (corpo, status = 200, csp = true) => new Response(corpo, {
  status,
  headers: { "content-type": "text/html; charset=utf-8", ...CAB, ...(csp ? { "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https:; form-action 'none'; base-uri 'none'" } : {}) },
});
const aviso = (titulo, texto, status = 404) =>
  html(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta name=robots content=noindex><title>${titulo}</title><body style="font-family:system-ui,sans-serif;background:#070a1c;color:#fff;text-align:center;padding:60px 20px"><h2>${titulo}</h2><p style="color:#8b95c0">${texto}</p>`, status);
const ics = (corpo, nome) => new Response(corpo, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `inline; filename="${nome}"`, ...CAB } });

export const ehRotaDaAgenda = (c) => c === "/agenda" || c.startsWith("/agenda/");
/** Nomes que não podem ser de uma loja no endereço /agenda/<loja>. */
const RESERVADAS = new Set(["painel", "equipe", "r"]);

async function corpoJson(req, max = 60_000) {
  const t = await req.text();
  if (t.length > max) throw new ErroLoja(413, "corpo_grande", "Pedido grande demais.");
  try {
    const d = JSON.parse(t || "{}");
    if (!d || typeof d !== "object" || Array.isArray(d)) throw 0;
    return d;
  } catch {
    throw new ErroLoja(400, "json_invalido", "O corpo precisa ser um JSON válido.");
  }
}

async function lojaPublica(env, slug) {
  const loja = await comPrivilegios(env, await env.DB.prepare("SELECT * FROM lojas WHERE slug = ?").bind(slug).first());
  if (!loja) throw new ErroLoja(404, "loja_inexistente", "Estabelecimento não encontrado. Confira o endereço do link.");
  if (!acessoLiberado(loja)) throw new ErroLoja(404, "fora_do_ar", "A agenda deste estabelecimento está temporariamente fora do ar.");
  return loja;
}

/** O que a página pública pode saber da loja (nunca telefone de cliente nem token). */
const dadosPublicos = (loja) => ({ nome: loja.titulo || loja.nome, cor: loja.cor || "#E36BD0", logo: loja.logo || "", whatsapp: loja.whatsapp || "" });

/** O link secreto vale para um profissional ou para a recepção (toda a equipe). */
async function escopoDaEquipe(env, token) {
  const p = await env.DB.prepare("SELECT id, loja, nome, ativo FROM agenda_profissionais WHERE token = ?").bind(token).first();
  if (p) {
    if (!p.ativo) throw new ErroLoja(404, "link_invalido", "Este link não vale mais.");
    return { lojaId: p.loja, profissional: p.id, nome: p.nome };
  }
  const c = await env.DB.prepare("SELECT loja, token_geral FROM agenda_config WHERE token_geral = ?").bind(token).first();
  if (c && iguais(c.token_geral, token)) return { lojaId: c.loja, profissional: null, nome: "Recepção" };
  throw new ErroLoja(404, "link_invalido", "Este link não vale mais. Peça um novo ao responsável.");
}

async function limitar(env, req, chave) {
  if (!env.LIMITADOR) return;
  const ip = req.headers.get("cf-connecting-ip") || "x";
  if (!(await env.LIMITADOR.limit({ key: `${chave}:${ip}` })).success) throw new ErroLoja(429, "muitas_tentativas", "Muitas tentativas. Espere um minuto.");
}

const titulo = (r) => `${r.cliente} · ${r.servico_nome}`;
const descricao = (r) => [r.telefone ? `WhatsApp: +${r.telefone}` : "", r.profissional_nome ? `Com ${r.profissional_nome}` : "", r.obs ? `Obs.: ${r.obs}` : ""].filter(Boolean).join("\n");

export async function tratarAgenda(req, env, ctx, url, caminho, agora = Date.now()) {
  const pagina = req.method === "GET" || req.method === "HEAD";
  try {
    if (caminho === "/agenda/painel" && pagina) return html(PAINEL_AGENDA);

    // ------------------------------------------------------------------------------- equipe (link secreto)
    let m = /^\/agenda\/equipe\/([a-f0-9]{48})(\.ics|\/dia|\/reservas\/(\d+))?$/.exec(caminho);
    if (m) {
      const esc = await escopoDaEquipe(env, m[1]);
      if (!m[2] && pagina) return html(paginaDaEquipe());
      const hoje = agoraLocal(agora);
      if (m[2] === ".ics" && pagina) {
        const lista = await D.listarReservas(env, esc.lojaId, somarDias(hoje.data, -7), somarDias(hoje.data, 54), esc.profissional);
        const loja = await env.DB.prepare("SELECT nome, titulo FROM lojas WHERE id = ?").bind(esc.lojaId).first();
        const eventos = lista.map((r) => ({ id: r.id, titulo: titulo(r), data: r.data, ini: r.ini, fim: r.fim, descricao: descricao(r), cancelado: r.status === "cancelado", alarmeMin: 30 }));
        return ics(calendario(eventos, { nome: `${esc.nome} · ${loja.titulo || loja.nome}`, agora }), "agenda.ics");
      }
      if (m[2] === "/dia" && pagina) {
        const data = dataValida(url.searchParams.get("data")) ? url.searchParams.get("data") : hoje.data;
        const dias = Math.min(7, Math.max(1, Number(url.searchParams.get("dias")) || 1));
        const lojaRow = await env.DB.prepare("SELECT nome, titulo, cor, whatsapp FROM lojas WHERE id = ?").bind(esc.lojaId).first();
        const equipe = (await D.listarEquipe(env, esc.lojaId)).filter((p) => !esc.profissional || p.id === esc.profissional);
        const reservas = await D.listarReservas(env, esc.lojaId, data, somarDias(data, dias - 1), esc.profissional);
        return json({
          escopo: esc.profissional ? "profissional" : "recepcao", nome: esc.nome, loja: { nome: lojaRow.titulo || lojaRow.nome, cor: lojaRow.cor, whatsapp: lojaRow.whatsapp },
          data, hoje: hoje.data, agoraMin: hoje.minuto, profissionais: equipe.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor })),
          reservas: reservas.map(({ codigo, ...r }) => r),
        });
      }
      if (m[3] && req.method === "POST") {
        const d = await corpoJson(req);
        await D.mudarStatus(env, esc.lojaId, m[3], String(d.status || ""), { profissional: esc.profissional, agora });
        return json({ ok: true });
      }
      return json({ error: "não encontrado" }, 404);
    }

    // ------------------------------------------------------------------------------- a marcação do cliente
    m = /^\/agenda\/r\/([a-f0-9]{12})(\.ics|\/cancelar)?$/.exec(caminho);
    if (m) {
      const r = await D.reservaPorCodigo(env, m[1]);
      if (!r) return m[2] === "/cancelar" ? json({ error: "Marcação não encontrada." }, 404) : aviso("Marcação não encontrada", "Confira o endereço do link.");
      const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(r.loja).first();
      const cfg = await D.garantirConfig(env, r.loja);
      if (m[2] === "/cancelar" && req.method === "POST") {
        await limitar(env, req, "agenda-cancelar");
        await D.cancelarPeloCliente(env, m[1], { agora });
        return json({ ok: true });
      }
      if (m[2] === ".ics" && pagina) {
        const nome = loja.titulo || loja.nome;
        return ics(calendario([{ id: r.id, titulo: `${r.servico_nome} · ${nome}`, data: r.data, ini: r.ini, fim: r.fim, descricao: r.profissional_nome ? `Com ${r.profissional_nome}` : "", cancelado: r.status === "cancelado", alarmeMin: 60 }], { nome, agora }), "marcacao.ics");
      }
      if (!m[2] && pagina) {
        const { telefone, loja: _l, ...publica } = r;
        void telefone; void _l;
        return html(paginaDaMarcacao({ loja: { ...dadosPublicos(loja), slug: loja.slug }, reserva: publica, cancelamentoHoras: cfg.cancelamento_horas, aviso: cfg.aviso, bonita: dataBonita(r.data, r.ini) }));
      }
      return json({ error: "não encontrado" }, 404);
    }

    // ------------------------------------------------------------------------------- página e API de agendamento
    m = /^\/agenda\/([a-z0-9-]{3,32})(\/info|\/horarios|\/reservar)?$/.exec(caminho);
    if (m && !RESERVADAS.has(m[1])) {
      const loja = await lojaPublica(env, m[1]);
      const cfg = await D.garantirConfig(env, loja.id);
      if (!m[2] && pagina) return html(paginaDeAgendamento({ loja: { ...dadosPublicos(loja), slug: loja.slug }, ativa: !!cfg.ativa }));
      if (m[2] === "/info" && pagina) {
        const servicos = await D.listarServicos(env, loja.id, { so_ativos: true });
        const equipe = await D.listarEquipe(env, loja.id, { so_ativos: true });
        const hoje = agoraLocal(agora);
        return json({
          loja: dadosPublicos(loja), ativa: !!cfg.ativa, aviso: cfg.aviso, hoje: hoje.data, janelaDias: cfg.janela_dias,
          servicos: servicos.map((s) => ({ id: s.id, nome: s.nome, descricao: s.descricao, duracao: s.duracao_min, preco: s.preco_centavos })),
          profissionais: equipe.filter((p) => p.horarios.length).map((p) => ({ id: p.id, nome: p.nome, funcao: p.funcao, cor: p.cor, servicos: p.servicos })),
        });
      }
      if (m[2] === "/horarios" && pagina) {
        const servicoId = url.searchParams.get("servico") || "";
        const prof = url.searchParams.get("prof") || null;
        const data = url.searchParams.get("data") || "";
        const lista = cfg.ativa ? await D.horariosLivres(env, loja.id, { servicoId, profId: prof, data, agora, config: cfg }) : [];
        return json({ data, horarios: lista.map((h) => ({ ini: h.ini, hora: h.hora, profissional: h.profissional, profissionalNome: h.profissionalNome })) });
      }
      if (m[2] === "/reservar" && req.method === "POST") {
        await limitar(env, req, "agenda");
        const d = await corpoJson(req, 10_000);
        if (d.site) throw new ErroLoja(400, "invalido", "Não foi possível concluir."); // campo escondido: só robô preenche
        const r = await D.reservar(env, loja, d, { agora, config: cfg });
        return json({ ok: true, codigo: r.codigo, link: `${url.origin}/agenda/r/${r.codigo}`, quando: dataBonita(r.data, r.ini), servico: r.servicoNome, profissional: r.profissionalNome, fim: hhmm(r.fim) }, 201);
      }
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    const pagina2 = req.method === "GET" && !caminho.endsWith("/info") && !caminho.endsWith("/horarios") && !caminho.endsWith("/dia") && !caminho.endsWith(".ics");
    if (e instanceof ErroLoja) return pagina2 ? aviso(e.status === 429 ? "Calma um instante" : "Não foi possível abrir", e.message, e.status) : json({ error: e.message, codigo: e.codigo }, e.status);
    console.error("agenda", caminho, e && e.stack ? e.stack : e);
    return pagina2 ? aviso("Não consegui abrir agora", "Tente de novo em instantes.", 500) : json({ error: "erro interno" }, 500);
  }
}

// ======================================================================================================== do lojista
/** /loja/agenda/* (a loja já foi identificada pelo token ou pelo Vetorial ID). Devolve null se a rota não é da agenda. */
export async function tratarAgendaDaLoja(req, env, loja, url, caminho, { exigeAcesso, agora = Date.now() } = {}) {
  if (!caminho.startsWith("/loja/agenda")) return null;
  const origem = url.origin;
  const escrever = () => exigeAcesso && exigeAcesso(loja);
  let m;
  if (caminho === "/loja/agenda" && req.method === "GET") {
    const e = await D.estado(env, loja.id);
    const { token_geral, ...config } = e.config;
    return json({
      config, servicos: e.servicos, hoje: agoraLocal(agora).data,
      loja: { id: loja.id, nome: loja.titulo || loja.nome, slug: loja.slug, whatsapp: loja.whatsapp || "" },
      linkPublico: `${origem}/agenda/${loja.slug}`, linkRecepcao: `${origem}/agenda/equipe/${token_geral}`,
      equipe: e.equipe.map(({ token, ...p }) => ({ ...p, link: `${origem}/agenda/equipe/${token}`, calendario: `${origem}/agenda/equipe/${token}.ics` })),
      calendarioGeral: `${origem}/agenda/equipe/${token_geral}.ics`,
    });
  }
  if (caminho === "/loja/agenda/config" && req.method === "PUT") { escrever(); return json({ config: { ...(({ token_geral, ...c }) => c)(await D.salvarConfig(env, loja.id, await corpoJson(req))) } }); }
  if (caminho === "/loja/agenda/servicos" && req.method === "POST") { escrever(); return json({ id: await D.salvarServico(env, loja.id, await corpoJson(req), agora) }, 201); }
  if ((m = /^\/loja\/agenda\/servicos\/([a-f0-9]{12})$/.exec(caminho)) && req.method === "DELETE") { escrever(); await D.removerServico(env, loja.id, m[1]); return json({ ok: true }); }
  if (caminho === "/loja/agenda/equipe" && req.method === "POST") { escrever(); return json({ id: await D.salvarProfissional(env, loja.id, await corpoJson(req), agora) }, 201); }
  if ((m = /^\/loja\/agenda\/equipe\/([a-f0-9]{12})$/.exec(caminho)) && req.method === "DELETE") { escrever(); await D.removerProfissional(env, loja.id, m[1]); return json({ ok: true }); }
  if ((m = /^\/loja\/agenda\/equipe\/([a-f0-9]{12})\/link$/.exec(caminho)) && req.method === "POST") {
    escrever();
    const t = await D.novoLinkDoProfissional(env, loja.id, m[1]);
    return json({ link: `${origem}/agenda/equipe/${t}`, calendario: `${origem}/agenda/equipe/${t}.ics` });
  }
  if (caminho === "/loja/agenda/recepcao/link" && req.method === "POST") {
    escrever();
    const t = await D.novoLinkGeral(env, loja.id);
    return json({ link: `${origem}/agenda/equipe/${t}`, calendario: `${origem}/agenda/equipe/${t}.ics` });
  }
  if (caminho === "/loja/agenda/reservas" && req.method === "GET") {
    const hoje = agoraLocal(agora).data;
    const de = url.searchParams.get("de") || hoje;
    const ate = url.searchParams.get("ate") || somarDias(de, 6);
    return json({ de, ate, reservas: await D.listarReservas(env, loja.id, de, ate, url.searchParams.get("prof") || null) });
  }
  if (caminho === "/loja/agenda/reservas" && req.method === "POST") {
    escrever();
    const r = await D.reservarNoBalcao(env, loja, await corpoJson(req), { agora });
    return json({ id: r.id, codigo: r.codigo, quando: dataBonita(r.data, r.ini) }, 201);
  }
  if ((m = /^\/loja\/agenda\/reservas\/(\d+)$/.exec(caminho)) && req.method === "POST") {
    escrever();
    await D.mudarStatus(env, loja.id, m[1], String((await corpoJson(req)).status || ""), { agora });
    return json({ ok: true });
  }
  if ((m = /^\/loja\/agenda\/reservas\/(\d+)$/.exec(caminho)) && req.method === "DELETE") {
    escrever();
    await env.DB.prepare("DELETE FROM agenda_reservas WHERE id = ? AND loja = ?").bind(Number(m[1]), loja.id).run();
    return json({ ok: true });
  }
  if (caminho === "/loja/agenda/bloqueios" && req.method === "GET") return json({ bloqueios: await D.listarBloqueios(env, loja.id, agoraLocal(agora).data) });
  if (caminho === "/loja/agenda/bloqueios" && req.method === "POST") { escrever(); return json({ id: await D.criarBloqueio(env, loja.id, await corpoJson(req)) }, 201); }
  if ((m = /^\/loja\/agenda\/bloqueios\/(\d+)$/.exec(caminho)) && req.method === "DELETE") { escrever(); await D.removerBloqueio(env, loja.id, m[1]); return json({ ok: true }); }
  if (caminho === "/loja/agenda/novos" && req.method === "GET") {
    const desde = url.searchParams.get("desde");
    const r = await D.marcacoesNovas(env, loja.id, desde);
    // sem "desde": só o ponto de partida (a primeira olhada do app não avisa o que já existia)
    return json(desde === null ? { reservas: [], ultimo: r.ultimo } : r);
  }
  return json({ error: "não encontrado" }, 404);
}
