// Aceite SMTP não é confirmação de entrega à caixa de entrada.
function emailsUnicos(valores) {
  return [...new Set((Array.isArray(valores) ? valores : []).map(valor =>
    String(valor?.address || valor).trim().toLowerCase()).filter(Boolean))];
}

function reciboSmtp(info = {}) {
  return {
    messageId: info.messageId || null,
    respostaSmtp: info.response || null,
    destinatariosAceitos: emailsUnicos(info.accepted),
    destinatariosRejeitados: emailsUnicos(info.rejected),
    errosRejeitados: (info.rejectedErrors || []).map(erro => ({
      destinatario: erro.recipient || null,
      codigo: erro.code || null,
      codigoSmtp: erro.responseCode || null,
      resposta: erro.response || erro.message || null,
    })),
  };
}

module.exports = { emailsUnicos, reciboSmtp };
