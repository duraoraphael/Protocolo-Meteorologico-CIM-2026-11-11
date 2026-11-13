# Auditoria de Design e UX — Painel CIM

- Data: 2026-11-13 · Skills: `design:design-critique` e `design-superpowers:design-review` (maturidade **L0**: sem DESIGN.md nem design system; "DS Compliance" não se aplica; "Motion Reviewer" limitado a `prefers-reduced-motion`).
- Evidência: `evidencias/screenshots/` — `desktop-1920x1080.png`, `notebook-1366x768.png`, `tablet-768x1024.png`, `mobile-430x932.png`, `mobile-375x812.png`, `fluxo-01..04`, `mobile-menu-aberto.png`, `mobile-responsaveis.png`.
- Limites: painel visto com dados reais do Rio de Janeiro. Telas Monitoramento e Sobre o CIM e a gestão de responsáveis desbloqueada **não foram abertas**. Contraste medido só contra fundos sólidos; texto sobre a foto do hero não medido.

## Impressão geral

Painel de TV coeso e profissional: identidade escura verde/amarelo, hierarquia clara (hero → ocorrências → COR-Rio → indicadores → tabelas), boa densidade para operação. A maior oportunidade é legibilidade (fontes pequenas, alvos de toque) e pequenos acertos de estado/estrutura.

## O que funciona bem

- Hierarquia: título e relógio dominam o hero; badges "ATENÇÃO" e títulos de ocorrência chamam a atenção correta.
- Responsividade: **sem overflow horizontal** em 375, 430, 768, 1366 e 1920 px; menu vira hambúrguer (`aria-expanded` correto).
- Acessibilidade: skip link, landmarks (`header/nav/main`), `lang="pt-BR"`, 1 `h1`, nenhuma `<img>` sem `alt`, 0 controles sem nome acessível, foco visível (outline 1,6 px), `prefers-reduced-motion`, 3 regiões `aria-live`.
- Diálogos exemplares: `aria-modal`, foco inicial no campo, Enter envia, ESC fecha e devolve o foco ao botão de origem, "Senha incorreta." exibida com foco mantido.
- Transparência: cada indicador mostra a fonte; estados degradados explícitos ("Coleta parcial…", "Informação indisponível").
- Feedback em operação longa: o botão muda por fase ("Gerando relatório…", "Gerando PDF…", "Enviando relatório…").

## Usabilidade

| Achado | Sev. | Recomendação |
|---|---|---|
| Alvos interativos pequenos: 11/28 <44 px no mobile e 15/28 no desktop (inclui "Ver mais →") | 🟡 | Padding para 44×44 px no mobile |
| "Monitoramento/Responsáveis/Gerar e Enviar" são botões que abrem diálogos; só "Início" é âncora. A URL não reflete a tela | 🟢 | Aceitável para painel de TV; considerar `#hash` por diálogo |
| Mensagem de progresso ("Gerando o PDF completo…") aparece com cor de erro (vermelho/salmão) | 🟢 | Classe de status neutra (`dashboard.js:299-308`) |
| O modal não informa duração esperada durante a geração | 🟢 | Texto "pode levar até ~1 min" |
| Sucesso da geração não verificado na UI (limite do harness) | — | Validar em homologação |

## Hierarquia visual

- **Primeiro foco:** "PROTOCOLO METEOROLÓGICO" e o relógio — correto para TV de sala de controle.
- **Fluxo:** hero → ocorrências → COR-Rio → indicadores → vento/chuva por período; coerente.
- **Ênfase:** valores grandes (28,2 °C; 42 km/h) corretos. O card **Índice UV** estica à altura do card INMET e deixa grande vazio (desktop). No mobile, o subtítulo do hero cai sobre a imagem do prédio, com contraste menor.

## Consistência

| Elemento | Problema | Recomendação |
|---|---|---|
| Tipografia | 79 elementos <12 px; 18 regras CSS com 9–11 px. `Segoe UI, Arial`: em Linux/Android cai para Arial | Piso 12 px; stack `system-ui, "Segoe UI", Roboto, Arial` |
| Cores de estado | Vermelho usado para erro e para progresso | Tokens `--status-info/--status-error` |
| Cards | Alturas desiguais entre cards irmãos | `align-items:start` |

## Acessibilidade (WCAG 2.1 AA)

- **Contraste:** 0 falhas em 248 elementos sobre fundo sólido (cálculo próprio; texto sobre foto não medido) → **passando com ressalvas**.
- **Teclado:** ordem lógica (skip link → CIM → menu → seletor de base); foco visível; ESC fecha diálogos; sem armadilha observada.
- **Alvos de toque:** parcialmente abaixo de 44 px (WCAG 2.2 AA exige 24 px, que a maioria cumpre; 44 px é boa prática para toque).
- **Movimento:** `prefers-reduced-motion` tratado; nada piscante identificado.

## Prioridades

1. Fontes <12 px e áreas de toque (DES-01/02).
2. Separar estilo de status e de erro no modal (DES-05).
3. Scrim no hero mobile e equilibrar altura dos cards (DES-03/04).
4. Otimizar a imagem do hero (PERF-02).
