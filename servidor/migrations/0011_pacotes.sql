-- Pacotes da suíte Vetorial: Vênus sozinha, Vênus + Vindex, Vênus + Vortex ou o combo completo.
ALTER TABLE lojas ADD COLUMN pacote TEXT NOT NULL DEFAULT 'venus';
ALTER TABLE pagamentos ADD COLUMN pacote TEXT NOT NULL DEFAULT 'venus';
