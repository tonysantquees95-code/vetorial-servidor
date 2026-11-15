-- Vetorial Drive guardado no próprio D1 (usado enquanto o R2 não está ligado). Cada arquivo vira pedaços de 256 KB em base64.
CREATE TABLE IF NOT EXISTS drive_arquivos (
  usuario TEXT NOT NULL,
  pasta TEXT NOT NULL,
  nome TEXT NOT NULL,
  envio TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  atualizado INTEGER NOT NULL,
  PRIMARY KEY (usuario, pasta, nome)
);
CREATE TABLE IF NOT EXISTS drive_envios (
  envio TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  pasta TEXT NOT NULL,
  nome TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  criado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS drive_pedacos (
  envio TEXT NOT NULL,
  pos INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  dados TEXT NOT NULL,
  PRIMARY KEY (envio, pos)
);
