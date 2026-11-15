-- Fotos reduzidas (JPEG em base64) dos produtos do catálogo interno da Vênus: o celular guarda a foto em arquivo local,
-- então a vitrine pública precisa de uma cópia aqui para mostrar a imagem.
CREATE TABLE IF NOT EXISTS vitrine_fotos (
  loja TEXT NOT NULL,
  sku TEXT NOT NULL,
  dados TEXT NOT NULL,
  atualizado INTEGER NOT NULL,
  PRIMARY KEY (loja, sku)
);
