# Resultados — testes E2E e Playwright

- Data: 2026-11-13 · Alvo: harness `auditoria/harness/start-audit-server.js` (app real via `criarApp()`, **sem `.env`, sem agendadores, envio simulado, cadastro em arquivo temporário**). Nada foi enviado por e-mail/SharePoint e `data/` não foi tocado.

## Totais

| | Executados | Aprovados | Reprovados | Bloqueados |
|---|---|---|---|---|
| Suíte existente (`npm test`, 499 testes node:test) | 499 | 499 | 0 | 0 |
| E2E de API novos (`auditoria/testes-e2e/api-e2e.test.js`) | 71 | 70 | 0 | 1 |
| **Total automatizado** | **570** | **569** | **0** | **1** |

Reexecução do E2E de API: resultado idêntico, **sem intermitência**. Logs: `evidencias/logs/npm-test.log`, `testes-e2e-api.log`, `testes-e2e-api-repeticao.log`.
Comando do E2E (Node 24): `node --test "auditoria/testes-e2e/*.test.js"` (o diretório puro falha no Node 24). Requer o harness rodando: `node auditoria/harness/start-audit-server.js`.

**Bloqueado (1):** sucesso de `POST /api/gerar-relatorio` (200, `urlArquivo`/token, download do PDF). O stub do harness devolve um relatório que não passa em `validarDocumentoOperacional` (500). É limitação do harness, não bug. Precisa de homologação com pipeline real (envio para destinatário de teste).

## O que os 71 testes de API cobrem (todos aprovados)

- Login: senha correta, errada, ausente, tipo errado, gigante, sem corpo, na query string; atraso progressivo medido; senha correta nunca recebe 429.
- Autorização: 401 em todas as rotas protegidas sem/ com senha errada, inclusive `/relatorios/*` e path traversal.
- CRUD de responsáveis: obrigatórios, e-mail inválido, duplicado, limites 100/254/64, caracteres proibidos, JSON malformado, corpo >100 KB (413).
- 404 em JSON, base inválida (preview, cor-rio, gerar-relatorio), listagem pública sem e-mails, cabeçalhos de segurança.
- Concorrência: 2 e 3 chamadas simultâneas → exatamente uma aceita, demais 409, trava liberada depois.

Falhas durante o desenvolvimento dos testes eram erros dos próprios testes (trim de e-mail, `cidade[]=`, stub), já corrigidos. **Nenhum bug real da aplicação foi encontrado pelos testes de API.**

## Probes de UI com Playwright (MCP) — não são testes automatizados formais

Executados por scripts `browser_run_code` (o `@playwright/test` não está no projeto e não foi instalado). Sem traces (nenhuma falha a rastrear). Evidências em `evidencias/screenshots/`.

| Verificação | Resultado |
|---|---|
| Carregamento em 375×812, 430×932, 768×1024, 1366×768, 1920×1080 | OK; sem overflow horizontal; sem erros de console |
| Menu hambúrguer mobile | Abre (`aria-expanded=true`) |
| Diálogo Gerar e Enviar: foco inicial, aria-modal, ESC, retorno de foco | OK |
| Senha errada → "Senha incorreta." | OK |
| Estado de carregamento ("Gerando PDF…", botão desabilitado) | OK |
| Diálogo Responsáveis (mobile) abre com campo de senha | OK |
| Sucesso da geração na UI | **Não verificado** (limite do harness) |
| Telas Monitoramento, Sobre o CIM, Responsáveis desbloqueado, navegação voltar, rotas inexistentes na UI, recuperação de senha (não existe), expiração de sessão (não há sessão: senha por requisição) | **Não executados** na UI |

## Matriz de cobertura

Ver `evidencias/matriz-cobertura.md` (funcionalidade × testes existentes). Lacunas principais: sucesso do envio real, painel `public/dashboard-components.js`, comportamento do monitor sob falha real de fonte, e os achados A1/A3/M1–M9 (nenhum tem teste de regressão ainda).

## Regressão sugerida para bugs confirmados (a escrever na fase de correção)

- A1: renovação do painel não herda `horarioAgendado` (teste unitário de `atualizacaoDados.atualizar`).
- A4: aviso sem geocódigo de uma UF não derruba as demais bases (`buscarAvisosInmetParaBases`).
- A2: forecast usa host `customer-` com licença e falha sem licença.
- SEC-01: 10 tentativas simultâneas → atrasos crescentes (hoje falha).
