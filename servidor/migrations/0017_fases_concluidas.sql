-- Fecha a etapa do Painel Dev da Vênus (entregue) e registra as entregas recentes do Vortex.
UPDATE dev_fases SET progresso = 100, status = 'concluida' WHERE id = 'venus-9';
INSERT OR IGNORE INTO dev_fases (id, projeto, titulo, progresso, status, ordem, atualizado) VALUES
 ('vortex-5', 'vortex', 'Controles para jogos de Android sem suporte a controle', 100, 'concluida', 5, 0),
 ('vortex-6', 'vortex', 'Conta Vetorial ID, saves na nuvem, ponte de voz, termos e atualização automática', 100, 'concluida', 6, 0);
