-- Recuperação de senha sem e-mail: senha de 6 números e pergunta secreta (só os hashes ficam guardados).
ALTER TABLE usuarios ADD COLUMN rec_pin_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN rec_pin_salt TEXT NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN rec_pergunta TEXT NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN rec_resp_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN rec_resp_salt TEXT NOT NULL DEFAULT '';
