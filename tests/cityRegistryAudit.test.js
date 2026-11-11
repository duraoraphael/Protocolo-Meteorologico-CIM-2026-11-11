const test = require("node:test");
const assert = require("node:assert/strict");
const { CIDADES } = require("../src/config/cities");
const { auditarRegistro, auditarRegistroCidades, validarCoordenadas } = require("../src/logic/cityRegistryAudit");

test("auditoria rejeita coordenadas ausentes, invertidas ou fora dos limites brasileiros", () => {
  assert.ok(validarCoordenadas({ latitude: -22.9, longitude: -43.2 }).length === 0);
  assert.ok(validarCoordenadas({ latitude: -43.2, longitude: -22.9 }).length > 0);
  assert.ok(validarCoordenadas({ latitude: NaN, longitude: -43.2 }).length > 0);
  assert.ok(validarCoordenadas({ latitude: -22.9, longitude: 120 }).length > 0);
});

test("auditoria verifica prefixo IBGE/UF e explicita coordenadas sem escopo e localidade pendente", () => {
  const cidade = { nome: "Linhares", municipio: "Linhares", uf: "RJ", latitude: -19, longitude: -40, codigoIbge: "3203205", status: "PENDENTE_VALIDACAO_GEOGRAFICA" };
  const result = auditarRegistro("utg_c", cidade);
  assert.ok(result.findings.some(({ code }) => code === "IBGE_UF_MISMATCH"));
  assert.ok(result.findings.some(({ code }) => code === "GEOGRAPHY_PENDING"));
  assert.ok(result.findings.some(({ code }) => code === "COORDINATE_SCOPE_UNVERIFIED"));
});

test("auditoria consulta API oficial IBGE e sinaliza município/UF divergentes", async () => {
  const response = {
    nome: "Município diferente",
    microrregiao: { mesorregiao: { UF: { sigla: "SP" } } },
  };
  const audit = await auditarRegistroCidades({
    exemplo: { nome: "Linhares", municipio: "Linhares", uf: "ES", latitude: -19, longitude: -40, codigoIbge: "3203205" },
  }, {
    validarIbge: true,
    fetchImpl: async (url) => {
      assert.match(url, /\/3203205$/);
      return { ok: true, json: async () => response };
    },
  });
  assert.equal(audit.registros[0].validacaoIbge, "confirmada");
  assert.ok(audit.registros[0].findings.some(({ code }) => code === "IBGE_MUNICIPALITY_MISMATCH"));
  assert.ok(audit.registros[0].findings.some(({ code }) => code === "IBGE_UF_MISMATCH"));
});

test("auditoria de cadastro percorre dinamicamente todas as bases sem alterar coordenadas", async () => {
  const antes = CIDADES.utg_c.latitude;
  const audit = await auditarRegistroCidades(CIDADES);
  assert.equal(audit.total, Object.keys(CIDADES).length);
  assert.equal(CIDADES.utg_c.latitude, antes);
  assert.ok(audit.registros.find(({ chave }) => chave === "utg_c").findings.some(({ code }) => code === "GEOGRAPHY_PENDING"));
});

test("auditoria identifica coordenadas duplicadas sem mesclar instalações", async () => {
  const audit = await auditarRegistroCidades({
    base_a: { uf: "RJ", latitude: -22.9, longitude: -43.2, codigoIbge: "3304557" },
    base_b: { uf: "RJ", latitude: -22.9, longitude: -43.2, codigoIbge: "3304557" },
  });
  assert.equal(audit.coordenadasDuplicadas, 2);
  assert.deepEqual(
    audit.registros.map((registro) => registro.findings.find(({ code }) => code === "DUPLICATE_COORDINATES").installations),
    [["base_b"], ["base_a"]]
  );
});

test("UTG-C usa as coordenadas confirmadas e permanece pendente de validação da instalação", () => {
  assert.deepEqual(
    [CIDADES.utg_c.latitude, CIDADES.utg_c.longitude],
    [-19.463066781816277, -39.761312334054885]
  );
  assert.equal(CIDADES.utg_c.status, "PENDENTE_VALIDACAO_GEOGRAFICA");
});
