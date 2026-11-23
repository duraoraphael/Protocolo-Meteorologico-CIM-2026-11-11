# Central de Gerenciamento de Destinatários

Acesse **Responsáveis** no painel, informe o nome do operador e a senha operacional existente. O operador é uma **identificação declarada**, não uma conta individual autenticada. Os dados administrativos e a credencial são descartados da sessão ao fechar a central.

## Pessoas e instalações

As abas Pessoas, Instalações e Histórico utilizam a lista completa de `src/config/distributionBases.js`, incluindo COR-RIO. Pessoas permite pesquisa por nome, e-mail ou instalação, filtros combinados, ordenação, paginação e seleção que atravessa páginas. O checkbox do cabeçalho seleciona apenas a página atual. As ações em massa usam a seleção completa, mesmo se parte dela estiver em outra página ou fora dos filtros atuais; o contador informa esse total.

Editar permite alterar nome, e-mail e instalações. Ativar/desativar preserva os vínculos. Excluir remove o cadastro e os vínculos após confirmação. Na aba Instalações, selecione uma instalação para ver suas pessoas; **Adicionar destinatários** permite selecionar pessoas existentes e confirmar os vínculos. Para criar pessoas, use **+ Adicionar destinatários**.

O botão **Adicionar destinatários** abre as opções Individual, Em lote e Importar planilha. O menu funciona com Tab, setas e Escape; ao fechar o formulário, o foco retorna ao botão. A tabela exibe avatar e até duas instalações por pessoa; **+N** permite abrir os demais vínculos. Quando o cadastro não tem nome, ou um cadastro antigo usa o próprio e-mail como nome, o endereço aparece uma vez acompanhado de **Nome pendente**. No celular, as linhas se organizam em cartões e o controle **Selecionar página** permanece visível.

Na aba Instalações, a pesquisa por nome/UF e os filtros **Todas**, **Com destinatários** e **Sem destinatários** têm contagens dinâmicas. Esses controles não alteram os filtros de Pessoas. O Histórico apresenta data, operador, tipo de ação, destinatário, instalação e detalhes, com filtro específico de usuário responsável além dos filtros de período, pesquisa e ação.

## Cadastro e planilhas

O cadastro individual, em lote e a importação sempre apresentam uma prévia. O lote aceita e-mails separados por `;` e quebras de linha; os nomes podem ser preenchidos por linha na prévia. Registros sem nome ficam como **Nome pendente**. Inválidos e repetidos aparecem identificados e não ficam selecionáveis. Para existentes, escolha ignorar ou acrescentar vínculos; esta opção preserva nome, status e instalações já cadastradas.

Importação: CSV UTF-8 ou primeira aba de XLSX, até **1 MB e 500 pessoas por operação**. Baixe o modelo no formato desejado. Cabeçalhos aceitos:

| Coluna | Conteúdo |
| --- | --- |
| `nome` | Opcional, até 100 caracteres, conforme validação já existente |
| `email` | Obrigatório, único sem diferenciar maiúsculas/minúsculas |
| `instalacoes` | Opcional, chaves da configuração separadas por `|`, por exemplo `santos|cor_rio` |

As chaves aparecem junto das instalações no formulário. CSV admite separador `;` ou `,`, campos entre aspas e aspas duplicadas. XLSX aceita células textuais, inclusive shared strings; fórmulas, tipos inesperados e recursos externos/embutidos são rejeitados. Os limites incluem arquivos compactados e conteúdo efetivamente descompactado. A exportação CSV neutraliza valores que poderiam ser interpretados como fórmulas; XLSX grava células como texto. A exportação contém nome, e-mail e instalações e pode usar a lista filtrada ou a seleção de pessoas.

Confira a prévia e confirme apenas os registros desejados. O relatório final mostra sucessos, falhas e ignorados do conjunto enviado, com resultado por endereço. O servidor revalida todos os registros antes de gravar: um erro de validação aborta todo o conjunto, sem gravação parcial.

## Persistência, auditoria e distribuição

Foi mantido `data/responsaveis.json` (ou `RESPONSAVEIS_ARQUIVO`). Formatos históricos continuam legíveis; abrir a central não regrava o arquivo. Pessoas antigas são consideradas ativas. As mutações gravam cadastro, histórico e recibo de idempotência juntos, por arquivo temporário e renomeação. Vínculos históricos com instalações desativadas continuam preservados, sem reaparecer como novas opções de distribuição.

O histórico contém operador, tipo de identificação, horário, ação e valores anteriores/novos, com filtros por pesquisa, ação e datas de Brasília. Operações pelas rotas legadas também geram auditoria, identificadas como acesso operacional compartilhado quando não há operador declarado. Não há reconstrução de histórico anterior à implantação, nem registro de senha ou token.

Cada operação da central utiliza um identificador persistente. Repetir o mesmo identificador e conteúdo devolve o recibo anterior; reutilizá-lo para outro conteúdo retorna 409. O navegador preserva o identificador ao repetir uma solicitação que falhou na comunicação.

As consultas usadas no envio diário, semanal, alertas e COR-RIO respeitam o status ativo. Os horários e as regras de separação das listas não foram alterados. O fallback existente permanece, excluindo endereços explicitamente desativados. Desativação não cancela mensagens já entregues ao SMTP nem trabalhos que já capturaram uma lista de destinatários.

O armazenamento em JSON continua adequado ao modelo atual de **um processo gravador**. Réplicas compartilhando o mesmo arquivo exigem um banco transacional ou coordenação de escrita antes de serem habilitadas. O histórico e os recibos devem ser incluídos no backup e protegidos pelas permissões do servidor; não são uma trilha imutável contra quem administra o próprio arquivo.

## Verificação

`npm test` executa a suíte do projeto, incluindo serviço, API, validação de importação, lotes de 500 registros, idempotência concorrente e regressões de distribuição. `node scripts/verificarCentralDestinatarios.js` verifica o fluxo em Chrome/Puppeteer, em desktop e celular, com arquivo de destinatários temporário e consultas meteorológicas externas bloqueadas. O script não inicia agendamentos nem envia e-mail e salva capturas em `output/central-desktop.png` e `output/central-celular.png`.

O smoke do redesign também verifica 1920×1080, 1366×768, 1280×720, 768×1024 e 390×844, sem rolagem horizontal, e salva `output/central-pessoas-<largura>.png` e `output/central-instalacoes-<largura>.png`. Ele usa dados sintéticos suficientes para paginação, nomes pendentes, endereços longos e muitos vínculos. Verifica seleção no celular, retorno de foco, filtro de operador, ordenação, exportação (com download bloqueado no teste), cancelamento e confirmação de exclusão. A implementação reutiliza os ícones do painel e renderizadores em `public/destinatarios-ui.js`, com estilos restritos ao modal em `public/destinatarios.css`; não foram adicionadas dependências no redesign.

## Arquivos do redesign

| Arquivos | Responsabilidade |
| --- | --- |
| `public/dashboard.html`, `public/destinatarios.css` | Estrutura do modal, paleta local, painéis e responsividade |
| `public/destinatarios-ui.js` | Indicadores, avatares, vínculos, badges, linhas de pessoas, cards e eventos do histórico |
| `public/destinatarios.js` | Menu acessível, filtros de instalações, sincronização de seleção e retorno de foco |
| `public/dashboard-components.js` | Ícones adicionais no catálogo já existente |
| `src/recipients/management.js` | Filtro opcional por operador na consulta de histórico existente; sem mudanças de rota ou persistência |
| `tests/destinatariosUi.test.js`, `tests/destinatarios.test.js`, `tests/helpers/fakeDom.js` | Testes dos renderizadores e filtro de operador |
| `scripts/verificarCentralDestinatarios.js` | Smoke funcional e capturas nas cinco resoluções |

Em 23/11/2026, a suíte completa passou com **541 testes, zero falhas e zero ignorados**, além do smoke real. O anexo de redesign recebido continha somente texto; as duas imagens citadas não estavam anexadas e a comparação visual direta com elas continua pendente.
