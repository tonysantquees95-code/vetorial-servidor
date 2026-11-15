// Caixa de entrada de cada pessoa no Voxix (Durable Object, uma por usuário).
// O servidor NÃO guarda histórico: a mensagem espera aqui só até o aparelho confirmar (ack) e então é apagada.
// Com o app aberto, a entrega é na hora pelo WebSocket; fechado, a fila espera até VALIDADE_MS.
export const MAX_FILA = 500;
export const VALIDADE_MS = 7 * 86_400_000;
const PREFIXO = "m:";

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

export class CaixaVoxix {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  /** Mensagens esperando (as vencidas são apagadas na hora). */
  async fila(agora = Date.now()) {
    const todas = await this.state.storage.list({ prefix: PREFIXO, limit: MAX_FILA + 10 });
    const vivas = [];
    const apagar = [];
    for (const [k, m] of todas) {
      if (agora - m.criado > VALIDADE_MS) apagar.push(k);
      else vivas.push(m);
    }
    if (apagar.length) await this.state.storage.delete(apagar);
    return vivas.sort((a, b) => a.criado - b.criado);
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (req.headers.get("upgrade") !== "websocket") return json({ error: "use WebSocket" }, 426);
      const par = new WebSocketPair();
      this.state.acceptWebSocket(par[1]);
      par[1].send(JSON.stringify({ t: "fila", mensagens: await this.fila() }));
      return new Response(null, { status: 101, webSocket: par[0] });
    }
    if (url.pathname === "/entregar" && req.method === "POST") {
      const m = await req.json();
      return json(await this.entregar(m));
    }
    return json({ error: "não encontrado" }, 404);
  }

  /** Guarda a mensagem na fila e empurra para quem estiver conectado. */
  async entregar(m, agora = Date.now()) {
    const fila = await this.state.storage.list({ prefix: PREFIXO, limit: MAX_FILA + 1 });
    if (fila.size >= MAX_FILA) return { ok: false, codigo: "caixa_cheia" };
    const msg = { id: m.id, de: m.de, deNome: m.deNome, conversa: m.conversa, corpo: m.corpo, tipo: m.tipo || "texto", criado: m.criado || agora };
    await this.state.storage.put(PREFIXO + msg.id, msg);
    const texto = JSON.stringify({ t: "msg", mensagem: msg });
    let aoVivo = 0;
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(texto); aoVivo++; } catch { /* conexão caída */ }
    }
    return { ok: true, aoVivo: aoVivo };
  }

  async webSocketMessage(ws, bruto) {
    let d;
    try { d = JSON.parse(typeof bruto === "string" ? bruto : new TextDecoder().decode(bruto)); } catch { return; }
    if (d.t === "ack" && Array.isArray(d.ids)) {
      const ids = d.ids.filter((x) => typeof x === "string" && /^[a-z0-9]{8,40}$/.test(x)).slice(0, 200);
      if (ids.length) await this.state.storage.delete(ids.map((i) => PREFIXO + i));
    } else if (d.t === "ping") {
      try { ws.send(JSON.stringify({ t: "pong" })); } catch { /* ok */ }
    }
  }

  webSocketClose(ws) {
    try { ws.close(); } catch { /* já fechado */ }
  }
}
