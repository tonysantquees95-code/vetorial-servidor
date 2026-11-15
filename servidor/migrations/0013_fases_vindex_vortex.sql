-- Etapas já entregues do Vindex e do Vortex (novas etapas entram aqui conforme ficam prontas).
INSERT OR IGNORE INTO dev_fases (id, projeto, titulo, progresso, status, ordem, atualizado) VALUES
 ('vindex-1', 'vindex', 'Núcleo em Rust: otimizador, limpeza e descompactação', 100, 'concluida', 1, 0),
 ('vindex-2', 'vindex', 'Manager: organizador de arquivos, regras e desfazer', 100, 'concluida', 2, 0),
 ('vindex-3', 'vindex', 'Explorador de arquivos (Android e Windows), abrir arquivos e excluir pastas', 100, 'concluida', 3, 0),
 ('vindex-4', 'vindex', 'Vault, Vetorial ID e telemetria para o Painel Dev', 100, 'concluida', 4, 0),
 ('vindex-5', 'vindex', 'Instalador Windows, APK e atualização automática', 100, 'concluida', 5, 0),
 ('vindex-6', 'vindex', 'Personalização: cor própria, botões e ícones', 100, 'concluida', 6, 0),
 ('vortex-1', 'vortex', 'Núcleo: biblioteca de ROMs, capas, títulos e tempo de jogo', 100, 'concluida', 1, 0),
 ('vortex-2', 'vortex', 'EmulatorBridge: RetroArch e emuladores, lançar com um clique', 100, 'concluida', 2, 0),
 ('vortex-3', 'vortex', 'Modo Jogo: desempenho máximo e restauração automática', 100, 'concluida', 3, 0);
