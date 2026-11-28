-- Vexperyon: resultados das rodadas de teste (privados, só o administrador lê).
CREATE TABLE IF NOT EXISTS vexperyon_rodadas (
  id INTEGER PRIMARY KEY,          -- número da execução no GitHub
  app TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'enviando',
  criado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vexperyon_arquivos (
  rodada INTEGER NOT NULL,
  nome TEXT NOT NULL,
  dados BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  PRIMARY KEY (rodada, nome)
);
