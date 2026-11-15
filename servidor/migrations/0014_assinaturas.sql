-- Chave de assinatura dos APKs de cada repositório (Painel Dev, Vindex, Vortex): criada na primeira compilação e reaproveitada
-- nas seguintes, para cada versão instalar por cima da anterior. Cifrada com CHAVE_COFRE; só o próprio repositório (via OIDC do GitHub) lê.
CREATE TABLE IF NOT EXISTS assinaturas (
  repo TEXT PRIMARY KEY,
  dados TEXT NOT NULL,
  criado INTEGER NOT NULL
);
