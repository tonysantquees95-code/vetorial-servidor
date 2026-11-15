-- Vetorial ID: os limites (3 aparelhos vinculados, 2 em uso ao mesmo tempo) passam a valer por aplicativo.
-- O que já existe fica no app "venus". O Velox (gratuito e público) não entra nessa conta.
ALTER TABLE dispositivos ADD COLUMN app TEXT NOT NULL DEFAULT 'venus';
ALTER TABLE sessoes ADD COLUMN app TEXT NOT NULL DEFAULT 'venus';
CREATE INDEX IF NOT EXISTS dispositivos_usuario_app ON dispositivos (usuario, app);
CREATE INDEX IF NOT EXISTS sessoes_usuario_app ON sessoes (usuario, app, encerrada, ultimo_ping);
