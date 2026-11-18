const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { setTimeout: esperar } = require("node:timers/promises");
const { subirApp, SENHA_TESTE } = require("./helpers/servidor");
const { registrarOperacionalTeste } = require("./helpers/provenance");

test("pipeline real do lote gera e anexa um PDF por base e usa somente os vínculos locais", async (t) => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "cim-lote-pipeline-"));
  const arquivoResponsaveis = path.join(pasta, "responsaveis.json");
  fs.writeFileSync(arquivoResponsaveis, JSON.stringify({ versao: 2, responsaveis: [
    { nome: "Macaé", email: "macae@example.test", bases: ["macae"] },
    { nome: "Santos", email: "santos@example.test", bases: ["santos"] },
    { nome: "COR", email: "cor@example.test", bases: ["cor_rio"] },
  ] }));
  const envAnterior = { RESPONSAVEIS_ARQUIVO: process.env.RESPONSAVEIS_ARQUIVO, REPORT_RECIPIENTS: process.env.REPORT_RECIPIENTS };
  process.env.RESPONSAVEIS_ARQUIVO = arquivoResponsaveis;
  process.env.REPORT_RECIPIENTS = "fallback@example.test";
  const nomePrefixo = `CIM_Lote_${randomUUID()}`;
  const pdfs = [];
  const mensagens = [];

  t.mock.method(require("../src/logic/reportBuilder"), "montarRelatorio", async (cidade) => registrarOperacionalTeste({
    cidade, nomeArquivoBase: `${nomePrefixo}_${cidade.chave}`, dataFormatadaCurta: "18/11/2026",
    avisosColeta: [], tabelaTemperaturaUmidade: [], ventoPorPeriodo: [], chuvaPorPeriodo: [],
    severidade: { grau: "NORMAL", eventos: [] }, avisosInmet: [], fontesAutomatizadas: [],
  }));
  t.mock.method(require("../src/sources/monitorSecas"), "obterMonitorSecas", async () => null);
  t.mock.method(require("../src/integrations/sharepointGed"), "destinoConfigurado", () => false);
  t.mock.method(require("../src/render/pdfGenerator"), "gerarPdfBuffer", async (report) => {
    pdfs.push(report.cidade.chave);
    return Buffer.from(`%PDF-1.4\n${report.cidade.chave}`);
  });
  const transport = require("../src/email/transport");
  t.mock.method(transport, "enderecoRemetente", () => ({ formatado: "CIM <cim@example.test>" }));
  t.mock.method(transport, "criarTransportador", () => ({
    async sendMail(mensagem) {
      mensagens.push(mensagem);
      return { messageId: "smtp-teste", accepted: [mensagem.to], rejected: [] };
    },
  }));
  const { PASTA_SAIDA } = require("../src/pipeline");
  const srv = await subirApp({ pastaLotes: path.join(pasta, "lotes") });
  t.after(async () => {
    await srv.fechar();
    for (const [chave, valor] of Object.entries(envAnterior)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
    for (const cidade of ["macae", "santos"]) {
      fs.rmSync(path.join(PASTA_SAIDA, `${nomePrefixo}_${cidade}.pdf`), { force: true });
    }
    fs.rmSync(pasta, { recursive: true, force: true });
  });
  const id = randomUUID();
  const postar = (sufixo, corpo) => fetch(`${srv.base}/api/relatorios/lotes${sufixo}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ senha: SENHA_TESTE, ...corpo }),
  });
  assert.equal((await postar("", { id, cidades: ["macae", "brasilia", "santos"] })).status, 202);
  let lote;
  for (let i = 0; i < 100 && !lote?.concluidoEm; i++) {
    lote = (await (await postar(`/${id}/status`)).json()).lote;
    if (!lote.concluidoEm) await esperar(10);
  }
  assert.ok(lote?.concluidoEm);
  assert.deepEqual(lote.itens.map((item) => item.status), ["enviado", "falha", "enviado"]);
  assert.match(lote.itens[1].erro, /Nenhum destinatário cadastrado/);
  assert.deepEqual(pdfs, ["macae", "santos"]);
  assert.equal(mensagens.length, 2);
  for (const [indice, cidade] of pdfs.entries()) {
    const mensagem = mensagens[indice];
    assert.equal(mensagem.to, `${cidade}@example.test`);
    const anexos = mensagem.attachments.filter((anexo) => anexo.contentType === "application/pdf");
    assert.equal(anexos.length, 1);
    assert.equal(anexos[0].content.toString(), `%PDF-1.4\n${cidade}`);
  }
});
