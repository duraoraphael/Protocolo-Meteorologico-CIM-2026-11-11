const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test('publicacoes novas e editadas nao disparam aviso de estagios', async t => {
  const { criarMonitorCorRio } = require('../src/logic/corRioAlertMonitor');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cim-cor-posts-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  let envios = 0;
  const monitor = criarMonitorCorRio({ arquivo: path.join(pasta, 'estado.json'),
    coletar: async () => ({ report: { corRio: {
      estagio: { status: 'operacional', dados: { nivel: 1 } }, calor: { status: 'operacional', dados: { nivel: 3 } },
    }, publicacoesCorRio: { status: 'operacional', itens: [{ id: String(Math.random()) }] } } }),
    enviar: async () => { envios++; return { messageId: 'ok' }; }, logger: { log() {}, error() {} },
  });
  await monitor(); await monitor(); await monitor(); assert.equal(envios, 0);
});

test('transicao enviada preserva a assinatura operacional', async t => {
  const { criarMonitorCorRio } = require('../src/logic/corRioAlertMonitor');
  const { validarDocumentoOperacional } = require('../src/logic/documentProvenance');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cim-cor-assinatura-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  let nivel = 1; let enviado;
  const monitor = criarMonitorCorRio({ arquivo: path.join(pasta, 'estado.json'),
    coletar: async () => ({ report: { corRio: { estagio: { status: 'operacional', dados: { nivel } } } } }),
    enviar: async r => { validarDocumentoOperacional(r); enviado = r; return { messageId: 'ok' }; },
    logger: { log() {}, error() {} },
  });
  await monitor(); nivel = 3; await monitor();
  enviado.corRioMudancas[0].anterior = 2;
  assert.throws(() => validarDocumentoOperacional(enviado));
});

test("COR-Rio avisa apenas mudanças válidas, persiste referência e retenta falha de envio", async (t) => {
  const { criarMonitorCorRio } = require("../src/logic/corRioAlertMonitor");
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "cim-cor-monitor-"));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, "estado.json");
  let estagio = 1;
  let calor = 1;
  let status = "operacional";
  let falhar = false;
  let semDestinatarios = false;
  const enviados = [];
  const opcoes = {
    arquivo,
    coletar: async () => ({ report: {
      corRio: {
        estagio: { status, dados: { nivel: estagio } },
        calor: { status: "operacional", dados: { nivel: calor } },
        comunicados: { status: "operacional", itens: [{ titulo: String(Date.now()) }] },
      },
    } }),
    enviar: async (report) => {
      if (falhar) throw new Error("SMTP indisponível");
      if (semDestinatarios) return null;
      enviados.push([report.corRio.estagio.dados.nivel, report.corRio.calor.dados.nivel]);
      return { messageId: `m-${enviados.length}` };
    },
  };
  let monitor = criarMonitorCorRio(opcoes);
  await monitor();
  await monitor();
  assert.deepEqual(enviados, [], "inicialização e comunicados novos não disparam alerta");
  estagio = 2;
  await monitor();
  await monitor();
  assert.deepEqual(enviados, [[2, 1]]);
  monitor = criarMonitorCorRio(opcoes);
  await monitor();
  assert.equal(enviados.length, 1, "reinício mantém referência");
  estagio = 1;
  await monitor();
  calor = 2;
  await monitor();
  assert.deepEqual(enviados, [[2, 1], [1, 1], [1, 2]], "redução e calor também notificam");
  estagio = 3;
  status = "desatualizado";
  await monitor();
  assert.equal(enviados.length, 3, "cache após falha não altera referência");
  status = "operacional";
  falhar = true;
  await assert.rejects(monitor(), /SMTP indisponível/);
  falhar = false;
  await monitor();
  assert.deepEqual(enviados.at(-1), [3, 2]);
  estagio = 4;
  semDestinatarios = true;
  await monitor();
  semDestinatarios = false;
  await monitor();
  assert.deepEqual(enviados.at(-1), [4, 2]);
  estagio = 1;
  calor = 1;
  await monitor();
  estagio = 2;
  await monitor();
  assert.deepEqual(enviados.at(-1), [2, 1], "um novo ciclo pode repetir níveis antigos");
});

test("COR-Rio inicializa fontes separadamente e rejeita níveis inválidos", async (t) => {
  const { criarMonitorCorRio } = require("../src/logic/corRioAlertMonitor");
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "cim-cor-parcial-"));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  let corRio = { estagio: { status: "indisponivel" }, calor: { status: "operacional", dados: { nivel: 1 } } };
  let envios = 0;
  const monitor = criarMonitorCorRio({
    arquivo: path.join(pasta, "estado.json"),
    coletar: async () => ({ report: { corRio } }),
    enviar: async () => { envios++; return { messageId: "ok" }; },
  });
  await monitor();
  corRio.estagio = { status: "operacional", dados: { nivel: 3 } };
  await monitor();
  assert.equal(envios, 0, "primeira leitura válida de cada fonte é silenciosa");
  corRio.estagio.dados.nivel = 0;
  await monitor();
  corRio.estagio.dados.nivel = 6;
  await monitor();
  corRio.estagio.dados.nivel = 3;
  await monitor();
  assert.equal(envios, 0);
  corRio.estagio.dados.nivel = 2;
  corRio.calor.dados.nivel = 2;
  await monitor();
  assert.equal(envios, 1, "mudanças simultâneas geram um aviso");
});
