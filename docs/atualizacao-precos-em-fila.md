# Atualização de preços em fila

O botão “Atualizar todos” consulta todos os voos ativos, independentemente do filtro visual, um por vez. Mantém as regras de alertas por e-mail e Telegram. Voos comprados, encerrados ou removidos antes de sua vez são ignorados.

Uma fila no processo Node atende a atualização individual, em lote e o cron. A reserva ocorre antes de carregar os voos. Novos pedidos manuais recebem HTTP 409 enquanto existe uma execução; um ciclo agendado sobreposto é ignorado. A interface desabilita consultas enquanto a fila está ocupada, consulta o progresso a cada três segundos e exibe o resultado final. As configurações passam a indicar uma consulta simultânea.

API autenticada: `POST /api/flights/check-all` inicia com HTTP 202 e exige CSRF; `GET /api/flights/check-all/status` informa total, concluídos, sucessos, falhas e ignorados. Nenhum navegador do cliente precisa permanecer aberto. Uma falha individual não interrompe os demais voos.

A fila é mantida em memória no único processo da aplicação. Reinícios/deploys interrompem a execução; ela não retoma automaticamente. Múltiplas réplicas precisariam de coordenação compartilhada antes de escalar. Consultas sequenciais reduzem carga e sobreposição, mas não garantem ausência de bloqueios do Google.

Validação: 584 testes passaram em 51 suítes, excluindo explicitamente `auth.test.js` e `users.test.js`, que têm defeitos conhecidos nos helpers. Build passou com o aviso de tamanho de chunk já existente. Navegador com backend real e scraper simulado: botão, progresso, bloqueio, reload e exclusão de voos inativos passaram. Testes de API cobrem sessão, CSRF, conflito manual/individual/cron e voo encerrado na fila. Google Voos real e envio real de notificações não foram executados.

Após deploy: atualizar a página, clicar em “Atualizar todos”, conferir progresso e resumo. Tentar outro clique em uma segunda aba durante a execução deve ser bloqueado. Verificar valores e histórico dos voos atualizados.
