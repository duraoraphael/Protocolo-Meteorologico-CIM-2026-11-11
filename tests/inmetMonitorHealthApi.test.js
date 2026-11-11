const test = require("node:test");
const assert = require("node:assert/strict");
const { subirApp } = require("./helpers/servidor");

test("endpoint de saúde expõe somente contagens e estado sanitizado do monitor", async () => {
  const servidor = await subirApp();
  try {
    const response = await fetch(`${servidor.base}/api/monitoramento/saude`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.registroGeografico.total > 0, true);
    assert.equal(body.registroGeografico.invalidos, 0);
    assert.equal(typeof body.monitor.monitoredInstallations, "number");
    assert.ok(["operacional", "degradada", "indisponivel"].includes(body.monitor.integracaoStatus));
    assert.equal(Object.hasOwn(body.monitor, "alerts"), false);
  } finally {
    await servidor.fechar();
  }
});
