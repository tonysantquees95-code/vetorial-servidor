-- Cortesia: a Vênus de graça por prazo certo (ex.: 60 dias incluídos na montagem vendida ao lojista). Só o administrador dá.
CREATE TABLE IF NOT EXISTS cortesias (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  loja TEXT NOT NULL,
  inicio INTEGER NOT NULL,
  fim INTEGER NOT NULL,
  plano_antes TEXT NOT NULL DEFAULT '',
  pacote_antes TEXT NOT NULL DEFAULT '',
  dado_por TEXT NOT NULL,
  revogada INTEGER NOT NULL DEFAULT 0
);
-- uma cortesia por conta (a retirada, por engano, não conta)
CREATE UNIQUE INDEX IF NOT EXISTS cortesias_uma_por_conta ON cortesias (usuario) WHERE revogada = 0;
