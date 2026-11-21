-- Feedback, relatos de erro e pesquisa rápida enviados de dentro dos apps (anônimos; contato é opcional).
CREATE TABLE IF NOT EXISTS feedbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  criado INTEGER NOT NULL,
  app TEXT NOT NULL,
  versao TEXT NOT NULL DEFAULT '',
  plataforma TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL,              -- problema | ideia | elogio | pesquisa
  texto TEXT NOT NULL DEFAULT '',
  nota INTEGER,                    -- 1 a 5 (pesquisa)
  respostas TEXT NOT NULL DEFAULT '{}',
  contato TEXT NOT NULL DEFAULT '',
  aparelho TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'novo',   -- novo | visto | resolvido
  resposta_dev TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_feedbacks_criado ON feedbacks (criado DESC);
CREATE INDEX IF NOT EXISTS ix_feedbacks_status ON feedbacks (status, criado DESC);
