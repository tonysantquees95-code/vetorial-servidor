// Cofre pessoal do Vindex: o aparelho cifra tudo (AES-GCM, chave derivada da senha do cofre) e o servidor só guarda
// o pacote cifrado de cada conta Vetorial ID, para o cofre aparecer em qualquer aparelho em que a pessoa entrar.
//   GET    /cofre         → {existe, versao, atualizado, criado}
//   GET    /cofre/pacote  → {pacote, versao, atualizado}   (ler é sempre permitido, mesmo com a assinatura vencida)
//   PUT    /cofre         → {pacote, base}  grava; "base" é a versão que o aparelho tinha (0 = cofre novo); 409 se mudou
//   DELETE /cofre         → apaga de vez (corpo {confirmar:"APAGAR"})
import { ErroLoja } from "../loja/lojas.js";
import { ErroId, validarSessao } from "../id/conta.js";
import { appsLiberados } from "../loja/assinatura.js";

export const MAX_PACOTE = 1024 * 1024; // 1 MB de texto cifrado: milhares de senhas
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,PUT,DELETE,OPTIONS" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
export const ehRotaCofre = (c) => c === "/cofre" || c.startsWith("/cofre/");
const FORMATO = /^[A-Za-z0-9+/=_.:-]+$/;

async function podeGravar(env, usuario, agora) {
  if (!usuario.loja) return true;
  const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(usuario.loja).first();
  return !loja || !!appsLiberados(loja, agora).vindex;
}

export async function tratarCofre(req, env, url, caminho, agora = Date.now()) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const ctx = await validarSessao(env, req, { agora });
    const u = ctx.usuario.id;
    const atual = await env.DB.prepare("SELECT * FROM cofre_pessoal WHERE usuario = ?").bind(u).first();
    if (caminho === "/cofre" && req.method === "GET") {
      return json(atual ? { existe: true, versao: atual.versao, atualizado: atual.atualizado, criado: atual.criado } : { existe: false, versao: 0 });
    }
    if (caminho === "/cofre/pacote" && req.method === "GET") {
      if (!atual) throw new ErroLoja(404, "sem_cofre", "Você ainda não criou o cofre.");
      return json({ pacote: atual.pacote, versao: atual.versao, atualizado: atual.atualizado });
    }
    if (caminho === "/cofre" && req.method === "PUT") {
      const texto = await req.text();
      if (texto.length > MAX_PACOTE + 1024) throw new ErroLoja(413, "cofre_grande", "O cofre passou do tamanho máximo (1 MB cifrado).");
      let d;
      try { d = JSON.parse(texto || "{}"); } catch { throw new ErroLoja(400, "json_invalido", "O corpo precisa ser um JSON válido."); }
      const pacote = typeof d.pacote === "string" ? d.pacote : "";
      if (pacote.length > MAX_PACOTE) throw new ErroLoja(413, "cofre_grande", "O cofre passou do tamanho máximo (1 MB cifrado).");
      if (!pacote || !FORMATO.test(pacote)) throw new ErroLoja(400, "pacote_invalido", "O pacote do cofre não é válido.");
      const base = Number.isInteger(d.base) ? d.base : -1;
      if (base < 0) throw new ErroLoja(400, "base_invalida", "Informe a versão em que o cofre estava (0 para um cofre novo).");
      if (!(await podeGravar(env, ctx.usuario, agora))) throw new ErroLoja(402, "assinatura", "Sua assinatura do Vindex venceu: você ainda pode abrir e copiar o cofre, mas não alterá-lo. Renove para editar.");
      const dispositivo = String(ctx.dispositivo || "").slice(0, 80);
      if (!atual) {
        if (base !== 0) throw new ErroLoja(409, "versao_mudou", "O cofre não existe mais na nuvem. Abra de novo.");
        await env.DB.prepare("INSERT INTO cofre_pessoal (usuario, pacote, versao, criado, atualizado, dispositivo) VALUES (?, ?, 1, ?, ?, ?)").bind(u, pacote, agora, agora, dispositivo).run();
        return json({ ok: true, versao: 1 }, 201);
      }
      if (base !== atual.versao) throw new ErroLoja(409, "versao_mudou", "O cofre foi alterado em outro aparelho. Abra de novo para juntar as mudanças.");
      const r = await env.DB.prepare("UPDATE cofre_pessoal SET anterior = pacote, pacote = ?, versao = versao + 1, atualizado = ?, dispositivo = ? WHERE usuario = ? AND versao = ?").bind(pacote, agora, dispositivo, u, base).run();
      if (!r.meta.changes) throw new ErroLoja(409, "versao_mudou", "O cofre foi alterado em outro aparelho. Abra de novo para juntar as mudanças.");
      return json({ ok: true, versao: base + 1 });
    }
    if (caminho === "/cofre" && req.method === "DELETE") {
      const d = await req.json().catch(() => ({}));
      if (d.confirmar !== "APAGAR") throw new ErroLoja(400, "sem_confirmacao", 'Para apagar o cofre de vez, envie {"confirmar":"APAGAR"}.');
      await env.DB.prepare("DELETE FROM cofre_pessoal WHERE usuario = ?").bind(u).run();
      return json({ ok: true });
    }
    return json({ error: "não encontrado" }, 404);
  } catch (e) {
    if (e instanceof ErroLoja || e instanceof ErroId) return json({ error: e.message, codigo: e.codigo, ...(e.dados || {}) }, e.status);
    console.error("cofre", caminho, e && e.stack ? e.stack : e);
    return json({ error: "erro interno" }, 500);
  }
}
