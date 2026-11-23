# Redesign visual da central CIM

**Objetivo:** aplicar o pedido de redesign de Pessoas, Instalações e Histórico na implementação existente. O anexo recebido contém somente texto; a fidelidade às duas imagens não pode ser aferida sem os arquivos visuais.

**Arquitetura:** manter HTML/CSS/JavaScript e Express existentes, sem novas dependências. Extrair renderizadores de apresentação em `public/destinatarios-ui.js`, reutilizando `Dashboard.icon` e `Dashboard.escape`. Concentrar a paleta e os estilos em `#overlay-responsaveis`, sem afetar o restante do painel. Não alterar armazenamento, integrações ou distribuição.

**Decisões:** modal com cabeçalho compacto e botão fechar sempre acessível; uma área principal de rolagem; indicadores com ícones; filtros em painel de duas linhas; seleção compacta; tabela com avatares, vínculos recolhidos e ações discretas; cards de instalações com pesquisa e filtros locais, até quatro colunas; histórico em tabela com filtros existentes e filtro específico de operador. Este último requer apenas um filtro opcional na consulta já existente para manter totais/paginação corretos; não muda rotas nem persistência.

## Etapas

- [x] Testes de apresentação para nome pendente/e-mail legado, escape, vínculos recolhidos, status, contagens de instalações, histórico e filtro de operador.
- [x] Extrair renderizadores, ampliar o catálogo atual de ícones e integrar sem mudar mutações.
- [x] Reorganizar HTML e CSS localizados: menu de cadastro, painéis, tabelas, cards e modais responsivos.
- [x] Ampliar smoke real com dados temporários: menu, filtros, ordenação, paginação, seleção, CSV/XLSX, vínculos, exclusão confirmada e histórico.
- [x] Verificar 1920×1080, 1366×768, 1280×720, tablet e celular; executar a suíte completa; revisar e documentar.

## Critérios

Dados e vínculos reais intocados. Nenhum envio real. Sem rolagem horizontal na viewport ou nas tabelas da central; no celular, linhas devem se reorganizar em cartões mantendo os cabeçalhos semânticos. Controles devem permanecer acessíveis por teclado, com foco visível e confirmação de alterações. A seleção precisa sobreviver às atualizações. Pesquisas das instalações não devem interferir nos filtros de Pessoas.


Verificação final: 541 testes aprovados, zero falhas e zero ignorados com Chrome habilitado. Smoke real aprovado nas cinco resoluções, cobrindo menu por teclado, retorno de foco, vínculos recolhidos, busca por e-mail, filtros locais e de status, paginação, seleção da página no celular, importação CSV/XLSX, ordenação, exportação e exclusão cancelada/confirmada. Revisão independente levou a manter visível a seleção da página no celular e restaurar explicitamente o foco do cadastro. Sem novas dependências, cadastros reais intocados e nenhum envio real.
