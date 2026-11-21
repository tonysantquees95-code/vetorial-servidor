// Contas de agenda: datas, minutos do dia e quais horários ainda estão livres. Só lógica pura (sem banco), testada à parte.

/** Brasília não tem horário de verão desde 2019: um deslocamento fixo basta. */
export const FUSO_MIN = -180;
export const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const DIAS_LONGOS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const pad = (n) => String(n).padStart(2, "0");

/** A data e o minuto de agora, no horário de Brasília. */
export function agoraLocal(agora = Date.now()) {
  const d = new Date(agora + FUSO_MIN * 60_000);
  return { data: d.toISOString().slice(0, 10), minuto: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function dataValida(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const diaDaSemana = (data) => new Date(`${data}T00:00:00Z`).getUTCDay();
export function somarDias(data, n) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
/** "09:30" → 570; qualquer coisa fora de 00:00–24:00 vira null. */
export function lerHHMM(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? "").trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && v >= 0 && v <= 1440 ? v : null;
}
/** "sex, 21/11 às 15:00" */
export function dataBonita(data, ini) {
  const [a, m, d] = data.split("-");
  void a;
  return `${DIAS[diaDaSemana(data)]}, ${d}/${m}${ini === undefined ? "" : ` às ${hhmm(ini)}`}`;
}

/** Junta trechos que se encostam ou se sobrepõem. */
export function juntar(trechos) {
  const lista = trechos.filter((t) => t.fim > t.ini).map((t) => ({ ini: t.ini, fim: t.fim })).sort((a, b) => a.ini - b.ini);
  const saida = [];
  for (const t of lista) {
    const ultimo = saida[saida.length - 1];
    if (ultimo && t.ini <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, t.fim);
    else saida.push(t);
  }
  return saida;
}

/**
 * Horários de início possíveis para um atendimento de `duracao` minutos.
 *  - janelas: trechos em que a pessoa atende naquele dia ([{ini, fim}]);
 *  - ocupados: marcações e bloqueios do dia ([{ini, fim}]);
 *  - passo: de quanto em quanto tempo oferece; intervalo: folga entre atendimentos;
 *  - apartirDe: não oferece nada antes deste minuto (hoje: agora + antecedência).
 */
export function livres({ janelas, ocupados = [], duracao, passo = 30, intervalo = 0, apartirDe = 0 }) {
  if (!(duracao > 0) || !(passo > 0)) return [];
  const bloqueado = juntar(ocupados);
  const saida = [];
  for (const j of juntar(janelas)) {
    for (let s = j.ini; s + duracao <= j.fim; s += passo) {
      if (s < apartirDe) continue;
      if (bloqueado.some((o) => s < o.fim + intervalo && s + duracao + intervalo > o.ini)) continue;
      saida.push(s);
    }
  }
  return saida;
}

/** Valida e normaliza os trechos de atendimento de uma semana: [{dia, ini, fim}]. */
export function normalizarSemana(lista) {
  const saida = [];
  for (const t of Array.isArray(lista) ? lista : []) {
    const dia = Number(t?.dia);
    const ini = typeof t?.ini === "string" ? lerHHMM(t.ini) : Number(t?.ini);
    const fim = typeof t?.fim === "string" ? lerHHMM(t.fim) : Number(t?.fim);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) continue;
    if (!Number.isInteger(ini) || !Number.isInteger(fim) || ini < 0 || fim > 1440 || fim <= ini) continue;
    saida.push({ dia, ini, fim });
  }
  // sem choque entre trechos do mesmo dia
  const porDia = new Map();
  for (const t of saida) porDia.set(t.dia, [...(porDia.get(t.dia) || []), t]);
  const final = [];
  for (const [dia, ts] of [...porDia.entries()].sort((a, b) => a[0] - b[0])) for (const j of juntar(ts)) final.push({ dia, ...j });
  return final.slice(0, 70);
}
