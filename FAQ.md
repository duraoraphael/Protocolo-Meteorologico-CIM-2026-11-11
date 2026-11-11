# FAQ — Protocolo Meteorológico CIM

**Perguntas frequentes de usuários e administradores**

Este documento resume o funcionamento do projeto conforme a implementação e a
documentação disponíveis no repositório. As configurações do ambiente de
execução podem alterar horários, fontes habilitadas e destinatários.

## Visão geral

O Protocolo Meteorológico CIM coleta informações meteorológicas e operacionais
para **11 instalações**, organiza os dados em um painel, gera informativos em
PDF e envia os documentos por e-mail. Há fluxos separados para avisos
extraordinários e para comunicados do COR-Rio.

As instalações meteorológicas são Rio de Janeiro, Macaé, Brasília, Manaus,
Santos, Aracaju, Natal, Oiapoque, Vitória, Wenceslau Bráz e Salvador.
**COR-RIO — RJ** é uma instalação lógica de distribuição de avisos; não é uma
12ª localidade meteorológica.

### O que o sistema oferece

- Painel web para consulta por instalação, com atualização automática e
  indicação da última consulta bem-sucedida.
- Informativos meteorológicos regulares às 08h e às 15h, no horário de
  Brasília, quando o agendamento e o envio estão habilitados.
- PDF detalhado e e-mail resumido, com conteúdos adequados a cada formato.
- Geração manual, protegida por senha, do informativo da instalação
  selecionada ou do aviso exclusivo do COR-Rio.
- Cadastro de responsáveis e associação a uma ou mais instalações.
- Monitor de alertas extraordinários e verificação preventiva das fontes.
- Geração de relatório semanal por linha de comando.

## FAQ para usuários

### 1. Como abro o painel?

No ambiente local, acesse `http://localhost:3210`. Em um servidor, use o
endereço publicado pela equipe responsável. Em produção, o acesso pela rede
deve ser feito por HTTPS.

### 2. Como troco a instalação exibida?

Use o seletor no topo do painel. A instalação selecionada também fica
registrada na URL, o que permite guardar um endereço específico para uma TV ou
estação de trabalho.

### 3. Quais instalações posso consultar?

Rio de Janeiro, Macaé, Brasília, Manaus, Santos, Aracaju, Natal, Oiapoque,
Vitória, Wenceslau Bráz e Salvador. COR-RIO aparece como opção de distribuição
de comunicados, não como instalação meteorológica.

### 4. Com que frequência os dados do painel são atualizados?

O servidor atualiza os dados periodicamente, sem enviar e-mail. O intervalo é
configurável; o padrão no código é **30 minutos**. A tela informa a hora da
última consulta bem-sucedida. Uma falha de consulta pode manter os últimos
dados válidos na tela e indicar que a atualização está pendente.

### 5. O botão de atualizar a página força uma nova consulta às fontes?

Não necessariamente. O painel lê o cache mantido pelo servidor e respeita o
intervalo de atualização. Se houver dados recentes em cache, recarregar a
página pode mostrar os mesmos dados.

### 6. O que significam “última atualização” e “atualização pendente”?

“Última atualização” indica quando os dados exibidos foram obtidos com sucesso.
“Atualização pendente” indica que a consulta mais recente falhou ou que os
dados passaram do intervalo esperado. Nessa situação, os dados anteriores
podem continuar visíveis, mas devem ser considerados com atenção à hora
informada.

### 7. Quais são os horários dos informativos?

As edições regulares são às **08h e às 15h**, no fuso `America/Sao_Paulo`.
Ambas são independentes. Em termos operacionais, a edição das 08h considera a
janela 08h–00h e a edição das 15h considera 15h–00h, no horário local da
instalação.

### 8. O painel envia um e-mail sempre que atualiza?

Não. A atualização periódica do painel apenas coleta e atualiza os dados. O
envio ocorre nos horários agendados, por ação manual autorizada ou por um dos
fluxos de alertas.

### 9. Qual é a diferença entre o painel, o PDF e o e-mail?

O painel é destinado à consulta rápida. O PDF apresenta mais detalhes,
incluindo fontes e horários de consulta. O e-mail é um resumo operacional:
não inclui as tabelas de vento e chuva por período, e a qualidade do ar, quando
disponível, é apresentada por classificação.

### 10. Como solicito a geração manual de um informativo?

No painel, use o botão de gerar e enviar, escolha o informativo da instalação
atual e informe a senha operacional. A ação gera e envia o relatório; não é
apenas uma prévia.

### 11. Posso gerar o aviso do COR-Rio pelo mesmo botão?

Sim. O menu permite escolher o aviso exclusivo do COR-Rio. Esse fluxo usa
destinatários vinculados especificamente a **COR-RIO — RJ**; não utiliza a
lista geral de destinatários dos informativos.

### 12. Onde encontro o PDF do informativo meteorológico gerado manualmente?

Após uma geração manual bem-sucedida do informativo meteorológico, o painel
fornece um link para o PDF. O link temporário vale por até **24 horas** e é
válido somente para aquele arquivo. Também é possível acessar PDFs autorizados
informando a senha operacional, quando solicitada. O fluxo do aviso COR-Rio é
um e-mail separado e não gera PDF.

### 13. Quem recebe os informativos?

Recebem o informativo os responsáveis vinculados à instalação correspondente.
Se nenhum responsável estiver cadastrado para uma instalação, a lista de
fallback `REPORT_RECIPIENTS` pode ser usada, conforme a configuração. Essa
lista não é fallback para avisos do COR-Rio nem para alertas extraordinários.

### 14. Quem recebe os alertas extraordinários?

Os alertas são enviados aos pontos focais vinculados à instalação afetada. O
sistema não usa a lista geral de fallback para esses alertas. Se não houver
destinatário vinculado, o envio não é realizado e a ocorrência fica registrada
para tratamento operacional.

### 15. Como cadastro ou altero responsáveis?

Use o botão **Responsáveis** no painel e autentique-se com a senha operacional.
É possível cadastrar responsáveis e associá-los a uma ou mais instalações. Uma
pessoa pode ser vinculada somente à instalação lógica COR-RIO, se essa for sua
atribuição.

### 16. Por que vejo nomes, mas não endereços de e-mail?

O painel pode exibir nomes de responsáveis sem autenticação. Os endereços de
e-mail só são revelados depois da autenticação no gerenciamento de
responsáveis.

### 17. O que dispara um alerta?

O sistema avalia avisos oficiais do INMET e indicadores meteorológicos
configurados, como chuva, rajada de vento e calor. Avisos oficiais válidos do
INMET têm precedência. Os níveis e as recomendações são gerados por regras
operacionais do CIM; o alerta não substitui procedimentos locais, o PRE, a
orientação da Defesa Civil ou a avaliação das equipes responsáveis.

### 18. O monitor de alertas funciona nos mesmos horários do informativo?

Não. É um fluxo independente. Por padrão, verifica as instalações a cada
**5 minutos** e opera continuamente, salvo configuração de janela ou
desativação. O primeiro ciclo registra uma linha de base (o estado inicial) e
não envia alertas retroativos. Eventos já enviados são deduplicados; falhas de
envio podem ser retentadas.

### 19. Por que uma condição grave pode não gerar um e-mail de alerta imediatamente após a inicialização?

O primeiro ciclo do monitor estabelece o estado inicial, sem disparar
notificações retroativas. Além disso, alertas extraordinários dependem de
destinatários vinculados à instalação e de fontes operacionais disponíveis.

### 20. Por que um nível de alerta ainda aparece depois de o indicador baixar?

Elevações de severidade são imediatas. Reduções e normalizações exigem leituras
válidas consecutivas e um período mínimo de estabilização, para evitar
oscilações causadas por uma leitura isolada. Falhas de fonte não contam como
leituras válidas.

## Fontes, indicadores e interpretação

### 21. Quais fontes meteorológicas e operacionais são consultadas?

| Fonte | Uso principal |
|---|---|
| INMET — previsão e avisos | Previsão municipal, condições gerais e avisos oficiais |
| INMET — estação automática | Temperatura, umidade, chuva e observações; medições observadas são separadas de previsões |
| Open-Meteo Forecast | Chuva prevista, probabilidade de chuva e complementos de previsão; pode servir de contingência para rajadas |
| Petrobras — OCEANOP | Rajada de vento prevista, quando a consulta para a instalação está disponível |
| Clima e Saúde — Ministério da Saúde | Indicadores de calor e saúde, incluindo o EHF |
| Open-Meteo Air Quality | UV e qualidade do ar, quando a integração e a licença/chave necessárias estão habilitadas |
| Open-Meteo Marine | Ondas e condições do mar em pontos cadastrados de instalações costeiras |
| ANA — Monitor de Secas | Mapa e resumo mensal da UF da instalação no relatório |
| COR-Rio | Estágio operacional e comunicados aplicáveis ao município do Rio de Janeiro |

### 22. As previsões e as observações são misturadas?

Não devem ser interpretadas como a mesma coisa. O sistema identifica a origem e
o horário dos dados. Por exemplo, rajadas observadas do INMET e rajadas
previstas por OCEANOP/Open-Meteo são tratadas separadamente; uma previsão não
deve ser lida como medição já observada.

### 23. O que acontece quando uma fonte está indisponível?

O sistema usa a contingência prevista para aquele indicador, quando aplicável.
Quando não há fonte substituta válida, o dado permanece indisponível, em vez de
ser inventado ou tratado como normal. Em falhas de coleta, o painel pode manter
os últimos dados válidos e sinalizar a atualização pendente.

### 24. A rajada prevista pode vir de outra fonte?

Sim. O OCEANOP é a fonte prioritária quando a consulta para a instalação é
bem-sucedida. A Open-Meteo Forecast pode ser usada como contingência quando o
OCEANOP falha ou não há ponto cadastrado. Uma resposta válida do OCEANOP sem
dado para determinado período não é completada automaticamente com outra fonte.
Consulte a indicação de procedência no relatório. A documentação técnica
registra que a unidade em nós e o fuso UTC são as configurações adotadas, mas
ainda aguardam confirmação formal da equipe OCEANOP.

### 25. O que significa “não se aplica” na seção do mar?

As informações de ondas são consultadas somente para instalações costeiras com
ponto marítimo cadastrado. Para instalações interiores, “não se aplica” é
esperado.

### 26. Por que qualidade do ar, UV ou ondas podem aparecer indisponíveis?

Essas integrações podem depender de habilitação de endpoint e de licença/chave
adequada. Também podem estar indisponíveis por falha ou falta de dado válido da
fonte. O sistema não deve substituir esses valores por estimativas não
identificadas.

### 27. O que é a seção do Monitor de Secas?

É um resumo mensal com mapa oficial e informação da UF correspondente à
instalação. Não representa uma previsão meteorológica diária.

### 28. O COR-Rio está disponível para todas as instalações?

Não. A integração de comunicados e estágio operacional é aplicável ao município
do Rio de Janeiro. Ela não deve ser interpretada como alerta municipal para as
outras localidades.

### 29. As classificações e recomendações substituem a orientação oficial?

Não. O sistema consolida fontes e aplica regras operacionais para apoiar a
consulta e a comunicação. Avisos oficiais do INMET mantêm precedência quando
válidos. Para decisões operacionais, siga os procedimentos locais, o PRE e as
orientações dos órgãos competentes.

### 30. Como leio os cartões da seção “Indicadores Meteorológicos”?

Cada cartão tem três linhas centralizadas: o ícone com o título, o valor em
destaque e, abaixo, a **fonte** efetivamente usada naquela leitura (por exemplo,
“Fonte: INMET”, “Fonte: Open-Meteo”, “Fonte: Open-Meteo Marine”,
“Fonte: Open-Meteo Air Quality” ou “Fonte: Clima e Saúde”). Quando não há fonte
identificada, aparece “Fonte: Indisponível”.

Se a medição observada não estiver disponível, o valor principal é exibido como
um traço (“—”). Quando existe uma estimativa, ela aparece logo abaixo, em
destaque, com identificação explícita (por exemplo, “Estimativa Open-Meteo ·
0,4 mm”). Um valor igual a zero é uma medição válida (“0 mm”) e não deve ser
confundido com dado indisponível.

As tabelas de mar, vento e chuva por período trazem a fonte no cabeçalho e
mantêm o link “Ver mais”. Em telas largas ficam lado a lado; em telas menores
são reorganizadas ou empilhadas.
