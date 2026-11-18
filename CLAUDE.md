# Servidor da Vetorial Tech — notas para quem mexe no código

- Este repositório só tem o servidor (`servidor/`) e o site (`site/`). Os apps têm cada um o seu repositório; o app da Vênus (Venus-core) é privado e fica separado.
- Publicação: `.github/workflows/servidor.yml` (Cloudflare Workers). Segredos obrigatórios do repositório: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VENUS_GITHUB_LEITURA` (token só de leitura do Venus-core). Os demais são opcionais: o Worker guarda no Cloudflare os que já estão salvos.
- A Vênus web (`/app`) é montada lendo o Venus-core. Mexeu na Vênus web? Rode a publicação de novo (Actions › Run workflow).
- Testes: `node --test servidor/teste/*.test.mjs` (rodam também na publicação).
- Mudou rota ou regra do Voxix (`servidor/src/voxix/`), confira o app do Voxix.
- O repositório é público: nunca coloque chave, token ou senha no código. Segredos só nos "Secrets" do GitHub ou no Cloudflare.
- Teste visual do site: `node teste-visual/telas.mjs` (motor) + `teste-visual/config.mjs` (telas a visitar) abre as páginas em 7 tamanhos (celular pequeno até janela do Windows) e confere se cabem, não estouram para o lado, não dão erro no console e se o simulador dos apps, a janelinha do Android e os botões funcionam. Roda na publicação (antes de montar a Vênus web) e guarda as fotos como artefato `fotos-do-site`. Página, seção ou janelinha nova: acrescente um cenário em `config.mjs`.
- Simulador da home (`site/simulador.js` + `simulador.css`): usa os mesmos ícones animados dos cartões da suíte (não troque os ícones). Classes com prefixo `sim-` para não colidir com o `estilo.css`; o CSS é estático (nada de Tailwind via CDN em produção).
