# Auditoria de Performance — Protocolo Meteorológico CIM

- Data: 2026-11-13 · Ambiente: harness local (`127.0.0.1:3999`), Windows 11, Chromium do Playwright MCP. **Rede loopback**: tempos de transferência não refletem a rede corporativa/Render.
- **Não medidos:** Core Web Vitals (LCP/CLS/INP), memória, carga concorrente, uso de CPU do Puppeteer, tempos reais das fontes externas sob falha.

## Medições (reproduzíveis)

Comando: `curl -s -o /dev/null -w "%{size_download} %{time_total}" -H "Accept-Encoding: gzip" <url>`

| Recurso | Tamanho (bytes) | Compressão | Cache-Control |
|---|---|---|---|
| `/` (HTML) | 6.499 | nenhuma | `public, max-age=0` |
| `/dashboard.js` | 27.511 | nenhuma | `max-age=0` |
| `/dashboard-components.js` | 49.831 | nenhuma | `max-age=0` |
| `/dashboard.css` | 40.305 | nenhuma | `max-age=0` |
| `/logo/ediselonge.png` (hero) | **2.420.303** | PNG | `max-age=0` |
| `/logo/CIM.png` (favicon) | 589.704 | PNG | `max-age=0` |
| `/logo/Petrobras_horizontal_logo.svg.png` | 51.380 | PNG | `max-age=0` |
| `/api/preview?cidade=rio_de_janeiro` | 98.913 | nenhuma | `no-store` |

Navegação (Chromium, 5 viewports): DOMContentLoaded 41–56 ms, load 43–60 ms, rede ociosa em ~570–585 ms (loopback). Sem erros de console nem exceções de página.

API: `/api/preview` com cache quente 3–13 ms (3 repetições); **primeira consulta de base fria (Macaé) 2,35 s**; `/api/cor-rio` 2 ms; `/api/monitoramento/saude` 18 ms.

## Achados

| ID | Camada | Problema | Sev. | Evidência | Recomendação |
|---|---|---|---|---|---|
| PERF-02 | Frontend/rede | Hero PNG de 2,4 MB em toda visita (≈80 % do peso da página). Decorativo (`alt=""`), `fetchpriority="high"` | MÉDIO | tabela acima; `dashboard.html:14` | WebP/AVIF ~150–300 KB; variantes por largura (`srcset`) para mobile |
| PERF-01 | Backend/HTTP | Sem compressão (JSON de 99 KB, JS+CSS ~118 KB sem gzip/br) e `max-age=0` em tudo | MÉDIO | `curl` sem `Content-Encoding` | Middleware `compression`; `Cache-Control` longo para imagens/JS/CSS versionados (`?v=` já é usado no CSS) |
| PERF-03 | Frontend | Favicon de 590 KB | BAIXO | tabela | Ícones 32/180 px |
| PERF-04 | Backend | Base fria: 2,35 s na primeira consulta de `/api/preview` | BAIXO | `curl` | Aquecer o cache das bases ao iniciar |
| A3 | Backend/fontes | Monitor de alertas coleta 26 bases a cada 5 min em paralelo, sem reaproveitar o cache do painel (~8.700+ chamadas/dia ao forecast); risco de HTTP 429 e custo | ALTO | leitura de código (`scheduler.js:339`, `alertWatcher.js:638`); estimativa do revisor, **não medida** | Ver AUDITORIA-GERAL A3 |
| M1 | Backend | Coleta sequencial; pior caso >3 min; rota manual sem teto | MÉDIO | leitura de código | `Promise.allSettled` + orçamento global |
| A2 | Fontes/rede | Previsão usa API gratuita e ignora chave paga → limites e licença | ALTO | verificado no código | Ver A2 |

## Frontend × backend × rede × serviços externos

- **Frontend:** leve em JS (≈78 KB sem compressão) e CSS; o gargalo é o peso das imagens (2,4 MB + 0,6 MB) e a ausência de cache.
- **Backend:** o painel é servido de cache em memória (rápido); o risco está na coleta (sequencial, duplicada a cada 5 min), não na rota.
- **Serviços externos:** latência e limites de INMET/Open-Meteo/Clima e Saúde dominam o pior caso; medi apenas uma consulta fria.

## Lacunas

Medir LCP/CLS com a imagem hero em 4G simulado; perfil de memória do processo (Puppeteer + caches) em 24 h; contagem real de chamadas/dia por fonte (instrumentar logs) antes de decidir sobre A3.
