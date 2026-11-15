-- Cofre pessoal (Vindex): cada conta Vetorial ID guarda UM pacote já cifrado no aparelho (AES-GCM).
-- O servidor nunca vê a senha do cofre nem o conteúdo: só guarda o pacote, a versão e a cópia anterior.
CREATE TABLE IF NOT EXISTS cofre_pessoal (
  usuario TEXT PRIMARY KEY,
  pacote TEXT NOT NULL,
  anterior TEXT,
  versao INTEGER NOT NULL DEFAULT 1,
  criado INTEGER NOT NULL,
  atualizado INTEGER NOT NULL,
  dispositivo TEXT NOT NULL DEFAULT ''
);
