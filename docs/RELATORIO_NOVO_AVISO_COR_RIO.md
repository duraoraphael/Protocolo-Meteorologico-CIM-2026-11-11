# Novo aviso COR-Rio — implementação e validação

Implementado em 25/11/2026, incluindo o ajuste posterior solicitado pelo usuário: exibir somente os estágios atuais, sem rótulos de agravamento/redução e sem o link da fonte da vigência.

## Resultado funcional

- Cabeçalho institucional preservado, com CIM, COMPARTILHADO, AVISO COR-RIO, linha de data por extenso seguida de ` - RJ`, verde `#006527` e linha amarela. O card de calor tem título `ESTÁGIO DE CALOR`.
- Somente os cards do estágio operacional e do calor. A seção de comunicado, notícias, descrição e previsão para próximos dias foi removida deste e-mail.
- Cada card mostra o nível atual, sua cor e o início da vigência quando há informação oficial identificável. Data ausente fica explícita; horário de consulta/atualização não é inventado como início de vigência.
- Sem agravamento, redução, setas, estágio anterior, SEM ALTERAÇÃO ou link “Fonte oficial da vigência” na apresentação. Assunto: `COR-RIO| Estágio 1 | Calor 3`, com valores dinâmicos. Nome do remetente exclusivo deste aviso: `ALERTA COR-RIO`, preservando o endereço configurado e o remetente dos demais informativos.
- Nível 1 não contém bloco, título, link ou espaço reservado para recomendações. Níveis 2–5 usam o mapeamento oficial validado. Orientações indisponíveis ficam explícitas sem impedir o envio.
- Recomendações e link geral do COR-Rio permanecem; a referência usada para obter a vigência continua internamente disponível.

## Disparo, persistência e recuperação

O monitor existente foi reutilizado, sem segundo agendamento. `INTERVALO_COR_RIO_SEGUNDOS` controla o intervalo, padrão 15 segundos após terminar o ciclo anterior. Falhas usam a espera progressiva existente, até 5 minutos. Os interruptores administrativos continuam válidos.

Qualquer mudança numérica válida, para cima ou para baixo, gera um evento. Mudanças simultâneas geram um único evento consolidado. Notícias, títulos, descrições e edições de publicações não disparam envio. Primeira leitura válida de cada indicador registra referência sem disparar histórico. Falhas ou cache não geram mudança nem presumem nível 1.

`data/cor-rio-notificado.json` passa à versão 2, com migração automática do formato anterior e preservação do legado. Guarda níveis observados, eventos com UUID, snapshot, tentativas, pendências, destinatários aceitos e confirmação de envio. A observação é persistida antes de tentar SMTP, preservando transições seguintes durante falhas. Um episódio repetido recebe outro UUID.

A fila é retomada após reinício, mesmo se a API estiver indisponível. Destinatários já aceitos numa entrega parcial não são incluídos nas tentativas seguintes. Endereços pendentes são novamente confrontados com o cadastro ativo, respeitando remoções administrativas. Um destinatário rejeitado não impede processar os outros eventos.

Trava por arquivo impede ciclos simultâneos entre monitores. É publicada completa por hard link, recupera proprietários encerrados e recupera trava legada inválida depois de 5 minutos. Estado ilegível bloqueia envio para evitar perda de referência. Logs incluem consulta, referências, transição, UUID, tentativas, aceitação parcial, destinatários, confirmação, falhas e bloqueios, com apresentação em Brasília. Nenhuma credencial é adicionada aos logs.

## Arquivos

| Arquivo | Alteração |
|---|---|
| `src/logic/corRioAlertMonitor.js` | Comparação dos dois indicadores, captura de episódios, fila e retentativa por destinatário |
| `src/logic/corRioEventStore.js` | Novo armazenamento versionado, migração, validação, gravação atômica e trava |
| `src/logic/corRioMonitorScheduler.js` | Intervalo centralizado e descrição do monitor de estágios |
| `src/sources/corRio.js` | Consulta só de estágios para este fluxo, preservando atualização de comunicados no painel |
| `src/pipeline.js` | Aviso exclusivo sem conteúdo de publicações, mantendo vigência oficial e assinatura |
| `src/render/corRioStandaloneEmail.js` | Dois cards e apresentação simplificada conforme o último pedido |
| `src/email/sendReport.js` | Assunto dinâmico, Message-ID estável e resultado SMTP por destinatário |
| `src/logic/documentProvenance.js` | Assinatura dos metadados do evento e das orientações quando presentes |
| `src/config/corRioOrientacoes.json` | Novo mapeamento rastreável das orientações oficiais |
| `scripts/simularCorRio.js`, `package.json` | Simulador local sem API/SMTP de produção |
| `tests/corRioEventos.test.js`, `tests/corRioNovoAviso.test.js` | Matriz completa de transições, persistência, falhas e novo layout |
| `tests/corRio.test.js`, `tests/corRioAlertMonitor.test.js`, `tests/corRioDistribution.test.js`, `tests/corRioPublicacoesPipeline.test.js`, `tests/corRioStandaloneEmail.test.js` | Integração e expectativas atualizadas para a nova regra |
| `.env.example`, `README.md`, `INSTALACAO_SERVIDOR_PETROBRAS.md` | Configuração e instruções operacionais atualizadas |
| `docs/superpowers/plans/2026-11-25-cor-rio-estagios.md` | Plano, decisões e ajuste posterior de apresentação |

SMTP, TLS, destinatários, cadastros, informativos gerais, previsão de três dias e horários das 08h/15h não foram alterados.

## Fontes e cores

As orientações de cada nível foram extraídas e conferidas em 25/11/2026 na [FAQ oficial — estágios operacionais](https://cor.rio/faq/) e em [Níveis de Calor — COR-Rio](https://cor.rio/niveis-de-calor/). O JSON guarda fontes e data de validação; não mistura recomendações entre níveis nem usa o resumo anterior do e-mail.

Os cinco tons continuam compartilhados com o painel: verde `#22C55E`, amarelo `#FACC15`, laranja `#F97316`, vermelho `#EF4444`, roxo `#A855F7`. As fontes de calor consultadas não fornecem uma tabela estruturada de valores hexadecimais por nível; foi preservada a escala já utilizada e solicitada no projeto. Não se apresenta essa escolha como uma nova norma cromática publicada pelo COR-Rio.

## Validação

- Matriz de 20 transições distintas para cada indicador: 40 casos.
- Mudanças simultâneas, permanência, episódio repetido, referência inicial, valores inválidos, cache e fontes parcialmente indisponíveis.
- SMTP indisponível, sequência de mudanças durante falha, retorno ao nível inicial, reinício e drenagem de fila com API fora.
- SMTP parcialmente aceito: retentativa somente para rejeitados, comparação de e-mails sem diferenciar maiúsculas e minúsculas e continuidade dos eventos seguintes.
- Dois monitores disputando o arquivo e recuperação de trava legada incompleta.
- Pipeline, assinatura operacional, HTML, assunto, destinatários exclusivos e ausência de PDF.
- Consulta real de estágio operacional e calor em instância isolada em memória, sem salvar o estado de produção e sem SMTP: ambas responderam operacionalmente.
- Os sete cenários do simulador foram executados; nenhum enviou e-mail real.
- Prévia renderizada em Chromium, nas larguras 850 e 390 pixels, sem rolagem horizontal. HTML usa tabelas, `bgcolor`, CSS inline e estrutura condicional para Outlook.
- Suíte completa (`npm test`), após os ajustes de assunto, cabeçalho e remetente: 615 testes, 614 aprovados, zero falhas, 1 ignorado. O teste ignorado é `modal de lote em desktop e celular acompanha a API real com SMTP simulado`, de `tests/lotesRelatorioUi.test.js`, pois `CIM_TEST_NAVEGADOR` não foi definido nessa execução. As prévias COR-Rio foram verificadas separadamente em Chromium real.
- Revisão independente identificou os casos de SMTP parcial e trava incompleta; ambos foram reproduzidos em testes, corrigidos e revisados novamente sem bloqueadores. O ajuste posterior de apresentação foi validado por testes do renderer/pipeline e prévias atualizadas.

## Simulação e prévias

```powershell
npm run simular-cor-rio -- --cenario=simultanea
npm run simular-cor-rio -- --cenario=reducao
npm run simular-cor-rio -- --cenario=reinicio
npm run simular-cor-rio -- --cenario=falha-envio
npm run simular-cor-rio -- --cenario=api-indisponivel
npm run simular-cor-rio -- --cenario=sem-alteracao
npm run simular-cor-rio -- --cenario=agravamento
node --test tests/corRioEventos.test.js tests/corRioNovoAviso.test.js
```

Use `--operacional=1..5`, `--calor=1..5`, `--anterior-operacional=1..5` e `--anterior-calor=1..5` para variar níveis. O simulador não lê `.env`, não conecta à API nem ao SMTP e grava exclusivamente em `output/simulacoes-cor-rio/`. Todas as prévias têm faixa “SIMULAÇÃO — NÃO ENVIAR”.

Prévias entregues em `output/previa-cor-rio.html`, `output/previa-cor-rio-reducao.html`, `output/previa-cor-rio-desktop.png` e `output/previa-cor-rio-mobile.png`.

## Limites e produção

Não houve reinício do serviço nem disparo real nesta implementação. Para aplicar:

1. Parar a instância em execução e fazer backup do diretório `data/`, especialmente `cor-rio-notificado.json` e o cadastro de destinatários.
2. Aplicar os arquivos, preservando `.env`, destinatários e certificados. Confirmar `MONITOR_ALERTAS=true`, `MONITOR_COR_RIO=true` e `INTERVALO_COR_RIO_SEGUNDOS=15` quando o monitor deva ficar ativo.
3. Rodar simulação e suíte. Iniciar uma única instância por diretório de dados. Não apagar o histórico para testar: isso altera a referência de primeira execução.
4. Conferir logs, migração para versão 2 e eventuais pendências antes de acompanhar os envios. Revisar a prévia também no Outlook Desktop/Web utilizado pela organização.

Uma interrupção exatamente entre a aceitação SMTP e a gravação local pode tornar a entrega incerta. O Message-ID estável e o UUID permitem reconciliar com o relay; não há garantia transacional de entrega exatamente uma vez oferecida por SMTP. Hard links exigem sistema de arquivos compatível; a criação/recuperação foi validada no ambiente Windows atual. Uma trava inválida recente aguarda 5 minutos antes da recuperação. O mapeamento de orientações requer nova conferência se o COR-Rio alterar suas recomendações. Não foi executado um cliente Outlook real nesta sessão, apenas validação estrutural e renderização em Chromium.

## Correção de vigência — 26/11/2026

Ocorrência verificada no histórico: a mudança Calor 3 → Calor 1 foi detectada às 03:15:34 de 26/11/2026, mas o comunicado foi publicado às 03:20:11. O snapshot do primeiro aviso não tinha a vigência porque a fonte ainda não havia divulgado o comunicado. Buscas sem resultado também eram mantidas em cache por 15 minutos.

Correções em `src/sources/corRioCalorVigencia.js`, `src/logic/corRioAlertMonitor.js` e `src/render/corRioStandaloneEmail.js`:

- Buscar a data e o horário no título e no corpo/resumo do comunicado de mudança, aceitando datas por extenso/abreviadas e horas como `03h15`, `03:15` e `11h30min`, além da sigla NC.
- Vincular a data à declaração do episódio atual. Referências históricas, inclusive de um episódio anterior do mesmo nível, não fornecem sua vigência. Ausência de vínculo seguro retorna ausência de horário oficial.
- Busca sem resultado expira em 15 segundos; resultados válidos mantêm cache de 15 minutos. Uma nova publicação não gera outro alerta sem mudança de estágio.
- Na retentativa de evento pendente, complementar a vigência quando a coleta válida já a disponibilizar para o mesmo nível e ela não for posterior à detecção do evento.
- Enviar o alerta sem esperar publicação tardia. Se o início oficial ainda não tiver sido confirmado, apresentar “Alteração identificada em” com o horário observado pelo monitor, claramente distinto de “Vigente desde”. O horário de publicação ou de consulta nunca é convertido em início oficial.

Foram adicionadas regressões para publicação tardia, corpo do comunicado, NC, horários com dois-pontos, referências históricas do mesmo/outro nível, notícia meteorológica posterior, cache negativo e complementação de pendência. A consulta real confirmou o início oficial do Calor 1 em 26/11/2026 às 03:15 de Brasília. Não houve reenvio real, alteração dos eventos já enviados ou modificação do histórico de produção durante a validação. A revisão independente confirmou a correção do vínculo entre data e episódio.

Suíte após esta correção: 625 testes, 624 aprovados, zero falhas e 1 ignorado (o teste opcional de navegador do modal de lotes, descrito acima).
