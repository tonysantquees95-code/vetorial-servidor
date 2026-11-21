// Arquivo de calendário (.ics): o cliente toca e o horário entra na agenda dele, já com alarme. A equipe assina o link da
// própria agenda e vê as marcações no Google Agenda ou no Calendário da Apple (o celular atualiza de tempos em tempos).
import { FUSO_MIN } from "./horarios.js";

const pad = (n) => String(n).padStart(2, "0");
/** "2026-11-21" + 15:00 (minutos) → "20261121T180000Z" (UTC). */
export function dataUtc(data, minuto) {
  const [a, m, d] = data.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d, 0, minuto - FUSO_MIN, 0));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00Z`;
}
const escapar = (t) => String(t ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Linhas com mais de 75 bytes continuam na seguinte, começando por um espaço (regra do formato). */
function dobrar(linha) {
  const bytes = new TextEncoder().encode(linha);
  if (bytes.length <= 75) return linha;
  const partes = [];
  let atual = "";
  let tam = 0;
  for (const c of linha) {
    const b = new TextEncoder().encode(c).length;
    if (tam + b > (partes.length ? 74 : 75)) { partes.push(atual); atual = ""; tam = 0; }
    atual += c;
    tam += b;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

/**
 * eventos: [{id, titulo, data, ini, fim, local?, descricao?, cancelado?, alarmeMin?}]
 * nome: nome do calendário (aparece no app de agenda).
 */
export function calendario(eventos, { nome = "Agenda", agora = Date.now(), alarmeMin = 60 } = {}) {
  const carimbo = new Date(agora).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const l = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vetorial Tech//Venus Agenda//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapar(nome)}`, "X-WR-TIMEZONE:America/Sao_Paulo", "REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M"];
  for (const e of eventos) {
    l.push("BEGIN:VEVENT", `UID:agenda-${e.id}@vetorial.tech`, `DTSTAMP:${carimbo}`, `DTSTART:${dataUtc(e.data, e.ini)}`, `DTEND:${dataUtc(e.data, e.fim)}`, `SUMMARY:${escapar(e.titulo)}`);
    if (e.local) l.push(`LOCATION:${escapar(e.local)}`);
    if (e.descricao) l.push(`DESCRIPTION:${escapar(e.descricao)}`);
    l.push(`STATUS:${e.cancelado ? "CANCELLED" : "CONFIRMED"}`);
    const alarme = e.alarmeMin ?? alarmeMin;
    if (alarme > 0 && !e.cancelado) l.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapar(e.titulo)}`, `TRIGGER:-PT${alarme}M`, "END:VALARM");
    l.push("END:VEVENT");
  }
  l.push("END:VCALENDAR");
  return l.map(dobrar).join("\r\n") + "\r\n";
}
