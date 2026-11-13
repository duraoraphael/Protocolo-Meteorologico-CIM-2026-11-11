# Revisão de código — Protocolo Meteorológico CIM

- Data: 2026-11-13
- Modo: somente leitura. O código da aplicação não foi editado. O `.env` não foi lido. `server.js` e os CLIs não foram executados.
- Escopo: server.js, src/pipeline.js, src/scheduler.js, src/logic/* (atualizacaoDados, scheduledReport, alertQueue, alertWatcher, inmetAlertMonitor, reportBuilder, documentProvenance, informativoValidity, cityRegistryAudit), src/sources/* (httpJsonClient, inmet, openMeteo [trechos], openMeteoConfig, airQuality [trecho], marine [trecho], corRio, climaSaudeService), src/render/pdfGenerator.js, src/render/chromiumSeguro.js, src/weeklyPipeline.js, src/email/* (sendReport, sendAlert, transport), src/config/recipients.js, public/dashboard.js, package.json.
- Contexto verificado em runtime (somente `require` de config): 26 bases em `CIDADES`, 8 costeiras, 26 com `climaSaudeUrl`, 11 pontos OCEANOP habilitados. Node v24.22.1.
- Não revisados a fundo por limite de tempo: riskEngine, motorGatilhos, weatherSourcePolicy, monitorSecas, oceanop, inmetObservations (só a estrutura), templates de render, dashboard-components.js.

## Contagem por severidade

| Severidade | Qtde |
|---|---|
| CRITICO | 0 |
| ALTO | 4 |
| MEDIO | 9 |
| BAIXO | 10 |

---

## ALTO

### A1. O cache do painel fica preso à janela da última edição agendada, e "Última atualização" passa a mostrar o horário da edição
- **Arquivos:** src/logic/atualizacaoDados.js:75, src/logic/reportBuilder.js:776, server.js:440-443, public/dashboard.js:40
- **Evidência:**
  - `atualizacaoDados.js:75`: `const horarioAgendado = itemAtual.report?.horarioAgendado || null;`, que depois é passado para `montar(cidade, { horarioAgendado, ... })`.
  - `reportBuilder.js:776`: `if (horarioAgendado) relatorio.horaConsulta = horarioAgendado;`
  - `server.js:442`: `app.locals.atualizadorDados.registrar(resultado.report)` publica no cache do painel o relatório agendado (08:00/15:00).
  - `dashboard.js:40`: `` `Última atualização: ${reportAtual.horaConsulta}` ``
- **Causa raiz:** depois do primeiro envio agendado, o cache da base guarda um relatório com `horarioAgendado`. Cada renovação seguinte (a cada 30 min) reaproveita esse `horarioAgendado`. O novo relatório herda o mesmo valor, e o comportamento passa a valer para sempre. Efeitos:
  1. Os cards do painel usam a janela da edição: 08h–15h depois das 08:00, e 15h–00h depois das 15:00. Isso inclui a madrugada e a manhã seguinte até o envio das 08:00. Entre 00h e 08h, a TV mostra rajada, chuva e temperatura agregadas de 15h a 24h do dia corrente, e as condições da manhã ficam de fora. As referências são `reportBuilder.js:206-210` (`inicioHora`, `fimHora`, `agregarJanela: Boolean(horarioAgendado)`) e `informativoValidity.js:44-52`.
  2. O texto "Última atualização" passa a mostrar "08:00" ou "15:00", mesmo com consultas reais feitas depois.
  3. Toda renovação do painel passa a consultar o Clima e Saúde (`reportBuilder.js:165`).
- **Correção proposta:** na renovação do painel, nunca herdar `horarioAgendado`. Em `atualizar()`, usar `montar(cidade, { horarioAgendado: null, atualizarClimaSaude: true })`. Se for preciso publicar o snapshot agendado, guardá-lo num campo separado (por exemplo `item.ultimoInformativo`) sem sobrescrever o snapshot "ao vivo". No painel, mostrar `atualizacao.consultadoEmISO`, que já vem de `/api/preview`, em vez de `report.horaConsulta`.

### A2. A previsão Open-Meteo (Weather Forecast) usa sempre o endpoint gratuito e ignora a política de licença comercial e a `OPEN_METEO_API_KEY`
- **Arquivos:** src/sources/openMeteo.js:397-416 e 522, src/sources/openMeteoConfig.js:22-35, src/sources/airQuality.js:153-168, src/sources/marine.js:138 e 231
- **Evidência:** `criarUrlPublicaOpenMeteo` retorna `https://api.open-meteo.com/v1/forecast?...`, e `buscarOpenMeteo` usa essa URL direto (`const url = criarUrlPublicaOpenMeteo(...)`). `aplicarConfiguracaoOpenMeteo` aparece só em airQuality.js, marine.js e openMeteoSemanal.js; o grep não encontra nenhuma chamada em openMeteo.js. A mensagem da própria configuração diz: "este protocolo é usado comercialmente e não pode consultar a API gratuita da Open-Meteo".
- **Causa raiz:** o bloqueio de licença e a troca para o host `customer-` foram aplicados a Air Quality e Marine, mas não à fonte principal (forecast). Com isso:
  1. A principal fonte de rajada, chuva e probabilidade de chuva consulta a API gratuita mesmo quando `OPEN_METEO_USAR_API_PUBLICA` não está `true`, o que contraria a decisão documentada.
  2. Com `OPEN_METEO_API_KEY` configurada, a chave paga não é usada e o tráfego continua contando nos limites gratuitos (ver A3).
- **Correção proposta:** em `buscarOpenMeteo`, aplicar `aplicarConfiguracaoOpenMeteo(url, env)` na URL principal, na URL de fallback (`:560`) e nas URLs por indicador (`:606`). Quando não houver licença, lançar o mesmo erro `OPEN_METEO_COMMERCIAL_LICENSE_REQUIRED` já tratado em `reportBuilder.js:196`. Mascarar a `apikey` em logs e diagnósticos, onde `urlSegura` já cobre "key". Adicionar teste unitário que verifique o host `customer-api.open-meteo.com`.

### A3. O monitor de alertas refaz a coleta completa de todas as bases a cada 5 min e em paralelo, duplicando o trabalho do atualizador do painel
- **Arquivos:** src/scheduler.js:339-348, src/logic/alertWatcher.js:548-638, src/logic/atualizacaoDados.js:134-151
- **Evidência:** `parseInt(process.env.INTERVALO_MONITOR_MIN || "5", 10)` e `` `*/${minutos} * * * *` ``. Em `verificarAlertas`: `await Promise.all(chaves.map(verificarBase))`, e cada `verificarBase` chama `montarRelatorio(cidade, { atualizarClimaSaude: true })`.
- **Causa raiz:** o monitor não reaproveita o snapshot do `atualizadorDados`. Ele monta 26 relatórios completos a cada ciclo, e todos de uma vez. Cada relatório faz chamadas sequenciais a INMET (previsão, observação, catálogo), Open-Meteo, OCEANOP, Marine e scraping do Clima e Saúde. Volume estimado com os valores padrão:
  - Open-Meteo forecast: 26 × 288 ciclos/dia = 7.488 chamadas/dia, somadas a 26 × 48 = 1.248 do painel, no mínimo cerca de 8.700 por dia. Isso sem contar fallbacks e o peso por número de variáveis (a URL pede 22 variáveis). Fica próximo ou acima do limite gratuito diário; confirmar o limite e o peso com o fornecedor.
  - A mesma ordem de grandeza vale para INMET e para o portal Clima e Saúde (scraping HTML de 26 páginas a cada 5 min).
  - Picos de cerca de 26 requisições simultâneas por fonte a cada ciclo (`Promise.all`) aumentam o risco de HTTP 429. O atualizador do painel, ao contrário, roda serial de propósito (`atualizacaoDados.js:133`: "uma de cada vez (respeita os limites das APIs)").
- **Correção proposta:** fazer o monitor consumir o snapshot do `atualizadorDados` (uma coleta por base por ciclo, compartilhada) ou fixar o mesmo intervalo para as duas rotinas. Limitar a concorrência (pool de 3 a 4 bases). Usar o monitor INMET de 10 min (`monitorAvisosInmet`), que já coleta os avisos, em vez de buscar de novo em `alertWatcher.js:566`. Revisar o padrão de 5 min, que contradiz o exemplo "INTERVALO_MONITOR_MIN=60" do comentário em `scheduler.js:253`.

### A4. Um único aviso nacional do INMET sem geocódigo nem polígono derruba os avisos oficiais de todas as bases
- **Arquivo:** src/sources/inmet.js:640-650
- **Evidência:**
  ```js
  if (avisos.some((aviso) => !aviso.geocodes.length && !aviso.geometria)) {
    const erro = new Error("INMET publicou avisos sem geocódigo municipal ou polígono CAP utilizável.");
    ...
    throw erro;
  }
  ```
- **Causa raiz:** a validação é feita sobre todos os avisos do país (`/avisos/ativos`) antes de filtrar por base. Basta um registro malformado em qualquer UF para que `buscarAvisosInmetParaBases` falhe para todas as 26 bases. O efeito se propaga ao relatório (`reportBuilder.js:237-250`, avisos "indisponíveis"), ao monitor (`alertWatcher.js:563-569`, `falhaAvisosInmet`) e ao monitor de status. A fonte mais importante do protocolo (aviso oficial) fica indisponível em todo lugar por um registro irrelevante.
- **Correção proposta:** descartar ou isolar só os avisos sem geografia, registrando contagem e log. Marcar degradação apenas quando o aviso sem geografia puder afetar a base, por exemplo quando `estados` contém a UF da base. Nesse caso, sinalizar "aviso sem geografia na UF X — conferir manualmente" em vez de lançar erro global.

---

## MEDIO

### M1. Coleta sequencial em `montarRelatorio`: o pior caso passa do teto de 3 min do painel e não tem teto na rota manual
- **Arquivos:** src/logic/reportBuilder.js:175-289, src/sources/httpJsonClient.js:1-4 e 190-237, src/sources/openMeteo.js:553-643, src/logic/atualizacaoDados.js:24
- **Evidência:** os `await` em sequência são INMET previsão, Air Quality, Open-Meteo, observação INMET, avisos INMET, OCEANOP e Marine. Cada fonte faz até 3 tentativas de 15 s, mais 2 s e 4 s de espera (cerca de 51 s). A Open-Meteo ainda tenta o modelo de fallback (mais cerca de 51 s) e até 6 consultas sequenciais por indicador (`:604-642`).
- **Causa raiz:** as fontes são independentes, mas são aguardadas uma a uma. Com instabilidade, o relatório passa de 3 min (`LIMITE_POR_BASE_MS`) e o painel descarta a coleta inteira. Na rota `POST /api/gerar-relatorio` não há teto: a requisição HTTP e a trava `geracaoEmAndamento` ficam presas por vários minutos, e proxies e navegadores podem cortar a conexão antes.
- **Correção proposta:** disparar as fontes independentes com `Promise.allSettled` e um orçamento global (`AbortSignal` propagado até `buscarJsonComRetentativa`). Fazer as consultas por indicador da Open-Meteo numa única requisição de fallback com todos os campos ausentes.

### M2. Timeouts por `Promise.race` não cancelam o trabalho e quebram a garantia de "uma consulta por base"
- **Arquivos:** src/logic/atualizacaoDados.js:36-43 e 96, src/logic/inmetAlertMonitor.js:69-104
- **Evidência:** `return Promise.race([promessa, limite]).finally(() => clearTimeout(temporizador));` e depois `.finally(() => emAndamento.delete(cidade.chave))`.
- **Causa raiz:** quando estoura o tempo, a `montar()` original continua rodando (requisições, gravação de caches em disco), mas a chave já saiu de `emAndamento`. O próximo `/api/preview` ou ciclo abre uma segunda coleta simultânea da mesma base, contrariando a regra do cabeçalho do arquivo (linha 11). O mesmo acontece em `inmetAlertMonitor`: o `collect` órfão segue e o próximo `run()` sobrepõe.
- **Correção proposta:** passar um `AbortSignal` para `montar` e `collect` e abortar no timeout. Ou só remover de `emAndamento` quando a promessa original terminar, mantendo-a como "zumbi" para deduplicação.

### M3. Travas de concorrência não compartilhadas: rota manual, agendador e envio único podem gerar e enviar ao mesmo tempo
- **Arquivos:** server.js:224 e 241-261, src/scheduler.js:37 e 62-66, src/scheduler.js:232-246
- **Evidência:** a rota usa `let geracaoEmAndamento = false;`, local ao app; o agendador usa `let processamentoAgendado = false;`, local ao módulo. `agendarEnvioUnicoHoje` chama `executarPipeline` sem nenhuma das duas travas e sem `adquirirExecucao`/estado.
- **Causa raiz:** cada caminho de envio tem sua própria flag em memória. Um "Gerar e enviar" manual durante o ciclo das 08:00, ou durante o `ENVIO_UNICO_HOJE`, roda em paralelo: várias abas Chromium, e e-mails em duplicidade se o envio único e o manual forem para a mesma base. O envio único também não grava o histórico, então um reinício antes do horário reagenda o envio.
- **Correção proposta:** criar uma fila ou mutex único para geração e envio (módulo compartilhado) e usar `adquirirExecucao` com uma chave `data|base|unico|HH:MM` também no envio único.

### M4. SMTP sem `socketTimeout`: um envio travado prende travas e ciclos por até 10 min
- **Arquivo:** src/email/transport.js:81-100 e 114-130
- **Evidência:** o relay tem apenas `connectionTimeout: 20000, greetingTimeout: 15000`. O Gmail não define nenhum timeout, então valem os padrões do nodemailer (socket de 10 min).
- **Causa raiz:** com o relay aceitando a conexão mas parando no DATA, `sendMail` fica pendente pelo `socketTimeout` padrão. Enquanto isso, `processamentoAgendado` ou `geracaoEmAndamento` continuam `true` e as demais bases do ciclo esperam.
- **Correção proposta:** definir `socketTimeout` (por exemplo 60 s) e timeouts explícitos também no transporte do Gmail. Logar a duração do envio.

### M5. O cadastro de responsáveis é gravado sem escrita atômica, e um arquivo corrompido bloqueia todos os envios
- **Arquivo:** src/config/recipients.js:102-105 e 96-98
- **Evidência:** `fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2), "utf-8");`, gravação direta sem tmp+rename. Na leitura, `throw new Error(\`Falha ao ler data/responsaveis.json: ...\`)`.
- **Causa raiz:** os demais estados (alertQueue, scheduledReport, corRio, marine, climaSaude) usam tmp+rename. Este é o único caminho que grava direto. Uma queda ou bloqueio no meio da escrita (a própria documentação cita pasta sincronizada pelo OneDrive em `pipeline.js:66-71`) deixa JSON truncado. A partir daí, `listaDestinatarios` lança erro para todas as bases e os informativos agendados falham.
- **Correção proposta:** gravar com o mesmo padrão tmp+rename e manter um backup `.bak`. Na leitura com erro, registrar alerta técnico e tentar o `.bak`.

### M6. Fila de alertas: `marcarEnviado` vira no-op silencioso quando a trava está ocupada (risco de reenvio), e a fila cresce sem limite
- **Arquivo:** src/logic/alertQueue.js:124-136, 64-102, 29-50
- **Evidência:** `return comTrava(arquivo, () => {...}).resultado || null;`. Quando `adquirido: false`, retorna `null` sem erro. Os eventos nunca são removidos, e cada operação lê e regrava o arquivo inteiro.
- **Causa raiz:** se outro processo (por exemplo `cliAlertas.js`) estiver segurando o `.lock`, o envio confirmado pelo SMTP não é registrado. O evento continua em `processando` até `leaseAte` (5 min) e depois `assumir` o retoma e reenvia o alerta. Sem poda, o arquivo cresce indefinidamente. A remoção de trava expirada (`:38-41`) também tem corrida clássica: dois processos veem a trava vencida e um apaga a trava recém-criada pelo outro.
- **Correção proposta:** em `marcarEnviado`/`marcarFalha`, tentar de novo com espera curta e lançar erro se não conseguir a trava, para o chamador logar e reconciliar. Podar eventos `enviado` com mais de N dias. Para a trava expirada, usar `rename` atômico ou um lock com PID e checagem de processo vivo.

### M7. Alerta de calor do agendador contorna a fila, a deduplicação e a regra de linha de base do monitor
- **Arquivos:** src/scheduler.js:97-104, src/logic/alertWatcher.js:675-688
- **Evidência:** `enviarAlertaCalorDoRelatorio` chama `filtrarNovidades(...)`, depois `enviarAlertaPorEmail(base)` e por fim `marcarAlertasEnviados(base)`, sem `enfileirar`/`assumir`, sem `eventoId` e sem verificar `ASSINATURA_MONITOR`.
- **Causa raiz:** o monitor de 5 min também avalia `calor-ehf` (`alertWatcher.js:169-183`). Se um ciclo do monitor carregou o estado antes de o agendador marcar o envio, os dois caminhos enviam o mesmo episódio, porque a fila não sabe do envio do agendador. Para uma base sem linha de base, o agendador envia alerta "novo" retroativo, o que o monitor evita de propósito (`:612-618`). As pendências de histerese calculadas nesse caminho também são descartadas (o objeto `pendencias` é local).
- **Correção proposta:** remover esse caminho (o monitor já cobre o EHF) ou passar por `processarAlertaBase` (fila e fingerprint), respeitando `ASSINATURA_MONITOR`.

### M8. PDFs dos envios agendados não podem ser baixados pelo painel, e a lista some ao reiniciar
- **Arquivo:** server.js:190-191, 211-213, 269, 440-444
- **Evidência:** `if (!tokenValido && !arquivosOperacionais.has(arquivo)) return res.status(404)`. Só a rota manual faz `arquivosOperacionais.add(...)`; `publicarSnapshotInformativo` não adiciona.
- **Causa raiz:** o `Set` é só em memória e só a rota manual o alimenta. Mesmo com a senha (HTTP Basic), os PDFs das 08:00/15:00 retornam 404, e depois de um reinício nenhum PDF anterior é acessível.
- **Correção proposta:** registrar também os PDFs agendados (no callback `onResultado`) ou validar com a senha contra a listagem real de `output/`, mantendo a regex `NOME_PDF_VALIDO` e `root`.

### M9. A trava de execução agendada fica órfã se o processo cair, e não há recuperação de horários perdidos
- **Arquivos:** src/logic/scheduledReport.js:55-83, src/scheduler.js:80-84 e 184
- **Evidência:** o `.lock` é criado com `wx` e status `em_andamento`, e só sai via `liberar()`. Não há expiração nem checagem de PID.
- **Causa raiz:** uma queda entre `adquirirExecucao` e `concluir`/`liberar` deixa a chave `data|base|HH:MM` bloqueada para sempre. Como o cron não reexecuta horários perdidos, uma queda às 08:00 significa nenhum informativo das 08:00, sem alarme. A pasta `travas-agendador` também cresce cerca de 54 arquivos por dia sem limpeza.
- **Correção proposta:** tratar `em_andamento` com `iniciadoEmISO` antigo (mais de 30 min) ou PID inexistente como trava expirada. Na inicialização, verificar se o horário do dia já passou sem `enviado` e disparar recuperação ou alerta técnico. Podar travas com mais de N dias.

---

## BAIXO

### B1. Chave errada ao ler o motivo de indisponibilidade do UV
- **Arquivo:** src/logic/reportBuilder.js:730 (grava em `:195`)
- **Evidência:** `motivoIndisponibilidade: falhasApi.qualidadeAr?.message || "UV atual não publicado..."`, mas a falha é gravada em `falhasApi.airQuality = erro;`.
- **Correção:** usar `falhasApi.airQuality?.message`.

### B2. Um cache corrompido descarta uma coleta bem-sucedida (Marine e Clima e Saúde)
- **Arquivos:** src/sources/marine.js:237-251, src/sources/climaSaudeService.js:218-223
- **Evidência:** `carregarCache()`/`carregar()` (que lançam erro em JSON inválido) ficam dentro do mesmo `try` da consulta HTTP. Se o arquivo estiver ilegível, a resposta válida da API vira "falha" e a fonte fica indisponível em todas as coletas.
- **Correção:** isolar leitura e gravação do cache num `try` próprio; em erro, recriar o cache só com o dado novo.

### B3. `page.close()` no `finally` pode mascarar o erro original da geração do PDF
- **Arquivo:** src/render/pdfGenerator.js:65-85
- **Evidência:** `finally { await page.close(); }`. Se o Chromium caiu, `close()` lança erro e substitui o erro real. `newPage()` também fica fora do `try`.
- **Correção:** `finally { await page.close().catch(() => {}); }`.

### B4. O relatório semanal duplica o lançamento do Chromium sem os endurecimentos do gerador diário
- **Arquivo:** src/weeklyPipeline.js:14-35
- **Evidência:** `puppeteer.launch({ headless: true, args: argsChromium() })`, sem `executablePath` e sem as novas tentativas; `setContent(..., { waitUntil: "networkidle0" })` sem `timeout` explícito (vale o padrão de 30 s).
- **Correção:** reutilizar `getBrowser()` de `pdfGenerator.js` e expor um `gerarPdf(html, opcoes)` genérico.

### B5. Expressão cron do monitor incorreta para intervalos que não dividem 60
- **Arquivo:** src/scheduler.js:348
- **Evidência:** `` minutos >= 60 ? `0 */${Math.floor(minutos / 60)} * * *` : `*/${minutos} * * * *` ``. Com 45, dispara em :00 e :45 (intervalos de 45 e 15 min). Com 90, vira 1 h.
- **Correção:** validar como em `intervaloAtualizacaoMin` (divisor de 60 ou múltiplo de 60) ou usar `setInterval` com `noOverlap`.

### B6. Temporizadores do toast no painel não são cancelados
- **Arquivo:** public/dashboard.js:283-287
- **Evidência:** `setTimeout(() => toastEl.classList.add("oculto"), 8000);`. Um segundo toast é escondido pelo timer do primeiro antes dos seus 8 s.
- **Correção:** guardar o id e fazer `clearTimeout` antes de agendar de novo.

### B7. Funções e módulos grandes demais
- **Evidência:** `montarRelatorio` (src/logic/reportBuilder.js:152-782, cerca de 630 linhas numa só função), src/render/pdfTemplate.js (1.245 linhas), src/sources/openMeteo.js (976), src/logic/alertWatcher.js (701), src/sources/inmet.js (712).
- **Correção:** separar `montarRelatorio` em coleta (com `allSettled`, ver M1), integração de fontes, avaliação de risco e montagem do DTO. Extrair o mapa de detecção de dados disponíveis de `alertWatcher.js:594-610` para um módulo próprio.

### B8. Código duplicado
- **Evidência:**
  - Agente undici com CAs do sistema repetido em src/sources/inmet.js:21-30, src/sources/climaSaudeService.js:34-41 e src/sources/inmetObservations.js:21.
  - Padrão de gravação atômica tmp+rename repetido em scheduledReport.js:24-29, alertQueue.js:22-27, alertWatcher.js:59-64, climaSaudeService.js:168-173, corRio.js:197-202 e marine.js:209-214.
  - `basesParaEnvioDiario` (scheduler.js:22-35) é idêntica a `basesMonitoradas` (alertWatcher.js:523-536).
  - Data/hora de Brasília via `new Date(x.toLocaleString("en-US", { timeZone }))` em scheduler.js:213 e 353 e inmet.js:90.
  - JSDoc de `executarPipeline` duplicado e desalinhado em src/pipeline.js:58-65 e 101-112, solto antes de `salvarCopiaLocal` e `relatorioBaseCorRio`.
- **Correção:** criar `src/util/arquivoJson.js` (ler e gravar atômico, com trava), `src/util/agenteTlsSistema.js`, `src/util/tempoBrasilia.js` e `parseListaBases(env, rotulo)`.

### B9. `package.json` sem lint, typecheck, build ou `engines` (confirmado)
- **Evidência:** `"scripts"` contém apenas `start`, `send-now`, `verificar-fontes`, `validar-integracao-meteo` e `test` (`node --test "tests/**/*.test.js"`). Não há `lint`, `typecheck` nem `build`. Não há campo `engines`, mas o código depende de APIs recentes do Node: `tls.getCACertificates` (inmet.js:26, climaSaudeService.js:37, transport.js:126), `AbortSignal.any` e `Error` com `cause`.
- **Correção:** adicionar `"engines": { "node": ">=22.15" }` (ou a versão validada), ESLint com regras `no-floating-promises` (por exemplo via `typescript-eslint` em JS com `checkJs`) e um script `check` no CI.

### B10. Express 5 sem `try` em `/api/monitoramento/saude`, com o erro tratado só pelo handler global
- **Arquivo:** server.js:116-118
- **Evidência:** `const auditoria = await auditarRegistroCidades(CIDADES);` sem `try`. Funciona no Express 5 (a rejeição vai para `tratadorDeErros`), mas foge do padrão das outras rotas (`responderErro`) e não registra contexto no log.
- **Correção:** envolver com `try/catch` e chamar `responderErro(res, erro, "Erro no monitoramento")`.

---

## `npm audit --omit=dev` (executado em 2026-11-13, somente leitura)

Resultado: **4 vulnerabilidades (2 high, 2 moderate)**. Todas têm correção via `npm audit fix` (não executado).

| Pacote | Faixa afetada | Severidade | Resumo |
|---|---|---|---|
| body-parser | 2.0.0 – 2.3.0 | high | DoS por bytes extras após corpo comprimido (GHSA-27r3-jxmh-p828). Afeta `express.json()` em server.js:71. |
| undici (direto e via cheerio) | 4.0.0 – 6.29.0 / 7.0.0 – 7.30.0 | high | Vários: DoS (EventSource, content-encodings, decompress, WebSocket PONG, renegociação TLS 1.2), envenenamento de cache por redirect e **bypass de validação TLS por opções `tls` descartadas no `Agent`** (GHSA-2m5v-pch6-74hx). |
| nodemailer | 3.0.0 – 10.1.3 | moderate | Falhas no `addressparser` que podem transformar texto em destinatário (GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h). |
| qs | 6.7.0 – 6.16.0 | moderate | DoS em `qs.stringify` com `arrayFormat: 'comma'` (GHSA-6pq8-jhm2-2vcw). O override `"qs": "^6.16.0"` no package.json ainda resolve uma versão vulnerável. |

**Pontos que cruzam com bugs (para o agente de segurança):**
- O código cria `new Agent({ connect: { ca } })` do undici em src/sources/inmet.js:27 e src/sources/climaSaudeService.js:38, exatamente o padrão citado em GHSA-2m5v-pch6-74hx. Atualizar `undici` é prioritário.
- O nodemailer recebe `to: destinatarios.join(", ")` (sendReport.js:74, sendAlert.js:46). A validação em `recipients.js:20-21` (regex estrita) reduz a exposição ao parser, mas `destinatariosOverride` e `REPORT_RECIPIENTS` (sendReport.js:31-39) não passam por `validarEmail`.

---

## Prioridade sugerida
1. A1 (painel exibe janela e horário errados) e A4 (avisos INMET globais): correções pequenas e de alto impacto operacional.
2. A2 e A3 (licença e volume da Open-Meteo, coleta duplicada a cada 5 min).
3. Atualizar dependências (`undici`, `body-parser`, `nodemailer`, `qs`).
4. M3, M4, M6 e M7 (duplicidade e travamento de envios).
5. M1 e M2 (paralelizar a coleta com cancelamento real).
