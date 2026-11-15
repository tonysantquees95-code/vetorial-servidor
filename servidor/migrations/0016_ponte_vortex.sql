-- Ponte Vênus ↔ Vortex: pedidos de voz ("abra o jogo X", "otimize o Vortex") executados pelo Vortex aberto no aparelho.
CREATE TABLE IF NOT EXISTS vortex_comandos (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  comando TEXT NOT NULL,
  argumento TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | recebido | concluido | falhou | expirado
  resumo TEXT,
  criado INTEGER NOT NULL,
  atualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vortex_comandos_usuario ON vortex_comandos (usuario, status, criado);
CREATE TABLE IF NOT EXISTS vortex_presenca (
  usuario TEXT PRIMARY KEY,
  plataforma TEXT NOT NULL,
  ultimo INTEGER NOT NULL
);
