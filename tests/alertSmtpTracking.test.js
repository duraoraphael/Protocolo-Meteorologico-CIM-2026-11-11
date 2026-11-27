const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fila = require('../src/logic/alertQueue');
const { processarAlertaBase } = require('../src/scheduler');

const base = { chave: 'macae', cidade: { nome: 'Macaé', uf: 'RJ' }, alertas: [
  { assinatura: 'vento', tipo: 'Vento', grauAnterior: 'ATENÇÃO', grau: 'ALERTA', motivo: 'agravou', fingerprint: 'smtp-partial' },
] };

function ambiente() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cim-smtp-'));
  const arquivo = path.join(pasta, 'fila.json');
  let agora = new Date('2026-11-27T13:00:00Z');
  const opcoes = () => ({ arquivo, agora });
  return {
    arquivo, limpar: () => fs.rmSync(pasta, { recursive: true, force: true }),
    avancar: () => { agora = new Date(agora.getTime() + 61 * 60000); },
    dependencias: {
      listar: () => ['a@example.com', 'b@example.com'],
      enfileirar: (b, d) => fila.enfileirar(b, d, opcoes()),
      assumir: id => fila.assumir(id, opcoes()),
      marcarEnviado: (id, envio) => fila.marcarEnviado(id, envio, opcoes()),
      marcarFalha: (id, erro) => fila.marcarFalha(id, erro, opcoes()),
    },
  };
}

test('aceite parcial persiste resposta SMTP e repete somente destinatário pendente após reinício', async () => {
  const amb = ambiente();
  const envios = [];
  let confirmacoes = 0;
  const executar = () => processarAlertaBase(base, { ...amb.dependencias,
    confirmar: () => { confirmacoes++; },
    enviar: async (_b, { destinatariosOverride }) => {
      envios.push(destinatariosOverride);
      return { messageId: '<smtp-test>', respostaSmtp: '250 queued',
        destinatarios: destinatariosOverride,
        destinatariosAceitos: envios.length === 1 ? ['A@example.com'] : ['b@example.com'],
        destinatariosRejeitados: envios.length === 1 ? ['b@example.com'] : [],
        errosRejeitados: envios.length === 1 ? [{ destinatario: 'b@example.com', codigoSmtp: 450, resposta: '450 mailbox busy' }] : [],
      };
    },
  });
  try {
    const primeiro = await executar();
    const [evento] = Object.values(fila.carregarFila(amb.arquivo).eventos);
    assert.equal(evento.status, 'pendente');
    assert.equal(primeiro.parcial, true);
    assert.equal(confirmacoes, 0);
    assert.deepEqual(evento.destinatariosAceitos, ['a@example.com']);
    assert.deepEqual(evento.pendentes, ['b@example.com']);
    assert.equal(evento.historicoEnvios[0].respostaSmtp, '250 queued');
    assert.equal(evento.historicoEnvios[0].errosRejeitados[0].codigoSmtp, 450);
    amb.avancar();
    await executar();
    const [concluido] = Object.values(fila.carregarFila(amb.arquivo).eventos);
    assert.deepEqual(envios, [['a@example.com', 'b@example.com'], ['b@example.com']]);
    assert.equal(concluido.status, 'enviado');
    assert.equal(concluido.confirmacaoEnvio, 'aceito_smtp');
    assert.equal(concluido.entrega, 'nao_confirmada');
    assert.equal(concluido.historicoEnvios.length, 2);
    assert.equal(confirmacoes, 1);
    await executar();
    assert.equal(envios.length, 2, 'evento concluído não é reenviado');
  } finally { amb.limpar(); }
});

for (const resposta of [{ messageId: 'id-sem-comprovante' }, { ignorado: true, motivo: 'sem-alerta-relevante' }]) {
  test(`resultado sem aceite não conclui evento: ${JSON.stringify(resposta)}`, async () => {
    const amb = ambiente();
    let confirmacoes = 0;
    try {
      await processarAlertaBase(base, { ...amb.dependencias, enviar: async () => resposta,
        confirmar: () => { confirmacoes++; },
      }).catch(() => {});
      const [evento] = Object.values(fila.carregarFila(amb.arquivo).eventos);
      assert.equal(evento.status, 'pendente');
      assert.equal(evento.enviadoEm, null);
      assert.equal(confirmacoes, 0);
    } finally { amb.limpar(); }
  });
}

test('rejeição total preserva código SMTP e pendências sem confirmar o alerta', async () => {
  const amb = ambiente();
  try {
    const erro = Object.assign(new Error('Todos recusados'), { code: 'EENVELOPE', responseCode: 550,
      response: '550 mailbox unavailable', rejected: ['a@example.com', 'b@example.com'] });
    await assert.rejects(processarAlertaBase(base, { ...amb.dependencias,
      enviar: async () => { throw erro; }, confirmar: () => assert.fail('não deve confirmar'),
    }), /Todos recusados/);
    const [evento] = Object.values(fila.carregarFila(amb.arquivo).eventos);
    assert.equal(evento.status, 'pendente');
    assert.equal(evento.historicoEnvios[0].codigoSmtp, 550);
    assert.equal(evento.historicoEnvios[0].respostaSmtp, '550 mailbox unavailable');
    assert.equal(evento.pendentes.length, 2);
  } finally { amb.limpar(); }
});

test('adaptador de envio retorna aceites, rejeições e resposta reais do transportador', async () => {
  const transport = require('../src/email/transport');
  const { registrarOperacionalTeste } = require('./helpers/provenance');
  const anterior = transport.criarTransportador;
  const remetenteAnterior = transport.enderecoRemetente;
  const caminho = require.resolve('../src/email/sendAlert');
  try {
    transport.criarTransportador = () => ({ sendMail: async () => ({
      messageId: '<adapter-test>', response: '250 queued for delivery',
      accepted: ['A@example.com'], rejected: ['b@example.com'],
      rejectedErrors: [{ recipient: 'b@example.com', responseCode: 450, response: '450 busy' }],
    }) });
    transport.enderecoRemetente = () => ({ email: 'cim@example.com' });
    delete require.cache[caminho];
    const resultado = await require(caminho).enviarAlertaPorEmail({ ...base,
      report: registrarOperacionalTeste({ cidade: base.cidade, dataFormatadaCurta: '27/11/2026', horaConsulta: '10:00' }),
    }, { destinatariosOverride: ['a@example.com', 'b@example.com'] });
    assert.deepEqual(resultado.destinatariosAceitos, ['a@example.com']);
    assert.deepEqual(resultado.destinatariosRejeitados, ['b@example.com']);
    assert.equal(resultado.respostaSmtp, '250 queued for delivery');
    assert.equal(resultado.errosRejeitados[0].codigoSmtp, 450);
  } finally {
    transport.criarTransportador = anterior;
    transport.enderecoRemetente = remetenteAnterior;
    delete require.cache[caminho];
  }
});

test('nova tentativa não envia para destinatário removido do cadastro da base', async () => {
  const amb = ambiente();
  let chamadas = 0;
  try {
    const dependencias = { ...amb.dependencias, confirmar: () => {}, enviar: async (_b, opcoes) => {
      chamadas++;
      return { destinatarios: opcoes.destinatariosOverride,
        destinatariosAceitos: ['a@example.com'], destinatariosRejeitados: ['b@example.com'] };
    } };
    await processarAlertaBase(base, dependencias);
    amb.avancar();
    await assert.rejects(processarAlertaBase(base, { ...dependencias,
      listar: () => ['a@example.com', 'novo@example.com'],
    }), /pendente.*ativo/i);
    assert.equal(chamadas, 1, 'não repete aceito, não envia para removido e não inclui cadastro novo no evento antigo');
  } finally { amb.limpar(); }
});
