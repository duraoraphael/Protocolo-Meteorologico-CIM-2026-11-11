const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarMonitorCorRio } = require('../src/logic/corRioAlertMonitor');

function ambiente(t) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cim-cor-eventos-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'estado.json');
  const niveis = { estagio: 1, calor: 1 }; let falhar = false; let apiFalha = false;
  const enviados = [];
  const opcoes = { arquivo, logger: { log() {}, error() {} },
    coletar: async () => {
      if (apiFalha) throw new Error('API fora');
      return { report: { corRio: Object.fromEntries(Object.entries(niveis).map(([p, nivel]) => [p, {
        status: 'operacional', dados: { nivel }, consultadoEm: new Date().toISOString(),
      }])), publicacoesCorRio: { status: 'operacional', desde: new Date().toISOString(), itens: [{ id: String(Math.random()), revisao: 'nova' }] } } };
    }, enviar: async report => {
      if (falhar) throw new Error('SMTP fora');
      enviados.push(structuredClone(report)); return { messageId: 'm-' + enviados.length, destinatarios: ['cor@example.test'] };
    } };
  return { arquivo, niveis, enviados, opcoes, set falhar(v) { falhar = v; }, set apiFalha(v) { apiFalha = v; } };
}

for (const parte of ['estagio', 'calor']) for (let anterior = 1; anterior <= 5; anterior++) for (let atual = 1; atual <= 5; atual++) {
  if (anterior === atual) continue;
  test(`${parte}: ${anterior} -> ${atual} gera exatamente um evento persistido`, async t => {
    const a = ambiente(t); a.niveis[parte] = anterior;
    const monitor = criarMonitorCorRio(a.opcoes); await monitor();
    a.niveis[parte] = atual; await monitor(); await monitor();
    assert.equal(a.enviados.length, 1);
    assert.deepEqual(a.enviados[0].corRioMudancas, [{ parte, anterior, atual,
      tipo: atual > anterior ? 'AGRAVAMENTO' : 'REDUÇÃO' }]);
    const evento = JSON.parse(fs.readFileSync(a.arquivo)).eventos[0];
    assert.equal(evento.status, 'enviado'); assert.ok(evento.id); assert.ok(evento.enviadoEm);
  });
}

test('consolida mudanças simultâneas e ignora publicações, preservando episódios repetidos', async t => {
  const a = ambiente(t), monitor = criarMonitorCorRio(a.opcoes);
  await monitor(); await monitor(); assert.equal(a.enviados.length, 0);
  a.niveis.estagio = 4; a.niveis.calor = 3; await monitor();
  assert.equal(a.enviados.length, 1); assert.equal(a.enviados[0].corRioMudancas.length, 2);
  a.niveis.estagio = 1; await monitor(); a.niveis.estagio = 4; await monitor();
  assert.equal(new Set(a.enviados.map(r => r.corRioEventoId)).size, 3);
});

test('falha SMTP não perde transições seguintes, nem retorno ao nível inicial; reinício e API fora preservam a fila', async t => {
  const a = ambiente(t); let monitor = criarMonitorCorRio(a.opcoes); await monitor();
  a.falhar = true; a.niveis.estagio = 2; await assert.rejects(monitor(), /SMTP fora/);
  a.niveis.estagio = 4; await assert.rejects(monitor(), /SMTP fora/);
  a.niveis.estagio = 1; await assert.rejects(monitor(), /SMTP fora/);
  assert.equal(JSON.parse(fs.readFileSync(a.arquivo)).eventos.length, 3);
  a.falhar = false; a.apiFalha = true; monitor = criarMonitorCorRio(a.opcoes);
  await monitor();
  assert.deepEqual(a.enviados.map(r => r.corRioMudancas[0].atual), [2, 4, 1]);
  await monitor(); assert.equal(a.enviados.length, 3);
});

test('migra referência legada sem avisos indevidos e bloqueia dois monitores no mesmo arquivo', async t => {
  const a = ambiente(t);
  fs.writeFileSync(a.arquivo, JSON.stringify({ estagio: 1, calor: 1, publicacoes: { desde: '2026-11-24T11:00:00Z', versoes: {} } }));
  let liberar;
  const lento = criarMonitorCorRio({ ...a.opcoes, coletar: () => new Promise(r => { liberar = r; }) });
  const ciclo = lento();
  const duplicado = await criarMonitorCorRio(a.opcoes)();
  assert.equal(duplicado.motivo, 'em-processamento');
  liberar(await a.opcoes.coletar()); await ciclo;
  assert.equal(a.enviados.length, 0);
  assert.equal(JSON.parse(fs.readFileSync(a.arquivo)).versao, 2);
});

test('valor inválido ou cache não representa mudança nem normalização', async t => {
  const a = ambiente(t), monitor = criarMonitorCorRio(a.opcoes); await monitor();
  for (const nivel of [0, 6, null, '3']) { a.niveis.estagio = nivel; await monitor(); }
  const cache = criarMonitorCorRio({ ...a.opcoes, coletar: async () => ({ report: { corRio: {
    estagio: { status: 'desatualizado', dados: { nivel: 4 } }, calor: { status: 'indisponivel' },
  } } }) });
  await cache(); assert.equal(a.enviados.length, 0);
  assert.equal(JSON.parse(fs.readFileSync(a.arquivo)).observados.estagio, 1);
});

test('SMTP parcial retenta só os rejeitados e não bloqueia os outros eventos', async t => {
  const a = ambiente(t); const chamadas = [];
  const monitor = criarMonitorCorRio({ ...a.opcoes, enviar: async (r, opcoes = {}) => {
    chamadas.push({ nivel: r.corRio.estagio.dados.nivel, pendentes: opcoes.destinatariosOverride });
    const pendentes = opcoes.destinatariosOverride || ['OK@EXAMPLE.TEST', 'falha@example.test'];
    return { messageId: r.corRioEventoId, destinatarios: pendentes,
      destinatariosAceitos: pendentes.map(e => e.toLowerCase()).filter(e => e === 'ok@example.test'),
      destinatariosRejeitados: pendentes.filter(e => e === 'falha@example.test') };
  } });
  await monitor(); a.niveis.estagio = 2; await assert.rejects(monitor(), /parcial/i);
  a.niveis.estagio = 3; await assert.rejects(monitor(), /parcial/i);
  assert.deepEqual(chamadas.map(c => c.nivel), [2, 2, 3]);
  assert.deepEqual(chamadas[1].pendentes, ['falha@example.test']);
  const eventos = JSON.parse(fs.readFileSync(a.arquivo)).eventos;
  assert.ok(eventos.every(e => e.aceitos.includes('ok@example.test')));
});

test('trava legada incompleta e antiga é recuperada sem bloquear o reinício', t => {
  const a = ambiente(t); const lock = a.arquivo + '.lock';
  fs.writeFileSync(lock, '');
  fs.utimesSync(lock, new Date(Date.now() - 600000), new Date(Date.now() - 600000));
  const liberar = require('../src/logic/corRioEventStore').adquirirTrava(a.arquivo);
  assert.equal(typeof liberar, 'function');
  assert.equal(JSON.parse(fs.readFileSync(lock)).pid, process.pid);
  liberar(); assert.equal(fs.existsSync(lock), false);
});

test('retentativa complementa a vigência publicada depois da detecção sem criar novo evento', async t => {
  const a = ambiente(t); let horario = new Date('2026-11-26T06:15:34Z'); let vigencia = null;
  const opcoes = { ...a.opcoes, agora: () => horario, coletar: async () => {
    const resultado = await a.opcoes.coletar();
    if (vigencia) resultado.report.corRio.calor.dados.vigenteDesde = vigencia;
    return resultado;
  } };
  a.niveis.calor = 3; let monitor = criarMonitorCorRio(opcoes); await monitor();
  a.niveis.calor = 1; a.falhar = true; await assert.rejects(monitor(), /SMTP fora/);
  horario = new Date('2026-11-26T06:21:00Z'); vigencia = '2026-11-26T06:15:00.000Z';
  a.falhar = false; monitor = criarMonitorCorRio(opcoes); await monitor();
  assert.equal(a.enviados[0].corRio.calor.dados.vigenteDesde, vigencia);
  assert.equal(JSON.parse(fs.readFileSync(a.arquivo)).eventos.length, 1);
});
