# FAQ — Informativos e alertas meteorológicos CIM

Guia para clientes do Centro Integrado de Monitoramento Compartilhado (CIM).

Atualizado em 27/11/2026. Os horários abaixo seguem a programação atual do serviço e o horário de Brasília.

## Sobre o serviço

### 1. O que o CIM acompanha?

O CIM reúne dados meteorológicos, previsões e avisos para apoiar o acompanhamento das condições nas instalações cadastradas. Conforme a localização e a disponibilidade das fontes, o informe pode apresentar temperatura, chuva, umidade, rajadas de vento, radiação ultravioleta, qualidade do ar, calor, seca e condições do mar.

Cada informação corresponde a uma estação, município, ponto de previsão ou área de cobertura.

### 2. Qual é a diferença entre informativo, alerta e aviso COR-Rio?

O **informativo regular** reúne as condições e previsões da base, com PDF anexo. O **alerta** comunica uma condição que atende às regras de alerta do protocolo, em mensagem específica, sem PDF. O **aviso COR-Rio** informa mudanças nos estágios operacional e de calor do município do Rio de Janeiro.

### 3. Como as informações chegam ao cliente?

O sistema consulta as fontes, associa os dados às bases cadastradas, aplica as regras do protocolo e prepara os informativos e alertas. O envio por e-mail depende do cadastro ativo do destinatário na respectiva base e do funcionamento do serviço de envio. O painel permite consultar as informações disponíveis entre os envios.

## Horários e frequência

### 4. Quais são os horários dos envios e das consultas?

| Serviço | Programação atual | Quando há envio de e-mail? |
| --- | --- | --- |
| Informativo regular | Todos os dias, às 08h e às 15h | Em cada edição programada, para os destinatários ativos da base. |
| Monitoramento de alertas gerais | Consulta a cada 60 minutos, durante as 24 horas | Quando uma condição ou mudança atende às regras de envio do protocolo. |
| Monitoramento dos estágios do COR-Rio | Nova consulta cerca de 15 segundos após o término da anterior, durante as 24 horas | Quando muda o número do estágio operacional ou do estágio de calor. |
| Atualização geral dos dados do painel | A cada 30 minutos | A atualização do painel, por si só, não envia e-mail. |

As frequências de consulta não garantem que a fonte publique dados novos no mesmo intervalo. Falhas de comunicação podem aumentar o tempo entre consultas bem-sucedidas.

### 5. O e-mail chega exatamente às 08h ou às 15h?

Esses são os horários de início do processamento das edições. A coleta dos dados, a geração dos documentos, o processamento das bases e a entrega pelo provedor de e-mail podem levar alguns minutos. Os horários seguem Brasília, inclusive para destinatários em outros fusos.

### 6. Há envio nos fins de semana, feriados e durante a madrugada?

Os informativos regulares estão programados para todos os dias, inclusive fins de semana e feriados. Os monitores de alertas gerais e do COR-Rio funcionam durante as 24 horas e podem gerar avisos na madrugada, desde que o sistema esteja em operação e as fontes estejam acessíveis.

### 7. Receberei um alerta a cada hora?

Não. A consulta dos alertas gerais ocorre a cada 60 minutos, mas o envio depende de uma condição que justifique uma nova comunicação. Se a situação permanecer igual, não há reenvio automático a cada consulta. O informativo regular continua seguindo os horários das 08h e das 15h.

### 8. Por quanto tempo vale o informativo?

A edição das 08h traz a previsão operacional para o período das 08h às 00h e tem validade até as 00h. A edição das 15h traz a previsão operacional das 15h à meia-noite, e o documento permanece como referência até as 08h do dia seguinte. A validade do documento e o intervalo detalhado de previsão são informações diferentes. Avisos e atualizações posteriores devem ser considerados na avaliação da situação.

### 9. A previsão dos próximos três dias tem outro horário de envio?

Não há um envio separado para essa previsão. Quando disponível, a tendência para os três dias seguintes integra o informativo regular. Ela ajuda no planejamento e pode mudar nas próximas atualizações.

## Fontes de dados e APIs

### 10. O que é uma API?

Uma API é uma forma de um sistema consultar dados de outro serviço automaticamente. No CIM, essas consultas permitem buscar informações nas fontes e atualizar os informes. Algumas informações também são obtidas de publicações oficiais, páginas e documentos, em vez de uma API.

### 11. Quais fontes o CIM utiliza e para quê?

| Fonte ou serviço | Uso no CIM |
| --- | --- |
| INMET | Observações de estações automáticas, previsões municipais e avisos meteorológicos oficiais. |
| Petrobras OCEANOP | Fonte prioritária para previsão de rajadas de vento nas bases com pontos de atendimento validados. |
| Open-Meteo Forecast | Previsões de chuva, probabilidade de precipitação e outras variáveis; tendência para os próximos dias; contingência de rajadas quando o OCEANOP não atende ou falha. Também pode fornecer UV. |
| Open-Meteo Air Quality / CAMS | Estimativas de qualidade do ar, partículas e UV, conforme disponibilidade e habilitação do serviço. |
| Open-Meteo Marine | Previsão de ondas e outras condições do mar para bases costeiras com pontos validados. |
| Clima e Saúde — Ministério da Saúde | Informações oficiais de excesso de calor e indicadores de risco associados. |
| Monitor de Secas — ANA | Informações mensais de seca, a partir dos mapas e resumos oficiais. |
| COR-Rio | Estágios operacional e de calor da cidade do Rio de Janeiro, com consulta aos serviços e comunicados oficiais. |

Nem todas as fontes se aplicam a todas as instalações. A disponibilidade de uma variável também pode variar entre consultas.

### 12. Todos os links apresentados no informe são integrações automáticas?

Não. O informe também pode apresentar links para consulta complementar em órgãos oficiais. A existência de um link não significa que todos os dados daquele site sejam coletados automaticamente pelo CIM. A fonte indicada junto à informação ajuda a identificar sua origem.

### 13. Qual é a diferença entre observação e previsão?

Uma observação descreve uma medição já realizada, como a chuva registrada por uma estação. Uma previsão estima o que pode acontecer em um período futuro. Dados de modelos, como determinadas estimativas de qualidade do ar, também não equivalem a uma medição feita dentro da instalação. Por isso, origem, horário e período de referência devem ser lidos junto ao valor.

### 14. Por que o vento do CIM pode ser diferente de outro aplicativo?

As fontes podem usar pontos, modelos, horários e variáveis diferentes. Uma rajada é um pico de vento e não equivale à velocidade média. Para previsão de rajadas, o CIM prioriza o OCEANOP nos pontos validados e utiliza o Open-Meteo como contingência quando necessário. Compare sempre a mesma variável, local e período.

### 15. Qualidade do ar, seca e condições do mar estão disponíveis para todas as bases?

Não. O Monitor de Secas tem atualização mensal e não é uma previsão de chuva para as próximas horas. As condições do mar se aplicam às bases costeiras atendidas; para instalações no interior, esse item pode aparecer como “Não se aplica”.

## Entendendo os alertas

### 16. O que significam Normal, Atenção, Alerta e Emergência?

São níveis utilizados pelo protocolo CIM para comunicar a condição de cada fenômeno. A classificação considera os critérios aplicáveis e os dados válidos disponíveis. Avisos oficiais do INMET têm prioridade para o fenômeno correspondente. Uma classificação calculada pelo protocolo CIM não deve ser confundida com a emissão de um novo aviso oficial pelo INMET.

### 17. Toda mudança de valor gera um novo alerta?

Não. A mudança precisa atender aos critérios do protocolo, como uma alteração de nível ou uma atualização relevante de aviso oficial. Pequenas oscilações ou a repetição da mesma condição não geram necessariamente um novo envio. Algumas reduções de nível exigem leituras consecutivas para confirmar a estabilização.

### 18. Quanto tempo leva para uma mudança gerar um alerta geral?

O sistema avalia a mudança na próxima consulta bem-sucedida, atualmente programada a cada 60 minutos. O prazo também depende de quando a fonte disponibiliza a informação, das regras de confirmação e do processamento do e-mail. Portanto, o alerta geral não representa uma detecção contínua a cada segundo.

### 19. O sistema avisa quando a situação melhora?

Pode haver aviso de redução ou normalização quando os critérios do protocolo forem atendidos. Algumas situações precisam de confirmação em leituras consecutivas. A ausência ou falha de uma fonte não é tratada como retorno à normalidade.

### 20. Se não chegou e-mail, significa que está tudo normal?

Não necessariamente. A condição pode ter permanecido igual, ainda estar em confirmação ou depender de dados indisponíveis. Também pode haver atraso de entrega. Consulte a condição, a data e a hora disponíveis no painel e, se houver dúvida, solicite a verificação ao CIM.

## Avisos COR-Rio

### 21. O aviso COR-Rio vale para quais localidades?

Os estágios operacional e de calor do COR-Rio se referem ao município do Rio de Janeiro. Eles não representam automaticamente a situação de outras cidades do estado. A distribuição desses avisos tem cadastro próprio; receber o informativo meteorológico da base Rio de Janeiro não inclui automaticamente o destinatário na lista COR-Rio.

### 22. O que provoca um envio do COR-Rio?

Na lógica atual, o aviso é enviado quando muda o número do estágio operacional ou do estágio de calor, tanto em aumentos quanto em reduções, inclusive no retorno ao nível 1. Se ambos mudarem na mesma consulta, a mensagem reúne as duas mudanças. Uma notícia nova, um comunicado de trânsito ou uma edição de texto no site, sem alteração desses estágios, não dispara esse aviso.

### 23. O aviso COR-Rio é instantâneo?

O monitor busca mudanças em ciclos curtos, com nova consulta cerca de 15 segundos após a conclusão da anterior. O envio começa após a detecção e o processamento da mudança. A atualização da fonte, o tempo de resposta da consulta e a entrega do e-mail podem acrescentar atraso; não há garantia de recebimento no mesmo segundo da alteração oficial.

### 24. Estágio operacional e estágio de calor significam a mesma coisa?

Não. São classificações independentes do COR-Rio, cada uma com sua escala de 1 a 5. O estágio operacional comunica a situação operacional da cidade; o estágio de calor acompanha as condições de calor. Eles também não correspondem diretamente aos níveis Normal, Atenção, Alerta e Emergência do protocolo CIM.

### 25. Como identificar o e-mail COR-Rio?

O nome do remetente é **ALERTA COR-RIO**. O assunto apresenta os níveis identificados, por exemplo: **COR-RIO| Estágio 1 | Calor 3**. Esse exemplo ilustra o formato e não informa a situação atual. No corpo, o título é **AVISO COR-RIO**, com os estágios apresentados em suas respectivas cores.

### 26. Qual é a diferença entre vigência e última consulta?

**Vigência** é o momento em que o estágio passou a valer, conforme a informação oficial identificada. **Última consulta** é quando o sistema verificou a fonte. O horário de envio do e-mail é outro momento e pode ser posterior aos dois.

O sistema pode detectar uma mudança antes de o COR-Rio publicar o horário de início. Quando esse horário ainda não foi confirmado, o aviso informa a hora em que a alteração foi identificada, sem apresentá-la como início oficial da vigência. O monitor continua procurando a informação; a complementação do horário, sozinha, não dispara outro e-mail de mudança de estágio.

## Disponibilidade, cadastro e suporte

### 27. O que acontece se uma fonte ficar indisponível?

Conforme o dado e a disponibilidade de contingência, o sistema pode usar outra fonte prevista no protocolo, manter a última informação válida com indicação de desatualização ou apresentar indisponibilidade. A falta de dado não deve ser interpretada como condição normal. Confira a fonte e o horário da informação exibida.

### 28. Posso receber informações de mais de uma instalação?

Sim. Uma pessoa pode estar cadastrada em várias bases, de acordo com sua necessidade de acompanhamento. Isso é válido e pode resultar em mensagens diferentes para cada instalação. Para inclusão, alteração ou retirada, informe à equipe CIM o nome, o e-mail e as bases desejadas. Para avisos COR-Rio, solicite essa distribuição especificamente.

### 29. O que fazer se eu não receber um informativo ou alerta esperado?

Verifique as pastas de spam e a quarentena corporativa. Confirme com a equipe CIM se o endereço está correto, ativo e vinculado à base desejada. Para investigar um caso, informe a instalação, a data, o horário aproximado e o tipo de mensagem esperado. A equipe poderá conferir se havia condição para envio e se houve falha de coleta ou entrega.

### 30. Como usar as informações na rotina da instalação?

Confira a base, o fenômeno, o nível, o período de validade e o horário dos dados antes de tomar uma decisão. Considere os avisos mais recentes e siga as orientações dos órgãos oficiais e os procedimentos da instalação. O CIM apoia esse acompanhamento; previsões podem mudar e precisam ser reavaliadas nas próximas atualizações.
