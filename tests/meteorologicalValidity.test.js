const test = require("node:test");
const assert = require("node:assert/strict");
const { classificarDadosRelatorio, validarDadosRelatorio } = require("../src/logic/meteorologicalValidity");

test("zero observado é distinto de falha e previsão", () => {
  const report = {
    precipitacaoDiariaMm: 0, precipitacaoHoraMm: null, precipitacaoUltimas24hMm: 0,
    precipitacaoTotalMm: 5, chuvaPrevistaDiaMm: 7, rajadaMaxKmh: 31, qualidadeAr: { iqar: 53, referenciaEm: "2026-10-23T14:00" },
    inmetObservacao: { status: "operacional", observacao: { medidoEm: "2026-10-23T17:00:00Z" } },
    fontesPorCampo: { precipitacaoDiariaMm: "INMET (A765)", precipitacaoUltimas24hMm: "INMET (A765)", precipitacaoTotalMm: "Open-Meteo", chuvaPrevistaDiaMm: "Open-Meteo", rajadaMaxKmh: "Open-Meteo", "ar.iqar": "Open-Meteo Air Quality" },
    ventoPorPeriodo: [],
  };
  report.classificacaoDados = classificarDadosRelatorio(report);
  assert.equal(report.classificacaoDados.chuvaObservadaDia.estado, "observada");
  assert.equal(report.classificacaoDados.chuvaObservadaDia.valor, 0);
  assert.equal(report.classificacaoDados.chuvaObservadaHora.estado, "indisponivel");
  assert.equal(report.classificacaoDados.chuvaPrevistaDia.estado, "prevista");
  assert.equal(report.classificacaoDados.qualidadeAr.estado, "estimada");
  assert.equal(validarDadosRelatorio(report), true);
});

test("bloqueia medição antiga e valor sem fonte antes da geração", () => {
  const report = {
    inmetObservacao: { status: "degradado", observacao: { desatualizado: true } },
    precipitacaoDiariaMm: 2, fontesPorCampo: { precipitacaoDiariaMm: "INMET" }, ventoPorPeriodo: [],
  };
  report.classificacaoDados = classificarDadosRelatorio(report);
  assert.throws(() => validarDadosRelatorio(report), /Medição INMET antiga/);
  report.precipitacaoDiariaMm = null;
  report.classificacaoDados = classificarDadosRelatorio(report);
  assert.equal(report.classificacaoDados.chuvaObservadaDia.estado, "desatualizada");
  assert.equal(validarDadosRelatorio(report), true);
  report.rajadaMaxKmh = 20;
  report.classificacaoDados.rajadaPrevista = { valor: 20, estado: "prevista", fonte: "Indisponível" };
  assert.throws(() => validarDadosRelatorio(report), /sem procedência/);
});

test("observação INMET recente armazenada pode ser distribuída como dado degradado", () => {
  const report = {
    atual: {
      temperaturaC: 31.6,
      umidadePct: 54,
      fonteTemperatura: "INMET — estação automática (A101) — última observação válida armazenada",
      fonteUmidade: "INMET — estação automática (A101) — última observação válida armazenada",
    },
    inmetObservacao: {
      status: "degradado",
      observacao: {
        status: "armazenado_recente",
        desatualizado: false,
        medidoEm: "2026-11-10T17:00:00.000Z",
        estacao: { codigo: "A101" },
      },
    },
    fontesPorCampo: {},
    ventoPorPeriodo: [],
  };
  report.classificacaoDados = classificarDadosRelatorio(report);
  assert.equal(report.classificacaoDados.temperaturaAtual.valor, 31.6);
  assert.equal(report.classificacaoDados.temperaturaAtual.estado, "observada");
  assert.equal(report.classificacaoDados.temperaturaAtual.statusColeta, "degradado");
  assert.equal(validarDadosRelatorio(report), true);
});

test("observação INMET antiga não invalida a previsão diária", () => {
  const report = {
    tempMin: 23, tempMax: 34, umidadeMin: 35, umidadeMax: 90,
    inmetPrevisao: { consultadoEm: "2026-10-25T12:00:00Z" },
    inmetObservacao: { status: "degradado", observacao: { desatualizado: true } },
    ventoPorPeriodo: [],
    fontesPorCampo: {
      tempMin: "INMET — previsão oficial",
      tempMax: "INMET — previsão oficial",
      umidadeMin: "INMET — previsão oficial",
      umidadeMax: "INMET — previsão oficial",
    },
  };
  report.classificacaoDados = classificarDadosRelatorio(report);

  assert.equal(report.classificacaoDados.temperaturaMin.estado, "prevista");
  assert.equal(report.classificacaoDados.temperaturaMax.estado, "prevista");
  assert.equal(report.classificacaoDados.umidadeMin.estado, "prevista");
  assert.equal(report.classificacaoDados.umidadeMax.estado, "prevista");
  assert.equal(validarDadosRelatorio(report), true);
});
