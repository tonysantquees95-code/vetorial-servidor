// Vetorial Drive: espaço de arquivos por conta (documentos e ROMs), no mesmo R2 dos saves do Vortex (binding SAVES, prefixo "drive/").
//   GET    /drive/arquivos[?pasta=roms/gba]       → { arquivos:[{pasta,nome,bytes,atualizado}], usado, cota, maxArquivo }
//   POST   /drive/enviar    {pasta,nome,tamanho}  → abre um envio em partes: { envio, parte }
//   PUT    /drive/parte?pasta=&nome=&envio=&n=    → corpo = bytes da parte n (1, 2, 3…): { n, etag }
//   POST   /drive/concluir  {pasta,nome,envio,partes:[{n,etag}]} → junta as partes: { ok, bytes }
//   POST   /drive/cancelar  {pasta,nome,envio}    → descarta um envio pela metade
//   GET    /drive/arquivo/<pasta>/<nome>          → baixa (aceita Range)
//   DELETE /drive/arquivo/<pasta>/<nome>
// Armazenamento: R2 (binding SAVES) se existir; senão o próprio D1 (arquivos até 100 MB, 1 GB por conta).
// Por enquanto só a conta de dono usa o Drive (DRIVE_PUBLICO=1 abre para quem tem Vortex ou Vindex).
// Cota e tamanho máximo podem ser mudados no ambiente (DRIVE_COTA_BYTES, DRIVE_ARQUIVO_MAX).
import { ErroId, validarSessao } from "../id/conta.js";
import { appsLiberados } from "../loja/assinatura.js";
import { backendD1 } from "./d1.js";

export const ehRotaDrive = (c) => c.startsWith("/drive/");
export const COTA_PADRAO = 3 * 1024 ** 3;
export const ARQUIVO_MAX_PADRAO = 2 * 1024 ** 3;
export const PARTE = 32 * 1024 * 1024;
const PARTE_MAX = 64 * 1024 * 1024; // o Worker aceita até 100 MB por pedido
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,range", "access-control-allow-methods": "GET,PUT,POST,DELETE,OPTIONS", "access-control-expose-headers": "content-range,accept-ranges,content-length" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });

const PASTA = /^[a-z0-9][a-z0-9_-]{0,31}(\/[a-z0-9][a-z0-9_-]{0,31})?$/;
export function nomeValido(n) {
  const s = String(n ?? "");
  return s.length >= 1 && s.length <= 120 && !/[\/\\\u0000-\u001f]/.test(s) && !s.startsWith(".") && s.trim() === s;
}
export function pastaValida(p) { return PASTA.test(String(p ?? "")); }
const limitesDe = (env, b) => ({
  cota: Number(env.DRIVE_COTA_BYTES) > 0 ? Number(env.DRIVE_COTA_BYTES) : b.limites.cota,
  maxArquivo: Number(env.DRIVE_ARQUIVO_MAX) > 0 ? Number(env.DRIVE_ARQUIVO_MAX) : b.limites.maxArquivo,
});

async function liberado(env, usuario, agora) {
  if (!usuario.loja) return false;
  const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(usuario.loja).first();
  if (!loja) return false;
  if (env.DRIVE_PUBLICO !== "1" && loja.plano !== "dono") return false;
  const a = appsLiberados(loja, agora);
  return !!(a.vortex || a.vindex);
}

function backendR2(env) {
  const chave = (u, p, n) => `drive/${u}/${p}/${n}`;
  return {
    nome: "r2",
    limites: { cota: COTA_PADRAO, maxArquivo: ARQUIVO_MAX_PADRAO, parte: PARTE },
    async lista(usuario) {
      const raiz = `drive/${usuario}/`;
      const itens = [];
      let cursor;
      do {
        const l = await env.SAVES.list({ prefix: raiz, cursor });
        for (const o of l.objects) {
          const resto = o.key.slice(raiz.length);
          const i = resto.lastIndexOf("/");
          if (i < 0) continue;
          itens.push({ pasta: resto.slice(0, i), nome: resto.slice(i + 1), bytes: o.size, atualizado: o.uploaded ? new Date(o.uploaded).getTime() : 0 });
        }
        cursor = l.truncated ? l.cursor : undefined;
      } while (cursor);
      return itens;
    },
    async iniciar(u, p, n, tamanho) {
      const up = await env.SAVES.createMultipartUpload(chave(u, p, n), { customMetadata: { tamanho: String(tamanho) } });
      return { envio: up.uploadId, parte: PARTE };
    },
    async parte(u, p, n, envio, num, dados) {
      if (dados.byteLength > PARTE_MAX) return "grande";
      const x = await env.SAVES.resumeMultipartUpload(chave(u, p, n), envio).uploadPart(num, dados);
      return { n: x.partNumber, etag: x.etag };
    },
    async concluir(u, p, n, envio, partes) {
      const obj = await env.SAVES.resumeMultipartUpload(chave(u, p, n), envio).complete(partes.map((x) => ({ partNumber: Number(x.n), etag: String(x.etag) })));
      return obj.size;
    },
    async descartar(u, p, n) { await env.SAVES.delete(chave(u, p, n)); },
    async cancelar(u, p, n, envio) { try { await env.SAVES.resumeMultipartUpload(chave(u, p, n), envio).abort(); } catch { /* já não existe */ } },
    async tamanho(u, p, n) { const c = await env.SAVES.head(chave(u, p, n)); return c ? c.size : null; },
    async ler(u, p, n, offset, length) {
      const o = await env.SAVES.get(chave(u, p, n), { range: { offset, length } });
      return o ? o.body : null;
    },
    async apagar(u, p, n) { await env.SAVES.delete(chave(u, p, n)); },
    async limpar() { /* o R2 descarta envios pela metade sozinho */ },
  };
}
export const escolherBackend = (env) => (env.SAVES ? backendR2(env) : backendD1(env));
export const limparDrive = (env) => escolherBackend(env).limpar();

/** "bytes=10-99", "bytes=10-" ou "bytes=-500" → { offset, length } dentro de um arquivo de `total` bytes (ou null se não valer). */
export function lerRange(cabecalho, total) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(cabecalho || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let ini, fim;
  if (m[1] === "") { const n = Number(m[2]); if (!n) return null; ini = Math.max(0, total - n); fim = total - 1; }
  else { ini = Number(m[1]); fim = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1); }
  if (ini >= total || fim < ini) return "invalido";
  return { offset: ini, length: fim - ini + 1 };
}

export async function tratarDrive(req, env, url, caminho, agora = Date.now()) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const ctx = await validarSessao(env, req, { agora });
    if (!(await liberado(env, ctx.usuario, agora))) throw new ErroId(402, "drive_nao_liberado", "O Vetorial Drive ainda está liberado só para o dono. Em breve para todos.");
    const B = escolherBackend(env);
    const u = ctx.usuario.id;
    const { cota, maxArquivo } = limitesDe(env, B);

    if (caminho === "/drive/arquivos" && req.method === "GET") {
      const pasta = url.searchParams.get("pasta");
      const todos = await B.lista(u);
      const usado = todos.reduce((a, i) => a + i.bytes, 0);
      const arquivos = pasta ? todos.filter((i) => i.pasta === pasta || i.pasta.startsWith(pasta + "/")) : todos;
      arquivos.sort((a, b) => a.pasta.localeCompare(b.pasta) || a.nome.localeCompare(b.nome));
      return json({ arquivos, usado, cota, maxArquivo, armazenamento: B.nome });
    }

    if (caminho === "/drive/enviar" && req.method === "POST") {
      const d = await req.json().catch(() => ({}));
      const tamanho = Number(d.tamanho);
      if (!pastaValida(d.pasta)) throw new ErroId(400, "pasta_invalida", "Pasta inválida. Use letras minúsculas, números, - ou _ (até 2 níveis).");
      if (!nomeValido(d.nome)) throw new ErroId(400, "nome_invalido", "Nome de arquivo inválido.");
      if (!Number.isFinite(tamanho) || tamanho < 1) throw new ErroId(400, "tamanho_invalido", "Tamanho do arquivo inválido.");
      if (tamanho > maxArquivo) throw new ErroId(413, "arquivo_grande", `O limite por arquivo é ${tamanhoLegivel(maxArquivo)}.`);
      const todos = await B.lista(u);
      const mesmo = todos.find((i) => i.pasta === d.pasta && i.nome === d.nome);
      const usado = todos.reduce((a, i) => a + i.bytes, 0) - (mesmo ? mesmo.bytes : 0);
      if (usado + tamanho > cota) throw new ErroId(413, "sem_espaco", `O espaço do Vetorial Drive (${tamanhoLegivel(cota)}) não comporta este arquivo.`, { usado, cota });
      return json(await B.iniciar(u, d.pasta, d.nome, tamanho), 201);
    }

    if (caminho === "/drive/parte" && req.method === "PUT") {
      const pasta = url.searchParams.get("pasta"), nome = url.searchParams.get("nome"), envio = url.searchParams.get("envio");
      const n = Number(url.searchParams.get("n"));
      if (!pastaValida(pasta) || !nomeValido(nome) || !envio || !Number.isInteger(n) || n < 1 || n > 10000) throw new ErroId(400, "pedido_invalido", "Parte inválida.");
      const dados = await req.arrayBuffer();
      if (dados.byteLength < 1) throw new ErroId(413, "parte_invalida", "Parte vazia.");
      const r = await B.parte(u, pasta, nome, envio, n, dados);
      if (r === "grande") throw new ErroId(413, "parte_invalida", "Parte grande demais para este armazenamento.");
      if (!r) throw new ErroId(404, "envio_desconhecido", "Esse envio não existe mais. Comece de novo.");
      return json(r);
    }

    if (caminho === "/drive/concluir" && req.method === "POST") {
      const d = await req.json().catch(() => ({}));
      if (!pastaValida(d.pasta) || !nomeValido(d.nome) || !d.envio || !Array.isArray(d.partes) || d.partes.length < 1) throw new ErroId(400, "pedido_invalido", "Pedido de conclusão inválido.");
      const bytes = await B.concluir(u, d.pasta, d.nome, String(d.envio), d.partes);
      if (bytes === null) throw new ErroId(404, "envio_desconhecido", "Esse envio não existe mais. Comece de novo.");
      if (bytes === "incompleto") throw new ErroId(409, "envio_incompleto", "Faltaram partes do arquivo. Envie de novo.");
      // confere o que realmente ficou guardado: tamanho máximo e cota (outros envios podem ter acontecido no meio)
      if (B.nome === "r2") {
        const usado = (await B.lista(u)).reduce((a, i) => a + i.bytes, 0);
        if (bytes > maxArquivo || usado > cota) { await B.descartar(u, d.pasta, d.nome); throw new ErroId(413, "sem_espaco", "O arquivo passou do limite do Vetorial Drive e foi descartado."); }
      }
      return json({ ok: true, bytes });
    }

    if (caminho === "/drive/cancelar" && req.method === "POST") {
      const d = await req.json().catch(() => ({}));
      if (pastaValida(d.pasta) && nomeValido(d.nome) && d.envio) await B.cancelar(u, d.pasta, d.nome, String(d.envio));
      return json({ ok: true });
    }

    const m = /^\/drive\/arquivo\/(.+)$/.exec(caminho);
    if (m) {
      let rel;
      try { rel = decodeURIComponent(m[1]); } catch { throw new ErroId(400, "nome_invalido", "Endereço inválido."); }
      const i = rel.lastIndexOf("/");
      const pasta = rel.slice(0, i), nome = rel.slice(i + 1);
      if (i < 0 || !pastaValida(pasta) || !nomeValido(nome)) throw new ErroId(400, "nome_invalido", "Pasta ou arquivo inválido.");
      if (req.method === "GET") {
        const total = await B.tamanho(u, pasta, nome);
        if (total === null) throw new ErroId(404, "sem_arquivo", "Arquivo não encontrado no Vetorial Drive.");
        const r = lerRange(req.headers.get("range"), total);
        const base = { "content-type": "application/octet-stream", "cache-control": "no-store", "accept-ranges": "bytes", ...CORS };
        if (r === "invalido") return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${total}` } });
        const off = r ? r.offset : 0, len = r ? r.length : total;
        const corpo = await B.ler(u, pasta, nome, off, len);
        if (!corpo) throw new ErroId(404, "sem_arquivo", "Arquivo não encontrado no Vetorial Drive.");
        if (r) return new Response(corpo, { status: 206, headers: { ...base, "content-range": `bytes ${off}-${off + len - 1}/${total}`, "content-length": String(len) } });
        return new Response(corpo, { headers: { ...base, "content-length": String(total) } });
      }
      if (req.method === "DELETE") {
        await B.apagar(u, pasta, nome);
        return json({ ok: true });
      }
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e && e.status && e.codigo) return json({ error: e.message, codigo: e.codigo, ...(e.dados || {}) }, e.status);
    console.error("drive", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}

function tamanhoLegivel(b) { return b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(b % 1024 ** 3 ? 1 : 0)} GB` : `${Math.round(b / 1024 ** 2)} MB`; }
