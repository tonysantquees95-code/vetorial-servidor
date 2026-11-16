// Sala de texto ao vivo do Voxix (Durable Object, uma por sala).
// Quem está com a sala aberta fica conectado por WebSocket: as mensagens vão para todos na hora e a lista de "online" sai
// das conexões abertas. O servidor guarda só as últimas mensagens (HISTORICO_MAX, por VALIDADE_MS) para quem abre a sala
// depois; o resto do histórico fica no aparelho de cada pessoa.
import { aleatorio } from "../loja/cripto.js";

export const HISTORICO_MAX = 200;
export const VALIDADE_MS = 7 * 86_400_000;
export const MAX_TEXTO = 2000;
export const JANELA_MS = 20_000;
export const JANELA_MAX = 15; // no máximo 15 mensagens a cada 20 s por pessoa
const PREFIXO = "m:";

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

export class SalaVoxix {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.janelas = new Map(); // usuario → horários das últimas mensagens
  }

  /** Quem está conectado (cada pessoa uma vez, mesmo com dois aparelhos), em ordem alfabética. */
  online(ignorar = null) {
    const vistos = new Map();
    for (const ws of this.state.getWebSockets()) {
      if (ws === ignorar) continue;
      const p = ws.deserializeAttachment?.();
      if (p && p.usuario && !vistos.has(p.usuario)) vistos.set(p.usuario, { apelido: p.apelido, nome: p.nome });
    }
    return [...vistos.values()].sort((a, b) => a.apelido.localeCompare(b.apelido));
  }

  /** As mensagens guardadas que ainda valem (as vencidas são apagadas). */
  async historico(agora = Date.now()) {
    const todas = await this.state.storage.list({ prefix: PREFIXO, limit: HISTORICO_MAX + 10 });
    const vivas = [];
    const apagar = [];
    for (const [k, m] of todas) {
      if (agora - m.criado > VALIDADE_MS) apagar.push(k);
      else vivas.push(m);
    }
    if (apagar.length) await this.state.storage.delete(apagar);
    return vivas.sort((a, b) => a.criado - b.criado || (a.id < b.id ? -1 : 1));
  }

  transmitir(obj, ignorar = null) {
    const texto = JSON.stringify(obj);
    for (const ws of this.state.getWebSockets()) {
      if (ws === ignorar) continue;
      try { ws.send(texto); } catch { /* conexão caída */ }
    }
  }

  /** Uma pessoa abriu a sala: recebe o histórico e a lista de online; os outros veem que ela entrou. */
  async entrar(ws, pessoa) {
    const jaEstava = this.online().some((p) => p.apelido === pessoa.apelido);
    ws.serializeAttachment?.({ usuario: pessoa.usuario, apelido: pessoa.apelido, nome: pessoa.nome });
    this.state.acceptWebSocket?.(ws);
    const online = this.online();
    if (!online.some((p) => p.apelido === pessoa.apelido)) online.push({ apelido: pessoa.apelido, nome: pessoa.nome });
    try { ws.send(JSON.stringify({ t: "inicio", mensagens: await this.historico(), online })); } catch { /* ok */ }
    if (!jaEstava) this.transmitir({ t: "entrou", pessoa: { apelido: pessoa.apelido, nome: pessoa.nome } }, ws);
  }

  /** Uma mensagem de uma conexão: valida, guarda e manda para os outros; quem mandou recebe a confirmação com o idLocal. */
  async receber(ws, d, agora = Date.now()) {
    const eu = ws.deserializeAttachment?.();
    if (!eu || !d || typeof d !== "object") return;
    if (d.t === "ping") { try { ws.send(JSON.stringify({ t: "pong" })); } catch { /* ok */ } return; }
    if (d.t !== "msg") return;
    const idLocal = typeof d.idLocal === "string" ? d.idLocal.slice(0, 40) : undefined;
    const recusar = (codigo, texto) => { try { ws.send(JSON.stringify({ t: "recusada", idLocal, codigo, erro: texto })); } catch { /* ok */ } };
    const corpo = String(d.corpo ?? "").replace(/\u0000/g, "").trim();
    if (!corpo) return recusar("mensagem_vazia", "Escreva alguma coisa.");
    if (corpo.length > MAX_TEXTO) return recusar("mensagem_grande", `A mensagem passa de ${MAX_TEXTO} letras.`);
    const recentes = (this.janelas.get(eu.usuario) || []).filter((h) => agora - h < JANELA_MS);
    if (recentes.length >= JANELA_MAX) return recusar("devagar", "Calma! Você está mandando mensagens rápido demais.");
    recentes.push(agora);
    this.janelas.set(eu.usuario, recentes);
    const id = agora.toString(36).padStart(9, "0") + aleatorio(5);
    const mensagem = { id, de: eu.apelido, deNome: eu.nome, corpo, criado: agora };
    await this.state.storage.put(PREFIXO + id, mensagem);
    const guardadas = await this.state.storage.list({ prefix: PREFIXO, limit: HISTORICO_MAX + 20 });
    if (guardadas.size > HISTORICO_MAX) await this.state.storage.delete([...guardadas.keys()].slice(0, guardadas.size - HISTORICO_MAX));
    this.transmitir({ t: "msg", mensagem }, ws); // quem mandou recebe só a confirmação (abaixo)
    // quem mandou recebe a mesma mensagem com o idLocal, para trocar a "enviando…" pela definitiva
    try { ws.send(JSON.stringify({ t: "confirmada", idLocal, mensagem })); } catch { /* ok */ }
  }

  /** Uma conexão acabou: se foi a última da pessoa, os outros veem que ela saiu. */
  saiu(ws) {
    const p = ws.deserializeAttachment?.();
    if (!p) return;
    if (!this.online(ws).some((o) => o.apelido === p.apelido)) this.transmitir({ t: "saiu", pessoa: { apelido: p.apelido, nome: p.nome } }, ws);
  }

  /** Tira a pessoa da sala (foi expulsa ou saiu da comunidade). */
  expulsar(usuario) {
    for (const ws of this.state.getWebSockets()) {
      if (ws.deserializeAttachment?.()?.usuario === usuario) {
        try { ws.send(JSON.stringify({ t: "removido" })); ws.close(4001, "removido"); } catch { /* já fechado */ }
        this.saiu(ws);
      }
    }
  }

  /** A sala ou a comunidade foi apagada. */
  async encerrar() {
    this.transmitir({ t: "encerrada" });
    for (const ws of this.state.getWebSockets()) { try { ws.close(4002, "encerrada"); } catch { /* ok */ } }
    await this.state.storage.deleteAll?.();
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (req.headers.get("upgrade") !== "websocket") return json({ error: "use WebSocket" }, 426);
      const usuario = req.headers.get("x-voxix-usuario");
      const apelido = req.headers.get("x-voxix-apelido");
      if (!usuario || !apelido) return json({ error: "sem identificação" }, 400);
      const par = new WebSocketPair();
      await this.entrar(par[1], { usuario, apelido, nome: req.headers.get("x-voxix-nome") || apelido });
      return new Response(null, { status: 101, webSocket: par[0] });
    }
    if (url.pathname === "/expulsar" && req.method === "POST") { this.expulsar(String((await req.json()).usuario || "")); return json({ ok: true }); }
    if (url.pathname === "/encerrar" && req.method === "POST") { await this.encerrar(); return json({ ok: true }); }
    if (url.pathname === "/online" && req.method === "GET") return json({ online: this.online() });
    return json({ error: "não encontrado" }, 404);
  }

  async webSocketMessage(ws, bruto) {
    let d;
    try { d = JSON.parse(typeof bruto === "string" ? bruto : new TextDecoder().decode(bruto)); } catch { return; }
    await this.receber(ws, d);
  }

  webSocketClose(ws) {
    this.saiu(ws);
    try { ws.close(); } catch { /* já fechado */ }
  }

  webSocketError(ws) {
    this.saiu(ws);
  }
}
