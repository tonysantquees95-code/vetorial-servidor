-- Cofre de chaves de API (Painel Dev): as chaves ficam cifradas (AES-GCM) e só se destrancam com a senha do cofre.
CREATE TABLE IF NOT EXISTS cofre_chaves (
  nome TEXT PRIMARY KEY,            -- ex.: GROQ_API_KEY
  valor TEXT NOT NULL,              -- cifrado; nunca volta para a tela
  rotulo TEXT NOT NULL DEFAULT '',
  previa TEXT NOT NULL DEFAULT '',  -- só os 4 últimos caracteres, para reconhecer qual é
  atualizado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cofre_acesso (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sal TEXT NOT NULL,
  hash TEXT NOT NULL,               -- PBKDF2 da senha do cofre (a senha em si não é guardada)
  falhas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate INTEGER NOT NULL DEFAULT 0,
  criado INTEGER NOT NULL,
  trocado INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cofre_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando INTEGER NOT NULL,
  acao TEXT NOT NULL,               -- iniciar | listar | guardar | apagar | trocar_senha | senha_errada
  nome TEXT NOT NULL DEFAULT '',
  ok INTEGER NOT NULL DEFAULT 1     -- nunca guarda valores de chave
);
-- Códigos de importação: o Painel gera um código de uso único (vale 15 min) que o workflow do GitHub usa para mandar os segredos do repositório para o cofre.
CREATE TABLE IF NOT EXISTS cofre_codigos (
  hash TEXT PRIMARY KEY,
  expira INTEGER NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0
);
