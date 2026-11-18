-- Código de uso único para abrir o chat ao vivo (WebSocket) sem pôr o token de login na URL.
-- Vale 60 segundos e é apagado ao ser usado.
CREATE TABLE IF NOT EXISTS voxix_ticket (
  ticket TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expira INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS voxix_ticket_expira ON voxix_ticket (expira);
