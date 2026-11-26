-- Voxix dentro do Vortex: troca de @, "jogando agora", jogos mais jogados e conquistas no perfil.
-- apelido_trocado = quando a pessoa trocou o @ pela última vez (null = nunca trocou). presenca = quem vê "jogando agora":
-- 'amigos' (padrão: quem já conversou comigo ou divide comunidade), 'todos' ou 'invisivel'.
ALTER TABLE voxix_perfis ADD COLUMN apelido_trocado INTEGER;
ALTER TABLE voxix_perfis ADD COLUMN presenca TEXT NOT NULL DEFAULT 'amigos';

-- @ que a pessoa largou fica reservado: só ela pode voltar a usar, até "ate" (ms).
CREATE TABLE IF NOT EXISTS voxix_apelidos_reservados (
  apelido TEXT PRIMARY KEY COLLATE NOCASE,
  usuario TEXT NOT NULL,
  ate INTEGER NOT NULL
);

-- O que a pessoa está jogando agora (o app avisa a cada ~60 s; sem aviso por 3 min = parou).
CREATE TABLE IF NOT EXISTS voxix_jogando (
  usuario TEXT PRIMARY KEY,
  jogo TEXT NOT NULL,
  plataforma TEXT NOT NULL,
  desde INTEGER NOT NULL,
  visto INTEGER NOT NULL
);

-- Tempo jogado por jogo (segundos), para mostrar os mais jogados no perfil.
CREATE TABLE IF NOT EXISTS voxix_jogos (
  usuario TEXT NOT NULL,
  jogo TEXT NOT NULL COLLATE NOCASE,
  segundos INTEGER NOT NULL DEFAULT 0,
  ultimo INTEGER NOT NULL,
  PRIMARY KEY (usuario, jogo)
);

-- Conquistas mostradas no perfil (a lista pronta, já limpa pelo servidor; só para exibir).
CREATE TABLE IF NOT EXISTS voxix_conquistas (
  usuario TEXT PRIMARY KEY,
  itens TEXT NOT NULL,
  atualizado INTEGER NOT NULL
);
