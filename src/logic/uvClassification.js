// Classificação operacional do Índice UV — ÚNICA fonte de verdade do CIM.
//
// Dashboard, PDFs (inclusive D+3), e-mails, painel de ocorrências e relatório
// semanal consomem este módulo; nenhum canal define faixas próprias.
//
//   UV 0–4   NORMAL      (verde)
//   UV 5–6   ATENÇÃO     (amarelo)
//   UV 7–10  ALERTA      (laranja)
//   UV ≥ 11  EMERGÊNCIA  (vermelho)
//
// Regra de arredondamento (a mesma do restante do projeto: Math.round, meio
// para cima): o valor recebido da API é arredondado para inteiro UMA vez e esse
// inteiro é usado tanto na classificação quanto na exibição. O valor original
// nunca é alterado. Ex.: 4,5 → 5 (ATENÇÃO); 6,5 → 7 (ALERTA); 10,5 → 11
// (EMERGÊNCIA); 10,9 → 11 (EMERGÊNCIA).
//
// Dado ausente, não numérico ou fora do intervalo físico (0–30) NÃO é NORMAL:
// a classificação devolve null e cada canal exibe "indisponível".

const { acumularRecomendacoes } = require("./recomendacoesCumulativas");

const UV_MAXIMO_VALIDO = 30;

// Ordem de prioridade operacional: EMERGÊNCIA > ALERTA > ATENÇÃO > NORMAL.
const FAIXAS_UV = Object.freeze([
  Object.freeze({ nivel: "EMERGÊNCIA", min: 11, max: Infinity, faixa: "11+", cor: "#D92828" }),
  Object.freeze({ nivel: "ALERTA", min: 7, max: 10, faixa: "7–10", cor: "#E67E22" }),
  Object.freeze({ nivel: "ATENÇÃO", min: 5, max: 6, faixa: "5–6", cor: "#F2C500" }),
  Object.freeze({ nivel: "NORMAL", min: 0, max: 4, faixa: "0–4", cor: "#00843D" }),
]);

// Cada nível guarda só a sua orientação; ALERTA e EMERGÊNCIA herdam as dos
// níveis inferiores via acumularRecomendacoes (regra única do CIM).
// NORMAL não gera alerta operacional de UV.
const RECOMENDACOES_UV = Object.freeze({
  uv: Object.freeze({
    "ATENÇÃO": Object.freeze(["Evitar exposição prolongada ao sol."]),
    ALERTA: Object.freeze(["Buscar sombra entre 10h e 16h."]),
    "EMERGÊNCIA": Object.freeze(["A exposição direta ao sol deve ser minimizada ao máximo."]),
  }),
});

function numeroOuNulo(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string" || !valor.trim()) return null;
  const n = Number(valor.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Inteiro usado na exibição e na classificação; null se ausente/inválido. */
function arredondarUv(valor) {
  const n = numeroOuNulo(valor);
  if (n === null || n < 0 || n > UV_MAXIMO_VALIDO) return null;
  return Math.round(n);
}

/**
 * @returns {{nivel:string, faixa:string, cor:string, valor:number, valorInteiro:number, ordem:number}|null}
 *   null quando o dado é indisponível ou inválido (nunca assume NORMAL).
 */
function classificarUv(valor) {
  const inteiro = arredondarUv(valor);
  if (inteiro === null) return null;
  const faixa = FAIXAS_UV.find((f) => inteiro >= f.min && inteiro <= f.max);
  return {
    nivel: faixa.nivel,
    faixa: faixa.faixa,
    cor: faixa.cor,
    valor: numeroOuNulo(valor),
    valorInteiro: inteiro,
    ordem: FAIXAS_UV.length - 1 - FAIXAS_UV.indexOf(faixa),
  };
}

/** Texto de exibição do índice (inteiro) ou `indisponivel`. */
function formatarUv(valor, indisponivel = "Indisponível") {
  const inteiro = arredondarUv(valor);
  return inteiro === null ? indisponivel : String(inteiro);
}

/** Recomendações cumulativas do nível; NORMAL/indefinido => []. */
function recomendacoesUv(nivel) {
  return acumularRecomendacoes("uv", nivel, RECOMENDACOES_UV);
}

module.exports = {
  FAIXAS_UV,
  RECOMENDACOES_UV,
  arredondarUv,
  classificarUv,
  formatarUv,
  recomendacoesUv,
};
