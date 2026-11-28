-- Velocidade: índices para consultas que liam a tabela inteira (entrada, cadastro, Voxix, agenda e posts).
CREATE INDEX IF NOT EXISTS usuarios_loja ON usuarios (loja, criado);
CREATE INDEX IF NOT EXISTS usuarios_criado ON usuarios (criado);
CREATE INDEX IF NOT EXISTS sessoes_dispositivo ON sessoes (dispositivo, encerrada, ultimo_ping);
CREATE INDEX IF NOT EXISTS voxix_comunidades_dono ON voxix_comunidades (dono);
CREATE INDEX IF NOT EXISTS agenda_config_geral ON agenda_config (token_geral);
CREATE INDEX IF NOT EXISTS fila_agendados ON fila_posts (status, agendado_para);
