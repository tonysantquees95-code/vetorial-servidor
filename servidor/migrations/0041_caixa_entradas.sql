-- Vênus → Vyntem: cada venda paga e confirmada vira UMA entrada no caixa do Vyntem (e, se for cancelada ou devolvida, UM estorno).
-- A Vênus envia, o Vyntem busca por `seq` e lança no aparelho. Idempotente por (usuario, ref, tipo): reenviar não duplica.
CREATE TABLE IF NOT EXISTS caixa_entradas (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL,
  ref TEXT NOT NULL,              -- identificador estável do pedido na loja
  tipo TEXT NOT NULL,             -- entrada | estorno
  valor_centavos INTEGER NOT NULL,
  cliente TEXT NOT NULL DEFAULT '',
  pedido TEXT NOT NULL DEFAULT '',-- número do pedido, como a loja mostra
  quando INTEGER NOT NULL,        -- quando o pagamento foi confirmado (ou o estorno aconteceu), em ms
  criado INTEGER NOT NULL,
  UNIQUE (usuario, ref, tipo)
);
CREATE INDEX IF NOT EXISTS caixa_usuario_seq ON caixa_entradas (usuario, seq);
