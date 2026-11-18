-- Lista de espera do Voxix (página pública do site). Guarda só o e-mail e o dia em que entrou.
CREATE TABLE IF NOT EXISTS voxix_espera (
  email TEXT PRIMARY KEY,
  criado INTEGER NOT NULL
);
-- Contador por dia, para travar abuso (robôs enchendo a lista).
CREATE TABLE IF NOT EXISTS voxix_espera_dia (
  dia TEXT PRIMARY KEY,
  n INTEGER NOT NULL
);
