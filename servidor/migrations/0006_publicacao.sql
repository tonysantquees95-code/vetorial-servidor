-- Publicação automática da Central de Marketing: destino (Instagram/webhook), tentativas e registro.
ALTER TABLE fila_posts ADD COLUMN canal TEXT NOT NULL DEFAULT 'instagram';
ALTER TABLE fila_posts ADD COLUMN erro TEXT NOT NULL DEFAULT '';
ALTER TABLE fila_posts ADD COLUMN tentativas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fila_posts ADD COLUMN publicado_em INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fila_posts ADD COLUMN imagem TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS publicacao_destinos (
  loja TEXT NOT NULL,
  tipo TEXT NOT NULL,               -- instagram | webhook
  dados TEXT NOT NULL,              -- JSON cifrado (token, ids, url, segredo)
  criado INTEGER NOT NULL,
  PRIMARY KEY (loja, tipo)
);
CREATE TABLE IF NOT EXISTS post_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post INTEGER NOT NULL,
  loja TEXT NOT NULL,
  quando INTEGER NOT NULL,
  status TEXT NOT NULL,             -- publicado | erro | tentando_de_novo
  detalhe TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS post_log_loja ON post_log (loja, quando);
