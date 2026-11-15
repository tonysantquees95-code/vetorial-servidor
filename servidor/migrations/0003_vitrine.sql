-- Vitrine web instantânea (one-page store) e encurtador de links da Vetorial Tech.
ALTER TABLE lojas ADD COLUMN titulo TEXT NOT NULL DEFAULT '';
ALTER TABLE lojas ADD COLUMN descricao TEXT NOT NULL DEFAULT '';
ALTER TABLE lojas ADD COLUMN cor TEXT NOT NULL DEFAULT '#E36BD0';
ALTER TABLE lojas ADD COLUMN logo TEXT NOT NULL DEFAULT '';
ALTER TABLE lojas ADD COLUMN whatsapp TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS links (
  codigo TEXT PRIMARY KEY,
  loja TEXT NOT NULL,
  destino TEXT NOT NULL,
  rotulo TEXT NOT NULL DEFAULT '',
  criado INTEGER NOT NULL,
  cliques INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS links_loja ON links (loja);
