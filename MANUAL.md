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
| 2026-11-28 | Cortesia da Vênus por 60 dias: só o administrador libera, por conta, depois do pagamento da montagem. Uma vez por conta, sem cobrança automática, não conta como assinante. | `servidor/src/dev/cortesia.js`, migração 0052 |
| 2026-11-28 | Apagar conta (LGPD): a própria pessoa apaga em Minha conta (senha + a palavra APAGAR). Corrigido: a exclusão antiga do Painel Dev deixava para trás loja, clientes da agenda, site, catálogo, links e comunidades. Com cobrança automática ou plano pago ativo, não apaga | `servidor/src/id/apagar.js`, `POST /id/apagar-conta`, `site/conta.html` |
| 2026-11-28 | Velocidade: índices no banco, tempo limite em todo serviço de fora e imagens do site em WebP (bem mais leves). Chamada nova a serviço externo usa `comPrazo` (o teste cobra). | `servidor/migrations/0051_indices_velocidade.sql`, `servidor/src/prazo.js`, `servidor/teste/desempenho.test.mjs`, `site/*.webp` |
| 2026-11-28 | Backup do banco mudou: sai do anexo do GitHub e vai criptografado para o bucket privado `venus-backups` (R2), apagado após 30 dias. A saída do wrangler fica escondida (a exportação imprime um link do banco sem criptografia). Falta ativar o R2, dar ao token a permissão de R2 e criar a `BACKUP_FRASE`. | `.github/workflows/backup-banco.yml`, `servidor/teste/backup-banco.test.mjs` |
| 2026-11-28 | Vexperyon: painel em `/vexperyon` com login de administrador e histórico real das rodadas (a página não tem dados; tudo vem de `/dev/*` depois do login). Botão Testar e envio em PDF ainda desligados. | `servidor/src/vexperyon/painel.js` |
| 2026-11-28 | Vexperyon: recebe as capturas do laboratório (identidade do GitHub, só o repositório vexperyon), guarda 3 rodadas por app e só o administrador lê. Conta @teste.invalid não abre o Drive. | `servidor/src/vexperyon/`, migração 0050 |
| 2026-11-27 | Backup semanal do banco D1, criptografado (gpg), como artefato por 30 dias. Precisa do segredo `BACKUP_FRASE`; sem ele o fluxo falha de propósito. | `.github/workflows/backup-banco.yml` |
| 2026-11-27 | Aviso no Painel Dev quando o Mercado Pago está ligado mas falta `MERCADOPAGO_WEBHOOK_SECRET` (some sozinho quando o segredo entra). | `servidor/src/dev/alertas.js` (`verificarConfiguracao`) |
| 2026-11-27 | Backup criptografado das chaves de assinatura dos APKs (frase só do dono; restaurar nunca sobrescreve chave existente). Painel Dev › Cofre › Backup das chaves dos APKs. Servidor e Desejo de Intimidade entraram no Painel Dev. | `servidor/src/dev/backup.js`, `dev/rotas.js`, `dev/github.js` |
| 2026-11-27 | Manual criado | `MANUAL.md` |
