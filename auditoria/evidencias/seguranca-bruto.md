# Auditoria de segurança (bruto) — Protocolo Meteorológico CIM

Data: 2026-11-13 · Modo: somente leitura no código da aplicação · Alvo dinâmico: harness `http://127.0.0.1:3999` + instâncias isoladas de `criarApp()` (pipeline simulado, sem .env, sem agendadores) em 127.0.0.1:4101/4102, script em scratchpad (`teste-tentativas.js`, senha aleatória gerada em memória e nunca impressa).
Nenhum valor de segredo foi copiado. `.env` lido só por nomes de variáveis.

Legenda: **[CONFIRMADO]** = reproduzido por teste · **[CÓDIGO]** = observado apenas no código/config.

---

## Resumo

| ID | Sev. | Título | Status |
|----|------|--------|--------|
| SEC-01 | MÉDIO | Atraso progressivo não serializa tentativas paralelas (força bruta ~16 palpites/s) | CONFIRMADO |
| SEC-02 | MÉDIO | Dependência `undici` com 4 vulnerabilidades (2 altas) — incl. bypass de validação TLS | CONFIRMADO (npm audit) |
| SEC-03 | MÉDIO (condicional) | `TRUST_PROXY` ativo + porta Node exposta: X-Forwarded-For forjado zera o controle de tentativas | CONFIRMADO (instância isolada) |
| SEC-04 | MÉDIO (deploy Render) | `render.yaml` sem `TRUST_PROXY`: todos os clientes compartilham o mesmo balde de tentativas; HSTS nunca enviado | CÓDIGO |
| SEC-05 | BAIXO | Contador de tentativas é zerado por qualquer login correto do mesmo IP (NAT/proxy compartilhado) | CONFIRMADO (observado no harness compartilhado) |
| SEC-06 | BAIXO | Token de download de PDF trafega na query string (logs/histórico) | CÓDIGO |
| SEC-07 | BAIXO | Chromium com `--no-sandbox` em Linux/container | CÓDIGO |
| SEC-08 | BAIXO | Gravação não atômica de `data/responsaveis.json` (perda de atualização em concorrência) | CÓDIGO |
| SEC-09 | BAIXO | `esc()` de pdfTemplate não escapa aspas e é reutilizado em atributos do e-mail | CÓDIGO |
| SEC-10 | BAIXO | Cabeçalhos de defesa complementares ausentes (Permissions-Policy, COOP/CORP); `Cache-Control: public` em estáticos | CONFIRMADO |
| SEC-11 | BAIXO | Nomes de responsáveis (dado pessoal) públicos em `GET /api/responsaveis` | CONFIRMADO |
| SEC-12 | BAIXO | Logs de erro com stack trace e caminhos completos do servidor | CONFIRMADO (log do harness) |
| SEC-13 | INFO | Possíveis strings no formato de senha de app no histórico git — verificar manualmente | CÓDIGO (inconclusivo) |

Controles verificados como **adequados** estão na seção final (OK-xx).

---

## Achados

### SEC-01 — Atraso progressivo não limita tentativas concorrentes — MÉDIO
- **OWASP:** A07:2021 Identification and Authentication Failures (ASVS V2.2.1 anti-automação)
- **Arquivo:** `src/security/tentativas.js:70-93` (atraso calculado em `:72-73` antes de `registrarFalha` em `:91`); limite global `maxEmEsperaTotal = 500` em `:23`
- **Status:** CONFIRMADO (instância isolada porta 4101)
- **Evidência:**
  ```
  node teste-tentativas.js <raiz>
  A seq 1..3                         401 (0-18 ms)          -> 3 falhas
  A paralelo 10 (todas avaliadas?)   {"status401":10,"msTotal":520,"msCada":[519 x10]}
  A XFF forjado                      {"status":401,"ms":30008}
  A senha correta apos falhas        {"status":200,"ms":30027}
  ```
  As 10 tentativas paralelas leram o mesmo contador (3 falhas → 0,5 s) e **todas foram avaliadas** em 0,52 s. O atraso é por requisição, não por IP serializado.
- **Impacto:** com o teto global de 500 requisições em espera e atraso máximo de 30 s, um único atacante avalia ~500/30 s ≈ 16,7 senhas/s (~1,4 milhão/dia). Com senha de 12 caracteres aleatória é inviável; com senha humana/dicionário é viável. Efeito colateral: o atacante ocupa as 500 vagas e usuários legítimos com atraso > 0 recebem 503.
- **Correção:** serializar por IP (fila/mutex por chave; rejeitar com 429 se já houver uma verificação pendente do mesmo IP), ou registrar a falha "provisoriamente" antes do `await dormir`. Adicionar limite global de falhas/minuto (ex.: alerta + bloqueio temporário global de tentativas após N falhas/min). Exigir senha ≥ 16 caracteres aleatória (documentar gerador). Opcional: rate limit no proxy reverso.

### SEC-02 — `undici` vulnerável (2 high, 2 moderate) — MÉDIO
- **OWASP:** A06:2021 Vulnerable and Outdated Components
- **Arquivo:** `package.json` (`undici ^6.28.1` → instalado 6.29.0; `cheerio` → `undici@7.30.0`); `undici` é o dispatcher global (`src/security/certificados.js:44,231-233`)
- **Status:** CONFIRMADO
- **Evidência:** `npm audit --omit=dev` → `4 vulnerabilities (2 moderate, 2 high)`: GHSA-2m5v-pch6-74hx (bypass de validação de certificado TLS por opções tls descartadas no Agent), GHSA-qrxm-fqhp-jwvm (DoS via renegociação TLS 1.2), GHSA-9fm3-97px-rjf6 (WebSocket PONG), GHSA-55wc-3pg8-jfw6 (decompress interceptor). "fix available via npm audit fix".
- **Impacto:** a aplicação cria `new Agent({ connectTimeout })` global e consome APIs externas (INMET, OCEANOP com credenciais) — o advisory de bypass TLS é diretamente relevante a esse padrão de uso (verificar se as opções tls customizadas são usadas em `inmetObservations.js`/`climaSaudeService.js`/`monitorSecas.js`, que montam Agent próprio com CAs do sistema).
- **Correção:** `npm audit fix` (atualizar `undici` e `cheerio`), regenerar lock, rodar testes; adicionar `npm audit --omit=dev --audit-level=high` no CI.

### SEC-03 — XFF forjado zera o controle quando `TRUST_PROXY` está ativo e a porta Node é alcançável diretamente — MÉDIO (condicional)
- **OWASP:** A07:2021 / A05:2021 Security Misconfiguration
- **Arquivo:** `server.js:68-69`, `src/security/tentativas.js:110-117`; `src/security/https.js:15` (`HOST` vazio = todas as interfaces)
- **Status:** CONFIRMADO em instância isolada com `trustProxy: "true"` (porta 4102)
- **Evidência:**
  ```
  B XFF rotativo 1..6 (198.51.100.N)   401 em 0-3 ms (nenhum atraso)
  B mesmo XFF fixo 1..4                 401; 4ª tentativa 518 ms (atraso só com IP fixo)
  ```
  Com o padrão (TRUST_PROXY ausente) o XFF forjado **não** contorna (teste A: 30 008 ms).
- **Impacto:** se `TRUST_PROXY=true`/número for configurado e a porta 3210 continuar acessível sem passar pelo proxy (HOST não restrito), o atacante troca `X-Forwarded-For` a cada tentativa e elimina o atraso (força bruta ilimitada).
- **Correção:** documentado em INSTALACAO (`TRUST_PROXY=127.0.0.1` + `HOST=127.0.0.1`) — tornar obrigatório: recusar iniciar se `TRUST_PROXY` estiver ativo e `HOST` não for loopback; preferir lista de IPs do proxy em vez de `true`/número.

### SEC-04 — Deploy Render: balde de tentativas compartilhado e sem HSTS — MÉDIO (se Render for usado em produção)
- **OWASP:** A05:2021 Security Misconfiguration / A02:2021
- **Arquivo:** `render.yaml:28-58` (não define `TRUST_PROXY`), `src/security/cabecalhos.js:54` (HSTS só com `req.secure`)
- **Status:** CÓDIGO
- **Impacto:** atrás do proxy do Render, `req.ip` = IP do proxy para todos. (a) Falhas de um atacante impõem até 30 s de atraso a todos os operadores e a vaga global (SEC-01) satura; (b) um login correto de operador zera o contador do atacante (SEC-05); (c) `req.secure` é falso → `Strict-Transport-Security` nunca enviado. Plano free também apaga `data/responsaveis.json` a cada deploy (disponibilidade/integridade).
- **Correção:** definir `TRUST_PROXY=1` no render.yaml (Render injeta XFF), validar que req.ip passa a ser o cliente; enviar HSTS quando `X-Forwarded-Proto=https` confiável.

### SEC-05 — Sucesso de qualquer usuário no mesmo IP zera as falhas do atacante — BAIXO
- **OWASP:** A07:2021
- **Arquivo:** `src/security/tentativas.js:87-89` (`registros.delete(chave)` no sucesso)
- **Status:** CONFIRMADO de forma incidental no harness compartilhado: após 2 tentativas erradas com 4 s e 8 s de atraso, a 3ª respondeu em 0,0026 s (outro processo de teste autenticou-se com sucesso a partir de 127.0.0.1 e zerou o contador). Por isso o teste de XFF no harness compartilhado foi descartado e repetido em instância isolada (SEC-03).
- **Impacto:** em rede com NAT/proxy (o próprio caso de uso descrito), um atacante interno compartilhando IP com operadores tem o atraso zerado periodicamente.
- **Correção:** combinar com limite global de falhas (SEC-01); considerar chave por IP+fingerprint de sessão ou não zerar contador de terceiros (manter janela deslizante de falhas).

### SEC-06 — Token de download na query string — BAIXO
- **OWASP:** A04:2021 Insecure Design / ASVS V3.1.1
- **Arquivo:** `server.js:199-200,278-280`, `src/security/linksRelatorio.js:23`
- **Status:** CÓDIGO (token 256 bits, 24 h, por arquivo, validado por regex — bom)
- **Impacto:** URL com token fica em histórico do navegador, logs de proxy/IIS e pode ser repassada; vale 24 h e não é de uso único. `Referrer-Policy: no-referrer` mitiga vazamento via Referer.
- **Correção:** reduzir validade (ex.: 1 h) e/ou tornar uso único; excluir query string dos logs do proxy.

### SEC-07 — Chromium sem sandbox em Linux — BAIXO
- **OWASP:** A05:2021
- **Arquivo:** `src/render/chromiumSeguro.js:19`
- **Status:** CÓDIGO. Mitigações fortes presentes: JS desabilitado (`:28`), interceptação bloqueando tudo exceto `data:`/`about:` (`:29-37`), usuário não-root `pptruser` (Dockerfile).
- **Correção:** na imagem oficial do Puppeteer a sandbox funciona com o perfil seccomp adequado; avaliar remover `--no-sandbox` no container.

### SEC-08 — Escrita não atômica do cadastro de responsáveis — BAIXO
- **OWASP:** A04:2021 (integridade)
- **Arquivo:** `src/config/recipients.js:102-105` (read-modify-write sem lock; `corRio.js:197-202` já usa tmp+rename)
- **Status:** CÓDIGO
- **Impacto:** requisições simultâneas autenticadas podem perder alterações ou truncar o JSON; arquivo corrompido derruba listagem (`:98`).
- **Correção:** gravar em arquivo temporário + `renameSync` e serializar escritas (fila em memória).

### SEC-09 — `esc()` sem escape de aspas usado em atributos — BAIXO
- **OWASP:** A03:2021 Injection (XSS em HTML de e-mail)
- **Arquivo:** `src/render/pdfTemplate.js:13-19` (escapa só `& < >`); usado em atributos em `src/render/emailTemplate.js:1,242,245,251` (`data-*="${esc(card.nivel)}"`)
- **Status:** CÓDIGO. Os valores atuais são níveis normalizados internos (NORMAL/ATENÇÃO/ALERTA/EMERGÊNCIA) → não explorável hoje.
- **Correção:** usar `escAtributo` (ou o `esc` completo de `emailComponents.js:18-26`) em contexto de atributo; unificar uma única função de escape.

### SEC-10 — Cabeçalhos complementares ausentes — BAIXO
- **OWASP:** A05:2021
- **Arquivo:** `src/security/cabecalhos.js:49-56`
- **Status:** CONFIRMADO
- **Evidência:** `curl -I http://127.0.0.1:3999/` → presentes: `Content-Security-Policy: default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`; sem `X-Powered-By`. Ausentes: `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`. Estáticos com `Cache-Control: public, max-age=0`.
- **Correção:** adicionar `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.

### SEC-11 — Nomes de responsáveis públicos — BAIXO
- **OWASP:** A01:2021 / LGPD (minimização)
- **Arquivo:** `server.js:322,340-346`
- **Status:** CONFIRMADO: `curl /api/responsaveis` → 200 sem autenticação, lista bases com `responsaveis:[{nome}]`. E-mails corretamente protegidos (só em `POST /api/responsaveis/consultar` com senha). `/api/preview` não contém e-mails (grep `@` vazio).
- **Impacto:** decisão de design (TV), mas expõe nomes de pessoas a quem alcança o painel na rede.
- **Correção:** aceitar formalmente o risco (LGPD) ou exibir só contagem/iniciais.

### SEC-12 — Stack traces e caminhos completos nos logs — BAIXO
- **OWASP:** A09:2021 Security Logging and Monitoring Failures
- **Arquivo:** `server.js:291-297`, `src/security/erros.js:31`, `src/sources/httpJsonClient.js`
- **Status:** CONFIRMADO em `auditoria/evidencias/logs/harness-server.log` (stack com `C:\Users\...\src\sources\oceanop.js:189` etc.). Respostas HTTP **não** vazam (ver OK-05).
- **Correção:** aceitável para log local; garantir permissões restritas e rotação dos logs; não logar URLs com credenciais/tokens.

### SEC-13 — Possíveis strings tipo "senha de app" no histórico git — INFO (inconclusivo)
- **OWASP:** A02:2021 / A07:2021
- **Status:** CÓDIGO. `.env` nunca foi versionado (`git log --all -- .env` vazio) e está em `.gitignore`/`.dockerignore`. Busca por JWT (`eyJ...`) no histórico: 0. Busca pelo padrão `xxxx xxxx xxxx xxxx` (formato de senha de app Gmail) em linhas adicionadas: 3 ocorrências — provavelmente placeholders de documentação, **não verificado** (valores não impressos). E-mails corporativos/gmail aparecem em `INSTALACAO_SERVIDOR_PETROBRAS.md` (2), `src/cliTestarEmail.js` (1), testes (5).
- **Correção:** revisar manualmente as 3 ocorrências (`git log -p | grep -nE '[a-z]{4} [a-z]{4} [a-z]{4} [a-z]{4}'`); se alguma for real, revogar a senha de app. Rodar gitleaks/trufflehog no CI. Avaliar substituir e-mails reais em docs/testes por `example.test`.
- **Observação operacional:** o `.env` local contém credenciais reais de serviço (nomes: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `DASHBOARD_PASSWORD`, `WINDY_API_KEY`, `OCEANOP_USUARIO`, `OCEANOP_SENHA`, `REPORT_RECIPIENTS`) e comentários orientando colar token Bearer do DevTools — manter fora de backups/compartilhamentos; preferir cofre de segredos/variáveis do serviço.

---

## Controles verificados como adequados (OK)

- **OK-01 Autorização por rota [CONFIRMADO]:** sem senha → 401 em `POST /api/gerar-relatorio`, `POST /api/responsaveis/consultar`, `POST|PUT|DELETE /api/responsaveis` (corpo `{}`).
- **OK-02 Comparação de senha [CÓDIGO]:** SHA-256 + `crypto.timingSafeEqual` (`src/security/senha.js:35-44`), tamanho máx. 1024, mín. 12 caracteres, recusa valor padrão público, servidor não sobe sem senha (`server.js:424-431`). Atraso aplicado também à senha correta (sem oráculo de tempo) — CONFIRMADO (correta após falhas: 200 em 30 027 ms).
- **OK-03 Atraso progressivo [CONFIRMADO]:** sequencial no harness 4 s → 8 s; sem bloqueio da senha correta. XFF forjado ignorado com `TRUST_PROXY` padrão (30 008 ms).
- **OK-04 `/relatorios/:arquivo` [CONFIRMADO]:** traversal `..%2f`, `..%5c`, `%2e%2e%2f`, `....//`, `.env.pdf`, `/../server.js` → 404 (regex `NOME_PDF_VALIDO`, `sendFile` com `root` e `dotfiles:"deny"`); token inválido/array/duplicado → 401 com `WWW-Authenticate: Basic`; token 256 bits por arquivo com expiração; Basic Auth passa pelo mesmo controle de tentativas; arquivos fora de `arquivosOperacionais` → 404. `/logo/..`, `/.env`, `/.git/config`, `/data/...`, `/output/` → 404.
- **OK-05 Erros [CONFIRMADO]:** JSON malformado → `400 {"erro":"Requisição inválida."}`; corpo >100 kb → `413 {"erro":"Requisição muito grande."}`; sem stack trace; 404 em JSON.
- **OK-06 CORS [CONFIRMADO]:** preflight `OPTIONS` com `Origin: https://evil.example` → 404, sem `Access-Control-Allow-*`. CSRF: rotas sensíveis exigem senha no corpo JSON (`express.json` só parseia `application/json`).
- **OK-07 Validação `/api/responsaveis` [CÓDIGO]:** nome ≤100, sem `< > " '` e controle; e-mail regex estrita ≤254 (local ≤64); bases via `Object.hasOwn` (bloqueia `__proto__`/`constructor`); mensagens de erro fixas (`publico:true`). Não foi testado dinamicamente por limite de turnos.
- **OK-08 XSS no frontend [CÓDIGO]:** `Dashboard.escape` cobre `& < > " '`; todos os dados externos (INMET, COR-Rio, Clima e Saúde, cadastro) passam por `escape` antes de `innerHTML`; links COR-Rio restritos a `https://cor.rio/` (`dashboard-components.js:550`, `corRio.js:61-69`); senha do modal só em memória (sem localStorage/cookie). CSP sem `'unsafe-inline'` bloqueia script inline/handlers como segunda camada.
- **OK-09 SSRF [CÓDIGO]:** URLs de `src/sources/*` são constantes; entrada do usuário limitada a `cidade` validada por allowlist (`getCidade`/`getBaseDistribuicao` com `Object.hasOwn`). Sem SSRF por parâmetro.
- **OK-10 PDF/Puppeteer [CÓDIGO]:** JS desligado + bloqueio de rede (exceto `data:`/`about:`) — escape falho não vira SSRF/`file://`.
- **OK-11 TLS de saída [CÓDIGO]:** validação TLS mantida; CAs SHA-1/MD5 e vencidas filtradas (`certificados.js`); servidor HTTPS com `minVersion: TLSv1.2`; redirecionamento HTTP→HTTPS valida Host (`https.js:40-64`).
- **OK-12 Container [CÓDIGO]:** imagem `ghcr.io/puppeteer/puppeteer:23.11.1` roda como `pptruser` (não-root); `npm ci --omit=dev`; `.dockerignore` exclui `.env`, `.git`, `node_modules`, PDFs e `data/*.json`. Observação: `.dockerignore` não exclui `auditoria/`, `tests/`, `scripts/` (copiados para a imagem — BAIXO/higiene). `render.yaml` usa `sync:false` para segredos (não versionados).

## Itens não cobertos / limitações
- Testes dinâmicos de entrada malformada em `/api/responsaveis` (exigem senha; adiados pelo limite de turnos).
- Revisão linha a linha de todos os templates de e-mail/PDF (amostragem por grep de interpolações não escapadas; nenhuma explorável encontrada).
- Verificação de qual uso de `Agent`/opções tls é afetado pelo GHSA-2m5v-pch6-74hx.
- Testes no harness compartilhado sofreram interferência de outros processos (ver SEC-05); medições de tentativas foram refeitas em instâncias isoladas. Total de tentativas de senha: harness ≈ 9; instâncias isoladas 26 (própria senha aleatória).
