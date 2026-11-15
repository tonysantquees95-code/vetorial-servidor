-- Steam no Vortex: a conta Steam ligada ao Vetorial ID (só o número público da conta) e o "nonce" do login em andamento.
CREATE TABLE IF NOT EXISTS vortex_steam (
  usuario TEXT PRIMARY KEY,
  steamid TEXT NOT NULL,
  atualizado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vortex_steam_login (
  nonce TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  expira INTEGER NOT NULL
);
