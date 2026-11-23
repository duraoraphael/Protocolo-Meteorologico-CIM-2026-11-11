const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarMonitorAlertas } = require("../src/scheduler");

test("monitor agenda uma vez e verifica COR-Rio mesmo quando não há alertas meteorológicos", async () => {
  const tarefas = [];
  const schedule = (expression, callback, options) => {
    const tarefa = { expression, callback, options, stop() {} };
    tarefas.push(tarefa);
    return tarefa;
  };
  let consultasCorRio = 0;
  let consultasBases = 0;
  const resultados = [];
  const first = iniciarMonitorAlertas((erro, resultado) => resultados.push({ erro, resultado }), schedule, {
    verificarCorRio: async () => {
      consultasCorRio++;
      if (consultasCorRio === 1) throw new Error("Falha COR-Rio");
      return { envio: { messageId: "cor-ok" }, mudancas: [{ parte: "estagio", anterior: 1, atual: 2 }] };
    },
    verificarBases: async () => {
      consultasBases++;
      return { falhas: [], totalNovos: 0, verificadoEm: "teste" };
    },
  });
  const second = iniciarMonitorAlertas(undefined, schedule);
  assert.equal(first, second);
  assert.equal(tarefas.length, 1);
  assert.equal(tarefas[0].options.timezone, "America/Sao_Paulo");
  assert.equal(consultasCorRio, 0, "agendar não dispara envio imediato");
  await tarefas[0].callback();
  await tarefas[0].callback();
  assert.equal(consultasCorRio, 2);
  assert.equal(consultasBases, 2, "falha COR-Rio não interrompe outras bases");
  assert.match(resultados[0].erro.message, /Falha COR-Rio/);
  assert.equal(resultados[1].resultado.envio.messageId, "cor-ok");
});
