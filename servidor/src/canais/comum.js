export class ErroCanal extends Error {
  constructor(codigo, mensagem, status = 502) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
  }
}

/** fetch com tempo limite e erro legível. */
export async function pedir(url, opcoes = {}, { tempo = 15000, aceitar404 = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), tempo);
  try {
    const r = await fetch(url, { ...opcoes, signal: ctrl.signal });
    if (aceitar404 && r.status === 404) return null;
    if (!r.ok) {
      const detalhe = (await r.text().catch(() => "")).slice(0, 200);
      throw new ErroCanal(r.status === 401 || r.status === 403 ? "acesso_negado" : "plataforma_erro", `A plataforma respondeu ${r.status}. ${detalhe}`.trim(), 502);
    }
    const texto = await r.text();
    return texto ? JSON.parse(texto) : {};
  } catch (e) {
    if (e instanceof ErroCanal) throw e;
    throw new ErroCanal("sem_resposta", "Não consegui falar com a plataforma agora.", 504);
  } finally {
    clearTimeout(t);
  }
}

export const centavos = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && String(v ?? "") !== "" ? Math.round(n * 100) : null;
};

/** Textos em vários idiomas da Nuvemshop ({pt: "...", es: "..."}) → português ou o primeiro. */
export const texto = (v) => (v && typeof v === "object" ? v.pt || v["pt-BR"] || Object.values(v)[0] || "" : String(v ?? ""));

export const STATUS_DEVOLVIDOS = new Set(["cancelado", "devolvido", "reembolsado"]);
