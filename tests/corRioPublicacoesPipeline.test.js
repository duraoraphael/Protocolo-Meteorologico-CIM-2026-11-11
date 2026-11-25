const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('publicação de trânsito percorre coleta, pipeline, monitor e e-mail exclusivo, com retentativa SMTP', async t => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cim-cor-fluxo-'));
  const destinatarios = path.join(pasta, 'responsaveis.json');
  fs.writeFileSync(destinatarios, JSON.stringify({ versao: 2, responsaveis: [
    { nome: 'COR', email: 'cor@example.test', bases: ['cor_rio'] },
    { nome: 'Rio', email: 'rio@example.test', bases: ['rio_de_janeiro'] },
  ] }));
  const envAnterior = process.env.RESPONSAVEIS_ARQUIVO;
  process.env.RESPONSAVEIS_ARQUIVO = destinatarios;
  const transport = require('../src/email/transport');
  const corRio = require('../src/sources/corRio');
  const originais = { criar: transport.criarTransportador, remetente: transport.enderecoRemetente,
    anexar: corRio.anexarCorRioAoRelatorio, fetch: global.fetch };
  const modulos = ['../src/config/recipients', '../src/email/sendReport', '../src/pipeline'];
  for (const modulo of modulos) delete require.cache[require.resolve(modulo)];
  let posts = []; let falhar = false; const mensagens = [];
  global.fetch = async url => {
    assert.equal(new URL(url).hostname, 'cor.rio');
    const resposta = new URL(url).searchParams.get('search') === 'calor' ? [{
      title: { rendered: 'Rio entrou em calor 3 às 10h45 de 20 de novembro de 2026' },
      date_gmt: '2026-11-20T13:50:37', link: 'https://cor.rio/vigencia-calor/',
    }] : posts;
    return { ok: true, status: 200, headers: new Headers({ 'X-WP-TotalPages': '1' }), text: async () => JSON.stringify(resposta) };
  };
  corRio.anexarCorRioAoRelatorio = async report => {
    report.corRio = { estagio: { status: 'operacional', dados: { nivel: 1, mensagens: [] } },
    calor: { status: 'operacional', dados: { nivel: 3, mensagens: [] } },
      comunicados: { status: 'operacional', itens: [] } };
  };
  transport.enderecoRemetente = () => ({ formatado: 'CIM <cim@example.test>' });
  transport.criarTransportador = () => ({ sendMail: async mensagem => {
    if (falhar) throw new Error('SMTP temporariamente indisponível');
    mensagens.push(mensagem); return { messageId: 'smtp-ok', accepted: ['cor@example.test'], rejected: [] };
  } });
  t.after(() => {
    global.fetch = originais.fetch;
    corRio.anexarCorRioAoRelatorio = originais.anexar;
    transport.criarTransportador = originais.criar;
    transport.enderecoRemetente = originais.remetente;
    for (const modulo of modulos) delete require.cache[require.resolve(modulo)];
    if (envAnterior === undefined) delete process.env.RESPONSAVEIS_ARQUIVO;
    else process.env.RESPONSAVEIS_ARQUIVO = envAnterior;
    fs.rmSync(pasta, { recursive: true, force: true });
  });
  const { criarMonitorCorRio } = require('../src/logic/corRioAlertMonitor');
  const monitor = criarMonitorCorRio({ arquivo: path.join(pasta, 'notificado.json') });
  await monitor(); assert.equal(mensagens.length, 0);
  const data = new Date().toISOString().slice(0, 19);
  posts = [{ id: 990, date_gmt: data, modified_gmt: data, categories: [99],
    title: { rendered: 'Interdição na avenida' }, content: { rendered: '<p>Use o desvio indicado.</p>' },
    link: 'https://cor.rio/interdicao-avenida/' }];
  falhar = true; await assert.rejects(monitor(), /SMTP temporariamente/);
  falhar = false; const r = await monitor();
  assert.equal(r.envio.messageId, 'smtp-ok');
  assert.equal(mensagens[0].to, 'cor@example.test');
  assert.match(mensagens[0].html, /Interdição na avenida/);
  assert.match(mensagens[0].html, /Use o desvio indicado/);
  assert.match(mensagens[0].html, /Vigente desde/);
  assert.match(mensagens[0].html, /20\/11\/2026 10:45/);
  assert.equal(mensagens[0].attachments.some(a => a.contentType === 'application/pdf'), false);
  await monitor(); assert.equal(mensagens.length, 1);
});
