const test = require("node:test");
const assert = require("node:assert/strict");
const { createInmetAlertMonitor } = require("../src/logic/inmetAlertMonitor");

const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

test("monitor detecta instalações novas em ciclos posteriores e acompanha mudanças de severidade", async () => {
  const cities = { first: { latitude: -22, longitude: -43 } };
  let severity = "Moderate";
  const observed = [];
  const monitor = createInmetAlertMonitor({
    cities: () => cities,
    collect: async (items) => {
      observed.push(items.length);
      return { porBase: { first: [{ severidade: severity }] } };
    },
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });
  monitor.start();
  monitor.start();
  await monitor.run();
  assert.equal(monitor.getStatus().alerts.first[0].severidade, "Moderate");
  cities.newInstallation = { latitude: -23, longitude: -44 };
  severity = "Severe";
  await monitor.run();
  assert.deepEqual(observed, [1, 2]);
  assert.equal(monitor.getStatus().alerts.first[0].severidade, "Severe");
  assert.equal(monitor.getStatus().monitoredInstallations, 2);
  monitor.stop();
});

test("resultado vazio é sucesso; falha retém cache com idade e recuperação o substitui", async () => {
  let instant = new Date("2026-11-10T12:00:00Z");
  let result = { porBase: { a: [{ severidade: "Severe" }] } };
  const monitor = createInmetAlertMonitor({
    cities: { a: { latitude: -22, longitude: -43 } },
    collect: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    now: () => instant,
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });
  monitor.start();
  await monitor.run();
  assert.equal(monitor.getStatus().status, "com_alertas");
  assert.equal(monitor.getStatus().cachedPreviousSuccess, false);
  instant = new Date("2026-11-10T12:25:00Z");
  result = Object.assign(new Error("private URL / token"), { code: "ENOTFOUND" });
  await monitor.run();
  assert.equal(monitor.getStatus().status, "indisponivel");
  assert.equal(monitor.getStatus().integracaoStatus, "degradada");
  assert.equal(monitor.getStatus().cachedPreviousSuccess, true);
  assert.equal(monitor.getStatus().alerts.a[0].severidade, "Severe");
  assert.equal(monitor.getStatus().stale, true);
  assert.equal(monitor.getStatus().expired, false);
  assert.equal(monitor.getStatus().recentError.message.includes("token"), false);
  instant = new Date("2026-11-10T13:01:00Z");
  assert.equal(monitor.getStatus().expired, true);
  assert.equal(monitor.getStatus().integracaoStatus, "indisponivel");
  result = { porBase: { a: [] }, consulta: "sucesso_vazio" };
  await monitor.run();
  assert.equal(monitor.getStatus().status, "sem_alertas");
  assert.equal(monitor.getStatus().integracaoStatus, "operacional");
  assert.deepEqual(monitor.getStatus().alerts.a, []);
  monitor.stop();
});

test("timeout libera ciclos futuros e execução concorrente não duplica a coleta", async () => {
  let resolveCollect;
  let calls = 0;
  const monitor = createInmetAlertMonitor({
    cities: {},
    collect: () => {
      calls += 1;
      if (calls > 1) return Promise.resolve({ porBase: {} });
      return new Promise((resolve) => { resolveCollect = resolve; });
    },
    timeoutMs: 5,
    setTimeoutFn: (callback, delay) => delay < 1000 ? setTimeout(callback, delay) : Symbol("scheduled"),
    clearTimeoutFn: (timer) => { if (typeof timer === "object") clearTimeout(timer); },
  });
  try {
    monitor.start();
    const concurrent = monitor.run();
    await settle();
    assert.equal(calls, 1);
    await concurrent;
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(monitor.getStatus().status, "indisponivel");
    resolveCollect?.({ porBase: {} });
    await monitor.run();
    assert.equal(calls, 2);
  } finally {
    monitor.stop();
  }
});
