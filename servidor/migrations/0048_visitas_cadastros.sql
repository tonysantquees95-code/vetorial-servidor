-- Visitas ao site e downloads dos apps (sem guardar IP: o "visitante" é um código que muda todo dia) para o Painel Dev.
CREATE TABLE IF NOT EXISTS site_visitas (
  dia TEXT NOT NULL,            -- AAAA-MM-DD, fuso de Brasília
  pagina TEXT NOT NULL,
  visitante TEXT NOT NULL,      -- hash de IP+navegador+dia (não dá para ligar um dia ao outro)
  PRIMARY KEY (dia, pagina, visitante)
);
CREATE TABLE IF NOT EXISTS downloads_apps (
  dia TEXT NOT NULL,
  app TEXT NOT NULL,            -- vortex-android, vindex-windows...
  visitante TEXT NOT NULL,
  criado INTEGER NOT NULL,
  PRIMARY KEY (dia, app, visitante)
);
CREATE INDEX IF NOT EXISTS idx_downloads_apps_criado ON downloads_apps (criado);
