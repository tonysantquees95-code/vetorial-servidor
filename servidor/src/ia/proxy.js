// IA da Vênus para os apps: rota compatível com a da OpenAI/Groq, só para quem está logado no Vetorial ID.
// O app não guarda chave nenhuma de IA: manda o pedido para cá com o token do Vetorial ID, e a chave da Groq fica só no servidor.
//
//   GET  /ia/v1/models
//   POST /ia/v1/chat/completions   (mesmo corpo da OpenAI: messages, tools, response_format…)
import { validarSessao } from "../id/conta.js";
import { contaComAcesso, MSG_SEM_ACESSO } from "../id/acesso.js";

const GROQ = "https://api.groq.com/openai/v1";
export const MODELOS = [
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
];
const MAX_CORPO = 6 * 1024 * 1024;
const MAX_SAIDA = 4096;
const CAMPOS = ["model", "messages", "tools", "tool_choice", "temperature", "top_p", "max_tokens", "max_completion_tokens", "response_format", "reasoning_effort", "stop", "seed"];

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const erro = (status, mensagem) => json({ error: { message: mensagem } }, status);

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const PREFIXO_GEMINI = "/ia/gemini/";
// só as chamadas que o app usa: texto/PDF/áudio/foto (generateContent) e memória (embeddings)
const GEMINI_PERMITIDO = /^models\/[A-Za-z0-9._-]{1,80}:(generateContent|batchEmbedContents|embedContent)$/;
const MAX_CORPO_GEMINI = 24 * 1024 * 1024; // PDF e áudio vão em base64

export const ehRotaDaIA = (caminho) => caminho === "/ia/v1/models" || caminho === "/ia/v1/chat/completions" || caminho.startsWith(PREFIXO_GEMINI);

export async function tratarProxyIA(req, env, ctx, caminho, { validar = validarSessao } = {}) {
  let quem;
  try {
    quem = await validar(env, req);
  } catch (e) {
    return erro(e?.status === 409 ? 409 : 401, e?.message || "Entre de novo com o seu Vetorial ID.");
  }
  if (!(await contaComAcesso(env, quem.usuario))) return erro(402, MSG_SEM_ACESSO);
  if (env.LIMITADOR) {
    const { success } = await env.LIMITADOR.limit({ key: `ia:${quem.usuario.id}` });
    if (!success) return erro(429, "Muitas perguntas seguidas. Espere um instante.");
  }
  if (caminho.startsWith(PREFIXO_GEMINI)) return await tratarGemini(req, env, caminho.slice(PREFIXO_GEMINI.length));
  if (req.method === "GET" && caminho === "/ia/v1/models") return json({ object: "list", data: MODELOS.map((id) => ({ id, object: "model" })) });
  if (req.method !== "POST" || caminho !== "/ia/v1/chat/completions") return erro(405, "Método não permitido.");
  if (!env.GROQ_API_KEY) return erro(503, "A IA do servidor não está configurada.");

  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_CORPO) return erro(413, "Pedido grande demais.");
  const bruto = await req.text();
  if (bruto.length > MAX_CORPO) return erro(413, "Pedido grande demais.");
  let corpo;
  try { corpo = JSON.parse(bruto); } catch { return erro(400, "JSON inválido."); }
  if (!corpo || typeof corpo !== "object" || !Array.isArray(corpo.messages) || corpo.messages.length === 0 || corpo.messages.length > 200) return erro(400, "Envie as mensagens.");
  if (!MODELOS.includes(corpo.model)) return erro(404, `model ${String(corpo.model).slice(0, 60)} not found`);

  const saida = {};
  for (const c of CAMPOS) if (corpo[c] !== undefined) saida[c] = corpo[c];
  saida.stream = false;
  if (typeof saida.max_tokens === "number") saida.max_tokens = Math.min(saida.max_tokens, MAX_SAIDA);
  if (typeof saida.max_completion_tokens === "number") saida.max_completion_tokens = Math.min(saida.max_completion_tokens, MAX_SAIDA);
  if (saida.max_tokens === undefined && saida.max_completion_tokens === undefined) saida.max_completion_tokens = MAX_SAIDA;

  let r;
  try {
    r = await fetch(`${GROQ}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(saida) });
  } catch {
    return erro(502, "Não consegui falar com a IA agora.");
  }
  // devolve o status e o corpo como vieram (429 vira "limite" no app, que tenta outro modelo)
  return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
}

// Gemini da Vênus: o app manda o pedido do Gemini como sempre, mas para cá, com o token do Vetorial ID;
// a chave do Google fica só no servidor. Serve PDF, áudio, foto, busca em notas e memória (embeddings).
async function tratarGemini(req, env, caminho) {
  if (!env.GEMINI_API_KEY) return erro(503, "O Gemini do servidor não está configurado.");
  if (req.method === "GET" && caminho === "models") {
    const r = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY } }).catch(() => null);
    if (!r) return erro(502, "Não consegui falar com o Gemini agora.");
    return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
  }
  if (req.method !== "POST" || !GEMINI_PERMITIDO.test(caminho)) return erro(404, "Rota do Gemini não permitida.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_CORPO_GEMINI) return erro(413, "Arquivo grande demais.");
  const bruto = await req.arrayBuffer();
  if (bruto.byteLength > MAX_CORPO_GEMINI) return erro(413, "Arquivo grande demais.");
  let r;
  try {
    r = await fetch(`${GEMINI}/${caminho}`, { method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" }, body: bruto });
  } catch {
    return erro(502, "Não consegui falar com o Gemini agora.");
  }
  return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
}
