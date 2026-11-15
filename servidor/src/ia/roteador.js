// Roteador: decide, de forma determinística, qual provedor atende cada função.
//   Groq     -> velocidade e textos
//   DeepSeek -> lógica pesada, relatórios de BI e código
//   Gemini   -> multimodal e OCR; em texto só entra como última reserva quando Groq e DeepSeek falham
export const TABELA = Object.freeze({
  conversa: "groq",
  rapida: "groq",
  texto: "groq",
  resumo: "groq",
  traducao: "groq",
  logica: "deepseek",
  bi: "deepseek",
  relatorio: "deepseek",
  codigo: "deepseek",
  multimodal: "gemini",
  ocr: "gemini"
});

export class ErroHttp extends Error {
  constructor(status, codigo, mensagem) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

export const normalizar = (t) =>
  String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const RE_CODIGO = /```|\b(codigo|funcao|classe|bug|stack ?trace|compil\w*|typescript|javascript|python|kotlin|java|sql|regex|script|refator\w*|endpoint|api rest|html|css|react)\b/;
const RE_BI = /\b(relatorio|bi|kpi|faturamento|margem|lucro|dashboard|indicadores?|tabela dinamica|tendencia|analise de dados|cohort|churn|ticket medio|curva abc|fluxo de caixa)\b/;
const RE_LOGICA = /\b(passo a passo|raciocin\w*|prove|demonstre|probabilidade|otimiz\w*|trade-?off|estrategia complexa|planejamento detalhado|enigma|puzzle)\b/;

/** Classificação automática quando o app não informa a tarefa. */
export function classificar(texto) {
  const t = normalizar(texto);
  if (RE_CODIGO.test(t)) return "codigo";
  if (RE_BI.test(t)) return "bi";
  if (RE_LOGICA.test(t)) return "logica";
  return "conversa";
}

/**
 * @returns {{tarefa:string, provedor:"groq"|"deepseek"|"gemini", motivo:string}}
 */
export function decidir({ tarefa, textoFinal, temAnexos }) {
  if (tarefa !== undefined && !(typeof tarefa === "string" && Object.hasOwn(TABELA, tarefa))) {
    throw new ErroHttp(400, "tarefa_invalida", `Tarefa desconhecida. Use: ${Object.keys(TABELA).join(", ")}.`);
  }
  if (temAnexos) {
    // Anexo (imagem, PDF, áudio) só o Gemini lê.
    const t = tarefa === "ocr" ? "ocr" : "multimodal";
    if (tarefa && TABELA[tarefa] !== "gemini") {
      throw new ErroHttp(400, "tarefa_incompativel", "Pedidos com anexo devem usar a tarefa multimodal ou ocr.");
    }
    return { tarefa: t, provedor: "gemini", motivo: "anexo" };
  }
  if (tarefa && TABELA[tarefa] === "gemini") {
    throw new ErroHttp(400, "anexo_obrigatorio", "As tarefas multimodal e ocr exigem pelo menos um anexo.");
  }
  if (tarefa) return { tarefa, provedor: TABELA[tarefa], motivo: "informada" };
  const auto = classificar(textoFinal);
  return { tarefa: auto, provedor: TABELA[auto], motivo: "automatica" };
}

/** Ordem de tentativas. Texto: Groq e DeepSeek se revezam e o Gemini é a última reserva (sem ela, limite ou saldo
 *  esgotado nos dois derrubava a conversa). Anexos: só o Gemini lê, sem reserva. */
export function ordemDeTentativas(provedor) {
  if (provedor === "groq") return ["groq", "deepseek", "gemini"];
  if (provedor === "deepseek") return ["deepseek", "groq", "gemini"];
  return ["gemini"];
}
