const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAgendamentoCorRio } = require('../src/logic/corRioMonitorScheduler');

test('ciclo exclusivo de 15 segundos não sobrepõe consultas, retenta com espera e pode parar', async () => {
  let tempo = 0; const pendentes = []; let consultas = 0; let resolver;
  const iniciar = criarAgendamentoCorRio({
    verificar: async () => { consultas++; if (consultas === 1) throw new Error('fonte fora');
      if (consultas === 2) await new Promise(r => { resolver = r; }); return {}; },
    agendar: (fn, ms) => { const item = { fn, ms }; pendentes.push(item); return item; },
    cancelar: item => { item.cancelado = true; }, logger: { log() {}, error() {} },
  });
  const tarefa = iniciar();
  assert.equal(pendentes[tempo].ms, 0);
  await pendentes[tempo++].fn();
  assert.equal(pendentes[tempo].ms, 30000);
  const consulta = pendentes[tempo++].fn();
  await Promise.resolve();
  assert.equal(pendentes.length, 2, 'não agenda próxima consulta enquanto há outra em andamento');
  resolver(); await consulta;
  assert.equal(pendentes[tempo].ms, 15000);
  tarefa.stop();
  assert.equal(pendentes[tempo].cancelado, true);
});

test('monitor exclusivo respeita os interruptores', () => {
  for (const env of [{ MONITOR_ALERTAS: 'false' }, { MONITOR_COR_RIO: 'false' }]) {
    assert.equal(criarAgendamentoCorRio({ env, verificar: async () => {}, agendar: () => assert.fail('agendou') })(), null);
  }
  assert.equal(criarAgendamentoCorRio({ ativo: () => false })(), null);
});
