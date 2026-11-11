const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarMonitorAlertas } = require("../src/scheduler");

test("agendamento do monitor de e-mail é criado uma única vez sem disparar SMTP", () => {
  const tarefas = [];
  const schedule = (expression, callback, options) => {
    const tarefa = { expression, callback, options, stop() {} };
    tarefas.push(tarefa);
    return tarefa;
  };
  const first = iniciarMonitorAlertas(undefined, schedule);
  const second = iniciarMonitorAlertas(undefined, schedule);
  assert.equal(first, second);
  assert.equal(tarefas.length, 1);
  assert.equal(tarefas[0].options.timezone, "America/Sao_Paulo");
});
