-- Trava de segurança: telefone da conta (uma conta por celular recebe o teste grátis) e códigos de recuperação de senha.
ALTER TABLE usuarios ADD COLUMN telefone TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS usuarios_telefone ON usuarios (telefone);
CREATE TABLE IF NOT EXISTS id_recuperacao (
  usuario TEXT PRIMARY KEY,
  codigo_hash TEXT NOT NULL,
  canal TEXT NOT NULL,
  expira INTEGER NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  criado INTEGER NOT NULL
);
