-- Fila de postagens sugeridas (Central de Marketing), assinatura (Plano Fundadores) e verificação em duas etapas.
CREATE TABLE IF NOT EXISTS fila_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loja TEXT NOT NULL,
  produto INTEGER,
  legenda TEXT NOT NULL DEFAULT '',
  copy TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'sugerido',
  agendado_para INTEGER,
  origem TEXT NOT NULL DEFAULT 'ia',
  criado INTEGER NOT NULL,
  atualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fila_loja ON fila_posts (loja, status);

ALTER TABLE lojas ADD COLUMN dispositivo TEXT NOT NULL DEFAULT '';
ALTER TABLE lojas ADD COLUMN totp_segredo TEXT NOT NULL DEFAULT '';
ALTER TABLE lojas ADD COLUMN totp_ativo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lojas ADD COLUMN totp_ultimo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lojas ADD COLUMN pago_pendente_ate INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS lojas_dispositivo ON lojas (dispositivo);

CREATE TABLE IF NOT EXISTS pagamentos (
  id TEXT PRIMARY KEY,              -- referência nossa (order_nsu / external_reference)
  loja TEXT NOT NULL,
  gateway TEXT NOT NULL,            -- infinitepay | mercadopago
  valor_centavos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando', -- aguardando | pago | liberado
  ref_gateway TEXT NOT NULL DEFAULT '',
  criado INTEGER NOT NULL,
  atualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pagamentos_loja ON pagamentos (loja);
CREATE TABLE IF NOT EXISTS avisos_gateway (
  chave TEXT PRIMARY KEY,           -- idempotência dos webhooks
  criado INTEGER NOT NULL
);
