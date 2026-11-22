-- Logo grátis do site: quantos logos cada conta criou por dia (o logo é desenhado na hora; aqui só a contagem).
CREATE TABLE IF NOT EXISTS logo_uso (
  usuario TEXT NOT NULL,
  dia TEXT NOT NULL,            -- AAAA-MM-DD no fuso de Brasília
  usos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario, dia)
);
