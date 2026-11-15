-- Voxix (chat para gamers): só contas/apelidos, bloqueios, denúncias e um contador de uso. As mensagens NÃO ficam aqui:
-- esperam entrega na caixa de cada pessoa (Durable Object) e o histórico fica no aparelho.
CREATE TABLE IF NOT EXISTS voxix_perfis (
  usuario TEXT PRIMARY KEY,
  apelido TEXT NOT NULL COLLATE NOCASE UNIQUE,
  nome TEXT NOT NULL,
  criado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS voxix_bloqueios (
  usuario TEXT NOT NULL,
  bloqueado TEXT NOT NULL,
  criado INTEGER NOT NULL,
  PRIMARY KEY (usuario, bloqueado)
);
CREATE TABLE IF NOT EXISTS voxix_denuncias (
  id TEXT PRIMARY KEY,
  de TEXT NOT NULL,
  alvo TEXT NOT NULL,
  motivo TEXT NOT NULL,
  trecho TEXT,
  criado INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta'
);
CREATE INDEX IF NOT EXISTS voxix_denuncias_status ON voxix_denuncias (status, criado);
CREATE TABLE IF NOT EXISTS voxix_uso (
  usuario TEXT NOT NULL,
  dia TEXT NOT NULL,
  tipo TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario, dia, tipo)
);
