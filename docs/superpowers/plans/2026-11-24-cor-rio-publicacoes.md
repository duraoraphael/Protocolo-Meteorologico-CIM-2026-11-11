# COR-Rio publicações — plano de implementação

> Execução: superpowers:executing-plans, diretamente nesta sessão.

**Goal:** avisar todas as publicações novas/editadas e mudanças de estágio com consultas exclusivas a cada 15 segundos.
**Architecture:** coletor paginado próprio para publicações; referência persistida pelo monitor; ciclo independente no servidor; e-mail inclui as publicações detectadas.
**Tech Stack:** Node.js, node-cron, node:test, API WordPress existente.
**Spec:** ../specs/2026-11-24-cor-rio-publicacoes-design.md

## Restrições

Sem novos serviços ou dependências. Sem disparos reais durante testes. Destinatários exclusivos `cor_rio`. Inicialização silenciosa. Confirmação somente após SMTP; falhas não apagam referências. Informativos gerais preservados.

## Foco da revisão

Paginação completa; edições de notícias antigas; falha parcial de coleta; reinício durante tentativa de envio; conteúdo de trânsito corretamente exibido e escapado.

## Tarefas

- [x] Escrever e executar testes inicialmente falhando para publicações paginadas sem filtro de categoria, detecção/retentativa persistida, conteúdo do e-mail e agendamento exclusivo.
- [x] Criar `src/sources/corRioPublicacoes.js`: `buscarPublicacoesCorRio({desde, fetchImpl, agora})`, com janela sobreposta de 120 segundos, paginação e assinatura de conteúdo. Integrar ao pipeline somente quando solicitado pelo monitor.
- [x] Ampliar `src/logic/corRioAlertMonitor.js`: migrar o estado antigo, inicializar publicações silenciosamente, identificar versões novas, enviar grupo de alterações e persistir depois de SMTP. Testar falhas, reinício e concorrência.
- [x] Atualizar `src/render/corRioStandaloneEmail.js` para apresentar todas as publicações detectadas sem filtro meteorológico. Preservar envio manual existente.
- [x] Separar ciclo em `src/logic/corRioMonitorScheduler.js`, iniciado por `server.js`: configuração específica, padrão 15 segundos, sem sobreposição, espera progressiva até 5 minutos em falhas, interruptor geral respeitado. Remover consulta duplicada de `src/scheduler.js`.
- [x] Atualizar `.env`, `.env.example`, README e instalação. Executar testes relevantes e `npm test`, revisar o diff e relatar limites.

## Decisões de execução

Executar no workspace atual para entregar a alteração nos arquivos abertos pelo usuário. Não criar commits ou iniciar o servidor de produção nesta sessão. A busca inicial de publicações estabelece o marco temporal sem distribuir histórico. O marco só avança após coleta completa e confirmação do envio quando houver novidade.


## Resultado da verificação

- Suíte final: 554 testes, 553 aprovados, 1 ignorado, nenhuma falha.
- API real: consulta operacional, filtro de edição conferido; nenhum e-mail real enviado.
- Revisão independente: risco de perda durante paginação reproduzido e corrigido; regressões 201→200 e 150→149 aprovadas. Revisão final sem bloqueadores.
- Fluxo completo com API e SMTP simulados: publicação → pipeline → assinatura → monitor → destinatário exclusivo, com retentativa e deduplicação.
- Configuração local: MONITOR_COR_RIO=true e INTERVALO_COR_RIO_SEGUNDOS=15; demais alertas mantidos em 60 minutos.
- O servidor não foi reiniciado. A configuração será carregada na próxima inicialização do serviço.
