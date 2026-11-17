-- Painel Dev: bloquear um perfil (não entra e as sessões são encerradas).
ALTER TABLE usuarios ADD COLUMN bloqueado INTEGER NOT NULL DEFAULT 0;
