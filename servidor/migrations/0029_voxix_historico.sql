-- Voxix: o histórico das conversas diretas fica no servidor (para aparecer igual no celular, no computador, no navegador e no iPhone).
-- Cada mensagem é uma linha. "entregue = 0" é a mensagem de quem foi bloqueado: aparece só para quem escreveu.
CREATE TABLE IF NOT EXISTS voxix_mensagens (
  id TEXT PRIMARY KEY,
  de TEXT NOT NULL,
  para TEXT NOT NULL,
  corpo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'texto',
  criado INTEGER NOT NULL,
  entregue INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS voxix_mensagens_de ON voxix_mensagens (de, criado);
CREATE INDEX IF NOT EXISTS voxix_mensagens_para ON voxix_mensagens (para, criado);
-- "Apagar conversa" some só para quem apagou: guarda até quando a pessoa limpou aquela conversa.
CREATE TABLE IF NOT EXISTS voxix_limpezas (
  usuario TEXT NOT NULL,
  outro TEXT NOT NULL,
  ate INTEGER NOT NULL,
  PRIMARY KEY (usuario, outro)
);
