-- Lojistas (cada celular com a Vênus é uma loja), canais de venda, catálogo central, pedidos e eventos de estoque.
CREATE TABLE IF NOT EXISTS lojas (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL DEFAULT '',
  slug TEXT UNIQUE,
  criado INTEGER NOT NULL,
  trial_fim INTEGER NOT NULL,
  plano TEXT NOT NULL DEFAULT 'trial',
  ativo_ate INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS canais (
  id TEXT PRIMARY KEY,
  loja TEXT NOT NULL,
  plataforma TEXT NOT NULL,
  conta TEXT NOT NULL DEFAULT '',
  nome TEXT NOT NULL DEFAULT '',
  credenciais TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  criado INTEGER NOT NULL,
  ultimo_sync INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok'
);
CREATE INDEX IF NOT EXISTS canais_loja ON canais (loja);

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loja TEXT NOT NULL,
  sku TEXT NOT NULL,
  nome TEXT NOT NULL,
  preco_centavos INTEGER,
  estoque INTEGER NOT NULL DEFAULT 0,
  oculto INTEGER NOT NULL DEFAULT 0,
  categoria TEXT NOT NULL DEFAULT '',
  atributos TEXT NOT NULL DEFAULT '{}',
  imagem TEXT NOT NULL DEFAULT '',
  promocao_centavos INTEGER,
  atualizado INTEGER NOT NULL,
  UNIQUE (loja, sku)
);

CREATE TABLE IF NOT EXISTS vinculos (
  canal TEXT NOT NULL,
  ref TEXT NOT NULL,
  variante TEXT NOT NULL DEFAULT '',
  produto INTEGER NOT NULL,
  PRIMARY KEY (canal, ref, variante)
);
CREATE INDEX IF NOT EXISTS vinculos_produto ON vinculos (produto);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loja TEXT NOT NULL,
  canal TEXT NOT NULL,
  ref TEXT NOT NULL,
  status TEXT NOT NULL,
  total_centavos INTEGER NOT NULL DEFAULT 0,
  taxa_centavos INTEGER NOT NULL DEFAULT 0,
  itens TEXT NOT NULL DEFAULT '[]',
  criado INTEGER NOT NULL,
  atualizado INTEGER NOT NULL,
  UNIQUE (canal, ref)
);
CREATE INDEX IF NOT EXISTS pedidos_loja ON pedidos (loja, criado);

-- Idempotência do estoque: cada baixa ou reposição acontece uma única vez por pedido.
CREATE TABLE IF NOT EXISTS eventos_estoque (
  chave TEXT PRIMARY KEY,
  loja TEXT NOT NULL,
  canal TEXT NOT NULL,
  tipo TEXT NOT NULL,
  produto INTEGER,
  quantidade INTEGER NOT NULL DEFAULT 0,
  criado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS eventos_loja ON eventos_estoque (loja, criado);
