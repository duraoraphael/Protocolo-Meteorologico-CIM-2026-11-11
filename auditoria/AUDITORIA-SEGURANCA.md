# Auditoria de Segurança — Protocolo Meteorológico CIM

- Data: 2026-11-13 · Base: OWASP Top 10 aplicável · Agente: `octo:personas:security-auditor` + verificações minhas
- Método: leitura de código; testes **não destrutivos** contra harness local (`127.0.0.1:3999`, sem `.env`, envio simulado) e duas cópias isoladas (portas 4101/4102) para medir atraso de tentativas (~35 tentativas de senha no total). Nenhum teste contra produção ou sistemas externos. Nenhum segredo foi impresso ou gravado.
- Bruto: `evidencias/seguranca-bruto.md`

## Resumo

| Severidade | Qtde | IDs |
|---|---|---|
| CRÍTICO | 0 | — |
| ALTO | 1 | SEC-02 (dependências) |
| MÉDIO | 3 | SEC-01, SEC-03, SEC-04 |
| BAIXO | 7 | SEC-05, 06, 07, 09, 10, 11, 12 (SEC-08 = M5 em AUDITORIA-GERAL) |

SEC-13 (suspeita de senha de app Gmail no histórico) foi **resolvido como falso positivo**: os 3 trechos (`.env.example:9`, `README.md:54`, `tests/smtpTls.test.js:45`) contêm o placeholder literal `xxxx xxxx xxxx xxxx`.

## Achados

| ID | OWASP | Problema | Sev. | Arquivo | Status da evidência | Correção |
|---|---|---|---|---|---|---|
| SEC-02 | A06 Componentes vulneráveis | `npm audit --omit=dev`: undici (high; inclui GHSA-2m5v-pch6-74hx, bypass de validação TLS quando `Agent` descarta opções `tls`), body-parser (high, DoS), nodemailer (moderate, parser de endereços), qs (moderate; `overrides` ainda resolve versão afetada). O app usa `new Agent({connect:{ca}})` em `inmet.js:27` e `climaSaudeService.js:38` | ALTO | `package.json` | Confirmado (audit). **Exploração do bypass TLS neste uso não verificada** | `npm audit fix`, rodar `npm test`, revisar override do qs |
| SEC-01 | A07 Autenticação | Atraso progressivo não vale para tentativas simultâneas: 10 senhas erradas paralelas do mesmo IP avaliadas em 0,52 s. Com limite global de 500 pendentes e atraso máx. 30 s ≈ 16,7 palpites/s (~1,4 mi/dia). Com as 500 vagas ocupadas, quem já tem atraso recebe 503 | MÉDIO | `src/security/tentativas.js:70-93` | Confirmado (instância isolada) | Reservar/contar a tentativa **antes** de avaliar a senha; limite duro por IP; alertar em volume |
| SEC-03 | A07 / A05 | Com `TRUST_PROXY` ativo e porta do Node acessível direto, variar `X-Forwarded-For` anula o atraso. Em configuração padrão o cabeçalho é ignorado (tentativa seguiu com 30 s) | MÉDIO | `server.js:66-69` | Confirmado (isolada) | Aceitar o Node só do proxy (firewall); configurar número de saltos |
| SEC-04 | A05 Configuração | `render.yaml` não define `TRUST_PROXY`: atrás do proxy do Render todos os usuários compartilham um contador e `req.secure` é falso (sem HSTS) | MÉDIO | `render.yaml` | Observado no código | `TRUST_PROXY=1` |
| SEC-05 | A07 | Login correto de um IP zera o contador de outro cliente errando no mesmo IP | BAIXO | `tentativas.js` | Confirmado | Reset por IP+tentativa |
| SEC-06 | A01/A02 | Token de download de PDF na URL, válido 24 h (aparece em histórico/log de proxy) | BAIXO | `linksRelatorio.js` | Código | Validade menor, uso único |
| SEC-07 | A05 | Chromium `--no-sandbox` no Linux (JS desligado, rede bloqueada em `chromiumSeguro.js`) | BAIXO | `chromiumSeguro.js` | Código | Manter mitigações; contêiner sem root já usado |
| SEC-09 | A03 Injeção | `esc()` em `pdfTemplate` não escapa aspas; usado em atributos de e-mail. Hoje sem vetor | BAIXO | `src/render/pdfTemplate.js` | Código | Escapar `"` e `'` |
| SEC-10 | A05 | Faltam `Permissions-Policy`, COOP, CORP (CSP, nosniff, X-Frame-Options, Referrer-Policy presentes) | BAIXO | `src/security/cabecalhos.js` | Confirmado (curl -I) | Adicionar |
| SEC-11 | A01 | `GET /api/responsaveis` público lista nomes (e-mails protegidos) | BAIXO | `server.js:340` | Confirmado | Decisão de negócio (painel de TV) |
| SEC-12 | A09 Logs | Logs com stack trace e caminhos completos | BAIXO | `server.js:291` | Código | Reduzir detalhe em produção |
| (extra) | A03 | `destinatariosOverride` e `REPORT_RECIPIENTS` não passam por `validarEmail` antes do nodemailer (relevante com o `addressparser` vulnerável) | BAIXO | `sendReport.js:31-39` | Código (revisor) | Validar no ponto de entrada |

## Verificado como adequado

**Por teste:** 5 rotas protegidas → 401 sem senha/senha errada; atraso cresce em tentativas sequenciais (3 rápidas, depois ~0,5 s, ~1 s, ~2 s no harness; 4 s, 8 s no isolado) e a senha correta nunca recebeu 429; traversal em `/relatorios`, `/logo`, `.env`, `.git` → 404; token inválido → 401; JSON malformado → 400; >100 KB → 413 sem stack; sem CORS aberto; rotas inexistentes → 404 JSON; 2–3 gerações simultâneas → 1 aceita e o resto 409.
**Só por leitura:** senha comparada em tempo constante; validação de `/api/responsaveis` (limites, caracteres proibidos); escape no frontend e CSP sem `unsafe-inline`; sem SSRF (única entrada é `cidade`, validada contra lista fixa); Docker sem root.

## Segredos

- `.env` não versionado (`.gitignore`) e nunca presente no histórico (`git log --all -- .env` vazio). O `.env` local contém credenciais reais (Gmail, OCEANOP, Windy, senha do painel): mantenha fora de backups/pastas sincronizadas e **rotacione** se o arquivo já saiu desta máquina.
- Nenhum token JWT/chave no histórico; trechos tipo senha de app eram placeholders.

## Fora do escopo / não feito

- Teste dinâmico de entradas malformadas em `/api/responsaveis`; revisão completa dos templates de e-mail/PDF (amostragem); confirmação de que o uso do undici é realmente afetado pela falha TLS; testes de upload (não há upload na aplicação); testes de carga (proibidos).
