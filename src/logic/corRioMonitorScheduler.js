const { criarMonitorCorRio } = require('./corRioAlertMonitor');
const { alertasAutomaticosAtivos } = require('../config/email');
const INTERVALO_PADRAO_SEGUNDOS = 15;

function criarAgendamentoCorRio({
  verificar = criarMonitorCorRio(), env = process.env, ativo = alertasAutomaticosAtivos,
  agendar = setTimeout, cancelar = clearTimeout, logger = console,
} = {}) {
  let tarefa = null;
  return function iniciar(onResultado) {
    if (tarefa) return tarefa;
    if (!ativo() || env.MONITOR_ALERTAS === 'false' || env.MONITOR_COR_RIO === 'false') return null;
    const configurado = Number(env.INTERVALO_COR_RIO_SEGUNDOS || INTERVALO_PADRAO_SEGUNDOS);
    const intervalo = (Number.isFinite(configurado) && configurado >= 5 && configurado <= 300
      ? configurado : INTERVALO_PADRAO_SEGUNDOS) * 1000;
    let parado = false;
    let timer;
    let falhas = 0;
    function programar(ms) {
      if (parado) return;
      timer = agendar(executar, ms);
      timer?.unref?.();
    }
    async function executar() {
      if (parado) return;
      try {
        const resultado = await verificar();
        falhas = resultado.falhaColeta ? falhas + 1 : 0;
        if (resultado.envio) onResultado?.(null, resultado);
      } catch (erro) {
        falhas++;
        logger.error?.(`[COR-RIO] Falha no monitor exclusivo: ${erro.message}`);
        onResultado?.(erro, null);
      } finally {
        programar(Math.min(300000, intervalo * 2 ** Math.min(falhas, 6)));
      }
    }
    tarefa = { stop() { parado = true; cancelar(timer); tarefa = null; } };
    logger.log?.(`[COR-RIO] Monitor exclusivo 24h: intervalo ${intervalo / 1000}s; mudanças dos estágios operacional e de calor.`);
    programar(0);
    return tarefa;
  };
}

const iniciarMonitorCorRio = criarAgendamentoCorRio();
module.exports = { criarAgendamentoCorRio, iniciarMonitorCorRio };
