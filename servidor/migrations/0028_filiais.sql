-- Até 3 lojas por conta: as lojas extras (filiais) apontam para a loja principal, que guarda a assinatura.
ALTER TABLE lojas ADD COLUMN matriz TEXT;
CREATE INDEX IF NOT EXISTS lojas_matriz ON lojas (matriz);
