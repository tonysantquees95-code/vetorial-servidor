// Rotas do Vetorial ID: /id (tela de login) e /id/* (API).
import { estadoDaAssinatura, iniciarCobranca } from "../loja/assinatura.js";
import { ErroLoja, comPrivilegios } from "../loja/lojas.js";
import { contaComAcesso, MSG_SEM_ACESSO } from "./acesso.js";
import { emitirSelo, chavePublicaDoSelo } from "./selo.js";
import { canaisDisponiveis } from "./envio.js";
import { ErroId, cadastrar, confirmarRecuperacao, pedirRecuperacao, salvarTelefone, perfilPublico, salvarPerfil, tokenDeApp, encerrarSessao, entrar, gravarSync, lerSync, listarDispositivos, reativar, removerDispositivo, renovarToken, tokenDoPedido, validarSessao } from "./conta.js";
import { paginaDeLogin, paginaSso } from "./pagina.js";
import { ehAdmin } from "../dev/admin.js";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
export const ehRotaDoId = (c) => c === "/id" || c.startsWith("/id/");

async function corpo(req) {
  const t = await req.text();
  if (t.length > 100_000) throw new ErroId(413, "corpo_grande", "Pedido grande demais.");
  try {
    const d = JSON.parse(t || "{}");
    if (!d || typeof d !== "object" || Array.isArray(d)) throw 0;
    return d;
  } catch {
    throw new ErroId(400, "json_invalido", "O corpo precisa ser um JSON válido.");
  }
}

async function licenca(env, usuario, origem, gerar, gateway, pacote, dispositivo = "") {
  const loja = usuario.loja ? await comPrivilegios(env, await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(usuario.loja).first()) : null;
  if (!loja) return { acesso: false, plano: "sem_loja", selo: await emitirSelo(env, usuario, { acesso: false }, Date.now(), dispositivo) };
  const e = await estadoDaAssinatura(env, loja);
  const vencendo = !e.emTeste && e.diasPagosRestantes <= 3 || e.emTeste && e.diasDeTesteRestantes <= 2;
  const r = { ...e, renovar: vencendo, selo: await emitirSelo(env, usuario, e, Date.now(), dispositivo) };
  if (gerar) r.cobranca = await iniciarCobranca(env, loja, gateway || "infinitepay", origem, Date.now(), pacote);
  return r;
}

/** Toda entrada devolve junto o selo de licença assinado (o app confere offline). */
async function comLicenca(env, r, origem) {
  const u = await env.DB.prepare("SELECT * FROM usuarios WHERE id = ?").bind(r.usuario.id).first();
  const l = await licenca(env, u, origem, false, undefined, undefined, r.dispositivo);
  return { ...r, licenca: { acesso: l.acesso, emTeste: l.emTeste, diasDeTesteRestantes: l.diasDeTesteRestantes, fimDoAcesso: l.fimDoAcesso }, selo: l.selo };
}

export async function tratarId(req, env, url, caminho) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const origem = url.origin;
  try {
    if (caminho === "/id/sso" && req.method === "GET") { // entrada sem digitar a senha de novo, se este aparelho já está logado
      return new Response(paginaSso(String(env.ORIGENS_PERMITIDAS || "").split(",").map((s) => s.trim()).filter(Boolean)), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'", "referrer-policy": "no-referrer", "x-frame-options": "DENY" } });
    }
    if (caminho === "/id" && req.method === "GET") {
      const origens = String(env.ORIGENS_PERMITIDAS || "").split(",").map((s) => s.trim()).filter(Boolean);
      return new Response(paginaDeLogin(origens), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'", "referrer-policy": "no-referrer", "x-frame-options": "DENY" } });
    }
    if (caminho === "/id/cadastrar" && req.method === "POST") {
      const d = await corpo(req);
      if (ehAdmin(env, d.email)) throw new ErroId(403, "email_reservado", "Esse e-mail é reservado à administração da Vetorial Tech.");
      let lojaExistente = null;
      const t = tokenDoPedido(req);
      if (/^vl_[a-f0-9]{48}$/.test(t)) {
        const { lojaDoPedido } = await import("../loja/lojas.js");
        lojaExistente = await lojaDoPedido(env, req); // quem já usa a Vênus liga a loja atual à conta
      }
      return json(await comLicenca(env, await cadastrar(env, { ...d, lojaExistente, exigirTelefone: true, ip: req.headers.get("cf-connecting-ip") || "" }), origem), 201);
    }
    if (caminho === "/id/entrar" && req.method === "POST") return json(await comLicenca(env, await entrar(env, await corpo(req)), origem));
    if (caminho === "/id/chave-publica" && req.method === "GET") return json({ alg: "Ed25519", x: await chavePublicaDoSelo(env) });
    if (caminho === "/id/recuperar/canais" && req.method === "GET") return json({ canais: canaisDisponiveis(env) });
    if (caminho === "/id/recuperar/pedir" && req.method === "POST") return json(await pedirRecuperacao(env, await corpo(req), req.headers.get("cf-connecting-ip") || ""));
    if (caminho === "/id/recuperar/confirmar" && req.method === "POST") return json(await confirmarRecuperacao(env, await corpo(req)));
    if (caminho === "/id/reativar" && req.method === "POST") return json(await reativar(env, tokenDoPedido(req), (await corpo(req)).encerrar));

    const ctx = await validarSessao(env, req, {});
    if (caminho === "/id/ping" && req.method === "POST") {
      const l = await licenca(env, ctx.usuario, origem, false, undefined, undefined, ctx.dispositivo);
      return json({ ok: true, ativa: true, selo: l.selo, perfil: ctx.usuario.atualizado || 0, licenca: { acesso: l.acesso, renovar: !!l.renovar } });
    }
    if (caminho === "/id/verificar" && req.method === "GET") { // para o Vindex e o Vortex validarem o login
      return json({ usuario: perfilPublico(ctx.usuario), app: null, sessao: ctx.sessao, licenca: await licenca(env, ctx.usuario, origem, false, undefined, undefined, ctx.dispositivo) });
    }
    if (caminho === "/id/conta" && req.method === "GET") { // tudo para o avatar: perfil, licença e este aparelho
      const lic = await licenca(env, ctx.usuario, origem, false);
      return json({ usuario: perfilPublico(ctx.usuario), licenca: lic, sessao: ctx.sessao, dispositivo: ctx.dispositivo, admin: ehAdmin(env, ctx.usuario.email) });
    }
    if (caminho === "/id/telefone" && req.method === "PUT") return json(await salvarTelefone(env, ctx, (await corpo(req)).telefone));
    if (caminho === "/id/perfil" && req.method === "PUT") return json({ usuario: await salvarPerfil(env, ctx, await corpo(req)) });
    if (caminho === "/id/app-token" && req.method === "POST") return json(await tokenDeApp(env, ctx, String((await corpo(req)).app || "")));
    if (caminho === "/id/eu" && req.method === "GET") return json({ id: ctx.usuario.id, email: ctx.usuario.email, nome: ctx.usuario.nome, loja: ctx.usuario.loja });
    if (caminho === "/id/renovar" && req.method === "POST") return json({ ...(await renovarToken(env, ctx)), licenca: await licenca(env, ctx.usuario, origem, false, undefined, undefined, ctx.dispositivo) });
    if (caminho === "/id/sair" && req.method === "POST") { await encerrarSessao(env, ctx.usuario.id, ctx.sessao, "saiu"); return json({ ok: true }); }
    if (caminho === "/id/dispositivos" && req.method === "GET") return json(await listarDispositivos(env, ctx));
    let m = /^\/id\/dispositivos\/([a-f0-9]{64})$/.exec(caminho);
    if (m && req.method === "DELETE") {
      if (m[1] === ctx.dispositivo) throw new ErroId(400, "dispositivo_atual", "Para sair deste aparelho use Sair.");
      return json({ ok: await removerDispositivo(env, ctx.usuario.id, m[1]) });
    }
    m = /^\/id\/sessoes\/([a-f0-9]{24})\/encerrar$/.exec(caminho);
    if (m && req.method === "POST") return json({ ok: await encerrarSessao(env, ctx.usuario.id, m[1], "encerrada_remotamente") });
    if (caminho === "/id/licenca" && req.method === "GET") {
      const g = url.searchParams.get("gerar") === "1";
      return json(await licenca(env, ctx.usuario, origem, g, url.searchParams.get("gateway"), url.searchParams.get("pacote") || "venus"));
    }
    if (caminho.startsWith("/id/sync") && !(await contaComAcesso(env, ctx.usuario))) throw new ErroId(402, "teste_acabou", MSG_SEM_ACESSO);
    if (caminho === "/id/sync" && req.method === "GET") return json(await lerSync(env, ctx, Number(url.searchParams.get("desde")) || 0));
    m = /^\/id\/sync\/([a-z-]{3,20})$/.exec(caminho);
    if (m && req.method === "PUT") {
      const d = await corpo(req);
      return json(await gravarSync(env, ctx, m[1], d.valor, d.versao ?? 0));
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroLoja) return json({ error: e.message, codigo: e.codigo, ...(e.dados || {}) }, e.status);
    console.error("id", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
