-- Ponte Vênus ↔ Vindex: comandos pedidos pela Vênus (voz) e executados pelo Vindex no aparelho do usuário.
CREATE TABLE IF NOT EXISTS vindex_comandos (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  comando TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | recebido | concluido | falhou | expirado
  resumo TEXT,
  dados TEXT,
  criado INTEGER NOT NULL,
  atualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vindex_comandos_usuario ON vindex_comandos (usuario, status, criado);
CREATE TABLE IF NOT EXISTS vindex_presenca (
  usuario TEXT PRIMARY KEY,
  plataforma TEXT NOT NULL,
  ultimo INTEGER NOT NULL
);
