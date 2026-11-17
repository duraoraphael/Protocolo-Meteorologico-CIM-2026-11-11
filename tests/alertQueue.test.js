// Estes testes cobrem transições e deduplicação sem a janela de estabilização;
// a histerese de redução é testada em gatilhosMeteorologicos.test.js.
process.env.GATILHOS_CONFIRMACOES_REDUCAO = "1";
process.env.GATILHOS_MINUTOS_ESTABILIZACAO = "0";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  verificarAlertas,
  filtrarNovidades,
  marcarAlertasEnviados,
  detectarAlertasGraves,
  picoUvPassou,
  ASSINATURA_MONITOR,
} = require("../src/logic/alertWatcher");
const fila = require("../src/logic/alertQueue");
const { processarAlertaBase, iniciarMonitorAlertas } = require("../src/scheduler");
const { CONFIGURACAO_EMAIL } = require("../src/config/email");
const { renderAlertEmailHtml } = require("../src/render/alertEmailTemplate");

function reportComNivel(grau = "ATENÇÃO") {
  return {
    avisosInmet: [],
    severidade: {
      eventos: [{
        assinatura: "chuva",
        tipo: "chuvaIntensa",
        grau,
        descricao: `Chuva em nível ${grau}`,
        fonteDados: "INMET — previsão oficial",
        recomendacoes: [],
      }],
    },
    periodos: {},
    fontesPorCampo: { precipitacaoTotalMm: "INMET — previsão oficial" },
    precipitacaoTotalMm: 50,
    monitoramentoApis: [{ id: "inmet-avisos", status: "operacional" }],
  };
}

function estadoBase(chave, grau = "ATENÇÃO", gravidade = "atencao") {
  return {
    [`${chave}|${ASSINATURA_MONITOR}`]: { inicializadoEm: "2026-10-20T12:00:00.000Z" },
    [`${chave}|chuva`]: { grau, gravidade, tipo: "Chuva", fonteDados: "INMET — previsão oficial" },
  };
}

test("cenário A: somente Macaé alterada produz um evento da própria base", async () => {
  const estado = { ...estadoBase("macae"), ...estadoBase("rio_de_janeiro") };
  const processadas = [];
  const resultado = await verificarAlertas({
    chaves: ["macae", "rio_de_janeiro"],
    carregar: () => estado,
    salvar: () => {},
    montar: async (cidade) => reportComNivel(cidade.chave === "macae" ? "ALERTA" : "ATENÇÃO"),
    onBase: async (base) => processadas.push(base.chave),
  });
  assert.deepEqual(processadas, ["macae"]);
  assert.deepEqual(resultado.porBase.map((base) => base.chave), ["macae"]);
});

test("cenários B e C: duas mudanças são independentes e nenhuma mudança não gera evento", async () => {
  const estado = { ...estadoBase("rio_de_janeiro"), ...estadoBase("santos") };
  const alteradas = await verificarAlertas({
    chaves: ["rio_de_janeiro", "santos"],
    carregar: () => estado,
    salvar: () => {},
    montar: async () => reportComNivel("ALERTA"),
  });
  assert.deepEqual(new Set(alteradas.porBase.map((base) => base.chave)), new Set(["rio_de_janeiro", "santos"]));

  const semMudanca = await verificarAlertas({
    chaves: ["rio_de_janeiro", "santos"],
    carregar: () => ({ ...estadoBase("rio_de_janeiro", "ALERTA", "alto"), ...estadoBase("santos", "ALERTA", "alto") }),
    salvar: () => {},
    montar: async () => reportComNivel("ALERTA"),
  });
  assert.equal(semMudanca.totalNovos, 0);
});

test("cenário D: agravamento de alerta para emergência é comunicado", () => {
  const estado = estadoBase("macae", "ALERTA", "alto");
  const [evento] = filtrarNovidades("macae", [{
    assinatura: "chuva", tipo: "Chuva", grau: "EMERGÊNCIA", gravidade: "severo",
  }], estado);
  assert.deepEqual([evento.grauAnterior, evento.grau, evento.motivo], ["ALERTA", "EMERGÊNCIA", "agravou"]);
});

test("cenário E: falha de fonte preserva o estado e não comunica normalização", async () => {
  const estado = estadoBase("macae", "ALERTA", "alto");
  const antes = JSON.stringify(estado);
  const resultado = await verificarAlertas({
    chaves: ["macae"], carregar: () => estado, salvar: () => {},
    montar: async () => { throw new Error("INMET indisponível"); },
  });
  assert.equal(resultado.totalNovos, 0);
  assert.equal(resultado.falhas.length, 1);
  assert.equal(JSON.stringify(estado), antes);
});

test("cenários F e G: falha permanece pendente e reinício não reenvia evento confirmado", () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "cim-alerta-fila-"));
  const arquivo = path.join(pasta, "fila.json");
  const base = { chave: "macae", cidade: { nome: "Macaé", uf: "RJ" }, alertas: [{ assinatura: "chuva", grau: "ALERTA", gravidade: "alto", motivo: "agravou", fingerprint: "abc" }] };
  try {
    const evento = fila.enfileirar(base, ["macae@exemplo.com"], { arquivo, agora: new Date("2026-10-21T12:00:00Z") });
    assert.ok(fila.assumir(evento.id, { arquivo, agora: new Date("2026-10-21T12:00:01Z") }));
    fila.marcarFalha(evento.id, new Error("SMTP fora do ar"), { arquivo, agora: new Date("2026-10-21T12:00:02Z") });
    assert.equal(fila.carregarFila(arquivo).eventos[evento.id].status, "pendente");
    assert.equal(fila.assumir(evento.id, { arquivo, agora: new Date("2026-10-21T12:04:00Z") }), null);
    assert.ok(fila.assumir(evento.id, { arquivo, agora: new Date("2026-10-21T12:06:00Z") }));
    fila.marcarEnviado(evento.id, { messageId: "smtp-1" }, { arquivo, agora: new Date("2026-10-21T12:06:01Z") });
    assert.equal(fila.enfileirar(base, ["macae@exemplo.com"], { arquivo }).status, "enviado");
    assert.equal(fila.assumir(evento.id, { arquivo, agora: new Date("2026-10-22T12:00:00Z") }), null);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test("novo ciclo após normalização recebe outro ID e não é descartado como duplicado", () => {
  const estado = estadoBase("macae", "ALERTA", "alto");
  estado["macae|chuva"].emISO = "2026-10-21T10:00:00.000Z";

  const [normalizacao] = filtrarNovidades("macae", [], estado, () => true);
  marcarAlertasEnviados(
    { chave: "macae", alertas: [normalizacao] },
    { carregar: () => estado, salvar: () => {} }
  );

  const [reativacao] = filtrarNovidades("macae", [{
    assinatura: "chuva", tipo: "Chuva", grau: "ALERTA", gravidade: "alto",
  }], estado);

  assert.equal(normalizacao.motivo, "normalizou");
  assert.equal(reativacao.motivo, "agravou");
  assert.equal(reativacao.grauAnterior, "NORMAL");
  assert.notEqual(normalizacao.fingerprint, reativacao.fingerprint);
  assert.notEqual(
    fila.idEvento({ chave: "macae", alertas: [normalizacao] }),
    fila.idEvento({ chave: "macae", alertas: [reativacao] })
  );
});

test("normalização de vento apresenta o nome do gatilho em português no informe", () => {
  const estado = {
    [`macae|${ASSINATURA_MONITOR}`]: { inicializadoEm: "2026-10-20T12:00:00.000Z" },
    "macae|vento": {
      grau: "ATENÇÃO", gravidade: "atencao", tipo: "ventoModerado",
      fonteDados: "Previsão", emISO: "2026-10-21T10:00:00.000Z",
    },
  };
  const [normalizacao] = filtrarNovidades("macae", [], estado, () => true);

  assert.equal(
    normalizacao.detalhe,
    "O gatilho de vento moderado retornou ao nível normal."
  );
  const html = renderAlertEmailHtml({
    cidade: { nome: "Macaé", uf: "RJ" },
    report: {
      dataFormatadaCurta: "21/10/2026",
      horaConsulta: "10:00",
      ventoPorPeriodo: [],
    },
    alertas: [normalizacao],
  });
  assert.match(html, /Informe do aviso:<\/strong> O gatilho de vento moderado retornou ao nível normal\./);
  assert.doesNotMatch(html, /ventoModerado/);
});

test("normaliza um fenômeno sem encerrar outro risco ativo da mesma base", () => {
  const estado = {
    ...estadoBase("macae", "ATENÇÃO", "atencao"),
    "macae|vento": {
      grau: "ALERTA", gravidade: "alto", tipo: "Vento",
      fonteDados: "OCEANOP", emISO: "2026-10-21T10:00:00.000Z",
    },
  };
  const chuvaAtiva = {
    assinatura: "chuva", tipo: "Chuva", grau: "ATENÇÃO", gravidade: "atencao",
  };
  const novidades = filtrarNovidades("macae", [chuvaAtiva], estado, () => true);
  assert.deepEqual(novidades.map((evento) => [evento.assinatura, evento.motivo]), [["vento", "normalizou"]]);
  assert.equal(estado["macae|chuva"].grau, "ATENÇÃO");
});

test("histórico persistente registra os campos auditáveis da transição", () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "cim-alerta-historico-"));
  const arquivo = path.join(pasta, "fila.json");
  try {
    const base = {
      chave: "vitoria", cidade: { nome: "Vitória", uf: "ES" },
      alertas: [{
        assinatura: "vento", tipo: "Rajadas de vento", grauAnterior: "ALERTA",
        grau: "ATENÇÃO", gravidade: "atencao", motivo: "reduziu",
        fonteDados: "OCEANOP", janela: "15h–00h", naturezaDado: "Classificação interna",
        fingerprint: "transicao-1",
      }],
    };
    const evento = fila.enfileirar(base, ["focal.vitoria@exemplo.com"], {
      arquivo, agora: new Date("2026-10-21T18:00:00Z"),
    });
    const salvo = fila.carregarFila(arquivo).eventos[evento.id];
    assert.equal(salvo.base, "vitoria");
    assert.deepEqual(salvo.destinatarios, ["focal.vitoria@exemplo.com"]);
    assert.deepEqual(salvo.transicoes[0], {
      assinatura: "vento", fenomeno: "Rajadas de vento", severidadeAnterior: "ALERTA",
      severidadeAtual: "ATENÇÃO", tipoAlteracao: "reduziu",
      fonteMeteorologica: "OCEANOP", periodoReferencia: "15h–00h",
      naturezaDado: "Classificação interna", fingerprint: "transicao-1",
    });
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test("cenário H: atualização material do mesmo aviso INMET gera nova versão", () => {
  const relatorio = (risco, atualizadoEm) => ({
    ...reportComNivel("ATENÇÃO"),
    severidade: { eventos: [] },
    avisosInmet: [{
      idAviso: "42", id: "urn:inmet:42.1", sequencia: 1,
      descricao: "Tempestade", severidade: "Perigo", inicio: "21/10/2026 12:00",
      fim: "21/10/2026 18:00", riscos: [risco], instrucoes: ["Busque abrigo."], atualizadoEm,
    }],
  });
  const anterior = detectarAlertasGraves(relatorio("Ventos intensos.", "2026-10-21T11:00:00Z"))
    .find((alerta) => alerta.assinatura === "inmet:tempestade");
  const estado = {};
  const primeiro = filtrarNovidades("santos", [anterior], estado);
  marcarAlertasEnviados({ chave: "santos", alertas: primeiro }, { carregar: () => estado, salvar: () => {} });
  const atual = detectarAlertasGraves(relatorio("Ventos intensos e granizo.", "2026-10-21T12:00:00Z"))
    .find((alerta) => alerta.assinatura === "inmet:tempestade");
  const [mudanca] = filtrarNovidades("santos", [atual], estado);
  assert.equal(mudanca.motivo, "atualizou");
});

test("aviso INMET reemitido só com vigência, id e carimbo novos não gera atualização", () => {
  const relatorio = (extra) => ({
    ...reportComNivel("ATENÇÃO"),
    severidade: { eventos: [] },
    avisosInmet: [{
      idAviso: "42", id: "urn:inmet:42.1", sequencia: 1,
      descricao: "Tempestade", severidade: "Perigo", inicio: "21/10/2026 08:55",
      fim: "21/10/2026 23:59", riscos: ["Ventos intensos."], instrucoes: ["Busque abrigo."],
      atualizadoEm: "2026-10-21T11:00:00Z", ...extra,
    }],
  });
  const achar = (r) => detectarAlertasGraves(r).find((a) => a.assinatura === "inmet:tempestade");
  const estado = {};
  const primeiro = filtrarNovidades("santos", [achar(relatorio({}))], estado);
  marcarAlertasEnviados({ chave: "santos", alertas: primeiro }, { carregar: () => estado, salvar: () => {} });

  const reemitido = achar(relatorio({
    idAviso: "43", id: "urn:inmet:43.1", sequencia: 2,
    inicio: "22/10/2026 00:00", fim: "22/10/2026 23:59", atualizadoEm: "2026-10-22T03:00:00Z",
  }));
  assert.deepEqual(filtrarNovidades("santos", [reemitido], estado), []);
});

test("estado gravado com fingerprint antigo é migrado em silêncio, sem e-mail", async () => {
  const relatorio = {
    ...reportComNivel("ATENÇÃO"),
    severidade: { eventos: [] },
    avisosInmet: [{
      idAviso: "42", id: "urn:inmet:42.1", sequencia: 1,
      descricao: "Tempestade", severidade: "Perigo", inicio: "21/10/2026 08:55",
      fim: "21/10/2026 23:59", riscos: ["Ventos intensos."], instrucoes: ["Busque abrigo."],
    }],
  };
  const atual = detectarAlertasGraves(relatorio).find((a) => a.assinatura === "inmet:tempestade");
  const estado = {
    [`santos|${ASSINATURA_MONITOR}`]: { inicializadoEm: "x", verificadoEm: "x" },
    "santos|inmet:tempestade": {
      gravidade: atual.gravidade, grau: atual.grau, tipo: atual.tipo, fonteDados: "INMET",
      fingerprint: "fingerprint-da-formula-antiga", emISO: "2026-10-21T10:00:00.000Z",
    },
  };
  const resultado = await verificarAlertas({
    chaves: ["santos"], carregar: () => estado, salvar: () => {}, montar: async () => relatorio,
  });
  assert.equal(resultado.totalNovos, 0);
  assert.equal(estado["santos|inmet:tempestade"].versaoFingerprint, 2, "estado migrado para a fórmula nova");
  assert.notEqual(estado["santos|inmet:tempestade"].fingerprint, "fingerprint-da-formula-antiga");
  const segundo = await verificarAlertas({
    chaves: ["santos"], carregar: () => estado, salvar: () => {}, montar: async () => relatorio,
  });
  assert.equal(segundo.totalNovos, 0);
});

test("mudança real no texto do aviso INMET ainda gera atualização depois da migração", () => {
  const relatorio = (risco) => ({
    ...reportComNivel("ATENÇÃO"),
    severidade: { eventos: [] },
    avisosInmet: [{
      idAviso: "42", id: "urn:inmet:42.1", sequencia: 1, descricao: "Tempestade", severidade: "Perigo",
      inicio: "21/10/2026 08:55", fim: "21/10/2026 23:59", riscos: [risco], instrucoes: ["Busque abrigo."],
    }],
  });
  const achar = (r) => detectarAlertasGraves(r).find((a) => a.assinatura === "inmet:tempestade");
  const estado = {};
  marcarAlertasEnviados({ chave: "santos", alertas: filtrarNovidades("santos", [achar(relatorio("Ventos."))], estado) },
    { carregar: () => estado, salvar: () => {} });
  const [mudanca] = filtrarNovidades("santos", [achar(relatorio("Ventos e granizo."))], estado);
  assert.equal(mudanca.motivo, "atualizou");
});

test("UV: oscilar em torno do limiar não normaliza; só 2 leituras abaixo confirmam", () => {
  const uvAtencao = { assinatura: "uv", tipo: "Índice UV", grau: "ATENÇÃO", gravidade: "atencao", fonteDados: "Open-Meteo" };
  const estado = {
    "macae|uv": { grau: "ATENÇÃO", gravidade: "atencao", tipo: "Índice UV", fonteDados: "Open-Meteo", emISO: "2026-11-16T12:00:00Z" },
  };
  const rodar = (achados, minutos) => {
    const pendencias = {};
    const novos = filtrarNovidades("macae", achados, estado, () => true, {
      agora: new Date(Date.UTC(2026, 10, 16, 12, minutos)), pendencias,
      confirmacao: { leituras: 3, minutos: 15 },
    });
    for (const [chave, p] of Object.entries(pendencias)) {
      if (p) estado[chave].reducaoPendente = p; else delete estado[chave].reducaoPendente;
    }
    return novos;
  };
  // 7.9 (abaixo do limiar): ainda não normaliza.
  assert.deepEqual(rodar([], 10), []);
  // Volta a 8.0 antes da confirmação: a estabilização é descartada.
  assert.deepEqual(rodar([uvAtencao], 20), []);
  assert.equal(estado["macae|uv"].reducaoPendente, undefined);
  // Duas leituras consecutivas abaixo, 10 min entre elas: confirma a normalização.
  assert.deepEqual(rodar([], 30), []);
  const [normalizacao] = rodar([], 40);
  assert.equal(normalizacao.motivo, "normalizou");
  assert.equal(normalizacao.assinatura, "uv");
});

test("UV: alerta de subida só sai antes do pico previsto", () => {
  const uv = { assinatura: "uv", tipo: "Índice UV", grau: "ATENÇÃO", gravidade: "atencao", fonteDados: "Open-Meteo" };
  const agora = new Date("2026-11-16T15:00:00-03:00");
  assert.equal(picoUvPassou("2026-11-16T12:00", new Date("2026-11-16T12:30:00-03:00")), false);
  assert.equal(picoUvPassou("2026-11-16T12:00", agora), true);
  assert.equal(picoUvPassou(null, agora), false);
  assert.equal(filtrarNovidades("macae", [uv], {}, () => true, { agora, uvPicoPassou: true }).length, 0);
  assert.equal(filtrarNovidades("macae", [uv], {}, () => true, { agora, uvPicoPassou: false }).length, 1);
  // Outros fenômenos não são afetados pelo pico do UV.
  const vento = { assinatura: "vento", tipo: "Vento", grau: "ATENÇÃO", gravidade: "atencao" };
  assert.equal(filtrarNovidades("macae", [vento], {}, () => true, { agora, uvPicoPassou: true }).length, 1);
});

test("UV: normalização só é enviada no mesmo dia do alerta; virada de dia é silenciosa", () => {
  const entrada = (emISO) => ({
    "macae|uv": { grau: "ATENÇÃO", gravidade: "atencao", tipo: "Índice UV", fonteDados: "Open-Meteo", emISO },
  });
  const confirmacao = { leituras: 1, minutos: 0 };
  const agora = new Date("2026-11-17T08:00:00-03:00");

  // Alerta enviado hoje às 05h: a normalização é comunicada.
  const hoje = filtrarNovidades("macae", [], entrada("2026-11-17T08:00:00.000Z"), () => true, { agora, confirmacao });
  assert.equal(hoje.length, 1);
  assert.equal(hoje[0].motivo, "normalizou");

  // Alerta de ontem: previsão nova substituiu a antiga; registra sem e-mail.
  const silenciosos = {};
  const ontem = filtrarNovidades("macae", [], entrada("2026-11-16T12:00:00.000Z"), () => true, { agora, confirmacao, silenciosos });
  assert.equal(ontem.length, 0);
  assert.equal(silenciosos["macae|uv"].grau, "NORMAL");
  assert.equal(silenciosos["macae|uv"].silencioso, true);
});

test("primeiro ciclo registra linha de base sem disparo em massa", async () => {
  const estado = {};
  const resultado = await verificarAlertas({
    chaves: ["macae"], carregar: () => estado, salvar: () => {}, montar: async () => reportComNivel("EMERGÊNCIA"),
  });
  assert.equal(resultado.totalNovos, 0);
  assert.ok(estado[`macae|${ASSINATURA_MONITOR}`]);
  assert.equal(estado["macae|chuva"].grau, "EMERGÊNCIA");
});

test("processamento usa somente destinatários da base e confirma após SMTP", async () => {
  const base = { chave: "macae", cidade: { nome: "Macaé", uf: "RJ" }, alertas: [{ assinatura: "chuva", grau: "ALERTA", gravidade: "alto" }] };
  let confirmou = false;
  const envio = await processarAlertaBase(base, {
    listar: (chave, opcoes) => {
      assert.equal(chave, "macae");
      assert.equal(opcoes.permitirFallback, false);
      return ["focal.macae@exemplo.com"];
    },
    enfileirar: () => ({ id: "evento-1", status: "pendente" }),
    assumir: () => ({ id: "evento-1", status: "processando" }),
    enviar: async (_base, opcoes) => {
      assert.deepEqual(opcoes.destinatariosOverride, ["focal.macae@exemplo.com"]);
      return { messageId: "smtp-1", destinatarios: opcoes.destinatariosOverride };
    },
    marcarEnviado: () => {},
    marcarFalha: () => assert.fail("não deveria registrar falha"),
    confirmar: () => { confirmou = true; },
  });
  assert.equal(envio.messageId, "smtp-1");
  assert.equal(confirmou, true);
});

test("monitor extraordinário agenda cinco minutos, dia inteiro e sem sobreposição", () => {
  const anterior = { ...CONFIGURACAO_EMAIL };
  const envAnterior = {
    MONITOR_ALERTAS: process.env.MONITOR_ALERTAS,
    INTERVALO_MONITOR_MIN: process.env.INTERVALO_MONITOR_MIN,
    JANELA_MONITOR: process.env.JANELA_MONITOR,
  };
  let chamada;
  try {
    CONFIGURACAO_EMAIL.alertasAutomaticosAtivos = true;
    delete process.env.MONITOR_ALERTAS;
    delete process.env.INTERVALO_MONITOR_MIN;
    delete process.env.JANELA_MONITOR;
    iniciarMonitorAlertas(undefined, (expressao, callback, opcoes) => {
      chamada = { expressao, callback, opcoes };
      return { stop() {} };
    });
    assert.equal(chamada.expressao, "*/5 * * * *");
    assert.equal(chamada.opcoes.timezone, "America/Sao_Paulo");
    assert.equal(chamada.opcoes.noOverlap, true);
  } finally {
    Object.assign(CONFIGURACAO_EMAIL, anterior);
    for (const [chave, valor] of Object.entries(envAnterior)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  }
});
