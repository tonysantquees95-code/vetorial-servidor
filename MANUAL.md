# Manual — Servidor da Vetorial Tech

> Escrito para a Vetorial Tech. Não contém segredos: só diz ONDE ficam. Visão de todos os apps: Manual da Vetorial Tech (Drive).

Servidor único (Cloudflare Worker + banco D1 + R2) e o site vetorial.tech.

## Onde fica cada coisa
- `servidor/src/index.js`: porta de entrada. Módulos: `id/` (Vetorial ID), `loja/` (planos, teste grátis, cobrança, webhooks), `dev/` (Painel Dev: avisos, assinaturas, visitas, manual), `feedback/`, `atualizacao.js` (mapa app→repositório→tag), `baixar.js`, `ci/` (entrega a chave de assinatura ao GitHub), `ia/`, `voxix/`, `vortex/`, `drive/`, `vindex/`, `financas/`, `pdf/`, `agenda/`, `meusite/`, `catalogo/`, `panfleto/`, `ferramentas/`, `sitevitrine/`.
- `servidor/migrations/` (0001 a 0049): mudanças do banco, só para frente. `servidor/wrangler.toml`: liga banco, armazenamento e tarefas de 10 em 10 minutos.
- `servidor/teste/`: testes (incl. `seguranca.test.mjs` com ataques simulados). `site/`: o site. `scripts/montar-demo*.mjs`: demos da home. `teste-visual/`: site em 7 tamanhos.
- `.github/workflows/servidor.yml`: testa e publica o Worker (se um teste falha, nada sobe).

## Regras
- App novo: acrescentar em `feedback/dados.js` (APPS), `atualizacao.js`, `dev/github.js` (PROJETOS) e `ci/assinatura.js` (REPOS_PERMITIDOS).
- Segredos só nos Secrets do GitHub e no Cloudflare; nunca no código.


## Como voltar atrás se algo quebrar
- No GitHub: aba **Actions** mostra o fluxo vermelho; **Code › Commits** mostra o commit culpado; abra o commit e toque em **⋯ › Revert** (cria um commit novo que desfaz o anterior).
- O número da versão sempre sobe: a versão boa volta como número novo, nunca se republica um número antigo.
- Banco de dados e dados dos usuários não voltam com o código (migrações só andam para frente).

## Movimentações importantes
Uma linha por mudança que valha lembrar (a mais nova em cima). O Painel Dev também mostra os últimos commits automaticamente.

| Data | O que mudou | Onde |
| --- | --- | --- |
| 2026-11-27 | Backup semanal do banco D1, criptografado (gpg), como artefato por 30 dias. Precisa do segredo `BACKUP_FRASE`; sem ele o fluxo falha de propósito. | `.github/workflows/backup-banco.yml` |
| 2026-11-27 | Aviso no Painel Dev quando o Mercado Pago está ligado mas falta `MERCADOPAGO_WEBHOOK_SECRET` (some sozinho quando o segredo entra). | `servidor/src/dev/alertas.js` (`verificarConfiguracao`) |
| 2026-11-27 | Backup criptografado das chaves de assinatura dos APKs (frase só do dono; restaurar nunca sobrescreve chave existente). Painel Dev › Cofre › Backup das chaves dos APKs. Servidor e Desejo de Intimidade entraram no Painel Dev. | `servidor/src/dev/backup.js`, `dev/rotas.js`, `dev/github.js` |
| 2026-11-27 | Manual criado | `MANUAL.md` |
