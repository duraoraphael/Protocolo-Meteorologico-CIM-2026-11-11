const fs = require("node:fs");
const path = require("node:path");

const ARQUIVO = path.join(__dirname, "..", "..", "data", "cor-rio-notificado.json");
const PARTES = ["estagio", "calor"];

function carregarEstado(arquivo) {
  try {
    const estado = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    if (!estado || typeof estado !== "object" || Array.isArray(estado)
      || Object.entries(estado).some(([chave, nivel]) => chave !== 'publicacoes' && (!PARTES.includes(chave)
        || !Number.isInteger(nivel) || nivel < 1 || nivel > 5))) {
      throw new Error("Referência de estágios inválida.");
    }
    if (estado.publicacoes && (!Number.isFinite(Date.parse(estado.publicacoes.desde))
      || !estado.publicacoes.versoes || typeof estado.publicacoes.versoes !== 'object'
      || Array.isArray(estado.publicacoes.versoes)
      || Object.values(estado.publicacoes.versoes).some(v => typeof v !== 'string'))) {
      throw new Error('Referência de publicações inválida.');
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
  coletar = ({ desde }) => require("../pipeline").executarPipelineCorRio({
    enviarEmail: false, monitorPublicacoes: true, publicacoesDesde: desde,
  }),
  enviar = (report) => require("../email/sendReport").enviarAvisoCorRioPorEmail(report),
} = {}) {
  let emAndamento = false;
  return async function verificar() {
    if (emAndamento) return { ignorado: true, motivo: "em-processamento" };
    emAndamento = true;
    try {
      const anterior = carregarEstado(arquivo);
      const { report } = await coletar({ desde: anterior.publicacoes?.desde });
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
      const publicacoes = report.publicacoesCorRio;
      const falhaColeta = [report.corRio?.estagio, report.corRio?.calor, publicacoes]
        .some(f => f && f.status !== 'operacional');
      let publicacoesAtuais = null;
      if (publicacoes?.status === 'operacional') {
        const versoes = Object.fromEntries(publicacoes.itens.map(item => [item.id, item.revisao]));
        publicacoesAtuais = { desde: publicacoes.desde, versoes: { ...anterior.publicacoes?.versoes, ...versoes } };
        if (!anterior.publicacoes) {
          anterior.publicacoes = publicacoesAtuais;
          inicializou = true;
          report.publicacoesCorRio = { ...publicacoes, itens: [] };
        } else {
          const novos = publicacoes.itens.filter(item => anterior.publicacoes.versoes[item.id] !== item.revisao);
          report.publicacoesCorRio = { ...publicacoes, itens: novos };
          for (const item of novos) mudancas.push({ parte: 'publicacao', id: item.id, titulo: item.titulo });
        }
      }
      // A primeira leitura de cada fonte apenas estabelece uma referência.
      if (inicializou) salvarEstado(arquivo, anterior);
      if (!mudancas.length) {
        if (publicacoesAtuais) salvarEstado(arquivo, { ...anterior, publicacoes: publicacoesAtuais });
        return { ignorado: true, motivo: "sem-mudanca", falhaColeta };
      }

      if (report.procedencia) require('./documentProvenance').atualizarAssinaturaDocumentoOperacional(report);
      const envio = await enviar(report);
      if (!envio) return { ignorado: true, motivo: "sem-destinatarios", falhaColeta };
      // Só confirma após SMTP; falhas são retentadas na próxima consulta.
      salvarEstado(arquivo, { ...anterior, ...atuais, ...(publicacoesAtuais ? { publicacoes: publicacoesAtuais } : {}) });
      return { report, envio, mudancas, falhaColeta };
    } finally {
      emAndamento = false;
    }
  };
}

module.exports = { criarMonitorCorRio };
