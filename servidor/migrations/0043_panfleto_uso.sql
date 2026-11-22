-- Panfleto grátis do site: quantos panfletos cada conta gerou por dia (o desenho fica no navegador, aqui só a contagem).
CREATE TABLE IF NOT EXISTS panfleto_uso (
  usuario TEXT NOT NULL,
  dia TEXT NOT NULL,            -- AAAA-MM-DD no fuso de Brasília
  usos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario, dia)
);
