# Servidor da Vetorial Tech — notas para quem mexe no código

- Este repositório só tem o servidor (`servidor/`) e o site (`site/`). Os apps têm cada um o seu repositório; o app da Vênus (Venus-core) é privado e fica separado.
- Publicação: `.github/workflows/servidor.yml` (Cloudflare Workers). Segredos obrigatórios do repositório: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VENUS_GITHUB_LEITURA` (token só de leitura do Venus-core). Os demais são opcionais: o Worker guarda no Cloudflare os que já estão salvos.
- A Vênus web (`/app`) é montada lendo o Venus-core. Mexeu na Vênus web? Rode a publicação de novo (Actions › Run workflow).
- Testes: `node --test servidor/teste/*.test.mjs` (rodam também na publicação).
- Mudou rota ou regra do Voxix (`servidor/src/voxix/`), confira o app do Voxix.
- O repositório é público: nunca coloque chave, token ou senha no código. Segredos só nos "Secrets" do GitHub ou no Cloudflare.
