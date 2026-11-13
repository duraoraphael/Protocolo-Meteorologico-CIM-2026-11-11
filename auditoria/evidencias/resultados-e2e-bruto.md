# Resultados E2E API (bruto)

Arquivo: auditoria/testes-e2e/api-e2e.test.js (node:test + fetch, sem dependencias), alvo http://127.0.0.1:3999.
Comando: `node --test "auditoria/testes-e2e/*.test.js"` (em Node v24 passar o diretorio puro `auditoria/testes-e2e/` falha com "test failed": o runner trata o argumento como modulo; use o glob).
Logs: auditoria/evidencias/logs/testes-e2e-api.log (execucao final) e testes-e2e-api-repeticao.log (repeticao).

## Totais (execucao final)
- Executados: 71 | Aprovados: 70 | Reprovados: 0 | Bloqueados/skip: 1
- Repeticao: identico (71/70/0/1). Sem intermitencia observada na execucao final.
- Tempo ~10 s.

## Bloqueado (1)
- "gerar-relatorio com senha correta ... caminho 200 BLOQUEADO": o stub do harness nao devolve documento registrado; validarDocumentoOperacional falha e a rota responde 500 generico (stage "unknown", sem stack). Limitacao do harness, nao bug. Fica NAO verificado: resposta 200, urlArquivo/token, download do PDF pela rota.
- A chamada /api/preview?cidade=macae (fonte externa) nao foi pulada na execucao final (passou); se as fontes falharem ela vira skip por ambiente.

## Falhas ocorridas durante o desenvolvimento dos testes (corrigidas; todas "teste errado", nenhuma bug do app)
1. E-mail "a@x.com\n" esperado como invalido, mas retornou 200. Causa: o app faz trim, entao o e-mail e valido. Teste errado; virou teste de normalizacao. Repro: POST /api/responsaveis com senha e email "a@x.com\n".
2. /api/preview?cidade[]=a&cidade[]=b retornou 200 em vez de 400. Causa: o parser de query nao converte "cidade[]" em array; o parametro cidade fica ausente e cai na base padrao (comportamento valido). Teste errado; trocado por ?cidade=a&cidade=b (400). Obs.: isso faz uma chamada a fonte externa na base padrao; inofensivo.
3. 4 testes de concorrencia esperavam 200 da chamada aceita; recebem 500 por causa do stub (ver Bloqueado). Ambiente/harness. A parte relevante (exatamente uma 409, stage "processing", lock liberado depois) passou.
4. `node --test auditoria/testes-e2e/` (diretorio) falha no Node 24: problema de invocacao, nao do app.

## Observacoes (nao sao falhas)
- Harness: a rota /__audit/chamadas e registrada depois do handler 404 do app, entao responde 404 e o contador de chamadas do pipeline nao pode ser lido. Os testes nao dependem dela.
- Atraso progressivo confirmado: tentativas 1-3 rapidas, 4a ~0,5 s, 5a ~1 s, senha correta apos 5 falhas esperou ~2 s e retornou 200 (sem 429), contador zerado depois.
- Nenhum bug real do aplicativo foi encontrado por estes testes. Cobertura limitada ao que o harness permite (sem HTTPS/HSTS, TRUST_PROXY, envio real, download de PDF).
- Os testes criam e removem responsaveis no arquivo temporario do harness (e-mails e2e-*@example.test).
- UI/Playwright: nao executada por este agente (conforme instrucao do coordenador).
