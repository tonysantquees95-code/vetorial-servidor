-- Itens que o app da Vênus envia do catálogo da própria loja (site conectado ou catálogo interno) para a vitrine pública.
-- Ficam separados dos produtos dos canais (Nuvemshop, Mercado Livre…); se o mesmo sku existir nos dois, vale o do canal.
CREATE TABLE IF NOT EXISTS vitrine_itens (
  loja TEXT NOT NULL,
  sku TEXT NOT NULL,
  nome TEXT NOT NULL,
  preco_centavos INTEGER,
  promocao_centavos INTEGER,
  estoque INTEGER NOT NULL DEFAULT 1,
  categoria TEXT NOT NULL DEFAULT '',
  imagem TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  atualizado INTEGER NOT NULL,
  PRIMARY KEY (loja, sku)
);
