# Matriz de cobertura: funcionalidade x testes

Base: leitura de server.js, public/dashboard.js e dos nomes/asserts de tests/*.test.js. A suite existente NAO foi executada por este agente.
Legenda: Unit/Integ = tests/ existentes (lidos, nao rodados); E2E-API = auditoria/testes-e2e/api-e2e.test.js (executado).

| Funcionalidade (rota/fluxo) | Testes existentes em tests/ | E2E-API (auditoria) | Lacuna |
|---|---|---|---|
| GET /api/preview (base valida, cache, 502) | atualizacaoDados, painelConteudoEmail, openMeteo*, reportBuilderDegraded | base invalida 400 (8 entradas + parametro repetido); base valida macae (200 ou skip por ambiente) | 502 controlado so tolerado, nao forcado |
| GET /api/cor-rio | corRio.test.js (so base Rio; nao-Rio) | base invalida 400; macae -> aplicavel:false; no-store | Rio real depende de fonte externa: nao testado |
| GET /api/cidades | corRio, novasLocalidades | estrutura, corRio=true no Rio, ativa existe | - |
| GET /api/monitoramento/saude | inmetMonitorHealthApi | 200, sem vazamento | - |
| POST /api/verificar-senha | senhaObrigatoria, tentativasSenha (HTTP) | correta/errada/ausente/tipo errado/gigante/sem corpo/query string; atraso progressivo medido | - |
| Atraso progressivo / TRUST_PROXY | tentativasSenha (unit + HTTP) | atraso real 0,5s/1s/2s e reset | TRUST_PROXY nao testavel no harness |
| POST /api/gerar-relatorio auth | gerarRelatorioApi (401, 200, falhas por etapa, cor_rio) | 401 sem/errada senha, stage=authorization, base invalida 400 | - |
| POST /api/gerar-relatorio sucesso | gerarRelatorioApi (com pipeline mockado) | BLOQUEADO (stub do harness gera 500) | caminho 200/urlArquivo/token nao verificado em E2E |
| Concorrencia gerar-relatorio (409) | nao localizado nos nomes lidos | 2 e 3 chamadas simultaneas; liberacao do lock | - |
| GET /relatorios/:arquivo | controleAcesso (401, Basic, token, traversal, expiracao) | 401+WWW-Authenticate, token invalido, Basic errado/correto sem arquivo (404), traversal | download real de PDF com token nao testado (harness) |
| GET /api/responsaveis (publico) | controleAcesso (so nomes) | sem '@' em todas as bases e por base; base invalida; parametro duplicado | - |
| POST /api/responsaveis/consultar | controleAcesso | 401, com senha (emails, basesDisponiveis), base invalida | - |
| POST/PUT/DELETE /api/responsaveis | recipientsValidacao, responsaveisBases | sem/errada senha; obrigatorios; e-mail invalido (14 formatos); duplicado; limites 100/254/local 64; chars proibidos; vinculo de bases; remocao; JSON malformado; >100kb; text/plain; corpos nao-objeto | - |
| Rotas inexistentes / handler de erro | errorHandler | 404 JSON, metodos errados, URL malformada, arquivos sensiveis, traversal estatico | - |
| Cabecalhos de seguranca | cabecalhosSeguranca (HSTS, FRAME_ANCESTORS, HTML sem inline) | CSP/nosniff/XFO/Referrer em estaticos, API e erros; sem x-powered-by; sem HSTS em HTTP | HSTS/HTTPS e FRAME_ANCESTORS nao testaveis no harness |
| HTTPS / redirecionamento | https.test.js | - | fora do escopo do harness |
| Schedulers, e-mail, SMTP, PDF, alertas INMET, OceanOp etc. | muitos arquivos (alert*, smtpTls, pdf*, inmet*, oceanop...) | - | nao exercitavel sem enviar e-mail real; fora de escopo |
| UI do painel (dashboard.js: seletor de base, modais senha/responsaveis, detalhes) | frontendEscape, responsaveisUi, painelOcorrencias, painelConteudoEmail (unit/jsdom-like) | - | UI via navegador: tratada pelo coordenador (Playwright), nao por este agente |
