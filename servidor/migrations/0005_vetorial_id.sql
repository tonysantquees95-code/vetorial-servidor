-- Vetorial ID: conta única, dispositivos (até 3), sessões (até 2 ativas ao mesmo tempo) e sincronização.
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL DEFAULT '',
  senha_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  loja TEXT,                          -- lojas.id (licença/Plano Fundadores)
  criado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dispositivos (
  id TEXT PRIMARY KEY,                -- hash do identificador do aparelho
  usuario TEXT NOT NULL,
  nome TEXT NOT NULL DEFAULT '',
  plataforma TEXT NOT NULL DEFAULT '',  -- android | ios | windows | web
  criado INTEGER NOT NULL,
  ultimo INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dispositivos_usuario ON dispositivos (usuario);
CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  dispositivo TEXT NOT NULL,
  criado INTEGER NOT NULL,
  ultimo_ping INTEGER NOT NULL,
  encerrada INTEGER NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessoes_usuario ON sessoes (usuario, encerrada, ultimo_ping);
CREATE TABLE IF NOT EXISTS id_tentativas (
  chave TEXT NOT NULL,
  quando INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS id_tentativas_chave ON id_tentativas (chave, quando);
CREATE TABLE IF NOT EXISTS sync_docs (
  usuario TEXT NOT NULL,
  chave TEXT NOT NULL,
  valor TEXT NOT NULL,
  versao INTEGER NOT NULL,
  atualizado INTEGER NOT NULL,
  dispositivo TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario, chave)
);
