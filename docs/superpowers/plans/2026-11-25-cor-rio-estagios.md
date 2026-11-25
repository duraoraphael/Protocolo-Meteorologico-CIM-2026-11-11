# Novo aviso COR-Rio — implementação

**Especificação:** solicitação completa fornecida em Texto colado.txt em 25/11/2026. Substitui o disparo por publicações por disparo exclusivo por mudança numérica de estágio.
**Execução:** skills writing-plans, executing-plans e test-driven-development, na sessão atual. O usuário já solicitou implementação efetiva e validação.

## Desenho

Reutilizar o agendamento exclusivo de 15 segundos. Migrar o estado legado para referência dos últimos níveis observados e uma fila de eventos com UUID, snapshot, status e tentativas. Persistir cada transição antes de enviar, independentemente da confirmação SMTP; não perder mudanças seguintes se um envio falhar. Um evento consolida as duas partes alteradas na mesma consulta. Trava do arquivo e controle em memória impedem execuções sobrepostas. Eventos pendentes são reenviados em ordem, inclusive após reinício ou falha de API. O e-mail é composto de dois cards, sem publicações. A vigência usa dados oficiais existentes; indisponibilidades ficam explícitas.

## Tarefas

- [x] Validar recomendações e cores na fonte oficial e manter mapeamento rastreável.
- [x] Testar todos os 20 pares distintos para cada indicador, simultaneidade, permanência, erro/cache, migração, concorrência, repetição de episódio e fila pendente em reinício.
- [x] Implementar fila persistente e metadados de transição; preservar destinatários e TLS.
- [x] Reformular renderer e assunto; ocultar recomendações e espaços associados ao nível 1, sinalizar orientações indisponíveis, destacar alteração e conservar cores.
- [x] Retirar coleta de publicações do caminho de envio/monitor, sem alterar painel e PDFs gerais.
- [x] Criar simulador local com prévias identificadas como simulação e transporte em memória, sem SMTP real.
- [x] Rodar suíte, revisar integração, gerar prévia desktop/mobile e relatório de validação/produção.

## Limites

O histórico identifica episódios por UUID; o mesmo par de níveis pode ocorrer novamente. SMTP não oferece transação conjunta com o arquivo local: uma interrupção exatamente após aceitação remota e antes da confirmação local pode exigir reconciliação pelo identificador estável da mensagem. Não reiniciar serviço nem enviar avisos reais durante esta implementação.

## Ajuste solicitado durante a implementação

O usuário retirou a identificação visual de transições: não mostrar AGRAVAMENTO, REDUÇÃO, SEM ALTERAÇÃO, setas ou nível anterior no e-mail. Exibir somente os estágios atuais e suas cores; omitir o link “Fonte oficial da vigência”. O assunto passa a informar os dois níveis atuais. As transições e seus identificadores permanecem no histórico interno e no controle de envio. Esta instrução substitui os destaques/assuntos propostos acima.


## Verificação final

Suíte: 614 testes, 613 aprovados, zero falhas, 1 teste de UI de lotes ignorado por falta de CIM_TEST_NAVEGADOR. Prévia COR-Rio verificada em Chromium em 850 e 390 pixels, sem overflow e sem os rótulos removidos. Sete cenários do simulador executados, sem SMTP real. Revisão independente concluída; regressões de SMTP parcial e trava incompleta corrigidas. Relatório: docs/RELATORIO_NOVO_AVISO_COR_RIO.md. Serviço de produção não reiniciado.
