// Saves do Vortex na nuvem (Cloudflare R2): um espaço por conta Vetorial ID, só para quem tem o Vortex liberado.
//   GET    /vortex/licenca                      → o Vortex está liberado para esta conta?
//   GET    /vortex/saves                        → lista (jogo, arquivo, bytes, atualizado)
//   GET    /vortex/saves/<jogo>/<arquivo>       → baixa
//   PUT    /vortex/saves/<jogo>/<arquivo>       → envia (corpo = bytes; cabeçalho x-base = versão que o aparelho tinha)
//   DELETE /vortex/saves/<jogo>/<arquivo>
// Conflito: se a nuvem já tem uma versão mais nova que a "x-base" do aparelho, devolve 409 e quem decide é o jogador.
import { varredura, faxina, perfilJogo } from "./varredura.js";
import { ErroId as ErroLoja } from "../id/conta.js";
import { validarSessao } from "../id/conta.js";
import { appsLiberados } from "../loja/assinatura.js";
import * as steam from "./steam.js";
import { buscar, consultar, pedir, responder, vortexOnline } from "./ponte.js";


export const ehRotaVortex = (c) => c.startsWith("/vortex/");
export const MAX_ARQUIVO = 8 * 1024 * 1024;
export const MAX_TOTAL = 256 * 1024 * 1024;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,x-base", "access-control-allow-methods": "GET,PUT,POST,DELETE,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
const NOME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$/;
const JOGO = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

async function liberado(env, usuario, agora) {
  if (!usuario.loja) return false;
  const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(usuario.loja).first();
  return !!loja && !!appsLiberados(loja, agora).vortex;
}

async function total(env, prefixo) {
  let soma = 0, cursor;
  do {
    const l = await env.SAVES.list({ prefix: prefixo, cursor });
    for (const o of l.objects) soma += o.size;
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  return soma;
}

export async function tratarVortex(req, env, url, caminho, agora = Date.now()) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    // a Steam volta aqui pelo navegador, sem sessão: o "n" do link prova de qual conta é o login
    if (caminho === "/vortex/steam/retorno" && req.method === "GET") return steam.retorno(env, url, url.origin, env.fetchSteam ?? fetch, agora);
    const ctx = await validarSessao(env, req, { agora });
    const ok = await liberado(env, ctx.usuario, agora);
    if (caminho === "/vortex/licenca") return json({ vortex: ok, mensagem: ok ? "" : "O Vortex não está liberado para esta conta. Assine um pacote com o Vortex ou comece o teste grátis." });
    if (!ok) throw new ErroLoja(402, "vortex_nao_liberado", "O Vortex não está liberado para esta conta.");
    if (caminho === "/vortex/steam/iniciar" && req.method === "POST") return json(await steam.iniciar(env, ctx.usuario.id, url.origin, agora));
    if (caminho === "/vortex/steam" && req.method === "GET") return json(await steam.estado(env, ctx.usuario.id));
    if (caminho === "/vortex/steam" && req.method === "DELETE") return json(await steam.desligar(env, ctx.usuario.id));
    if (caminho === "/vortex/steam/jogos" && req.method === "GET") return json(await steam.jogos(env, ctx.usuario.id, env.fetchSteam ?? fetch));
    if (caminho === "/vortex/ia/varredura" && req.method === "POST") {
      const bruto = await req.text();
      if (bruto.length > 200_000) throw new ErroLoja(413, "grande_demais", "Resumo grande demais.");
      let corpo;
      try { corpo = JSON.parse(bruto); } catch { throw new ErroLoja(400, "json_invalido", "JSON inválido."); }
      return json(await varredura(env, corpo));
    }
    if (caminho === "/vortex/ia/faxina" && req.method === "POST") {
      const bruto = await req.text();
      if (bruto.length > 200_000) throw new ErroLoja(413, "grande_demais", "Resumo grande demais.");
      let corpo;
      try { corpo = JSON.parse(bruto); } catch { throw new ErroLoja(400, "json_invalido", "JSON inválido."); }
      return json(await faxina(env, corpo));
    }
    if (caminho === "/vortex/ia/perfil" && req.method === "POST") {
      const corpo = await req.json().catch(() => ({}));
      return json(await perfilJogo(env, corpo));
    }
    // ponte de voz Vênus ↔ Vortex
    if (caminho === "/vortex/presenca" && req.method === "GET") return json(await vortexOnline(env, ctx.usuario.id, agora));
    if (caminho === "/vortex/pedidos" && req.method === "POST") {
      const d = await req.json().catch(() => ({}));
      return json(await pedir(env, ctx.usuario.id, String(d.comando || ""), d.argumento, agora), 201);
    }
    if (caminho === "/vortex/fila" && req.method === "GET") return json({ pedidos: await buscar(env, ctx.usuario.id, url.searchParams.get("plataforma") === "android" ? "android" : "windows", agora) });
    let pm = /^\/vortex\/pedidos\/([a-f0-9]{24})$/.exec(caminho);
    if (pm && req.method === "GET") return json(await consultar(env, ctx.usuario.id, pm[1], agora));
    pm = /^\/vortex\/pedidos\/([a-f0-9]{24})\/resultado$/.exec(caminho);
    if (pm && req.method === "POST") return json(await responder(env, ctx.usuario.id, pm[1], await req.json().catch(() => ({})), agora));
    if (!env.SAVES) throw new ErroLoja(503, "nuvem_indisponivel", "A nuvem de saves ainda não está ligada no servidor.");
    const raiz = `u/${ctx.usuario.id}/`;
    if (caminho === "/vortex/saves" && req.method === "GET") {
      const itens = [];
      let cursor;
      do {
        const l = await env.SAVES.list({ prefix: raiz, cursor, include: ["customMetadata"] });
        for (const o of l.objects) {
          const [jogo, ...resto] = o.key.slice(raiz.length).split("/");
          itens.push({ jogo, arquivo: resto.join("/"), bytes: o.size, versao: Number(o.customMetadata?.versao || 0), atualizado: o.uploaded ? new Date(o.uploaded).getTime() : 0, dispositivo: o.customMetadata?.dispositivo || "" });
        }
        cursor = l.truncated ? l.cursor : undefined;
      } while (cursor);
      return json({ saves: itens, usado: itens.reduce((a, i) => a + i.bytes, 0), limite: MAX_TOTAL });
    }
    const m = /^\/vortex\/saves\/([^/]+)\/([^/]+)$/.exec(caminho);
    if (!m) return json({ error: "não encontrado" }, 404);
    const jogo = decodeURIComponent(m[1]), arquivo = decodeURIComponent(m[2]);
    if (!JOGO.test(jogo) || !NOME.test(arquivo) || arquivo.includes("..")) throw new ErroLoja(400, "nome_invalido", "Nome de jogo ou arquivo inválido.");
    const chave = `${raiz}${jogo}/${arquivo}`;
    if (req.method === "GET") {
      const o = await env.SAVES.get(chave);
      if (!o) throw new ErroLoja(404, "sem_save", "Não há save na nuvem para esse arquivo.");
      return new Response(o.body, { headers: { "content-type": "application/octet-stream", "cache-control": "no-store", "x-versao": String(o.customMetadata?.versao || 0), ...CORS } });
    }
    if (req.method === "PUT") {
      const dados = new Uint8Array(await req.arrayBuffer());
      if (dados.length === 0 || dados.length > MAX_ARQUIVO) throw new ErroLoja(413, "tamanho_invalido", "O arquivo de save precisa ter entre 1 byte e 8 MB.");
      const atual = await env.SAVES.head(chave);
      const versaoNuvem = Number(atual?.customMetadata?.versao || 0);
      const base = Number(req.headers.get("x-base") || 0);
      if (atual && base !== versaoNuvem) throw new ErroLoja(409, "conflito", "A nuvem tem um save mais novo que o deste aparelho.", { versao: versaoNuvem, atualizado: atual.uploaded ? new Date(atual.uploaded).getTime() : 0 });
      if (!atual && (await total(env, raiz)) + dados.length > MAX_TOTAL) throw new ErroLoja(413, "sem_espaco", "O espaço de saves da conta (256 MB) acabou.");
      const versao = versaoNuvem + 1;
      await env.SAVES.put(chave, dados, { customMetadata: { versao: String(versao), dispositivo: String(ctx.dispositivo || "").slice(0, 16) } });
      return json({ ok: true, versao });
    }
    if (req.method === "DELETE") {
      await env.SAVES.delete(chave);
      return json({ ok: true });
    }
    return json({ error: "método não permitido" }, 405);
  } catch (e) {
    if (e && e.status && e.codigo) return json({ error: e.message, codigo: e.codigo, ...(e.dados || {}) }, e.status);
    console.error("vortex", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
