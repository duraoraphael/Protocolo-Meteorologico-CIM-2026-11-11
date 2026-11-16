# FAQ — Protocolo Meteorológico CIM

**Dúvidas frequentes sobre os informativos e os alertas.**

Este guia explica como consultar as informações e o que fazer nas situações
mais comuns. O sistema reúne dados de diferentes fontes; por isso, confira
sempre o horário da última atualização e siga os procedimentos operacionais da
sua equipe.



## Informativos e e-mails

### 8. Quando os informativos são enviados?

Quando o agendamento automático está habilitado, há edições às **08h e às
15h**, no horário de Brasília. A edição das 08h traz previsão para o período
das **08h às 00h**; a edição das 15h cobre das **15h até 00h**.

### 9. Qual é a diferença entre o PDF e o e-mail?

- **PDF:** relatório mais detalhado, com fontes e horários de consulta.
- **E-mail:** resumo operacional. Ele não inclui as tabelas de vento e chuva
  por período; a qualidade do ar, quando disponível, aparece por classificação.

### 10. O painel envia um e-mail quando os dados são atualizados?

Não. A atualização periódica serve apenas para atualizar as informações do
painel. Os e-mails são enviados pelo agendamento, por uma ação manual autorizada
ou pelos fluxos de alerta.

### 11. Como gero um informativo manualmente?

Selecione a instalação desejada e use **Gerar e enviar**. Depois, escolha o
tipo de envio e informe a senha operacional quando solicitada.

**Atenção:** essa ação gera e envia o relatório; não é apenas uma prévia.

### 12. Como recebo o informativo da minha instalação?

Os informativos são enviados aos responsáveis cadastrados para a instalação.
Se não houver responsáveis cadastrados, o sistema pode usar a lista geral de
destinatários configurada pela equipe administradora. Essa lista não é usada
para o COR-RIO nem para os alertas extraordinários.

Se você deveria receber um e-mail e não recebeu, confirme com a equipe
administradora se seu endereço está cadastrado para a instalação correta.

### 13. Onde encontro o PDF que gerei pelo painel?

Após uma geração manual bem-sucedida de um informativo meteorológico, o painel
disponibiliza um link para o PDF. Esse link temporário vale por até **24 horas**
e dá acesso somente àquele arquivo. Também é possível acessar relatórios
autorizados com a senha operacional, quando solicitada.

O aviso do COR-RIO é enviado em um fluxo separado e não gera esse PDF.

### 14. O que é o aviso do COR-RIO?

É um comunicado separado, destinado ao município do Rio de Janeiro. Selecione
**COR-RIO — RJ** no fluxo de geração para enviá-lo. O aviso é encaminhado
somente aos responsáveis cadastrados especificamente para essa distribuição;
os destinatários dos informativos meteorológicos não são incluídos
automaticamente.

## Alertas

### 15. Qual é a diferença entre um alerta e um informativo?

Os informativos são edições programadas. Os alertas extraordinários são
monitorados em um fluxo independente, que pode verificar avisos oficiais do
INMET e condições configuradas de chuva, vento e calor. Por padrão, o monitor
faz verificações a cada **5 minutos**, mas a equipe administradora pode alterar
essa configuração.

### 16. Por que não recebi um alerta por e-mail?

O envio depende de haver um responsável cadastrado para a instalação afetada e
de as fontes necessárias estarem disponíveis. Além disso, no primeiro ciclo
após a inicialização, o monitor registra a situação existente como referência
inicial; ele não envia notificações retroativas para condições que já estavam
presentes.

### 17. Quem recebe os alertas extraordinários?

Os pontos focais cadastrados para a instalação afetada. Diferentemente do
informativo regular, o alerta não usa a lista geral de destinatários como
alternativa.

### 18. Por que um alerta continua aparecendo mesmo depois que o indicador baixou?

O sistema eleva o nível de alerta assim que identifica uma piora. Para reduzir
ou encerrar o alerta, ele exige novas leituras válidas e um período de
estabilização. Isso evita mudanças causadas por uma única medição isolada.

## Entendendo os dados

### 19. Qual é a diferença entre uma observação e uma previsão?

Uma **observação** é uma medição já registrada por uma estação. Uma
**previsão** é uma estimativa para um período futuro. O painel e os relatórios
identificam a fonte e, quando aplicável, deixam claro quando o valor é uma
estimativa. Não interprete uma previsão como uma medição já realizada.

### 20. O que significam o traço, o zero e a estimativa?

- **Traço (—):** não há uma medição observada válida disponível.
- **Zero (por exemplo, 0 mm):** é um valor medido; não significa dado ausente.
- **Estimativa:** é apresentada separadamente e identificada como estimativa,
  com a respectiva fonte, quando disponível.

### 21. Quais fontes de informação o sistema consulta?

Dependendo do indicador e da instalação, o sistema pode consultar:

| Fonte | Em termos simples |
|---|---|
| INMET | Previsões, avisos oficiais e medições de estações meteorológicas |
| Open-Meteo | Complementos de previsão e, quando habilitados, dados de qualidade do ar |
| OCEANOP | Previsão de rajadas de vento, quando disponível para a instalação |
| Clima e Saúde — Ministério da Saúde | Indicadores relacionados a calor e saúde |
| Open-Meteo Marine | Ondas e condições do mar em pontos costeiros cadastrados |
| ANA — Monitor de Secas | Informações mensais sobre seca por estado |
| COR-Rio | Estágio operacional e comunicados aplicáveis ao município do Rio de Janeiro |

Nem todas as fontes se aplicam a todas as instalações ou a todos os indicadores.

### 22. Por que os dados do mar não aparecem para algumas instalações?

As informações de ondas são consultadas somente para instalações costeiras com
um ponto marítimo cadastrado. Para outras localidades, a indicação de que não
se aplica é esperada.

### 23. O Monitor de Secas mostra a previsão para hoje?

Não. Ele apresenta informações mensais da ANA para o estado relacionado à
instalação; não é uma previsão meteorológica diária.

### 24. Os alertas e as recomendações substituem a orientação oficial?

Não. O sistema ajuda a reunir informações e apoiar a comunicação, mas não
substitui avisos oficiais, procedimentos locais, o PRE, a Defesa Civil ou a
avaliação das equipes responsáveis. Em uma situação operacional, siga os
procedimentos aplicáveis à sua equipe.

## Para quem administra o sistema

### 25. Como cadastro ou atualizo um responsável?

No painel, abra **Responsáveis** e autentique-se com a senha operacional.
Cadastre a pessoa e associe-a a uma ou mais instalações. Para receber avisos
do COR-RIO, ela precisa estar vinculada especificamente a **COR-RIO — RJ**.

### 26. Por que vejo o nome de um responsável, mas não o e-mail?

Por segurança, o painel pode mostrar os nomes sem autenticação. Os endereços de
e-mail ficam disponíveis somente no gerenciamento autenticado de responsáveis.

### 27. Posso adicionar ou editar uma instalação pelo painel?

Não. O seletor mostra as instalações cadastradas no sistema, mas a interface
não permite criar ou editar esse cadastro. Peça à equipe responsável para
atualizar a configuração do projeto.
