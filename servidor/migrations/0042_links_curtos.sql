-- Ferramentas grátis do site: link curto. Só guarda o destino, o dono (Vetorial ID) e a contagem de cliques.
CREATE TABLE IF NOT EXISTS links_curtos (
  codigo TEXT PRIMARY KEY,         -- 6 letras/números, minúsculos
  usuario TEXT NOT NULL,
  destino TEXT NOT NULL,
  criado INTEGER NOT NULL,
  cliques INTEGER NOT NULL DEFAULT 0,
  ultimo_clique INTEGER,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_links_curtos_usuario ON links_curtos (usuario, criado);
