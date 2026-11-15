// Vetorial Drive no D1 (plano B enquanto o R2 não está ligado). Arquivos pequenos: documentos e ROMs leves.
// Cada arquivo é guardado em pedaços de 256 KB (base64) indexados pela posição no arquivo, então o Range é direto.
export const CH = 256 * 1024;
export const PARTE_D1 = 4 * 1024 * 1024; // múltiplo de CH: a posição de cada pedaço sai de (n-1)*PARTE + i*CH
export const COTA_D1 = 1024 ** 3;
export const ARQUIVO_MAX_D1 = 100 * 1024 ** 2;

function paraBase64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return btoa(s);
}
function deBase64(t) {
  const s = atob(t);
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
  return o;
}
const id = () => crypto.randomUUID().replace(/-/g, "");

export function backendD1(env) {
  const db = env.DB;
  return {
    nome: "d1",
    limites: { cota: COTA_D1, maxArquivo: ARQUIVO_MAX_D1, parte: PARTE_D1 },

    async lista(usuario) {
      const r = await db.prepare("SELECT pasta, nome, bytes, atualizado FROM drive_arquivos WHERE usuario = ?").bind(usuario).all();
      return r.results.map((x) => ({ pasta: x.pasta, nome: x.nome, bytes: Number(x.bytes), atualizado: Number(x.atualizado) }));
    },

    async iniciar(usuario, pasta, nome, tamanho) {
      const envio = id();
      await db.prepare("INSERT INTO drive_envios (envio, usuario, pasta, nome, tamanho, criado) VALUES (?, ?, ?, ?, ?, ?)").bind(envio, usuario, pasta, nome, tamanho, Date.now()).run();
      return { envio, parte: PARTE_D1 };
    },

    async parte(usuario, pasta, nome, envio, n, dados) {
      const e = await db.prepare("SELECT 1 AS ok FROM drive_envios WHERE envio = ? AND usuario = ? AND pasta = ? AND nome = ?").bind(envio, usuario, pasta, nome).first();
      if (!e) return null;
      const u8 = new Uint8Array(dados);
      if (u8.length > PARTE_D1) return "grande";
      const base = (n - 1) * PARTE_D1;
      const ops = [];
      for (let i = 0; i * CH < u8.length; i++) {
        const fatia = u8.subarray(i * CH, Math.min(u8.length, (i + 1) * CH));
        ops.push(db.prepare("INSERT OR REPLACE INTO drive_pedacos (envio, pos, bytes, dados) VALUES (?, ?, ?, ?)").bind(envio, base + i * CH, fatia.length, paraBase64(fatia)));
      }
      for (let i = 0; i < ops.length; i += 20) await db.batch(ops.slice(i, i + 20));
      return { n, etag: "d1" };
    },

    /** Confere que o arquivo está inteiro (sem buracos, tamanho igual ao combinado) e publica. Devolve bytes ou null. */
    async concluir(usuario, pasta, nome, envio) {
      const e = await db.prepare("SELECT tamanho FROM drive_envios WHERE envio = ? AND usuario = ? AND pasta = ? AND nome = ?").bind(envio, usuario, pasta, nome).first();
      if (!e) return null;
      const s = await db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(bytes), 0) AS t, COALESCE(MAX(pos), -1) AS m FROM drive_pedacos WHERE envio = ?").bind(envio).first();
      const esperado = Math.ceil(Number(e.tamanho) / CH);
      if (Number(s.t) !== Number(e.tamanho) || Number(s.c) !== esperado || Number(s.m) !== (esperado - 1) * CH) return "incompleto";
      const antigo = await db.prepare("SELECT envio FROM drive_arquivos WHERE usuario = ? AND pasta = ? AND nome = ?").bind(usuario, pasta, nome).first();
      await db.prepare("INSERT OR REPLACE INTO drive_arquivos (usuario, pasta, nome, envio, bytes, atualizado) VALUES (?, ?, ?, ?, ?, ?)").bind(usuario, pasta, nome, envio, Number(e.tamanho), Date.now()).run();
      await db.prepare("DELETE FROM drive_envios WHERE envio = ?").bind(envio).run();
      if (antigo && antigo.envio !== envio) await db.prepare("DELETE FROM drive_pedacos WHERE envio = ?").bind(antigo.envio).run();
      return Number(e.tamanho);
    },

    async cancelar(usuario, pasta, nome, envio) {
      const e = await db.prepare("SELECT 1 AS ok FROM drive_envios WHERE envio = ? AND usuario = ?").bind(envio, usuario).first();
      if (!e) return;
      await db.prepare("DELETE FROM drive_pedacos WHERE envio = ?").bind(envio).run();
      await db.prepare("DELETE FROM drive_envios WHERE envio = ?").bind(envio).run();
    },

    async tamanho(usuario, pasta, nome) {
      const a = await db.prepare("SELECT bytes FROM drive_arquivos WHERE usuario = ? AND pasta = ? AND nome = ?").bind(usuario, pasta, nome).first();
      return a ? Number(a.bytes) : null;
    },

    /** Corpo (stream) dos bytes [offset, offset+length). */
    async ler(usuario, pasta, nome, offset, length) {
      const a = await db.prepare("SELECT envio FROM drive_arquivos WHERE usuario = ? AND pasta = ? AND nome = ?").bind(usuario, pasta, nome).first();
      if (!a) return null;
      const fim = offset + length;
      let pos = Math.floor(offset / CH) * CH;
      return new ReadableStream({
        async pull(c) {
          if (pos >= fim) { c.close(); return; }
          const lote = await db.prepare("SELECT pos, dados FROM drive_pedacos WHERE envio = ? AND pos >= ? AND pos < ? ORDER BY pos LIMIT 8").bind(a.envio, pos, fim).all();
          if (!lote.results.length) { c.error(new Error("arquivo incompleto no Drive")); return; }
          for (const r of lote.results) {
            const b = deBase64(r.dados);
            const de = Math.max(0, offset - r.pos), ate = Math.min(b.length, fim - r.pos);
            if (ate > de) c.enqueue(b.subarray(de, ate));
            pos = Number(r.pos) + CH;
          }
        },
      });
    },

    async apagar(usuario, pasta, nome) {
      const a = await db.prepare("SELECT envio FROM drive_arquivos WHERE usuario = ? AND pasta = ? AND nome = ?").bind(usuario, pasta, nome).first();
      if (!a) return;
      await db.prepare("DELETE FROM drive_pedacos WHERE envio = ?").bind(a.envio).run();
      await db.prepare("DELETE FROM drive_arquivos WHERE usuario = ? AND pasta = ? AND nome = ?").bind(usuario, pasta, nome).run();
    },

    /** Envios largados há mais de um dia. */
    async limpar() {
      const velhos = await db.prepare("SELECT envio FROM drive_envios WHERE criado < ?").bind(Date.now() - 86400000).all();
      for (const v of velhos.results) {
        await db.prepare("DELETE FROM drive_pedacos WHERE envio = ?").bind(v.envio).run();
        await db.prepare("DELETE FROM drive_envios WHERE envio = ?").bind(v.envio).run();
      }
    },
  };
}
