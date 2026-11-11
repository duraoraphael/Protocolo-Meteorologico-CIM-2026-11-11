const test = require("node:test");
const assert = require("node:assert/strict");
const { buscarAvisosInmetParaBases, pontoNaGeometria } = require("../src/sources/inmet");

const now = new Date("2026-11-10T12:00:00Z");
function resposta(features) {
  return async () => ({ ok: true, status: 200, json: async () => ({ features }) });
}
const cidade = (chave, codigoIbge, latitude, longitude) => ({ chave, codigoIbge, latitude, longitude, uf: "RJ" });

test("aplica avisos por geocódigo municipal sem ampliar para todo o estado", async () => {
  const features = [{
    properties: { event: "Tempestade", severity: "Severe", geocodes: ["3302700"] },
  }];
  const result = await buscarAvisosInmetParaBases([
    cidade("marica", "3302700", -22.9, -42.8),
    cidade("itaborai", "3301900", -22.7, -42.9),
  ], { agora: now, fetchImpl: resposta(features), logger: null });
  assert.equal(result.porBase.marica.length, 1);
  assert.equal(result.porBase.itaborai.length, 0);
  assert.equal(result.porBase.marica[0].severidade, "Severe");
});

test("aplica polígono CAP oficial ao ponto da instalação e respeita buracos", async () => {
  const polygon = { type: "Polygon", coordinates: [
    [[-44, -23], [-42, -23], [-42, -22], [-44, -22], [-44, -23]],
    [[-43.4, -22.8], [-43.2, -22.8], [-43.2, -22.6], [-43.4, -22.6], [-43.4, -22.8]],
  ] };
  assert.equal(pontoNaGeometria(-43.8, -22.5, polygon), true);
  assert.equal(pontoNaGeometria(-43.3, -22.7, polygon), false);
  const result = await buscarAvisosInmetParaBases([
    cidade("inside", "3302700", -22.5, -43.8),
    cidade("outside", "3301900", -21.5, -41.8),
  ], {
    agora: now,
    fetchImpl: resposta([{ properties: { event: "Chuva", severity: "Moderate" }, geometry: polygon }]),
    logger: null,
  });
  assert.equal(result.porBase.inside.length, 1);
  assert.equal(result.porBase.outside.length, 0);
});

test("sucesso vazio difere de falha HTTP, DNS e JSON malformado", async () => {
  const vazio = await buscarAvisosInmetParaBases([cidade("a", "3302700", -22, -43)], {
    agora: now, fetchImpl: resposta([]), logger: null,
  });
  assert.equal(vazio.consulta, "sucesso_vazio");
  await assert.rejects(() => buscarAvisosInmetParaBases([], {
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({}) }), logger: null,
  }), /400/);
  await assert.rejects(() => buscarAvisosInmetParaBases([], {
    fetchImpl: async () => { throw Object.assign(new Error("DNS"), { code: "ENOTFOUND" }); }, logger: null,
  }), (error) => error.tipo === "dns");
  await assert.rejects(() => buscarAvisosInmetParaBases([], {
    fetchImpl: async () => ({ ok: true, text: async () => "{" }),
    esperarFn: async () => {}, logger: null,
  }), (error) => error.tipo === "invalid_json");
  await assert.rejects(() => buscarAvisosInmetParaBases([], {
    fetchImpl: resposta([{ properties: { event: "Aviso sem área", severity: "Severe" } }]),
    logger: null,
  }), (error) => error.tipo === "geography" && error.code === "INMET_ALERT_GEOGRAPHY_UNAVAILABLE");
});
