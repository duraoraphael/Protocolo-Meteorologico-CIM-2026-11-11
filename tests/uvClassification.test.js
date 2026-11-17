const test = require("node:test");
const assert = require("node:assert/strict");
const { classificarUv, arredondarUv, formatarUv, recomendacoesUv } = require("../src/logic/uvClassification");
const { classificarIndiceUv: uvAr } = require("../src/sources/airQuality");
const { classificarIndiceUv: uvPrevisao } = require("../src/sources/openMeteo");
const { avaliarDia } = require("../src/logic/weeklyBuilder");

const CASOS = [
  [0, "NORMAL"], [3, "NORMAL"], [4, "NORMAL"],
  [5, "ATENÇÃO"], [6, "ATENÇÃO"],
  [7, "ALERTA"], [8, "ALERTA"], [10, "ALERTA"],
  [11, "EMERGÊNCIA"], [12, "EMERGÊNCIA"], [15, "EMERGÊNCIA"],
];

test("faixas inteiras do UV", () => {
  for (const [uv, nivel] of CASOS) assert.equal(classificarUv(uv).nivel, nivel, `UV ${uv}`);
});

test("decimais próximos aos limites: Math.round, mesma regra na exibição e na classificação", () => {
  const esperado = [
    [4.4, "4", "NORMAL"], [4.5, "5", "ATENÇÃO"], [6.5, "7", "ALERTA"],
    [7.0, "7", "ALERTA"], [10.5, "11", "EMERGÊNCIA"], [10.9, "11", "EMERGÊNCIA"],
  ];
  for (const [uv, exibicao, nivel] of esperado) {
    assert.equal(formatarUv(uv), exibicao, `exibição de ${uv}`);
    assert.equal(classificarUv(uv).nivel, nivel, `classificação de ${uv}`);
    assert.equal(classificarUv(uv).valor, uv, "valor original preservado");
  }
});

test("dado indisponível ou inválido não vira NORMAL", () => {
  for (const v of [null, undefined, "", "abc", NaN, Infinity, -1, 31]) {
    assert.equal(classificarUv(v), null, String(v));
    assert.equal(arredondarUv(v), null);
  }
  assert.equal(formatarUv(null), "Indisponível");
  assert.deepEqual(recomendacoesUv("NORMAL"), []);
  assert.deepEqual(recomendacoesUv(null), []);
});

test("recomendações cumulativas por nível", () => {
  const evitar = "Evitar exposição prolongada ao sol.";
  const sombra = "Buscar sombra entre 10h e 16h.";
  const minimizar = "A exposição direta ao sol deve ser minimizada ao máximo.";
  assert.deepEqual(recomendacoesUv("ATENÇÃO"), [evitar]);
  assert.deepEqual(recomendacoesUv("ALERTA"), [evitar, sombra]);
  assert.deepEqual(recomendacoesUv("EMERGÊNCIA"), [evitar, sombra, minimizar]);
});

test("todas as fontes usam a mesma classificação central", () => {
  for (const [uv, nivel] of CASOS) {
    assert.equal(uvAr(uv).nivel, nivel);
    assert.equal(uvPrevisao(uv).nivel, nivel);
  }
  assert.equal(uvAr(null), null);
  assert.equal(uvPrevisao(null), null);
});

test("relatório semanal/D+3 classifica pelo mesmo módulo", () => {
  const dia = (uvMax) => ({ codigoTempo: 1, precipitacaoMm: 0, probabilidadeChuva: 0, rajadaMaxKmh: 10, uvMax });
  const tipos = (uv) => avaliarDia(dia(uv), null).riscos.map((r) => r.tipo);
  assert.deepEqual(tipos(4.4), []);
  assert.deepEqual(tipos(5), ["UV ATENÇÃO"]);
  assert.deepEqual(tipos(10.4), ["UV ALERTA"]);
  assert.deepEqual(tipos(10.5), ["UV EMERGÊNCIA"]);
});
