# FAQ — Protocolo Meteorológico CIM

**Guia rápido para quem recebe os informativos e os alertas por e-mail.**

Você recebe dois tipos de mensagem: o **informativo**, que chega em horários
fixos, e o **alerta**, que chega só quando algo muda. Este guia explica como
ler cada um e o que fazer. Confira sempre o horário da informação e siga os
procedimentos da sua equipe.

---

## Resumo em 30 segundos

| | Informativo | Alerta |
|---|---|---|
| **Quando chega** | Todo dia, às **08h** e às **15h** (horário de Brasília) | Só quando uma condição **muda** |
| **Para que serve** | Panorama do dia e do período | Avisar de uma mudança que exige atenção |
| **O que vem junto** | Resumo no e-mail e **PDF** com os detalhes | Cartão com o nível, o motivo e as recomendações |
| **Se não chegou nada** | Fale com a equipe administradora | Pode ser normal: sem mudança, não há e-mail |

**Os quatro níveis**, do mais calmo ao mais grave:

| Nível | Cor | O que significa |
|---|---|---|
| **NORMAL** | Verde | Sem condição que exija ação |
| **ATENÇÃO** | Amarelo | Condição a acompanhar; aplique as recomendações |
| **ALERTA** | Laranja | Risco maior; siga as recomendações com prioridade |
| **EMERGÊNCIA** | Vermelho | Risco grave; siga o protocolo da sua equipe e a Defesa Civil |

Em emergência, acione a Defesa Civil pelo **199**.

---

## Informativos

### Quando o informativo chega?
Duas vezes por dia, no horário de Brasília:
- **08h:** previsão das **08h às 00h**.
- **15h:** previsão das **15h às 00h**.

### Qual é a diferença entre o PDF e o e-mail?
- **E-mail:** resumo operacional, para leitura rápida.
- **PDF (anexo):** versão completa, com tabelas por período, fontes e horários
  de consulta. Quando precisar de um detalhe, abra o PDF.

### Quem recebe o informativo?
Os responsáveis cadastrados para a sua instalação. Se você deveria receber e
não recebe, peça à equipe administradora para conferir se o seu e-mail está
cadastrado na instalação correta.

### O que é o aviso do COR-RIO?
É um comunicado separado, sobre o município do Rio de Janeiro. Só recebe quem
foi cadastrado especificamente para essa distribuição. Ser destinatário do
informativo de uma instalação não inclui você automaticamente.

---

## Alertas

### Como é um e-mail de alerta?
O assunto traz o símbolo do nível, o fenômeno, o nível e a instalação.
Exemplo: `🟡 Índice UV — ATENÇÃO — Macaé/RJ`.

Dentro do e-mail há um cartão com:
- o **nível atual** e, quando houve mudança, de qual nível ele veio
  (por exemplo, NORMAL → ATENÇÃO);
- o **motivo**: o que foi detectado;
- a **vigência** (período de validade), quando o aviso é oficial do INMET;
- as **recomendações** do Protocolo Meteorológico para aquele nível.

### Quais tipos de alerta existem?
| Título do e-mail | Quando acontece |
|---|---|
| **Alerta meteorológico** | Surgiu uma condição nova ou o nível **subiu** |
| **Atualização de alerta** | O nível **baixou**, mas a condição ainda apresenta risco |
| **Normalização** | A condição voltou ao nível **Normal** |

### O que o sistema monitora?
Avisos oficiais do INMET (como tempestade) e condições de chuva, vento, calor,
índice UV, qualidade do ar, umidade e mar, conforme a instalação.

### Qual é a diferença entre "aviso oficial" e "classificação interna"?
- **Aviso oficial (INMET):** emitido pelo órgão oficial. Vem com a
  **vigência** (início e fim, no formato DD-MM-AAAA) e as orientações do INMET.
- **Classificação interna:** feita pelo sistema a partir da **previsão**, com os
  limites do protocolo. O cartão informa que é uma classificação baseada na
  previsão e não um aviso oficial.

### Com que frequência o sistema verifica as condições?
**A cada hora**, das **05h às 22h**. A verificação acontece o tempo todo nesse
horário, mas o e-mail só sai quando há mudança.

### Por que não recebi nenhum alerta hoje?
Normalmente porque **nada mudou**. O sistema não repete o mesmo alerta: ele só
envia quando o nível sobe, desce ou volta ao normal. Outros motivos possíveis:
- você não está cadastrado como ponto focal da instalação afetada;
- logo após o sistema ser iniciado, ele registra a situação existente como
  ponto de partida e **não** envia alertas retroativos;
- as fontes de dados estavam indisponíveis naquele momento.

### Por que recebi um alerta de UV só depois do pico?
O alerta de **índice UV** só é enviado **antes do horário previsto para o
pico**. Depois do pico não há mais o que fazer, então o sistema não envia.
Por isso o e-mail de UV não traz uma "janela" de horário; o pico previsto
aparece no texto, quando disponível.

### Por que o UV não avisa que "normalizou" de manhã?
O UV é uma **previsão máxima do dia**. Quando o dia vira, a previsão nova
substitui a do dia anterior, e isso não é uma melhora real. O sistema registra
essa troca em silêncio. Só envia "normalização" quando o alerta foi enviado
**no mesmo dia**.

### Por que o alerta continua depois que o indicador baixou?
O sistema **sobe o nível na hora**, mas só **baixa** depois de confirmar a
melhora com **leituras seguidas**: 2 para o UV e 3 para chuva, vento e calor.
Isso evita avisos que mudam por causa de uma medição isolada. Como a
verificação é de hora em hora, a confirmação leva algumas horas.

### Recebi uma "atualização", mas vejo o mesmo nível. O que mudou?
Uma atualização só é enviada quando algo relevante muda: o **nível**, o
**texto do motivo** ou as **instruções oficiais**. Se o INMET apenas reemitir o
mesmo aviso com outro número ou nova vigência, o sistema **não** envia e-mail.
Compare o novo cartão com o anterior para ver o que mudou.

### Quem recebe os alertas?
Os pontos focais cadastrados para a **instalação afetada**. Diferentemente do
informativo, o alerta não usa uma lista geral de destinatários.

---

## Entendendo os dados

### Qual é a diferença entre observação e previsão?
- **Observação:** medição já registrada por uma estação.
- **Previsão:** estimativa para um período futuro.

Não trate uma previsão como se fosse uma medição já feita. O e-mail e o PDF
indicam a fonte e deixam claro quando o valor é uma estimativa.

### O que significam o traço, o zero e a estimativa?
- **Traço (—):** não há medição válida disponível.
- **Zero (por exemplo, 0 mm):** é um valor **medido**; não significa dado
  ausente.
- **Estimativa:** aparece separada e identificada, com a fonte.

### De onde vêm as informações?
| Fonte | Em termos simples |
|---|---|
| **INMET** | Previsões, avisos oficiais e medições de estações |
| **Open-Meteo** | Complemento de previsão, índice UV e qualidade do ar |
| **OCEANOP** | Previsão de rajadas de vento, quando existe para a instalação |
| **Clima e Saúde (Ministério da Saúde)** | Indicador de calor excessivo (EHF) e saúde |
| **Open-Meteo Marine** | Ondas e condições do mar em pontos costeiros |
| **ANA — Monitor de Secas** | Situação mensal de seca por estado |
| **COR-Rio** | Estágio operacional e comunicados do município do Rio de Janeiro |

Nem toda fonte se aplica a toda instalação.

### O que é o calor / risco à saúde?
É um alerta baseado no **EHF**, indicador do Ministério da Saúde que mede o
excesso de calor. Ele é separado da temperatura do dia e tem protocolo e
recomendações próprios.

### Por que não vejo dados do mar na minha instalação?
Ondas só são consultadas para instalações **costeiras** com ponto marítimo
cadastrado. Para as demais, "não se aplica" é esperado.

### O Monitor de Secas mostra a previsão de hoje?
Não. Ele traz a situação **mensal** da ANA para o estado. A ANA publica o mapa
de um mês no mês seguinte; portanto, ele não é uma previsão diária.

---

## Importante

### Os alertas e as recomendações substituem a orientação oficial?
**Não.** O sistema reúne informações e apoia a comunicação, mas não substitui
avisos oficiais, procedimentos locais, o PRE, a Defesa Civil ou a avaliação das
equipes responsáveis. Os alertas passam por revisão humana antes de uso
operacional. Em caso de dúvida, siga o procedimento da sua equipe.

### Com quem falo se algo estiver errado?
Com a **equipe administradora** do sistema. Ela pode:
- incluir ou corrigir o seu cadastro como responsável de uma instalação;
- conferir por que um e-mail não chegou;
- esclarecer um dado que pareça incorreto.

Informe a **instalação**, o **horário** e, se possível, o **assunto do e-mail**.
