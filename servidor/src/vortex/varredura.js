// IA da primeira varredura do Vortex: recebe um resumo compacto (nomes de pastas, contagens, amostras de arquivos e dados do aparelho)
// e devolve a plataforma provável de cada pasta ambígua e um perfil de desempenho. A chave de IA fica aqui; o app só manda o resumo.
import { executar } from "../ia/provedores.js";

const MAX_PASTAS = 60;
const ID = /^[a-z0-9_]{2,24}$/;
const PERFIS = ["leve", "equilibrado", "potente"];
const SISTEMA =
  "Você ajuda um frontend de emuladores a organizar jogos retrô. Responda SOMENTE com JSON válido, sem texto extra, no formato " +
  '{"pastas":[{"pasta":"<exatamente como recebida>","plataforma":"<id da lista ou null>","motivo":"<até 80 caracteres>"}],"perfil":"leve|equilibrado|potente","observacoes":"<até 200 caracteres>"}. ' +
  "Use só ids de plataforma da lista recebida. Se não tiver certeza, plataforma null. Escolha o perfil pelo processador e pela RAM.";

const texto = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, n);

export function montarPedido(corpo) {
  const plataformas = Array.isArray(corpo?.plataformas) ? corpo.plataformas.filter((p) => ID.test(String(p))).slice(0, 80) : [];
  const pastas = (Array.isArray(corpo?.pastas) ? corpo.pastas : []).slice(0, MAX_PASTAS).map((p) => ({
    pasta: texto(p?.pasta, 200),
    reconhecidos: p?.plataformas && typeof p.plataformas === "object" ? Object.fromEntries(Object.entries(p.plataformas).filter(([k]) => ID.test(k)).slice(0, 12).map(([k, v]) => [k, Number(v) || 0])) : {},
    ambiguos: Number(p?.ambiguos) || 0,
    amostras: (Array.isArray(p?.amostras) ? p.amostras : []).slice(0, 6).map((a) => texto(a, 100)),
  })).filter((p) => p.pasta);
  const a = corpo?.aparelho ?? {};
  const aparelho = { so: texto(a.so, 20), cpu: texto(a.cpu, 80), nucleos: Number(a.nucleos) || 0, ram_gb: Number(a.ram_gb) || 0 };
  const emuladores = (Array.isArray(corpo?.emuladores) ? corpo.emuladores : []).slice(0, 40).map((e) => texto(e, 40));
  return { plataformas, pastas, aparelho, emuladores };
}

/** Valida a resposta da IA: só pastas pedidas, só plataformas permitidas, perfil conhecido. */
export function validarResposta(bruto, pedido) {
  const m = /\{[\s\S]*\}/.exec(String(bruto));
  let j;
  try { j = JSON.parse(m ? m[0] : ""); } catch { return null; }
  const pedidas = new Set(pedido.pastas.map((p) => p.pasta));
  const ok = new Set(pedido.plataformas);
  const pastas = (Array.isArray(j?.pastas) ? j.pastas : [])
    .filter((p) => pedidas.has(p?.pasta))
    .map((p) => ({ pasta: p.pasta, plataforma: ok.has(p.plataforma) ? p.plataforma : null, motivo: texto(p.motivo, 80) }));
  return { pastas, perfil: PERFIS.includes(j?.perfil) ? j.perfil : "equilibrado", observacoes: texto(j?.observacoes, 200) };
}

export async function varredura(env, corpo, ia = executar) {
  const pedido = montarPedido(corpo);
  if (!pedido.pastas.length && !pedido.aparelho.cpu) return { pastas: [], perfil: "equilibrado", observacoes: "" };
  const r = await ia(env, ["deepseek", "groq"], {
    tarefa: "relatorio",
    sistema: SISTEMA,
    mensagens: [{ papel: "user", texto: JSON.stringify(pedido) }],
    temperatura: 0.1,
    maxTokens: 1800,
  });
  const v = validarResposta(r.texto, pedido);
  if (!v) return { pastas: [], perfil: "equilibrado", observacoes: "A IA não respondeu num formato válido." };
  return { ...v, provedor: r.provedor };
}

// ---- Faxina: a IA opina sobre nomes parecidos (duplicados) e arquivos pequenos demais (corrompidos) ----
const SISTEMA_FAXINA =
  "Você ajuda a limpar uma biblioteca de jogos retrô. Recebe grupos de jogos com nomes parecidos e arquivos suspeitos por serem pequenos. Responda SOMENTE com JSON válido: " +
  '{"duplicados":[{"manter":"<id>","remover":["<id>"],"motivo":"<até 80 caracteres>"}],"corrompidos":[{"id":"<id>","motivo":"<até 80 caracteres>"}]}. ' +
  "Só marque como duplicados jogos que são claramente o MESMO jogo (outra grafia, idioma, 'The', região); sequências como 2, 3 ou títulos diferentes NÃO são duplicados. Prefira manter a versão em português/Brasil ou EUA, sem beta/demo. " +
  "Só marque corrompido quando o tamanho for incompatível com o console. Na dúvida, não marque.";

const ITEM = (i) => ({ id: texto(i?.id, 40), titulo: texto(i?.titulo, 120), plataforma: texto(i?.plataforma, 24), bytes: Number(i?.bytes) || 0, arquivo: texto(i?.arquivo, 120) });

export function montarPedidoFaxina(corpo) {
  const parecidos = (Array.isArray(corpo?.parecidos) ? corpo.parecidos : []).slice(0, 40).map((g) => (Array.isArray(g) ? g.slice(0, 10).map(ITEM) : [])).filter((g) => g.length > 1);
  const suspeitos = (Array.isArray(corpo?.suspeitos) ? corpo.suspeitos : []).slice(0, 40).map(ITEM);
  return { parecidos, suspeitos };
}

export function validarFaxina(bruto, pedido) {
  const m = /\{[\s\S]*\}/.exec(String(bruto));
  let j;
  try { j = JSON.parse(m ? m[0] : ""); } catch { return null; }
  const grupos = pedido.parecidos.map((g) => new Set(g.map((i) => i.id)));
  const susp = new Set(pedido.suspeitos.map((i) => i.id));
  const duplicados = [];
  for (const d of Array.isArray(j?.duplicados) ? j.duplicados : []) {
    const g = grupos.find((x) => x.has(d?.manter));
    if (!g) continue;
    const remover = (Array.isArray(d.remover) ? d.remover : []).filter((id) => g.has(id) && id !== d.manter);
    if (remover.length) duplicados.push({ manter: d.manter, remover, motivo: texto(d.motivo, 80) });
  }
  const corrompidos = (Array.isArray(j?.corrompidos) ? j.corrompidos : []).filter((c) => susp.has(c?.id)).map((c) => ({ id: c.id, motivo: texto(c.motivo, 80) }));
  return { duplicados, corrompidos };
}

export async function faxina(env, corpo, ia = executar) {
  const pedido = montarPedidoFaxina(corpo);
  if (!pedido.parecidos.length && !pedido.suspeitos.length) return { duplicados: [], corrompidos: [] };
  const r = await ia(env, ["deepseek", "groq"], { tarefa: "relatorio", sistema: SISTEMA_FAXINA, mensagens: [{ papel: "user", texto: JSON.stringify(pedido) }], temperatura: 0.1, maxTokens: 1800 });
  const v = validarFaxina(r.texto, pedido);
  return v ? { ...v, provedor: r.provedor } : { duplicados: [], corrompidos: [], observacoes: "A IA não respondeu num formato válido." };
}

// ---- Perfil por jogo: ajustes neutros que o Vortex traduz para cada emulador (Dolphin, PPSSPP, RetroArch) ----
export const AJUSTES = Object.freeze({
  resolucao: { min: 1, max: 6 }, // múltiplo da resolução original do console
  msaa: { valores: [0, 2, 4, 8] }, // 0 = desligado
  anisotropia: { min: 0, max: 4 }, // 0 = desligado, 4 = 16x
  vsync: { bool: true },
  sombreadores: { min: 0, max: 3 }, // só Dolphin: modo de compilação (0 = síncrono ... 3 = assíncrono sem travadas)
});
export const PLATAFORMAS_PERFIL = ["gamecube", "wii", "psp"];
const SISTEMA_PERFIL =
  "Você escolhe ajustes gráficos de emulador para um jogo e um computador. Responda SOMENTE com JSON válido: " +
  '{"ajustes":{"<chave>":<valor>},"motivo":"<até 120 caracteres>"}. Use apenas as chaves permitidas e valores dentro das faixas. ' +
  "resolucao: 1 = nativa, 2 = 2x, 3 = 3x, 4 = 4x. Computador fraco (pouca RAM ou poucos núcleos): resolucao 1 ou 2, msaa 0, anisotropia 0. Potente: resolucao 3 ou 4, anisotropia 2-4. Na dúvida, escolha o seguro. Não invente chaves.";

export function validarAjustes(obj) {
  const saida = {};
  for (const [k, v] of Object.entries(obj && typeof obj === "object" ? obj : {})) {
    const r = AJUSTES[k];
    if (!r) continue;
    if (r.bool) { if (typeof v === "boolean") saida[k] = v; continue; }
    const n = Number(v);
    if (!Number.isInteger(n)) continue;
    if (r.valores ? r.valores.includes(n) : n >= r.min && n <= r.max) saida[k] = n;
  }
  return saida;
}

export async function perfilJogo(env, corpo, ia = executar) {
  const entrada = { titulo: texto(corpo?.titulo, 120), plataforma: texto(corpo?.plataforma, 24), emulador: texto(corpo?.emulador, 24), aparelho: montarPedido({ aparelho: corpo?.aparelho }).aparelho, permitidas: AJUSTES };
  if (!entrada.titulo || !PLATAFORMAS_PERFIL.includes(entrada.plataforma)) return { ajustes: {}, motivo: "" };
  const r = await ia(env, ["deepseek", "groq"], { tarefa: "relatorio", sistema: SISTEMA_PERFIL, mensagens: [{ papel: "user", texto: JSON.stringify(entrada) }], temperatura: 0.1, maxTokens: 600 });
  const m = /\{[\s\S]*\}/.exec(String(r.texto));
  let j;
  try { j = JSON.parse(m ? m[0] : ""); } catch { return { ajustes: {}, motivo: "" }; }
  return { ajustes: validarAjustes(j?.ajustes), motivo: texto(j?.motivo, 120), provedor: r.provedor };
}
