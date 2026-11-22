-- Catálogo digital da Vênus Vitrine: uma página pública /c/<nome> com produtos e pedido pelo WhatsApp.
-- Um catálogo por conta. As fotos já chegam reduzidas (JPEG) e ficam aqui mesmo, em base64.
CREATE TABLE IF NOT EXISTS catalogos (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  whats TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  cor TEXT NOT NULL,
  tema TEXT NOT NULL,
  produtos TEXT NOT NULL,           -- JSON: [{nome, preco (centavos), desc, foto (id)}]
  sem_marca INTEGER NOT NULL DEFAULT 0,
  visitas INTEGER NOT NULL DEFAULT 0,
  criado INTEGER NOT NULL,
  atualizado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS catalogo_fotos (
  id TEXT PRIMARY KEY,
  catalogo TEXT NOT NULL,
  dados TEXT NOT NULL,              -- JPEG em base64
  criado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS catalogo_fotos_catalogo ON catalogo_fotos (catalogo);
