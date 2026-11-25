-- Cardápio → loja: quantas leituras de cardápio por IA cada conta fez por dia (só a contagem; o arquivo nunca é guardado).
CREATE TABLE IF NOT EXISTS cardapio_uso (
  usuario TEXT NOT NULL,
  dia TEXT NOT NULL,            -- AAAA-MM-DD no fuso de Brasília
  usos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario, dia)
);
