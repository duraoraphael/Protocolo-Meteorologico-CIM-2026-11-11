# Central de destinatários — plano de implementação

**Objetivo:** implementar o pedido anexado de 23/11/2026 no painel existente.

**Arquitetura:** Express e JavaScript do projeto; manter `data/responsaveis.json`, compatibilidade com os formatos antigos e a configuração `distributionBases`. Armazenar status, auditoria e resultados idempotentes no mesmo documento, com gravação temporária e troca atômica. Nenhum cadastro real será modificado durante o desenvolvimento.

**Decisões:** manter senha operacional, com operador declarado explicitamente identificado no histórico. Não introduzir contas individuais. Pessoas antigas continuam ativas. A desativação passa a ser respeitada pelas consultas usadas nos envios, mantendo os mecanismos de fallback existentes. Preservar vínculos históricos desativados. Trabalhar no checkout solicitado pelo usuário, sem publicar ou realizar envios reais.

**Alternativas:** banco de dados e autenticação individual acrescentariam migração e infraestrutura fora do pedido. A evolução compatível do armazenamento atual atende esta instalação de processo único; múltiplos processos gravadores exigiriam banco transacional.

## Etapas

- [x] 1. Testes de serviço/API em arquivos temporários: prévia, duplicados, validação, edição, status, vínculos, auditoria, idempotência, atomicidade e acesso.
- [x] 2. Evoluir `src/config/recipients.js` e adicionar serviço administrativo. Mutação validada integralmente antes de uma única gravação. Leituras de envio excluem inativos; leitura administrativa preserva todos.
- [x] 3. Importação CSV/XLSX e exportação: limites de tamanho/linhas, cabeçalhos e instalações validados no servidor, prévia obrigatória, proteção de fórmulas em planilhas.
- [x] 4. Integrar rotas protegidas no `server.js`, inclusive auditoria das rotas legadas e filtragem de e-mails usados como nome na consulta pública.
- [x] 5. Central responsiva com abas Pessoas, Instalações e Histórico; pesquisa com debounce, filtros, paginação, seleção e confirmação em lote. Formulários e diálogos acessíveis, edição multicoluna e estados de processamento.
- [x] 6. Executar testes focados, suíte completa e fluxo visual com dados sintéticos. Revisar alterações e documentar uso/limitações.

## Verificação prioritária

Reenvio de uma operação não duplica auditoria; chave reutilizada com corpo diferente retorna conflito. Erro de validação não grava parcialmente. Importação não executa fórmulas e rejeita arquivos grandes/malformados. Nenhuma rota pública revela e-mail usado como nome. Desativação e reativação preservam vínculos e são refletidas nos destinatários de diário, semanal, alertas e COR-RIO.

## Execução

Reutilizada a inspeção anterior; falha preexistente confirmada em `controleAcesso.test.js`: nomes históricos contendo e-mail expostos pela leitura pública. Execução direta conforme o pedido reiterado de implementação.


Verificação final: 536 testes aprovados, zero falhas e zero ignorados com Chrome habilitado. Smoke da central aprovado em desktop/celular, incluindo CSV/XLSX, lote misto, edição de e-mail com seleção preservada e vinculação pela instalação. Revisão independente corrigiu limite do payload, expansão ZIP, auditoria de troca de e-mail e seleção visual. Nenhum envio real executado; testes com cadastros temporários e SMTP simulado.
