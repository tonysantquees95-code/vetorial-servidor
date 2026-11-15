# Servidor da Vetorial Tech

Cloudflare Worker + banco D1 que atende todos os aplicativos da Vetorial Tech (Vênus, Vindex, Vortex, Velox, Vetorial Drive, Voxix e o Painel Dev):
Vetorial ID (conta e login), IA da Vênus, saves do Vortex, Voxix ao vivo, canal de atualização dos apps, assinatura permanente dos APKs e o site (`site/`).

- `servidor/` — o Worker (código, migrações do banco e testes).
- `site/` — o site de vendas e as páginas da conta, servidos pelo próprio Worker. A Vênus web (`site/app`) é montada na publicação a partir do Venus-core.
- `.github/workflows/servidor.yml` — publica no Cloudflare a cada mudança em `servidor/`, `site/` ou no próprio fluxo.

Os apps continuam falando com o mesmo endereço (`venus-servidor.tonysantquees95.workers.dev`).
