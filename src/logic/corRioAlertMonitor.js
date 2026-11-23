const fs = require("node:fs");
const path = require("node:path");

const ARQUIVO = path.join(__dirname, "..", "..", "data", "cor-rio-notificado.json");
const PARTES = ["estagio", "calor"];

function carregarEstado(arquivo) {
  try {
    const estado = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    if (!estado || typeof estado !== "object" || Array.isArray(estado)
      || Object.entries(estado).some(([chave, nivel]) => !PARTES.includes(chave)
        || !Number.isInteger(nivel) || nivel < 1 || nivel > 5)) {
      throw new Error("Referência de estágios inválida.");
    }
    return estado;
  } catch (erro) {
    if (erro.code === "ENOENT") return {};
    throw new Error(`Estado COR-Rio ilegível; envio suspenso: ${erro.message}`, { cause: erro });
  }
}

function salvarEstado(arquivo, estado) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const temporario = `${arquivo}.${process.pid}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(estado, null, 2), "utf8");
  fs.renameSync(temporario, arquivo);
}

function criarMonitorCorRio({
  arquivo = ARQUIVO,
  coletar = () => require("../pipeline").executarPipelineCorRio({ enviarEmail: false }),
  enviar = (report) => require("../email/sendReport").enviarAvisoCorRioPorEmail(report),
} = {}) {
  let emAndamento = false;
  return async function verificar() {
    if (emAndamento) return { ignorado: true, motivo: "em-processamento" };
    emAndamento = true;
    try {
      const anterior = carregarEstado(arquivo);
      const { report } = await coletar();
      const atuais = {};
      const mudancas = [];
      let inicializou = false;
      for (const parte of PARTES) {
        const fonte = report.corRio?.[parte];
        const nivel = fonte?.dados?.nivel;
        // Erro/cache não muda a referência nem representa retorno à normalidade.
        if (fonte?.status !== "operacional" || !Number.isInteger(nivel) || nivel < 1 || nivel > 5) continue;
        atuais[parte] = nivel;
        if (anterior[parte] === undefined) {
          anterior[parte] = nivel;
          inicializou = true;
        } else if (nivel !== anterior[parte]) {
          mudancas.push({ parte, anterior: anterior[parte], atual: nivel });
        }
      }
      // A primeira leitura de cada fonte apenas estabelece uma referência.
      if (inicializou) salvarEstado(arquivo, anterior);
      if (!mudancas.length) return { ignorado: true, motivo: "sem-mudanca" };

      const envio = await enviar(report);
      if (!envio) return { ignorado: true, motivo: "sem-destinatarios" };
      // Só confirma após SMTP; falhas são retentadas na próxima consulta.
      salvarEstado(arquivo, { ...anterior, ...atuais });
      return { report, envio, mudancas };
    } finally {
      emAndamento = false;
    }
  };
}

module.exports = { criarMonitorCorRio };
