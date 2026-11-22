-- Avisos do Painel Dev: build quebrado, relato de erro novo e erro em alta.
CREATE TABLE IF NOT EXISTS dev_alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  criado INTEGER NOT NULL,
  tipo TEXT NOT NULL,            -- build | relato | alta
  app TEXT NOT NULL,
  grupo TEXT NOT NULL DEFAULT '', -- build: "<projeto>|<workflow>" (um build verde depois resolve o aviso)
  titulo TEXT NOT NULL,
  detalhe TEXT NOT NULL DEFAULT '',
  chave TEXT NOT NULL UNIQUE,    -- evita avisar duas vezes do mesmo fato
  status TEXT NOT NULL DEFAULT 'novo', -- novo | visto | resolvido
  resolvido_em INTEGER
);
CREATE INDEX IF NOT EXISTS idx_dev_alertas_status ON dev_alertas (status, criado);
