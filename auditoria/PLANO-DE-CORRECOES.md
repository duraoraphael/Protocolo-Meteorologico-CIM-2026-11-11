# Plano de Correções

Nada abaixo foi implementado. **Aprovação** indica mudança que altera comportamento visível, regra de negócio, custo/licença, infraestrutura ou dependências, e que deve ser aprovada antes. Esforço: S (<½ dia), M (1–2 dias), L (>2 dias). Cada correção deve nascer com teste de regressão (hoje inexistente para A1–A4/M1–M9).

## Etapa 0 — Decisões e higiene (antes de codar)

| Item | Ação | Aprovação |
|---|---|---|
| Licença Open-Meteo (A2) | Definir se há plano comercial/chave. Sem isso, a correção A2 faria a previsão **parar** (erro `OPEN_METEO_COMMERCIAL_LICENSE_REQUIRED`) | **Sim — decisão de negócio** |
| Credenciais do `.env` | Se o arquivo saiu desta máquina (backup, OneDrive, compartilhamento), rotacionar Gmail app password, OCEANOP, Windy e senha do painel | **Sim (operacional)** |
| Homologação | Ter ambiente com destinatário de teste para validar o sucesso de `/api/gerar-relatorio` | Sim |

## Etapa 1 — Correções pequenas de alto impacto (S)

| # | Achados | Mudança | Aprovação |
|---|---|---|---|
| 1.1 | SEC-02 | `npm audit fix`, rodar `npm test` (499), revisar override do `qs`; verificar se `undici` ≥ versão corrigida | **Sim (dependências)** |
| 1.2 | A1 | Renovação do painel com `horarioAgendado: null`; guardar snapshot agendado à parte; mostrar `consultadoEmISO` | **Sim** — muda o que a TV exibe |
| 1.3 | A4 | Isolar avisos INMET sem geografia (log + degradação só se afetar a UF) | **Sim** — muda regra de aviso oficial |
| 1.4 | B1, B3, B6, B10 | Correções pontuais sem mudança de comportamento | Não |
| 1.5 | B9 | `engines` no `package.json` (Node ≥ versão validada) | Não |
| 1.6 | SEC-04 | `TRUST_PROXY=1` no `render.yaml` (se o deploy for no Render) | Sim (infra) |

## Etapa 2 — Robustez de envio e dados (M)

| # | Achados | Mudança | Aprovação |
|---|---|---|---|
| 2.1 | M4 | `socketTimeout` nos transportes SMTP | Não |
| 2.2 | M5 (SEC-08) | Escrita atômica + `.bak` em `responsaveis.json` | Não |
| 2.3 | M3 | Mutex único para geração/envio; `adquirirExecucao` no envio único | **Sim** — muda concorrência de envios |
| 2.4 | M6, M7 | Fila: retentar/lançar em `marcarEnviado`; poda; alerta de calor via fila | **Sim** — muda deduplicação de alertas |
| 2.5 | M8 | Registrar PDFs agendados para download pelo painel | Sim (expõe mais arquivos sob senha) |
| 2.6 | M9 | Expiração de travas órfãs e recuperação de horário perdido | **Sim** — pode disparar envio atrasado |
| 2.7 | B2, B4, B5 | Cache isolado, reuso do Chromium, validação do intervalo | Não |

## Etapa 3 — Segurança de acesso (M)

| # | Achados | Mudança | Aprovação |
|---|---|---|---|
| 3.1 | SEC-01, SEC-05 | Contar/reservar tentativa antes de avaliar a senha; limite duro por IP; teste de 10 tentativas simultâneas | Sim |
| 3.2 | SEC-03 | Documentar/forçar que só o proxy alcança o Node; saltos de `TRUST_PROXY` | Sim (infra) |
| 3.3 | SEC-10, SEC-09, SEC-14, SEC-12 | Cabeçalhos extras, escape de aspas, validar destinatários, reduzir logs | Não |
| 3.4 | SEC-06, SEC-11 | Validade do token; nomes públicos | **Sim — decisão de negócio** |

## Etapa 4 — Fontes e desempenho (M–L)

| # | Achados | Mudança | Aprovação |
|---|---|---|---|
| 4.1 | A2 | `aplicarConfiguracaoOpenMeteo` no forecast (após decisão da Etapa 0) | **Sim** |
| 4.2 | A3 | **Medir primeiro** (contar chamadas/dia por fonte). Depois reusar snapshot do painel, pool de 3–4 bases | **Sim** — muda frequência de coleta dos alertas |
| 4.3 | M1, M2 | `Promise.allSettled` + `AbortSignal` com orçamento global | Sim (comportamento sob falha) |
| 4.4 | PERF-01..04 | `compression`, cache longo versionado, hero em WebP/AVIF, favicon leve, aquecimento do cache | Não (visual idêntico) |

## Etapa 5 — Design/UX (S–M)

| # | Achados | Mudança | Aprovação |
|---|---|---|---|
| 5.1 | DES-01, DES-02 | Piso de fonte 12 px; alvos 44 px | **Sim** — muda o visual da TV |
| 5.2 | DES-05 | Cor neutra para status de progresso | Não |
| 5.3 | DES-03, DES-04, DES-06 | Altura dos cards, scrim no hero mobile, stack de fontes | Sim (visual) |

## Etapa 6 — Qualidade contínua (M)

- ESLint (incluindo `no-floating-promises`) e script `check`; CI rodando `npm test` + auditoria de dependências.
- Quebrar `montarRelatorio` (B7) e consolidar duplicações (B8) **só depois** dos testes de regressão das Etapas 1–2.
- Adotar `@playwright/test` para a UI (**requer aprovação para instalar**), reaproveitando `auditoria/harness/` e `auditoria/testes-e2e/`.
- Completar a revisão dos módulos não cobertos (riskEngine, motorGatilhos, weatherSourcePolicy, monitorSecas, oceanop, inmetObservations, templates).

## Ordem sugerida

Etapa 0 → 1.1 + 1.2 + 1.3 (com testes) → 2.1/2.2 → 3.1 → 4.4 → 2.3–2.6 → 4.1–4.3 → 5 → 6.
