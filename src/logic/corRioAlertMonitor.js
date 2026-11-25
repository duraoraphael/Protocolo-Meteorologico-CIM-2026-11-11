const path = require('node:path');
const { randomUUID } = require('node:crypto');
const store = require('./corRioEventStore');
const { registrarDocumentoOperacional } = require('./documentProvenance');
const ARQUIVO = path.join(__dirname, '..', '..', 'data', 'cor-rio-notificado.json');

function prepararDocumento(evento, agora) {
  const report = structuredClone(evento.report);
  delete report.procedencia;
  delete report.publicacoesCorRio;
  report.corRioMudancas = evento.mudancas;
  report.corRioEventoId = evento.id;
  report.corRioIdentificadoEm = evento.identificadoEm;
  report.geradoEmISO = agora.toISOString();
  report.dataFormatadaLonga = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full' });
  report.dataFormatadaCurta = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  report.tipoDocumento = 'AVISO_COR_RIO';
  registrarDocumentoOperacional(report, { localidade: 'rio_de_janeiro', fontes: ['COR-Rio — Centro de Operações e Resiliência'] });
  return report;
}

function criarMonitorCorRio({
  arquivo = ARQUIVO,
  coletar = () => require('../pipeline').executarPipelineCorRio({ enviarEmail: false }),
  enviar = (report, opcoes) => require('../email/sendReport').enviarAvisoCorRioPorEmail(report, opcoes),
  prepararEnvio = prepararDocumento, agora = () => new Date(), logger = console,
} = {}) {
  let emAndamento = false;
  const log = (evento, detalhes = {}) => logger.log?.('[COR-RIO] ' + JSON.stringify({ evento,
    horarioBrasilia: agora().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), ...detalhes }));
  return async function verificar() {
    if (emAndamento) return { ignorado: true, motivo: 'em-processamento' };
    const liberar = store.adquirirTrava(arquivo);
    if (!liberar) { log('duplicidade_bloqueada'); return { ignorado: true, motivo: 'em-processamento' }; }
    emAndamento = true;
    try {
      const estado = store.carregar(arquivo);
      let falhaColeta = false;
      const anterior = { ...estado.observados };
      let report;
      try { ({ report } = await coletar()); }
      catch (erro) { falhaColeta = true; logger.error?.(`[COR-RIO] Falha na consulta: ${erro.message}`); }
      const mudancas = [];
      if (report) for (const parte of store.PARTES) {
        const fonte = report.corRio?.[parte];
        const nivel = fonte?.dados?.nivel;
        if (fonte?.status !== 'operacional' || !store.nivelValido(nivel)) {
          falhaColeta = true;
          log('fonte_indisponivel', { parte, status: fonte?.status || 'incompleto' });
          continue;
        }
        if (estado.observados[parte] !== undefined && estado.observados[parte] !== nivel) {
          mudancas.push({ parte, anterior: estado.observados[parte], atual: nivel,
            tipo: nivel > estado.observados[parte] ? 'AGRAVAMENTO' : 'REDUÇÃO' });
        }
        estado.observados[parte] = nivel;
      }
      if (mudancas.length) {
        const snapshot = structuredClone(report);
        delete snapshot.publicacoesCorRio;
        delete snapshot.procedencia;
        estado.eventos.push({ id: randomUUID(), identificadoEm: agora().toISOString(), mudancas,
          report: snapshot, status: 'pendente', tentativas: 0, enviadoEm: null, ultimoErro: null });
        log('mudanca_identificada', { id: estado.eventos.at(-1).id, mudancas });
      }
      // Persistir observação e episódio antes de SMTP preserva as mudanças seguintes.
      store.salvar(arquivo, estado);
      log('consulta', { anteriores: anterior, atuais: estado.observados, alterou: !!mudancas.length, falhaColeta });
      const envios = [];
      let primeiraFalha = null;
      for (const evento of estado.eventos) {
        if (evento.status === 'enviado') continue;
        evento.status = 'processando';
        evento.tentativas++;
        evento.ultimaTentativaEm = agora().toISOString();
        store.salvar(arquivo, estado);
        log('tentativa_envio', { id: evento.id, tentativa: evento.tentativas });
        try {
          const documento = prepararEnvio(evento, agora());
          const envio = await enviar(documento, { destinatariosOverride: evento.pendentes || null });
          if (!envio) {
            evento.status = 'pendente'; evento.ultimoErro = 'Nenhum destinatário COR-RIO ativo.';
            store.salvar(arquivo, estado);
            continue;
          }
          const aceitosAgora = (envio.destinatariosAceitos || envio.destinatarios || []).map(email => email.toLowerCase());
          evento.aceitos = [...new Set([...(evento.aceitos || []), ...aceitosAgora])];
          evento.pendentes = (envio.destinatarios || []).filter(email => !aceitosAgora.includes(email.toLowerCase()));
          evento.envio = envio;
          if (evento.pendentes.length) {
            evento.status = 'pendente'; evento.ultimoErro = 'SMTP parcial: destinatários rejeitados aguardam nova tentativa.';
            store.salvar(arquivo, estado);
            primeiraFalha ||= new Error(evento.ultimoErro);
            log('envio_parcial', { id: evento.id, aceitos: evento.aceitos, pendentes: evento.pendentes });
            continue;
          }
          evento.status = 'enviado'; evento.enviadoEm = agora().toISOString(); evento.ultimoErro = null;
          evento.envio = envio;
          store.salvar(arquivo, estado);
          envios.push({ report: documento, envio, mudancas: evento.mudancas, eventoId: evento.id });
          log('enviado', { id: evento.id, enviadoEm: evento.enviadoEm, destinatarios: envio.destinatarios || [], messageId: envio.messageId });
        } catch (erro) {
          evento.status = 'pendente'; evento.ultimoErro = erro.message;
          store.salvar(arquivo, estado);
          logger.error?.(`[COR-RIO] Falha no evento ${evento.id}, tentativa ${evento.tentativas}: ${erro.message}`);
          primeiraFalha ||= erro;
        }
      }
      if (primeiraFalha) throw primeiraFalha;
      return envios.length ? { ...envios.at(-1), envios, falhaColeta }
        : { ignorado: true, motivo: 'sem-mudanca', falhaColeta };
    } finally { emAndamento = false; liberar(); }
  };
}

module.exports = { criarMonitorCorRio, prepararDocumento };
