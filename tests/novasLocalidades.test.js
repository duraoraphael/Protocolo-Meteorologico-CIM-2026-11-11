const test = require("node:test");
const assert = require("node:assert/strict");

const { CIDADES, getCidade, baseExiste } = require("../src/config/cities");
const { BASES_DISTRIBUICAO } = require("../src/config/distributionBases");

test("Natal e Oiapoque usam cadastro operacional exato", () => {
  assert.deepEqual(getCidade("natal"), {
    chave: "natal",
    costeira: true,
    nome: "Natal",
    uf: "RN",
    fusoHorario: "America/Fortaleza",
    latitude: -5.8115,
    longitude: -35.2415,
    pontoMar: { latitude: -5.82, longitude: -35.10, referencia: "Atlântico a leste de Natal" },
    codigoIbge: "2408102",
    climaSaudeUrl: "https://clima.saude.gov.br/rn/natal?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/2408102",
      defesaCivilTelefone: "199",
    },
  });
  assert.deepEqual(getCidade("oiapoque"), {
    chave: "oiapoque",
    costeira: true,
    nome: "Oiapoque",
    uf: "AP",
    fusoHorario: "America/Belem",
    latitude: 3.861224,
    longitude: -51.796699,
    pontoMar: { latitude: 4.10, longitude: -51.20, referencia: "Atlântico na costa do Amapá, referência para Oiapoque" },
    codigoIbge: "1600501",
    climaSaudeUrl: "https://clima.saude.gov.br/ap/oiapoque?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/1600501",
      defesaCivilTelefone: "199",
    },
  });
});

test("As novas instalações ficam cadastradas e a UTG-C permanece em validação geográfica", () => {
  assert.ok(baseExiste("utg_sul"));
  assert.ok(baseExiste("utg_c"));
  assert.equal(getCidade("utg_c").status, "PENDENTE_VALIDACAO_GEOGRAFICA");
  assert.ok(BASES_DISTRIBUICAO.utg_sul);
  assert.ok(BASES_DISTRIBUICAO.utg_c);
  assert.deepEqual(getCidade("utg_sul"), {
    chave: "utg_sul",
    nome: "Anchieta",
    uf: "ES",
    municipio: "Anchieta",
    latitude: -20.79490211144529,
    longitude: -40.62122053457425,
    codigoIbge: "3200409",
    climaSaudeUrl: "https://clima.saude.gov.br/es/anchieta?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3200409",
      defesaCivilTelefone: "199",
    },
  });
  assert.ok(Object.keys(CIDADES).length >= 26);
});

test("códigos IBGE corrigidos correspondem às localidades da API do INMET", () => {
  const codigosCorrigidos = {
    utg_sul: "3200409",
    utg_c: "3203205",
    doutor_ulysses: "4128633",
    boaventura: "3301900",
    utg_ca: "3510500",
    barra_do_furado: "3304151",
    ipojuca: "2607208",
    imbituba: "4207304",
    barra_dos_coqueiros: "2800605",
  };
  for (const [chave, codigoIbge] of Object.entries(codigosCorrigidos)) {
    assert.equal(CIDADES[chave].codigoIbge, codigoIbge);
    assert.equal(CIDADES[chave].links.inmet, `https://previsao.inmet.gov.br/${codigoIbge}`);
  }
});
