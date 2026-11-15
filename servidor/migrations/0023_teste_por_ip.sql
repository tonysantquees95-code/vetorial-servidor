-- Teste grátis só para quem se inscreve na janela promocional e uma vez por aparelho, celular e rede (IP).
-- Só o hash do IP fica guardado (suficiente para reconhecer a mesma rede).
ALTER TABLE lojas ADD COLUMN ip_hash TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS lojas_ip ON lojas (ip_hash);
