/**
 * Conversa da Vênus com busca na web.
 *
 *   POST /chat  { "messages": [{ "role": "user"|"assistant"|"system", "content": "..." }] }  ou  { "message": "..." }
 *   →           { "reply": "...", "provider": "groq"|"gemini", "model": "...", "sources": [{ title, url }], "fallback"?: true }
 *
 * 1. Groq com Tool Calling: o modelo chama a ferramenta web_search (Tavily) quando precisa de dados atuais.
 * 2. Se a Groq ou o Tavily falharem, estourarem o limite (429) ou demorarem demais, responde o Gemini
 *    (com a busca do Google embutida, para continuar com dados em tempo real).
 *
 * Segredos (wrangler secret): GROQ_API_KEY, TAVILY_API_KEY, GEMINI_API_KEY. Nada disso vai para o app.
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// mesma ordem de preferência do app (SegundaIA); os dois aceitam Tool Calling
const GROQ_MODELOS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"];
const TAVILY_URL = "https://api.tavily.com/search";
// gemini-2.5-flash não está disponível para chaves novas (ver CLAUDE.md)
const GEMINI_MODELOS = ["gemini-3.8-flash", "gemini-flash-lite-latest"];
const geminiUrl = (modelo) => `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

const TEMPO_MAXIMO_MS = 12000;
const TEMPO_TAVILY_MS = 15000;
const MAX_RODADAS = 3;

const CABECALHOS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: CABECALHOS });

const INSTRUCOES =
  "Você é a Vênus, assistente que responde em português do Brasil, de forma clara e direta. " +
  "Hoje é {HOJE} (horário de Brasília). " +
  "Quando a pergunta exigir informação atual ou externa (notícias, preços, cotações, clima, resultados, datas, " +
  "lançamentos, horários, qualquer coisa que possa ter mudado), use a ferramenta web_search antes de responder " +
  "e cite as fontes de forma breve. Para conversa comum, responda sem pesquisar.";

const FERRAMENTAS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Pesquisa na web em tempo real. Use para notícias, eventos recentes, preços, cotações, clima, " +
        "datas atuais ou qualquer informação que possa ter mudado depois do seu treinamento.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Termo de busca objetivo." } },
        required: ["query"],
      },
    },
  },
];

class ErroDoProvedor extends Error {
  constructor(provedor, status, detalhe) {
    super(`${provedor} falhou (${status}): ${String(detalhe || "").slice(0, 300)}`);
    this.provedor = provedor;
    this.status = status;
  }
}

function instrucoes() {
  const hoje = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });
  return INSTRUCOES.replace("{HOJE}", hoje);
}

async function buscar(url, init, tempo = TEMPO_MAXIMO_MS) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), tempo);
  try {
    return await fetch(url, { ...init, signal: controle.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ Tavily
async function pesquisarNaWeb(consulta, env) {
  if (!env.TAVILY_API_KEY) throw new ErroDoProvedor("tavily", 500, "TAVILY_API_KEY ausente");
  if (!consulta.trim()) throw new ErroDoProvedor("tavily", 400, "busca vazia");
  const r = await buscar(
    TAVILY_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.TAVILY_API_KEY}` },
      body: JSON.stringify({ query: consulta.slice(0, 400), search_depth: "basic", max_results: 5, include_answer: true }),
    },
    TEMPO_TAVILY_MS,
  );
  if (!r.ok) throw new ErroDoProvedor("tavily", r.status, await r.text());
  const d = await r.json();
  return {
    answer: d.answer || null,
    results: (d.results || []).map((x) => ({ title: x.title, url: x.url, content: String(x.content || "").slice(0, 800) })),
  };
}

// ------------------------------------------------------------------ Groq
async function perguntarGroqModelo(modelo, mensagens, env) {
  const conversa = [{ role: "system", content: instrucoes() }, ...mensagens];
  const fontes = [];
  for (let rodada = 0; rodada <= MAX_RODADAS; rodada++) {
    const r = await buscar(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: modelo,
        messages: conversa,
        tools: FERRAMENTAS,
        // na última rodada força a resposta final, sem novas buscas
        tool_choice: rodada === MAX_RODADAS ? "none" : "auto",
        temperature: 0.6,
      }),
    });
    if (!r.ok) throw new ErroDoProvedor("groq", r.status, await r.text());
    const d = await r.json();
    const msg = d.choices && d.choices[0] && d.choices[0].message;
    if (!msg) throw new ErroDoProvedor("groq", 502, "resposta vazia");

    const chamadas = msg.tool_calls || [];
    if (!chamadas.length) {
      const reply = String(msg.content || "").trim();
      if (!reply) throw new ErroDoProvedor("groq", 502, "conteúdo vazio");
      return { reply, provider: "groq", model: modelo, sources: unicas(fontes) };
    }

    conversa.push({ role: "assistant", content: msg.content || "", tool_calls: chamadas });
    for (const c of chamadas) {
      let saida;
      if (c.function && c.function.name === "web_search") {
        let args = {};
        try {
          args = JSON.parse(c.function.arguments || "{}");
        } catch (e) {}
        // falha do Tavily sobe e aciona o Gemini
        const res = await pesquisarNaWeb(String(args.query || ""), env);
        res.results.forEach((x) => fontes.push({ title: x.title, url: x.url }));
        saida = JSON.stringify(res);
      } else {
        saida = JSON.stringify({ error: `ferramenta desconhecida: ${c.function && c.function.name}` });
      }
      conversa.push({ role: "tool", tool_call_id: c.id, content: saida });
    }
  }
  throw new ErroDoProvedor("groq", 508, "limite de rodadas de busca");
}

async function perguntarGroq(mensagens, env) {
  if (!env.GROQ_API_KEY) throw new ErroDoProvedor("groq", 500, "GROQ_API_KEY ausente");
  let ultimo;
  for (const modelo of GROQ_MODELOS) {
    try {
      return await perguntarGroqModelo(modelo, mensagens, env);
    } catch (e) {
      ultimo = e;
      // só tenta o próximo modelo quando este não existe/não aceita o pedido; limite, queda,
      // demora e falha do Tavily vão direto para o Gemini
      if (!(e instanceof ErroDoProvedor) || e.provedor !== "groq" || ![400, 404].includes(e.status)) throw e;
    }
  }
  throw ultimo;
}

// ------------------------------------------------------------------ Gemini (reserva)
async function perguntarGemini(mensagens, env) {
  if (!env.GEMINI_API_KEY) throw new ErroDoProvedor("gemini", 500, "GEMINI_API_KEY ausente");
  const sistemaExtra = mensagens.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const contents = mensagens
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const corpo = JSON.stringify({
    systemInstruction: { parts: [{ text: [instrucoes(), sistemaExtra].filter(Boolean).join("\n") }] },
    contents,
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.6 },
  });

  let ultimo;
  for (const modelo of GEMINI_MODELOS) {
    try {
      const r = await buscar(geminiUrl(modelo), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: corpo,
      });
      if (!r.ok) throw new ErroDoProvedor("gemini", r.status, await r.text());
      const d = await r.json();
      const cand = d.candidates && d.candidates[0];
      const reply = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("").trim();
      if (!reply) throw new ErroDoProvedor("gemini", 502, "conteúdo vazio");
      const fontes = ((cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [])
        .filter((c) => c.web && c.web.uri)
        .map((c) => ({ title: c.web.title, url: c.web.uri }));
      return { reply, provider: "gemini", model: modelo, sources: unicas(fontes) };
    } catch (e) {
      ultimo = e;
      console.warn("venus chat gemini", modelo, e && e.message);
    }
  }
  throw ultimo;
}

// ------------------------------------------------------------------ entrada
function unicas(fontes) {
  const vistas = new Set();
  return fontes.filter((f) => f.url && !vistas.has(f.url) && vistas.add(f.url)).slice(0, 8);
}

function lerMensagens(corpo) {
  if (corpo && Array.isArray(corpo.messages)) {
    return corpo.messages
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: ["user", "assistant", "system"].includes(m.role) ? m.role : "user", content: m.content.slice(0, 8000) }))
      .slice(-30);
  }
  if (corpo && typeof corpo.message === "string" && corpo.message.trim()) {
    return [{ role: "user", content: corpo.message.slice(0, 8000) }];
  }
  return [];
}

export function chatPreflight() {
  return new Response(null, { status: 204, headers: CABECALHOS });
}

export async function chat(req, env) {
  let corpo;
  try {
    corpo = await req.json();
  } catch (e) {
    return json({ error: "JSON inválido" }, 400);
  }
  const mensagens = lerMensagens(corpo);
  if (!mensagens.length || !mensagens.some((m) => m.role === "user")) return json({ error: "nenhuma mensagem enviada" }, 400);

  try {
    return json(await perguntarGroq(mensagens, env));
  } catch (erroGroq) {
    console.warn("venus chat: Groq/Tavily falhou, usando o Gemini:", erroGroq && erroGroq.message);
    try {
      return json({ ...(await perguntarGemini(mensagens, env)), fallback: true });
    } catch (erroGemini) {
      console.error("venus chat: Gemini também falhou:", erroGemini && erroGemini.message);
      return json({ error: "A Vênus está indisponível no momento. Tente de novo em instantes." }, 503);
    }
  }
}
