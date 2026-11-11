const UF_POR_CODIGO_IBGE = Object.freeze({
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
  21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL",
  28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR",
  42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF",
});

function normalizarNome(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}

function validarCoordenadas(cidade) {
  const { latitude, longitude } = cidade || {};
  const problemas = [];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    problemas.push("Coordenadas ausentes ou não finitas.");
  } else {
    if (latitude < -33.75 || latitude > 5.3 || longitude < -73.99 || longitude > -28.8) {
      problemas.push("Coordenadas fora dos limites terrestres de referência do Brasil.");
    }
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) problemas.push("Latitude/longitude fora do intervalo geográfico.");
    if (latitude > 0 && longitude < 0 && cidade.uf !== "AP" && cidade.uf !== "RR" && cidade.uf !== "AM" && cidade.uf !== "PA") {
      problemas.push("Possível inversão de latitude/longitude: ponto fora da região esperada.");
    }
  }
  return problemas;
}

function auditarRegistro(chave, cidade) {
  const findings = validarCoordenadas(cidade).map((message) => ({ code: "INVALID_COORDINATES", message }));
  const codigo = String(cidade?.codigoIbge || "");
  if (!/^\d{7}$/.test(codigo)) {
    findings.push({ code: "INVALID_IBGE_CODE", message: "Código IBGE municipal deve conter sete dígitos." });
  } else if (UF_POR_CODIGO_IBGE[Number(codigo.slice(0, 2))] !== cidade.uf) {
    findings.push({ code: "IBGE_UF_MISMATCH", message: "O prefixo do código IBGE não corresponde à UF cadastrada." });
  }
  if (cidade?.status === "PENDENTE_VALIDACAO_GEOGRAFICA") {
    findings.push({ code: "GEOGRAPHY_PENDING", message: "Correspondência instalação/município e coordenadas ainda pendentes." });
  }
  if (!cidade?.escopoCoordenadas) {
    findings.push({ code: "COORDINATE_SCOPE_UNVERIFIED", message: "Não está documentado se o ponto representa a instalação ou a sede municipal." });
  }
  return {
    chave,
    municipio: cidade?.municipio || cidade?.nome || null,
    codigoIbge: codigo || null,
    uf: cidade?.uf || null,
    coordenadas: { latitude: cidade?.latitude ?? null, longitude: cidade?.longitude ?? null },
    findings,
  };
}

async function validarMunicipioOficial(registro, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!/^\d{7}$/.test(registro.codigoIbge || "")) return registro;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${registro.codigoIbge}`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    );
    if (!response.ok) throw new Error(`IBGE HTTP ${response.status}`);
    const oficial = await response.json();
    const nomeOficial = oficial?.nome;
    const ufOficial = oficial?.microrregiao?.mesorregiao?.UF?.sigla
      || oficial?.regiaoImediata?.regiaoIntermediaria?.UF?.sigla;
    if (!nomeOficial || !ufOficial) throw new Error("Resposta do IBGE sem município/UF.");
    if (normalizarNome(registro.municipio) !== normalizarNome(nomeOficial)) {
      registro.findings.push({ code: "IBGE_MUNICIPALITY_MISMATCH", expected: nomeOficial });
    }
    if (registro.uf !== ufOficial) {
      registro.findings.push({ code: "IBGE_UF_MISMATCH", expected: ufOficial });
    }
    registro.validacaoIbge = "confirmada";
  } catch (error) {
    registro.validacaoIbge = "indisponivel";
    registro.erroValidacaoIbge = error.name === "AbortError" ? "IBGE_TIMEOUT" : "IBGE_UNAVAILABLE";
  } finally {
    clearTimeout(timer);
  }
  return registro;
}

async function auditarRegistroCidades(cidades, { fetchImpl, validarIbge = false } = {}) {
  const registros = Object.entries(cidades).map(([chave, cidade]) => auditarRegistro(chave, cidade));
  const porCoordenadas = new Map();
  for (const registro of registros) {
    const { latitude, longitude } = registro.coordenadas;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const chave = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    const grupo = porCoordenadas.get(chave) || [];
    grupo.push(registro);
    porCoordenadas.set(chave, grupo);
  }
  for (const grupo of porCoordenadas.values()) {
    if (grupo.length < 2) continue;
    for (const registro of grupo) {
      registro.findings.push({
        code: "DUPLICATE_COORDINATES",
        installations: grupo.filter((outro) => outro !== registro).map((outro) => outro.chave),
      });
    }
  }
  if (validarIbge) {
    await Promise.all(registros.map((registro) => validarMunicipioOficial(registro, { fetchImpl })));
  }
  return {
    total: registros.length,
    invalidos: registros.filter((registro) => registro.findings.some((finding) =>
      ["INVALID_COORDINATES", "INVALID_IBGE_CODE", "IBGE_UF_MISMATCH", "IBGE_MUNICIPALITY_MISMATCH"].includes(finding.code))).length,
    pendentes: registros.filter((registro) => registro.findings.some((finding) => finding.code === "GEOGRAPHY_PENDING")).length,
    escopoCoordenadasNaoVerificado: registros.filter((registro) =>
      registro.findings.some((finding) => finding.code === "COORDINATE_SCOPE_UNVERIFIED")).length,
    coordenadasDuplicadas: registros.filter((registro) =>
      registro.findings.some((finding) => finding.code === "DUPLICATE_COORDINATES")).length,
    registros,
  };
}

module.exports = { auditarRegistro, auditarRegistroCidades, validarCoordenadas, validarMunicipioOficial };
