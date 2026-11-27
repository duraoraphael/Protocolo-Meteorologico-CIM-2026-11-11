# Controle de envio dos alertas CIM

O controle dos alertas extraordinários guarda o resultado SMTP por destinatário em `data/alertas-fila.json`. A mesma fila atende aos alertas de calor emitidos a partir do informativo regular. O aviso COR-Rio mantém seu controle separado.

## O que cada resultado significa

- `status: enviado`, com `confirmacaoEnvio: aceito_smtp`: todos os destinatários do evento tiveram aceite SMTP registrado. Isso não confirma entrega à caixa de entrada.
- `status: pendente`, com `confirmacaoEnvio: parcial`: parte dos destinatários teve aceite; os demais permanecem em `pendentes`.
- `confirmacaoEnvio: nao_confirmado`: não há aceite suficiente para concluir o evento.
- `entrega: nao_confirmada`: o aplicativo não dispõe de confirmação de entrega final.

Os registros anteriores à correção podem ter `status: enviado` sem `confirmacaoEnvio` ou recibos por destinatário. Esses registros têm confirmação desconhecida e não devem ser apresentados como prova de entrega. São preservados para evitar reenvio automático de avisos antigos.

## Evidências e novas tentativas

O campo `historicoEnvios` guarda horários, Message-ID, resposta SMTP, aceites, rejeições e detalhes de falhas quando fornecidos pelo transportador. Uma execução ignorada ou sem aceites não conclui o evento nem confirma os gatilhos como notificados.

Aceites são acumulados entre tentativas. Quando a mesma mudança volta a ser processada, somente os destinatários ainda pendentes e ativos na base entram na nova tentativa. Um destinatário removido não recebe a tentativa, e a remoção não é convertida em aceite. O intervalo mínimo cresce de 5 até 60 minutos; a tentativa efetiva depende do próximo processamento da mudança pelo monitor. A fila não é um serviço independente de reenvio de alertas antigos: se a condição mudar antes da conclusão, é necessário avaliar a pendência com a condição mais recente.

O histórico dos gatilhos só é confirmado após a conclusão do evento. O Message-ID estável permite correlacionar as tentativas do mesmo evento nos logs corporativos. Um Message-ID sozinho não prova que o servidor tenha aceitado a mensagem.

## Rastreamento da entrega

A entrega, rejeição posterior ao aceite e quarentena precisam ser consultadas no serviço corporativo de e-mail. Para o lote das 10h de 27/11/2026, o pacote local está em `output/rastreamento-alertas-2026-11-27/` e contém relatório, IDs, destinatários e um script de consulta para Exchange Server. O script requer sessão e permissões de Exchange e não envia mensagens nem altera configurações.

Referências: [resposta SMTP e aceitação parcial no Nodemailer](https://nodemailer.com/), [consulta de logs no Exchange Server](https://learn.microsoft.com/en-us/exchange/mail-flow/transport-logs/search-message-tracking-logs).
