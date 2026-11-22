-- Vindex PDF na web: quantos downloads cada conta fez por dia (o arquivo nunca vem para cá, só a contagem).
CREATE TABLE IF NOT EXISTS pdf_uso (
  usuario TEXT NOT NULL,
  dia TEXT NOT NULL,            -- AAAA-MM-DD no fuso de Brasília
  usos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario, dia)
);
