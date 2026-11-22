-- Site grátis da Vênus Vitrine: uma página pública /w/<nome> por conta do Vetorial ID (separada do "Meu site" das lojas da Vênus).
CREATE TABLE IF NOT EXISTS sites_vitrine (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  whats TEXT NOT NULL,
  dados TEXT NOT NULL DEFAULT '{}',
  sem_marca INTEGER NOT NULL DEFAULT 0,
  visitas INTEGER NOT NULL DEFAULT 0,
  criado INTEGER NOT NULL,
  atualizado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sites_vitrine_fotos (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL,
  dados TEXT NOT NULL,
  criado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sites_vitrine_fotos ON sites_vitrine_fotos (site);
