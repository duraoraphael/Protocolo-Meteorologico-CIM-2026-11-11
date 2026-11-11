const test = require("node:test");
const assert = require("node:assert/strict");
const { classificarDadosRelatorio } = require("../src/logic/meteorologicalValidity");
const { CIDADES } = require("../src/config/cities");
const { montarRelatorio } = require("../src/logic/reportBuilder");

test("classificação lê temperatura e umidade atuais do formato atual do relatório", () => {
  const report = {
    atual: {
      temperaturaC: 25.3,
      umidadePct: 64,
      fonteTemperatura: "INMET — estação automática (A667)",
      fonteUmidade: "INMET — estação automática (A667)",
    },
    inmetObservacao: {
      status: "operacional",
      observacao: { medidoEm: "2026-11-10T12:00:00Z", estacao: { codigo: "A667" } },
    },
    fontesPorCampo: {},
    cidade: { nome: "Maricá" },
  };
  const result = classificarDadosRelatorio(report);
  assert.equal(result.temperaturaAtual.valor, 25.3);
  assert.equal(result.temperaturaAtual.estado, "observada");
  assert.equal(result.temperaturaAtual.fonte, "INMET — estação automática (A667)");
  assert.equal(result.umidadeAtual.valor, 64);
  assert.equal(result.umidadeAtual.estado, "observada");
});

test("previsão INMET valida o município, não o nome operacional da instalação", async () => {
  let municipioConsultado;
  await montarRelatorio(CIDADES.barra_do_furado, {
    dependencias: {
      agora: () => new Date("2026-11-10T12:00:00Z"),
      buscarPrevisaoInmet: async (_codigo, opcoes) => {
        municipioConsultado = opcoes.municipio;
        return { data: "10/11/2026", dias: [], periodos: {} };
      },
      buscarAvisosInmet: async () => ({ avisos: [] }),
      buscarObservacaoInmet: async () => ({ status: "indisponivel", observacao: null, agregado: null }),
      buscarOpenMeteo: async () => ({}),
      buscarQualidadeAr: async () => ({}),
      buscarMarComFallback: async () => null,
      buscarOceanopPorCoordenadas: async () => null,
      lerClimaSaudeArmazenado: () => ({ status: "indisponivel", dados: null }),
    },
  });
  assert.equal(municipioConsultado, "Quissamã");
});
