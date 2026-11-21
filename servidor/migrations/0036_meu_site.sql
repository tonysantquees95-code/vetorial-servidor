-- Meu site: as escolhas de cada loja (tema, textos, seções, logo) e as fotos da galeria.
CREATE TABLE IF NOT EXISTS site_config (
  loja TEXT PRIMARY KEY,
  dados TEXT NOT NULL,
  atualizado INTEGER NOT NULL
);
-- Até 9 fotos por loja (JPEG reduzido, em base64), separadas das fotos de produtos da vitrine.
CREATE TABLE IF NOT EXISTS site_fotos (
  loja TEXT NOT NULL,
  n INTEGER NOT NULL,
  dados TEXT NOT NULL,
  atualizado INTEGER NOT NULL,
  PRIMARY KEY (loja, n)
);
