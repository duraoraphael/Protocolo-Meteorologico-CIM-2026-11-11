const ESTADOS = new Set(["observada", "prevista", "estimada", "indisponivel", "desatualizada"]);

function observacaoInmetUtilizavel(relatorio) {
  const coleta = relatorio.inmetObservacao;
  const observacao = coleta?.observacao;
  if (!observacao || observacao.desatualizado) return false;
  return coleta.status === "operacional" && observacao.status !== "armazenado"
    || coleta.status === "degradado" && observacao.status === "armazenado_recente";
}

function classificarDadosRelatorio(relatorio) {
  const fontes = relatorio.fontesPorCampo || {};
  const observacao = relatorio.inmetObservacao;
  const indiceAr = Number.isFinite(relatorio.qualidadeAr?.iqar)
    ? relatorio.qualidadeAr.iqar : relatorio.qualidadeAr?.usAqi;
  const fonteArPorCampo = fontes["ar.iqar"] || fontes["ar.usAqi"];
  const fonteIndiceAr = fonteArPorCampo && !/indisponível/i.test(fonteArPorCampo)
    ? fonteArPorCampo
    : relatorio.qualidadeAr?.fonte || fonteArPorCampo || "Indisponível";
  const atual = observacaoInmetUtilizavel(relatorio);
  const antiga = Boolean(observacao?.observacao) && !atual;
  const indicador = (campo, natureza, referenciaEm, { desatualizado = false, cobertura = null } = {}) => {
    const atualObservada = campo === "temperaturaAtualC" ? relatorio.atual?.temperaturaC
      : campo === "umidadeAtualPct" ? relatorio.atual?.umidadePct : undefined;
    const valor = Number.isFinite(atualObservada) ? atualObservada : relatorio[campo];
    const fonte = (campo === "temperaturaAtualC" ? relatorio.atual?.fonteTemperatura
      : campo === "umidadeAtualPct" ? relatorio.atual?.fonteUmidade : null)
      || fontes[campo] || "Indisponível";
    const disponivel = Number.isFinite(valor);
    const statusColeta = !disponivel ? "indisponivel"
      : natureza === "observada" && observacao?.status === "degradado" ? "degradado"
        : cobertura?.parcial ? "parcial" : "operacional";
    return {
      valor: disponivel ? valor : null,
      estado: disponivel ? natureza : desatualizado ? "desatualizada" : "indisponivel",
      fonte: disponivel ? fonte : "Indisponível",
      apiOrigem: disponivel ? fonte : null,
      modeloOuEstacao: !disponivel ? null : natureza === "observada"
        ? observacao?.observacao?.estacao?.codigo || null
        : /Open-Meteo/i.test(fonte) ? "Open-Meteo" : fonte,
      referenciaEm: disponivel ? referenciaEm || null : null,
      consultadoEm: relatorio.geradoEmISO || null,
      localidade: relatorio.cidade?.nome || null,
      coordenadas: { latitude: relatorio.cidade?.latitude ?? null, longitude: relatorio.cidade?.longitude ?? null },
      variavel: campo,
      unidade: campo.toLowerCase().includes("chuva") || campo.toLowerCase().includes("precipitacao") ? "mm"
        : campo.toLowerCase().includes("rajada") ? "km/h"
          : campo.toLowerCase().includes("umidade") ? "%"
            : campo.toLowerCase().includes("temp") ? "°C" : null,
      tipoDado: natureza,
      statusColeta,
      motivoIndisponibilidade: disponivel ? null : campo.startsWith("chuvaEstimada")
        ? relatorio.chuvaEstimadaMotivoIndisponibilidade || "Sem horas históricas válidas."
        : "Sem valor válido da fonte.",
      ...(cobertura ? { cobertura } : {}),
    };
  };
  const dados = {
    temperaturaMin: indicador("tempMin", "prevista", relatorio.inmetPrevisao?.consultadoEm || relatorio.openMeteo?.consultadoEm),
    temperaturaMax: indicador("tempMax", "prevista", relatorio.inmetPrevisao?.consultadoEm || relatorio.openMeteo?.consultadoEm),
    temperaturaAtual: indicador("temperaturaAtualC", "observada", observacao?.observacao?.medidoEm, { desatualizado: antiga }),
    umidadeMin: indicador("umidadeMin", "prevista", relatorio.inmetPrevisao?.consultadoEm || relatorio.openMeteo?.consultadoEm),
    umidadeMax: indicador("umidadeMax", "prevista", relatorio.inmetPrevisao?.consultadoEm || relatorio.openMeteo?.consultadoEm),
    umidadeAtual: indicador("umidadeAtualPct", "observada", observacao?.observacao?.medidoEm, { desatualizado: antiga }),
    chuvaObservadaDia: indicador("precipitacaoDiariaMm", "observada", observacao?.observacao?.medidoEm, { desatualizado: antiga, cobertura: relatorio.coberturaObservacoesInmet }),
    chuvaObservadaHora: indicador("precipitacaoHoraMm", "observada", relatorio.precipitacaoHoraMedidaEm, { desatualizado: antiga }),
    chuvaObservada24h: indicador("precipitacaoUltimas24hMm", "observada", observacao?.observacao?.medidoEm, { desatualizado: antiga, cobertura: relatorio.coberturaChuva24h }),
    chuvaPrevistaDia: indicador("chuvaPrevistaDiaMm", "prevista", relatorio.openMeteo?.dataReferencia),
    chuvaEstimadaDia: indicador("chuvaEstimadaDiaMm", "estimada", relatorio.chuvaEstimadaReferencia, { cobertura: relatorio.coberturaChuvaEstimadaDia }),
    chuvaEstimadaHora: indicador("chuvaEstimadaHoraMm", "estimada", relatorio.chuvaEstimadaHoraReferencia),
    chuvaEstimada24h: indicador("chuvaEstimada24hMm", "estimada", relatorio.chuvaEstimadaReferencia, { cobertura: relatorio.coberturaChuvaEstimada24h }),
    rajadaPrevista: indicador("rajadaMaxKmh", "prevista", relatorio.rajadaPrevistaReferencia?.rajadaPrevistaEm || relatorio.openMeteo?.dataReferencia),
    qualidadeAr: {
      valor: Number.isFinite(indiceAr) ? indiceAr : null,
      estado: Number.isFinite(indiceAr) ? "estimada" : "indisponivel",
      fonte: Number.isFinite(indiceAr) ? fonteIndiceAr : "Indisponível",
      referenciaEm: Number.isFinite(indiceAr) ? relatorio.qualidadeAr.referenciaEm : null,
    },
  };
  for (const periodo of relatorio.ventoPorPeriodo || []) {
    dados[`rajada${periodo.periodo}`] = {
      valor: Number.isFinite(periodo.rajadaMaxKmh) ? periodo.rajadaMaxKmh : null,
      estado: Number.isFinite(periodo.rajadaMaxKmh) ? "prevista" : "indisponivel",
      fonte: Number.isFinite(periodo.rajadaMaxKmh) ? periodo.fonteRajada : "Indisponível",
      referenciaEm: periodo.rajadaPrevistaEm || relatorio.openMeteo?.dataReferencia || null,
    };
  }
  return dados;
}

function validarDadosRelatorio(relatorio) {
  const dados = relatorio.classificacaoDados;
  if (!dados || typeof dados !== "object") throw new Error("Classificação meteorológica ausente.");
  const campos = {
    temperaturaMin: relatorio.tempMin,
    temperaturaMax: relatorio.tempMax,
    temperaturaAtual: Number.isFinite(relatorio.atual?.temperaturaC)
      ? relatorio.atual.temperaturaC : relatorio.temperaturaAtualC,
    umidadeMin: relatorio.umidadeMin,
    umidadeMax: relatorio.umidadeMax,
    umidadeAtual: Number.isFinite(relatorio.atual?.umidadePct)
      ? relatorio.atual.umidadePct : relatorio.umidadeAtualPct,
    chuvaObservadaDia: relatorio.precipitacaoDiariaMm,
    chuvaObservadaHora: relatorio.precipitacaoHoraMm,
    chuvaObservada24h: relatorio.precipitacaoUltimas24hMm,
    chuvaPrevistaDia: relatorio.chuvaPrevistaDiaMm,
    chuvaEstimadaDia: relatorio.chuvaEstimadaDiaMm,
    chuvaEstimadaHora: relatorio.chuvaEstimadaHoraMm,
    chuvaEstimada24h: relatorio.chuvaEstimada24hMm,
    rajadaPrevista: relatorio.rajadaMaxKmh,
    qualidadeAr: Number.isFinite(relatorio.qualidadeAr?.iqar) ? relatorio.qualidadeAr.iqar : relatorio.qualidadeAr?.usAqi,
  };
  for (const periodo of relatorio.ventoPorPeriodo || []) campos[`rajada${periodo.periodo}`] = periodo.rajadaMaxKmh;
  for (const [nome, valor] of Object.entries(campos)) {
    if (!dados[nome] || dados[nome].valor !== (Number.isFinite(valor) ? valor : null)) {
      throw new Error(`Classificação meteorológica divergente do relatório: ${nome} (${dados[nome]?.valor} != ${Number.isFinite(valor) ? valor : null}).`);
    }
  }
  for (const [nome, item] of Object.entries(dados)) {
    if (!ESTADOS.has(item?.estado)) throw new Error(`Estado meteorológico inválido: ${nome}.`);
    if (Number.isFinite(item.valor)) {
      if (["indisponivel", "desatualizada"].includes(item.estado) || !item.fonte || /indisponível/i.test(item.fonte)) {
        throw new Error(`Valor meteorológico sem procedência válida: ${nome}.`);
      }
    } else if (item.valor !== null || !["indisponivel", "desatualizada"].includes(item.estado)) {
      throw new Error(`Ausência meteorológica tratada como valor: ${nome}.`);
    }
  }
  if (!observacaoInmetUtilizavel(relatorio)) {
    for (const nome of ["temperaturaAtual", "umidadeAtual", "chuvaObservadaDia", "chuvaObservadaHora", "chuvaObservada24h"]) {
      if (Number.isFinite(dados[nome]?.valor)) throw new Error(`Medição INMET antiga não pode ser distribuída: ${nome}.`);
    }
  }
  return true;
}

module.exports = { classificarDadosRelatorio, validarDadosRelatorio };
