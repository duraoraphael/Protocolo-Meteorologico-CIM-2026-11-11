# Auditoria Geral — Protocolo Meteorológico CIM

- Data: 2026-11-13 · Modo: **AUDITORIA** (nenhum código da aplicação, regra de negócio ou dado real foi alterado)
- Detalhes: [Segurança](AUDITORIA-SEGURANCA.md) · [Performance](AUDITORIA-PERFORMANCE.md) · [Design/UX](AUDITORIA-DESIGN-UX.md) · [Playwright/testes](RESULTADOS-PLAYWRIGHT.md) · [Plano de correções](PLANO-DE-CORRECOES.md)
- Fontes brutas: `evidencias/revisao-codigo.md`, `evidencias/seguranca-bruto.md`, `evidencias/matriz-cobertura.md`, `evidencias/resultados-e2e-bruto.md`

## 1. Ferramentas e agentes — o que realmente foi executado

| Item solicitado | Situação |
|---|---|
| `/design:design-critique` | Skill carregada e aplicada por mim sobre screenshots e probes |
| `/design-superpowers:design-review` | Skill carregada; maturidade **L0** (sem DESIGN.md/DS). Os sub-agentes da skill foram aplicados por mim em uma única passada, não como processos separados |
| `/code-review` | **Não executado como comando.** Equivalente: agente `octo:personas:code-reviewer` + minha verificação manual de 3 achados ALTO |
| `octo:personas:code-reviewer` | Executado (retomado uma vez após atingir limite de turnos) |
| `octo:personas:test-automator` | Executado (retomado uma vez) |
| `octo:personas:security-auditor` (extra) | Executado (retomado uma vez) |
| Playwright | Via **MCP Playwright** (scripts). `@playwright/test` não está instalado e não foi instalado; não há `.spec` nem traces |

## 2. Reconhecimento (Fase 1)

- **Stack:** Node 24 + Express 5, JavaScript (sem TypeScript), Puppeteer (PDF), nodemailer, node-cron, undici, cheerio, docx. Frontend estático em `public/` (sem framework).
- **Arquitetura:** monólito. `server.js` (API + estáticos) · `src/scheduler.js` (envios 08:00/15:00, monitor de alertas a cada 5 min, atualização do painel a cada 30 min) · `src/sources/*` (INMET, Open-Meteo, Air Quality, Marine, OCEANOP, COR-Rio, Clima e Saúde) · `src/logic/*` · `src/render/*` · SharePoint opcional.
- **Persistência:** arquivos JSON em `data/` (sem banco/ORM). 26 bases.
- **Autenticação:** senha operacional única (mín. 12 caracteres; servidor não sobe sem ela). Sem perfis: uma senha = acesso total às ações protegidas.
- **Rotas:** `GET /`, `/api/preview`, `/api/cidades`, `/api/cor-rio`, `/api/monitoramento/saude`, `/api/responsaveis` (GET público só nomes; POST/PUT/DELETE e `/consultar` com senha), `POST /api/verificar-senha`, `POST /api/gerar-relatorio`, `GET /relatorios/:arquivo` (token 24 h ou Basic).
- **Testes existentes:** 499 (`node:test`). Sem lint, typecheck ou build.

## 3. Resultados dos testes

| Métrica | Valor |
|---|---|
| Testes automatizados executados | **570** (499 existentes + 71 E2E de API novos) |
| Aprovados | **569** |
| Reprovados | **0** |
| Bloqueados/não executados | **1** (sucesso de `/api/gerar-relatorio`: limite do stub do harness, não bug) |
| Lint / typecheck / build | **Não existem** → não executados |
| Instáveis | Nenhum (E2E reexecutado com resultado idêntico) |
| UI | Probes Playwright MCP, **não contados** como testes (ver RESULTADOS-PLAYWRIGHT.md) |

Importante: a suíte existente usa mocks e **não detecta** os problemas abaixo. A1–A4 e M1–M9 foram achados por leitura de código (A1, A2, A4 e B6/B10 verificados por mim no código) e **não foram reproduzidos** em execução contra fontes reais.

## 4. Achados consolidados (45)

| Severidade | Qtde |
|---|---|
| CRÍTICO | 0 |
| ALTO | 5 |
| MÉDIO | 16 |
| BAIXO | 24 |

Evidência: **[C]** confirmado por execução · **[V]** verificado por mim no código · **[L]** observado em leitura pelo agente, não reproduzido.

### ALTO

| ID | Problema | Sev. | Arquivo/Página | Evidência | Correção recomendada |
|---|---|---|---|---|---|
| A1 | Painel fica preso à janela da última edição agendada; "Última atualização" mostra 08:00/15:00; de madrugada os cards agregam 15h–24h | ALTO | `src/logic/atualizacaoDados.js:75`, `reportBuilder.js:776`, `public/dashboard.js:40` | [V] linha 75 herda `horarioAgendado` a cada renovação; efeito em `revisao-codigo.md` A1 [L] | Renovar com `horarioAgendado: null`; snapshot agendado em campo separado; exibir `atualizacao.consultadoEmISO` |
| A2 | Previsão Open-Meteo ignora política de licença comercial e `OPEN_METEO_API_KEY` (usa sempre `api.open-meteo.com`) | ALTO | `src/sources/openMeteo.js:397-416, 522` | [V] `openMeteo.js` não referencia `aplicarConfiguracaoOpenMeteo`; Air Quality/Marine sim | Aplicar nas 3 URLs; erro `OPEN_METEO_COMMERCIAL_LICENSE_REQUIRED` sem licença; teste do host |
| A3 | Monitor refaz coleta completa das 26 bases a cada 5 min em paralelo (~8.700+ chamadas/dia só ao forecast) | ALTO | `scheduler.js:339-348`, `alertWatcher.js:548-638` | [L] estimativa do revisor; limite do fornecedor não confirmado | Reusar snapshot do painel; pool de 3–4 bases; reusar avisos do monitor INMET |
| A4 | Um aviso INMET sem geocódigo/polígono derruba os avisos de **todas** as bases | ALTO | `src/sources/inmet.js:640-650` | [V] `throw` global antes do filtro por base | Isolar só o aviso malformado; degradar apenas se afetar a UF da base |
| SEC-02 | Dependências vulneráveis: undici (2 high, inclui bypass de validação TLS), body-parser (high), nodemailer e qs (moderate; override do qs ainda resolve versão afetada) | ALTO | `package.json`, `inmet.js:27`, `climaSaudeService.js:38` | [C] `npm audit --omit=dev`. Exploração real do bypass TLS **não verificada** | `npm audit fix` + `npm test`; revisar override do qs |

### MÉDIO

| ID | Problema | Sev. | Arquivo/Página | Evidência | Correção recomendada |
|---|---|---|---|---|---|
| SEC-01 | Atraso progressivo não segura tentativas paralelas (10 simultâneas em 0,52 s; ~16,7 palpites/s) | MÉDIO | `src/security/tentativas.js:70-93` | [C] instância isolada | Contar a tentativa antes de avaliar; limite duro por IP |
| SEC-03 | Com `TRUST_PROXY` ligado e porta do Node exposta, `X-Forwarded-For` forjado anula o atraso | MÉDIO | `server.js:66-69` | [C] isolada; default seguro | Só o proxy alcança o Node; número de saltos |
| SEC-04 | `render.yaml` sem `TRUST_PROXY`: contador compartilhado e sem HSTS no Render | MÉDIO | `render.yaml` | [L] | `TRUST_PROXY=1` |
| M1 | Coleta sequencial; pior caso >3 min; rota manual sem teto | MÉDIO | `reportBuilder.js:175-289` | [L] | `Promise.allSettled` + orçamento global (`AbortSignal`) |
| M2 | `Promise.race` não cancela; permite 2 coletas simultâneas da mesma base | MÉDIO | `atualizacaoDados.js:36-43,96`, `inmetAlertMonitor.js:69-104` | [L] | `AbortSignal` ou manter "zumbi" em `emAndamento` |
| M3 | Travas de envio não compartilhadas → PDFs/e-mails paralelos ou duplicados | MÉDIO | `server.js:224`, `scheduler.js:37,232-246` | [L] | Mutex único + `adquirirExecucao` no envio único |
| M4 | SMTP sem `socketTimeout` (padrão 10 min) prende travas | MÉDIO | `src/email/transport.js:81-130` | [L] | `socketTimeout` ~60 s |
| M5 | `responsaveis.json` sem escrita atômica; JSON truncado bloqueia todos os envios | MÉDIO | `src/config/recipients.js:102-105` | [L] | tmp+rename + `.bak` |
| M6 | `marcarEnviado` vira no-op com trava ocupada (risco de reenvio); fila nunca podada | MÉDIO | `src/logic/alertQueue.js:29-136` | [L] | Retentar/lançar erro; poda por idade |
| M7 | Alerta de calor do agendador contorna fila/deduplicação do monitor | MÉDIO | `scheduler.js:97-104`, `alertWatcher.js:675-688` | [L] | Remover caminho ou usar `processarAlertaBase` |
| M8 | PDFs agendados dão 404 no download; lista some ao reiniciar | MÉDIO | `server.js:190-213,440-444` | [L] | Registrar PDFs agendados ou validar contra `output/` |
| M9 | Trava de execução agendada órfã após queda; horário perdido sem alarme | MÉDIO | `scheduledReport.js:55-83` | [L] | Expiração por tempo/PID; recuperação na inicialização |
| PERF-01 | Estáticos e JSON sem compressão e com `max-age=0` | MÉDIO | `server.js:72-74` | [C] curl | `compression` + cache longo versionado |
| PERF-02 | Hero PNG de 2,4 MB em toda visita | MÉDIO | `public/dashboard.html:14` | [C] 2.420.303 bytes | WebP/AVIF + `srcset` |
| DES-01 | 79 elementos de texto <12 px | MÉDIO | `public/dashboard.css` | [C] probe | Piso 12 px |
| DES-02 | 11/28 alvos <44 px no mobile (15/28 desktop) | MÉDIO | menu, "Ver mais" | [C] probe | Área mínima 44×44 |

### BAIXO

| ID | Problema | Sev. | Arquivo/Página | Evidência | Correção recomendada |
|---|---|---|---|---|---|
| B1 | Chave errada (`qualidadeAr` vs `airQuality`) no motivo de indisponibilidade do UV | BAIXO | `reportBuilder.js:730` | [L] | `falhasApi.airQuality` |
| B2 | Cache corrompido descarta coleta bem-sucedida | BAIXO | `marine.js:237-251`, `climaSaudeService.js:218-223` | [L] | `try` separado p/ cache |
| B3 | `page.close()` no `finally` pode mascarar erro do PDF | BAIXO | `pdfGenerator.js:65-85` | [L] | `.catch(()=>{})` |
| B4 | Semanal duplica lançamento do Chromium sem endurecimento | BAIXO | `weeklyPipeline.js:14-35` | [L] | Reusar `getBrowser()` |
| B5 | Cron do monitor incorreto p/ intervalos que não dividem 60 | BAIXO | `scheduler.js:348` | [L] | Validar intervalo |
| B6 | Timers do toast não cancelados | BAIXO | `public/dashboard.js:283-287` | [V] | `clearTimeout` |
| B7 | Funções/módulos grandes (`montarRelatorio` ~630 linhas) | BAIXO | `reportBuilder.js:152-782` | [L] | Dividir |
| B8 | Código duplicado (agente undici, gravação atômica, bases monitoradas) | BAIXO | vários | [L] | Utilitários |
| B9 | Sem lint/typecheck/build/`engines` | BAIXO | `package.json` | [C] | `engines`, ESLint, script `check` |
| B10 | `/api/monitoramento/saude` sem `try/catch` padrão | BAIXO | `server.js:116-118` | [V] | `responderErro` |
| SEC-05 | Login correto do mesmo IP zera contador de quem erra | BAIXO | `tentativas.js` | [C] | Reset por IP+tentativa |
| SEC-06 | Token de download na URL, válido 24 h | BAIXO | `linksRelatorio.js` | [L] | Validade menor |
| SEC-07 | Chromium `--no-sandbox` no Linux (JS off, rede bloqueada) | BAIXO | `chromiumSeguro.js` | [L] | Manter mitigações |
| SEC-09 | `esc()` não escapa aspas; usado em atributos de e-mail | BAIXO | `pdfTemplate.js` | [L] | Escapar `"` `'` |
| SEC-10 | Faltam `Permissions-Policy`, COOP, CORP | BAIXO | `cabecalhos.js` | [C] | Adicionar |
| SEC-11 | Nomes dos responsáveis públicos | BAIXO | `server.js:340` | [C] | Decisão de negócio |
| SEC-12 | Logs com stack trace e caminhos | BAIXO | `server.js:291` | [L] | Reduzir em produção |
| SEC-14 | `destinatariosOverride`/`REPORT_RECIPIENTS` sem `validarEmail` | BAIXO | `sendReport.js:31-39` | [L] | Validar na entrada |
| PERF-03 | Favicon de 590 KB | BAIXO | `dashboard.html:7` | [C] | Ícones 32/180 px |
| PERF-04 | Base fria: 2,35 s na primeira consulta | BAIXO | `/api/preview?cidade=macae` | [C] | Aquecer cache |
| DES-03 | Card UV com grande área vazia (desktop) | BAIXO | Ocorrências | [C] screenshot | `align-items:start` |
| DES-04 | Subtítulo do hero sobre a foto no mobile | BAIXO | hero 375/430 | [C] screenshot | Scrim |
| DES-05 | Mensagem de progresso com cor de erro | BAIXO | modal Gerar e Enviar | [C] screenshot | Classe de status neutra |
| DES-06 | `Segoe UI` sem fallback adequado em Linux/Android | BAIXO | `dashboard.css:15` | [V] | Stack `system-ui` |

(SEC-08 do agente = M5; SEC-13 = falso positivo, placeholders `xxxx xxxx xxxx xxxx`; ambos fora da contagem.)

## 5. Pontos fortes confirmados

- 5 rotas protegidas → 401 sem senha; traversal em `/relatorios`, `/logo`, `.env`, `.git` → 404; JSON malformado → 400; >100 KB → 413, sem stack. [C]
- Senha em tempo constante; servidor não sobe sem senha forte; `.env` nunca versionado e sem segredos no histórico.
- Geração concorrente: 2–3 chamadas simultâneas → 1 aceita, demais 409. [C]
- CSP sem `unsafe-inline`; escape consistente no frontend; Docker sem root.
- Acessibilidade: skip link, landmarks, `lang`, diálogos acessíveis, `prefers-reduced-motion`, sem overflow horizontal em 5 resoluções. [C]

## 6. Lacunas e funcionalidades sem cobertura

- Sucesso de `/api/gerar-relatorio`, envio real de e-mail e SharePoint: **não testados** (proibido enviar e-mail real).
- Telas Monitoramento e Sobre o CIM e gestão de Responsáveis desbloqueada: não percorridas na UI.
- Revisão de código não cobriu a fundo: riskEngine, motorGatilhos, weatherSourcePolicy, monitorSecas, oceanop, inmetObservations, templates de render, `dashboard-components.js`.
- Core Web Vitals, memória e carga **não medidos**. Falhas reais de integração (timeout/dados inválidos) só pela suíte existente com mocks.
- Nenhum teste de regressão existe ainda para A1–A4 e M1–M9.

## 7. Melhorias prioritárias

1. A1 + A4 (correções pequenas, alto impacto operacional).
2. SEC-02 (`npm audit fix`) e `engines`.
3. A2 (exige decisão de licença) e A3 (medir antes de mudar).
4. M3/M4/M6/M7 (envio duplicado/travado).
5. PERF-01/02 e DES-01/02.
