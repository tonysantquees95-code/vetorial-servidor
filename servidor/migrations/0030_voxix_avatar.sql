-- Foto/avatar do perfil do Voxix: "p:<id>" (avatar pronto do app) ou "f:data:image/...;base64,..." (foto enviada, já reduzida pelo app).
ALTER TABLE voxix_perfis ADD COLUMN avatar TEXT;
