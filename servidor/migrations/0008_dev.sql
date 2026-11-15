-- Painel Dev (superadmin): tráfego do Worker, uso das IAs, fases dos projetos, configurações e telemetria do Vindex.
CREATE TABLE IF NOT EXISTS dev_trafego (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando INTEGER NOT NULL,
  metodo TEXT NOT NULL,
  rota TEXT NOT NULL,               -- caminho sem ids (ex.: /loja/produtos/:id)
  status INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  origem TEXT NOT NULL DEFAULT ''   -- app que chamou (cabeçalho Origin, sem dados pessoais)
);
CREATE INDEX IF NOT EXISTS dev_trafego_quando ON dev_trafego (quando);
CREATE TABLE IF NOT EXISTS dev_uso_ia (
  hora INTEGER NOT NULL,            -- hora UTC desde 1970 (agora / 3600000)
  provedor TEXT NOT NULL,           -- groq | deepseek | gemini
  tarefa TEXT NOT NULL,
  requisicoes INTEGER NOT NULL DEFAULT 0,
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_saida INTEGER NOT NULL DEFAULT 0,
  erros INTEGER NOT NULL DEFAULT 0,
  cache INTEGER NOT NULL DEFAULT 0, -- respostas servidas pelo cache (sem gastar IA)
  PRIMARY KEY (hora, provedor, tarefa)
);
CREATE TABLE IF NOT EXISTS dev_fases (
  id TEXT PRIMARY KEY,
  projeto TEXT NOT NULL,            -- venus | vindex | vortex
  titulo TEXT NOT NULL,
  progresso INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planejada', -- planejada | em_andamento | concluida | bloqueada
  ordem INTEGER NOT NULL DEFAULT 0,
  atualizado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS dev_fases_projeto ON dev_fases (projeto, ordem);
CREATE TABLE IF NOT EXISTS dev_config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dev_telemetria (
  origem TEXT PRIMARY KEY,          -- vindex | dev
  dados TEXT NOT NULL,
  atualizado INTEGER NOT NULL
);
-- Fases da Vênus (o que já foi entregue). Vindex e Vortex começam sem fases: cadastre no painel.
INSERT OR IGNORE INTO dev_fases (id, projeto, titulo, progresso, status, ordem, atualizado) VALUES
 ('venus-1', 'venus', 'Assistente Android, voz e comandos locais', 100, 'concluida', 1, 0),
 ('venus-2', 'venus', 'Multicanal, estoque e reverse-sync (passos 6–7)', 100, 'concluida', 2, 0),
 ('venus-3', 'venus', 'Vitrine, marketing, logotipo, cartões e QR (passos 8–11)', 100, 'concluida', 3, 0),
 ('venus-4', 'venus', 'Auditoria profunda e BI (passo 12)', 100, 'concluida', 4, 0),
 ('venus-5', 'venus', 'Plano Fundadores e gateways de pagamento (passo 13)', 100, 'concluida', 5, 0),
 ('venus-6', 'venus', 'Mídia, voz e onboarding (passos 14–15)', 100, 'concluida', 6, 0),
 ('venus-7', 'venus', 'Desktop, Vetorial ID, modos, iOS, sincronização e fila de posts (passos 16–23)', 100, 'concluida', 7, 0),
 ('venus-8', 'venus', 'Login unificado, conta pela conversa e avatar (passos 24–25)', 100, 'concluida', 8, 0),
 ('venus-9', 'venus', 'Painel Dev e APK de Desenvolvedor (passo 26)', 90, 'em_andamento', 9, 0);
