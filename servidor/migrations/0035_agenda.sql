-- Agenda de serviços (salão, barbearia, manicure…): serviços, equipe, horários de atendimento e marcações.
-- Horários são sempre "minutos desde a meia-noite" (09:30 = 570) e datas "AAAA-MM-DD", no horário de Brasília.

CREATE TABLE IF NOT EXISTS agenda_config (
  loja TEXT PRIMARY KEY,
  ativa INTEGER NOT NULL DEFAULT 1,
  antecedencia_min INTEGER NOT NULL DEFAULT 60,   -- o cliente marca com pelo menos isto de antecedência
  janela_dias INTEGER NOT NULL DEFAULT 30,        -- até quantos dias à frente aceita marcação
  passo_min INTEGER NOT NULL DEFAULT 30,          -- de quanto em quanto tempo oferece horários
  intervalo_min INTEGER NOT NULL DEFAULT 0,       -- folga entre um atendimento e outro
  cancelamento_horas INTEGER NOT NULL DEFAULT 2,  -- o cliente cancela sozinho até X horas antes
  aviso TEXT NOT NULL DEFAULT '',                 -- recado mostrado na confirmação (ex.: tolerância de atraso)
  token_geral TEXT NOT NULL,                      -- link da recepção (vê toda a equipe)
  criado INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agenda_servicos (
  id TEXT PRIMARY KEY,
  loja TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  duracao_min INTEGER NOT NULL,
  preco_centavos INTEGER,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agenda_servicos_loja ON agenda_servicos (loja, ordem);

CREATE TABLE IF NOT EXISTS agenda_profissionais (
  id TEXT PRIMARY KEY,
  loja TEXT NOT NULL,
  nome TEXT NOT NULL,
  funcao TEXT NOT NULL DEFAULT '',
  cor TEXT NOT NULL DEFAULT '#E36BD0',
  token TEXT NOT NULL UNIQUE,                     -- link secreto da agenda deste profissional
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agenda_prof_loja ON agenda_profissionais (loja, ordem);

-- Quais serviços cada profissional faz (sem linha nenhuma = faz todos).
CREATE TABLE IF NOT EXISTS agenda_prof_servicos (
  profissional TEXT NOT NULL,
  servico TEXT NOT NULL,
  PRIMARY KEY (profissional, servico)
);

-- Horário de atendimento da semana (dia 0 = domingo … 6 = sábado); vários trechos no mesmo dia = pausa para o almoço.
CREATE TABLE IF NOT EXISTS agenda_horarios (
  profissional TEXT NOT NULL,
  dia INTEGER NOT NULL,
  ini INTEGER NOT NULL,
  fim INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agenda_horarios_prof ON agenda_horarios (profissional, dia);

-- Folgas, feriados e compromissos (profissional vazio = todos).
CREATE TABLE IF NOT EXISTS agenda_bloqueios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loja TEXT NOT NULL,
  profissional TEXT,
  data TEXT NOT NULL,
  ini INTEGER NOT NULL DEFAULT 0,
  fim INTEGER NOT NULL DEFAULT 1440,
  motivo TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS agenda_bloqueios_dia ON agenda_bloqueios (loja, data);

CREATE TABLE IF NOT EXISTS agenda_reservas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loja TEXT NOT NULL,
  profissional TEXT NOT NULL,
  servico TEXT NOT NULL,
  servico_nome TEXT NOT NULL,
  duracao_min INTEGER NOT NULL,
  preco_centavos INTEGER,
  data TEXT NOT NULL,
  ini INTEGER NOT NULL,
  fim INTEGER NOT NULL,
  cliente TEXT NOT NULL,
  telefone TEXT NOT NULL DEFAULT '',
  obs TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'marcado',         -- marcado | concluido | faltou | cancelado
  origem TEXT NOT NULL DEFAULT 'online',          -- online | balcao
  codigo TEXT NOT NULL UNIQUE,                    -- link do cliente (ver, cancelar, calendário)
  criado INTEGER NOT NULL,
  atualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agenda_reservas_dia ON agenda_reservas (loja, data, profissional);
CREATE INDEX IF NOT EXISTS agenda_reservas_prof ON agenda_reservas (profissional, data);
CREATE INDEX IF NOT EXISTS agenda_reservas_tel ON agenda_reservas (loja, telefone, data);
