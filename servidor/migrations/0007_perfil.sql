-- Perfil do Vetorial ID (foto e nome editáveis) e versão para atualização em tempo real nos outros apps.
ALTER TABLE usuarios ADD COLUMN foto TEXT NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN atualizado INTEGER NOT NULL DEFAULT 0;
