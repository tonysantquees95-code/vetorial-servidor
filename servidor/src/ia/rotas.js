// Rotas de IA /v1/* (roteador Groq / DeepSeek / Gemini, CORS e cache vetorial).
//
//   GET  /saude      estado do servidor
//   GET  /v1/rotas   tabela função -> provedor
//   POST /v1/chat    { mensagens:[{papel,texto}], tarefa?, sistema?, anexos?, cache?, escopo?, maxTokens?, temperatura? }
//   POST /v1/transcrever  corpo = áudio bruto (audio/webm, ogg, wav, mp4…) → { texto }  (Groq Whisper)
//   POST /v1/ocr     { anexos:[{mime,dados}], instrucao?, formato?:"texto"|"json" }
//
// O app só fala com este Worker. GROQ_API_KEY, DEEPSEEK_API_KEY e GEMINI_API_KEY ficam em segredos (env).
import { comCors, origemOk, preflight } from "./cors.js";
import { buscarNoCache, cacheViavel, gravarNoCache, sha } from "./cache.js";
import { decidir, ErroHttp, ordemDeTentativas, TABELA } from "./roteador.js";
import { executar } from "./provedores.js";
import { provedoresDesligados, registrarUso } from "../dev/uso.js";

const VERSAO = "1.0.0";
const MAX_CORPO = 12 * 1024 * 1024;
const MAX_TEXTO = 60_000;
const MAX_ANEXO = 8_000_000; // caracteres base64 (~6 MB) por anexo
const MIMES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif",
  "application/pdf",
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/aac", "audio/ogg", "audio/flac"
]);

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra }
  });

async function lerJson(request) {
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > MAX_CORPO) throw new ErroHttp(413, "corpo_grande", "Pedido grande demais.");
  const bruto = await request.text();
  if (bruto.length > MAX_CORPO) throw new ErroHttp(413, "corpo_grande", "Pedido grande demais.");
  try {
    const dados = JSON.parse(bruto);
    if (dados === null || typeof dados !== "object" || Array.isArray(dados)) throw new Error();
    return dados;
  } catch {
    throw new ErroHttp(400, "json_invalido", "O corpo precisa ser um JSON válido.");
  }
}

const limitar = (v, min, max, padrao) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.min(max, Math.max(min, Number(v))) : padrao);

function validarAnexos(anexos) {
  if (anexos === undefined) return [];
  if (!Array.isArray(anexos) || anexos.length > 5) throw new ErroHttp(400, "anexos_invalidos", "Envie até 5 anexos.");
  return anexos.map((a) => {
    if (!a || !MIMES.has(a.mime) || typeof a.dados !== "string" || a.dados.length < 4 || a.dados.length > MAX_ANEXO || !/^[A-Za-z0-9+/=\r\n]+$/.test(a.dados)) {
      throw new ErroHttp(400, "anexo_invalido", "Anexo inválido: use base64 com mime de imagem, PDF ou áudio suportado.");
    }
    return { mime: a.mime, dados: a.dados.replace(/\s+/g, "") };
  });
}

function validarMensagens(lista) {
  if (!Array.isArray(lista) || lista.length < 1 || lista.length > 40) throw new ErroHttp(400, "mensagens_invalidas", "Envie de 1 a 40 mensagens.");
  let total = 0;
  const ok = lista.map((m) => {
    if (!m || (m.papel !== "user" && m.papel !== "assistant") || typeof m.texto !== "string") {
      throw new ErroHttp(400, "mensagens_invalidas", 'Cada mensagem precisa de papel ("user" ou "assistant") e texto.');
    }
    total += m.texto.length;
    return { papel: m.papel, texto: m.texto };
  });
  if (total > MAX_TEXTO) throw new ErroHttp(413, "texto_grande", "Texto grande demais.");
  if (ok[ok.length - 1].papel !== "user") throw new ErroHttp(400, "mensagens_invalidas", "A última mensagem deve ser do usuário.");
  return ok;
}

async function autenticar(request, env) {
  if (!env.APP_TOKEN) return;
  const dado = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const [a, b] = await Promise.all([sha(dado, 64), sha(env.APP_TOKEN, 64)]);
  // Compara os hashes (mesmo tamanho) sem sair no primeiro byte diferente.
  let dif = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  if (dif !== 0) throw new ErroHttp(401, "nao_autorizado", "Acesso negado.");
}

async function limitarUso(request, env, rota) {
  if (!env.LIMITADOR) return;
  const ip = request.headers.get("cf-connecting-ip") ?? "anonimo";
  const { success } = await env.LIMITADOR.limit({ key: `${ip}:${rota}` });
  if (!success) throw new ErroHttp(429, "limite", "Muitas requisições. Aguarde um instante.");
}

const TEMPERATURAS = { codigo: 0.2, bi: 0.2, relatorio: 0.2, logica: 0.3, ocr: 0, multimodal: 0.4, traducao: 0.2, resumo: 0.3 };
const TOKENS = { bi: 4096, relatorio: 4096, codigo: 4096, logica: 4096, ocr: 4096 };

async function responder(request, env, ctx, { mensagens, anexos, corpo, tarefaFixa }) {
  const textoFinal = mensagens[mensagens.length - 1].texto;
  const plano = decidir({ tarefa: tarefaFixa ?? corpo.tarefa, textoFinal, temAnexos: anexos.length > 0 });
  const sistema = typeof corpo.sistema === "string" ? corpo.sistema.slice(0, 4000) : undefined;

  const turnosUsuario = mensagens.filter((m) => m.papel === "user").length;
  const usarCache = corpo.cache !== false && plano.provedor !== "gemini" && cacheViavel({ texto: textoFinal, turnosUsuario, temAnexos: false });

  let cacheCtx = null;
  if (usarCache) {
    const base = env.APP_TOKEN ? await sha(env.APP_TOKEN, 16) : "publico";
    const escopo = `${base}|${String(corpo.escopo ?? request.headers.get("x-venus-escopo") ?? "").slice(0, 80)}`;
    const { acerto, ctx: c } = await buscarNoCache(env, { escopo, tarefa: plano.tarefa, sistema, texto: textoFinal });
    cacheCtx = c;
    if (acerto) {
      const v = acerto.valor;
      ctx.waitUntil(registrarUso(env, { provedor: v.provedor, tarefa: plano.tarefa, cache: true }).catch(() => {}));
      return json(
        { resposta: v.resposta, tarefa: plano.tarefa, provedor: v.provedor, modelo: v.modelo, fallback: false, cache: { acerto: acerto.tipo, similaridade: Number(acerto.similaridade.toFixed(4)) }, uso: null },
        200,
        { "x-venus-provedor": v.provedor, "x-venus-cache": acerto.tipo }
      );
    }
  }

  // provedores desligados pelo Painel Dev ficam fora da fila (a reserva assume)
  const desligados = await provedoresDesligados(env);
  const ordem = ordemDeTentativas(plano.provedor).filter((p) => !desligados.has(p));
  if (!ordem.length) throw new ErroHttp(503, "provedor_desligado", "Esse provedor de IA está desligado no momento.");
  let r;
  try {
    r = await executar(env, ordem, {
    tarefa: plano.tarefa,
    mensagens,
    sistema,
    anexos,
    temperatura: limitar(corpo.temperatura, 0, 1.5, TEMPERATURAS[plano.tarefa] ?? 0.7),
    maxTokens: Math.round(limitar(corpo.maxTokens, 1, 8192, TOKENS[plano.tarefa] ?? 1024))
    });
  } catch (e) {
    ctx.waitUntil(registrarUso(env, { provedor: ordem[0], tarefa: plano.tarefa, erro: true }).catch(() => {}));
    throw e;
  }
  ctx.waitUntil(registrarUso(env, { provedor: r.provedor, tarefa: plano.tarefa, uso: r.uso }).catch(() => {}));

  if (cacheCtx) {
    ctx.waitUntil(
      gravarNoCache(env, cacheCtx, { resposta: r.texto, provedor: r.provedor, modelo: r.modelo }).catch((e) => console.error("falha ao gravar cache", e?.name))
    );
  }
  return json(
    { resposta: r.texto, tarefa: plano.tarefa, provedor: r.provedor, modelo: r.modelo, fallback: r.fallback, cache: { acerto: false }, uso: r.uso },
    200,
    { "x-venus-provedor": r.provedor, "x-venus-cache": "miss" }
  );
}

const MAX_AUDIO = 6 * 1024 * 1024;
const EXTENSAO_DO_AUDIO = { webm: "webm", ogg: "ogg", wav: "wav", wave: "wav", mp4: "mp4", mpeg: "mp3", mp3: "mp3", flac: "flac", aac: "m4a", "x-m4a": "m4a" };

/** Voz → texto (Groq Whisper). O corpo é o áudio bruto; a chave da Groq nunca sai do servidor. */
async function transcrever(request, env) {
  if (!env.GROQ_API_KEY) throw new ErroHttp(503, "sem_chave", "A transcrição não está configurada no servidor.");
  const tipo = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = tipo.startsWith("audio/") || tipo === "video/webm" ? EXTENSAO_DO_AUDIO[tipo.split("/")[1]] : undefined;
  if (!ext) throw new ErroHttp(415, "audio_invalido", "Envie o áudio com content-type audio/webm, ogg, wav, mp4 ou mp3.");
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > MAX_AUDIO) throw new ErroHttp(413, "audio_grande", "Áudio grande demais (máximo 6 MB).");
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_AUDIO) throw new ErroHttp(413, "audio_grande", "Áudio grande demais (máximo 6 MB).");
  if (bytes.byteLength < 400) return json({ texto: "" });
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: tipo }), `fala.${ext}`);
  form.append("model", env.MODELO_GROQ_VOZ || "whisper-large-v3-turbo");
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append("temperature", "0");
  let r;
  try {
    r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form });
  } catch {
    throw new ErroHttp(502, "transcricao_falhou", "Não consegui falar com o serviço de voz.");
  }
  if (!r.ok) throw new ErroHttp(r.status === 429 ? 429 : 502, "transcricao_falhou", "O serviço de voz não respondeu agora.");
  const dados = await r.json().catch(() => ({}));
  return json({ texto: typeof dados.text === "string" ? dados.text.trim().slice(0, 4000) : "" });
}

async function rotear(request, env, ctx, origem) {
  const { pathname } = new URL(request.url);

  if (request.method === "OPTIONS") return preflight(origem, env);
  if (!origemOk(origem, env)) throw new ErroHttp(403, "origem_negada", "Origem não permitida.");

  if (request.method === "GET" && pathname === "/saude") return json({ ok: true, versao: VERSAO });
  if (request.method === "GET" && pathname === "/v1/rotas") return json({ rotas: TABELA, regra: "gemini apenas com anexo (multimodal/ocr)" });

  if (pathname === "/v1/transcrever") {
    if (request.method !== "POST") throw new ErroHttp(405, "metodo", "Use POST.");
    await autenticar(request, env);
    await limitarUso(request, env, pathname);
    return transcrever(request, env);
  }

  const eChat = pathname === "/v1/chat";
  const eOcr = pathname === "/v1/ocr";
  if (!eChat && !eOcr) throw new ErroHttp(404, "nao_encontrado", "Rota não encontrada.");
  if (request.method !== "POST") throw new ErroHttp(405, "metodo", "Use POST.");

  await autenticar(request, env);
  await limitarUso(request, env, pathname);
  const corpo = await lerJson(request);
  const anexos = validarAnexos(corpo.anexos);

  if (eOcr) {
    if (anexos.length === 0) throw new ErroHttp(400, "anexo_obrigatorio", "Envie pelo menos um anexo para o OCR.");
    const extra = corpo.formato === "json"
      ? "Devolva apenas JSON válido, sem markdown, com a estrutura mais natural para o documento (campos, itens, totais)."
      : "Devolva apenas o texto extraído, preservando ordem e quebras de linha.";
    const instrucao = typeof corpo.instrucao === "string" ? corpo.instrucao.slice(0, 1000) : "";
    const mensagens = [{ papel: "user", texto: `Extraia fielmente todo o texto visível do(s) anexo(s). Não invente nem complete nada que não esteja legível. ${extra} ${instrucao}`.trim() }];
    return responder(request, env, ctx, { mensagens, anexos, corpo: { ...corpo, cache: false }, tarefaFixa: "ocr" });
  }

  const mensagens = validarMensagens(corpo.mensagens);
  return responder(request, env, ctx, { mensagens, anexos, corpo });
}

export async function tratarIA(request, env, ctx) {
  {
    const origem = request.headers.get("origin");
    try {
      return comCors(await rotear(request, env, ctx, origem), origem, env);
    } catch (e) {
      if (e instanceof ErroHttp) return comCors(json({ erro: { codigo: e.codigo, mensagem: e.message } }, e.status), origem, env);
      console.error("erro interno", e?.name);
      return comCors(json({ erro: { codigo: "interno", mensagem: "Erro interno." } }, 500), origem, env);
    }
  }
}
