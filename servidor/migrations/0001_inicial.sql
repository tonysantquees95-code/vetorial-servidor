-- Canal de avisos: o site (ou outro serviço) avisa, a Vênus app lê, sem gastar a hospedagem da loja.
CREATE TABLE IF NOT EXISTS avisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canal TEXT NOT NULL,
  texto TEXT NOT NULL,
  criado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS avisos_canal ON avisos (canal, id);

-- Avisos de pagamento da InfinitePay (cobrança por link dos lojistas).
CREATE TABLE IF NOT EXISTS cobranca_avisos (
  order_nsu TEXT PRIMARY KEY,
  slug TEXT,
  transaction_nsu TEXT,
  corpo TEXT NOT NULL DEFAULT '{}',
  criado INTEGER NOT NULL
);
