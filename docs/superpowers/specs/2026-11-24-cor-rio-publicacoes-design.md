# COR-Rio: avisos rápidos para todas as publicações

## Solicitação

Enviar o aviso COR-Rio assim que houver alteração no site oficial. O usuário confirmou que o escopo inclui qualquer publicação, inclusive trânsito e notícias, além dos estágios operacional e de calor.

## Situação atual

O monitor compartilha o agendamento dos demais alertas. O `.env` local configura consultas a cada 60 minutos. Somente mudanças nos números dos estágios geram envio. A coleta de posts limita as categorias a Estágios e Prevenção e Operação; o e-mail seleciona um comunicado meteorológico do dia. Alterar somente o intervalo não atende à solicitação.

## Alternativas

- Notificação enviada pelo próprio COR-Rio: permitiria reagir ao evento sem consultas periódicas, mas não foi encontrada documentação pública de webhook ou fluxo de eventos para esta integração. Dependeria de acesso fornecido pelo COR-Rio.
- Consultar o HTML inteiro: mistura publicações com elementos dinâmicos e alterações de apresentação; pode gerar avisos sem conteúdo novo.
- Consultar as fontes oficiais de estágios e a API de publicações, sem restrição de categorias: permite identificar conteúdo novo e editado e evitar duplicações. É a proposta recomendada; depende da disponibilidade e atualização dessas fontes.

## Desenho proposto para aprovação

1. Criar um ciclo exclusivo COR-Rio, independente do intervalo e da janela dos outros alertas, ativo 24 horas por dia. Proposta do implementador: intervalo configurável de 15 segundos. Preservar o interruptor geral de alertas automáticos e oferecer configuração específica para o COR-Rio.
2. Consultar os estágios e todas as categorias de publicações. Preservar a seleção meteorológica usada no painel e nos relatórios gerais, criando uma coleta própria para o acompanhamento amplo.
3. Enviar por publicação nova, edição de publicação ou mudança de estágio, incluindo reduções. Mudanças no layout, relógios, anúncios, exclusão de posts e outras alterações sem publicação não integram esta proposta.
4. No início, registrar a situação atual como referência, sem disparar notícias antigas. Persistir a referência para preservar a detecção após reinícios. Buscar atualizações com paginação e sobreposição temporal para não depender somente da primeira página; não usar a janela meteorológica de 24 horas como histórico de deduplicação.
5. No e-mail, mostrar os títulos, conteúdos oficiais e links das publicações detectadas, com data de publicação/edição e estágios consultados. Agrupar alterações do mesmo ciclo em um aviso. Não aplicar o filtro de comunicado meteorológico do dia a notícias ou trânsito.
6. Manter a distribuição exclusiva aos responsáveis ativos vinculados a `cor_rio`, sem PDF. Não alterar os informativos das 08h e 15h.
7. Evitar consultas sobrepostas e reenvio de atualizações já confirmadas. Avançar a referência de notificação somente após confirmação do envio. Falhas de fonte não representam mudanças; falhas de envio permanecem pendentes para nova tentativa. Aplicar espera progressiva em indisponibilidade ou limitação HTTP, sem prometer intervalo fixo durante falhas.

## Limites e decisões pendentes

O intervalo de 15 segundos é uma proposta, não uma garantia de entrega em 15 segundos. A detecção também depende de cache e disponibilidade do COR-Rio, duração das consultas e processamento; a entrega depende do SMTP. Uma mudança publicada e retirada entre duas consultas pode não ser observada. Envio estritamente instantâneo requer uma integração de eventos oferecida pelo COR-Rio, ainda não identificada.

A leitura da página oficial foi possível na etapa de proposta; a tentativa de consultar a API pelo navegador de pesquisa falhou nessa etapa. Após aprovação do usuário, a API real foi validada com Node.js: resposta operacional e filtro de edição funcionando, sem envio de e-mails. A implementação testa a paginação com respostas controladas, incluindo edições durante a consulta.

## Verificação planejada

Testar detecção de notícias e trânsito, edições, mudanças de estágio, inicialização silenciosa, reinício, paginação, duplicação, falhas parciais de coleta e SMTP, e independência do agendamento geral. Verificar que o e-mail mostra a publicação que disparou o aviso. Rodar a suíte do projeto e relatar eventuais falhas.
