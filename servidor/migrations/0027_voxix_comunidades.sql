-- Voxix: comunidades (grupos) com salas de texto, públicas ou privadas, entrada por link ou código de convite.
-- As mensagens NÃO ficam aqui: moram na sala ao vivo (Durable Object), só as últimas e por pouco tempo.
CREATE TABLE IF NOT EXISTS voxix_comunidades (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  icone TEXT NOT NULL DEFAULT 'grupo',
  dono TEXT NOT NULL,
  publica INTEGER NOT NULL DEFAULT 0,
  codigo TEXT NOT NULL UNIQUE,
  membros INTEGER NOT NULL DEFAULT 1,
  criado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS voxix_comunidades_publicas ON voxix_comunidades (publica, membros);
CREATE TABLE IF NOT EXISTS voxix_salas (
  id TEXT PRIMARY KEY,
  comunidade TEXT NOT NULL,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS voxix_salas_comunidade ON voxix_salas (comunidade, ordem);
CREATE TABLE IF NOT EXISTS voxix_membros (
  comunidade TEXT NOT NULL,
  usuario TEXT NOT NULL,
  cargo TEXT NOT NULL DEFAULT 'membro',
  entrou INTEGER NOT NULL,
  PRIMARY KEY (comunidade, usuario)
);
CREATE INDEX IF NOT EXISTS voxix_membros_usuario ON voxix_membros (usuario, entrou);
CREATE TABLE IF NOT EXISTS voxix_expulsos (
  comunidade TEXT NOT NULL,
  usuario TEXT NOT NULL,
  criado INTEGER NOT NULL,
  PRIMARY KEY (comunidade, usuario)
);
