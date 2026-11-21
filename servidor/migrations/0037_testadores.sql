-- Testadores: contas que usam os produtos da Vetorial de graça, por tempo indeterminado, só para testar.
CREATE TABLE IF NOT EXISTS testadores (
  email TEXT PRIMARY KEY,
  nota TEXT NOT NULL DEFAULT '',
  criado INTEGER NOT NULL
);
INSERT OR IGNORE INTO testadores (email, nota, criado) VALUES ('guilherme.gewehr@hotmail.com', 'Testador liberado pelo Toni em 2026-11-21', 1795270000000);
