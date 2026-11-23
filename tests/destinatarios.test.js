const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cim-central-'));
process.env.RESPONSAVEIS_ARQUIVO = path.join(pasta, 'pessoas.json');
const recipients = require('../src/config/recipients');
const { subirApp, SENHA_TESTE } = require('./helpers/servidor');
let central;
let serial = 0;
const executar = (dados) => central.executar({ id: `operacao-teste-${++serial}`, operador: 'Operadora de teste', ...dados });
function reset() {
  fs.writeFileSync(process.env.RESPONSAVEIS_ARQUIVO, JSON.stringify({ versao: 2, responsaveis: [
    { nome: 'Maria', email: 'maria@exemplo.com', bases: ['rio_de_janeiro', 'cabiunas'] },
  ] }));
}
test.before(() => { central = require('../src/recipients/management'); });
test.beforeEach(reset);
test.after(() => fs.rmSync(pasta, { recursive: true, force: true }));

test('prévia classifica inválidos, repetidos e já cadastrados sem gravar', () => {
  const antes = fs.readFileSync(process.env.RESPONSAVEIS_ARQUIVO, 'utf8');
  const p = central.previa({ texto: ' NOVO@exemplo.com ; errado\nmaria@exemplo.com; novo@exemplo.com' });
  assert.deepEqual(p.contagens, { validos: 1, invalidos: 1, repetidos: 1, existentes: 1 });
  assert.equal(fs.readFileSync(process.env.RESPONSAVEIS_ARQUIVO, 'utf8'), antes);
});
test('cadastro em lote mantém nome pendente, adiciona vínculos sem sobrescrever e é idempotente', () => {
  const dados = { acao: 'cadastrar', registros: [{ email: 'nova@exemplo.com' }, { email: 'maria@exemplo.com', nome: 'Outro nome' }], bases: ['santos'], existentes: 'vincular' };
  const r = executar(dados);
  assert.equal(r.sucessos, 2);
  assert.equal(recipients.listarResponsaveis().find(p => p.email === 'nova@exemplo.com').nome, '');
  assert.deepEqual(recipients.listarResponsaveis().find(p => p.email === 'maria@exemplo.com').bases, ['rio_de_janeiro', 'santos']);
  assert.equal(recipients.listarResponsaveis().find(p => p.email === 'maria@exemplo.com').nome, 'Maria');
  const antes = fs.readFileSync(process.env.RESPONSAVEIS_ARQUIVO, 'utf8');
  assert.deepEqual(central.executar({ id: `operacao-teste-${serial}`, operador: 'Operadora de teste', ...dados }), r);
  assert.equal(fs.readFileSync(process.env.RESPONSAVEIS_ARQUIVO, 'utf8'), antes);
  assert.throws(() => central.executar({ id: `operacao-teste-${serial}`, operador: 'Operadora de teste', ...dados, bases: ['macae'] }), { status: 409 });
  assert.ok(JSON.parse(antes).responsaveis[0].bases.includes('cabiunas'));
});
test('validação de todo o lote evita gravação parcial', () => {
  const antes = fs.readFileSync(process.env.RESPONSAVEIS_ARQUIVO, 'utf8');
  assert.throws(() => executar({ acao: 'cadastrar', registros: [{ email: 'boa@exemplo.com' }, { email: 'invalido' }], bases: [] }), { status: 400 });
  assert.equal(fs.readFileSync(process.env.RESPONSAVEIS_ARQUIVO, 'utf8'), antes);
  assert.throws(() => executar({ acao: 'vincular', emails: ['maria@exemplo.com', 'ausente@exemplo.com'], bases: ['santos'], confirmado: true }), { status: 400 });
  assert.equal(fs.readFileSync(process.env.RESPONSAVEIS_ARQUIVO, 'utf8'), antes);
});
test('status controla envio diário e semanal preservando os vínculos e auditando antes/depois', () => {
  executar({ acao: 'desativar', emails: ['maria@exemplo.com'], confirmado: true });
  assert.equal(recipients.listarPorCidade('rio_de_janeiro').length, 0);
  assert.equal(recipients.listarTodos().flatMap(b => b.responsaveis).length, 0);
  assert.equal(recipients.listarResponsaveis()[0].ativo, false);
  executar({ acao: 'ativar', emails: ['maria@exemplo.com'], confirmado: true });
  assert.equal(recipients.listarPorCidade('rio_de_janeiro').length, 1);
  const h = central.historico({ busca: 'desativar' });
  assert.equal(h.total, 1);
  assert.equal(h.itens[0].operador, 'Operadora de teste');
  assert.equal(h.itens[0].identificacao, 'declarada');
  assert.equal(h.itens[0].antes.ativo, true);
  assert.equal(h.itens[0].depois.ativo, false);
});
test('editar garante unicidade; vínculos em massa e exclusão exigem confirmação', () => {
  executar({ acao: 'editar', emails: ['maria@exemplo.com'], nome: 'Maria Silva', email: 'maria.silva@exemplo.com', bases: ['cor_rio'], confirmado: true });
  const eventos = central.historico({ acao: 'editar' }).itens;
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].antes.email, 'maria@exemplo.com');
  assert.equal(eventos[0].depois.email, 'maria.silva@exemplo.com');
  assert.equal(recipients.listarPorCidade('cor_rio')[0].nome, 'Maria Silva');
  executar({ acao: 'vincular', emails: ['maria.silva@exemplo.com'], bases: ['santos'], confirmado: true });
  executar({ acao: 'desvincular', emails: ['maria.silva@exemplo.com'], bases: ['cor_rio'], confirmado: true });
  assert.deepEqual(recipients.listarResponsaveis()[0].bases, ['santos']);
  assert.throws(() => executar({ acao: 'excluir', emails: ['maria.silva@exemplo.com'] }), { status: 400 });
  executar({ acao: 'excluir', emails: ['maria.silva@exemplo.com'], confirmado: true });
  assert.equal(recipients.listarResponsaveis().length, 0);
});
test('desativação também exclui destinatário explícito dos fallbacks diário e semanal', () => {
  const anterior = process.env.REPORT_RECIPIENTS;
  process.env.REPORT_RECIPIENTS = 'maria@exemplo.com,plantao@exemplo.com';
  try {
    executar({ acao: 'desativar', emails: ['maria@exemplo.com'], confirmado: true });
    const { listaDestinatarios } = require('../src/email/sendReport');
    const { listaDestinatariosSemanal } = require('../src/email/sendWeeklyReport');
    assert.deepEqual(listaDestinatarios('rio_de_janeiro'), ['plantao@exemplo.com']);
    assert.deepEqual(listaDestinatariosSemanal(), ['plantao@exemplo.com']);
  } finally {
    if (anterior === undefined) delete process.env.REPORT_RECIPIENTS;
    else process.env.REPORT_RECIPIENTS = anterior;
  }
});
test('pesquisa combina instalação, status, vínculo, paginação e ordenação', () => {
  executar({ acao: 'cadastrar', registros: [{ nome: 'Álvaro', email: 'alvaro@exemplo.com' }, { email: 'sem@exemplo.com' }], bases: [] });
  assert.equal(central.consultar({ busca: 'RIO DE JANEIRO', instalacao: 'rio_de_janeiro', status: 'ativos', vinculos: 'com' }).total, 1);
  assert.equal(central.consultar({ busca: 'alvaro' }).total, 1);
  const d = central.consultar({ tamanho: 1, pagina: 2, ordem: 'email', direcao: 'asc' });
  assert.equal(d.itens[0].email, 'maria@exemplo.com');
  assert.deepEqual(d.indicadores, { cadastrados: 3, ativos: 3, semVinculo: 2 });
});
test('histórico filtra datas pelo dia de Brasília, inclusive perto da meia-noite UTC', () => {
  const dados = JSON.parse(fs.readFileSync(process.env.RESPONSAVEIS_ARQUIVO, 'utf8'));
  dados.historico = [{ id: 'evento-1', data: '2026-11-24T02:00:00.000Z', operador: 'Teste', acao: 'editar', email: 'maria@exemplo.com' }];
  fs.writeFileSync(process.env.RESPONSAVEIS_ARQUIVO, JSON.stringify(dados));
  assert.equal(central.historico({ desde: '2026-11-23', ate: '2026-11-23' }).total, 1);
  assert.equal(central.historico({ desde: '2026-11-24' }).total, 0);
  assert.throws(() => central.historico({ desde: '2026-13-40' }), { status: 400 });
});
test('filtro de operador do histórico é independente da pesquisa geral e preserva totais', () => {
  executar({ acao: 'cadastrar', registros: [{ email: 'ana@exemplo.com' }], bases: [], operador: 'Bruno' });
  executar({ acao: 'cadastrar', registros: [{ email: 'bruno@exemplo.com' }], bases: [], operador: 'Ána' });
  assert.equal(central.historico({ operador: 'ana' }).total, 1);
  assert.equal(central.historico({ operador: 'ana', busca: 'bruno@' }).itens[0].operador, 'Ána');
  assert.throws(() => central.historico({ operador: [] }), { status: 400 });
});
test('API protege prévia, escrita, histórico e exportação; nomes com e-mail não vazam publicamente', async t => {
  fs.writeFileSync(process.env.RESPONSAVEIS_ARQUIVO, JSON.stringify({ versao: 2, responsaveis: [{ nome: 'legado@exemplo.com', email: 'legado@exemplo.com', bases: ['rio_de_janeiro'] }] }));
  const srv = await subirApp(); t.after(srv.fechar);
  for (const rota of ['consultar', 'previa', 'executar', 'historico', 'exportar', 'importar', 'modelo']) {
    const r = await fetch(`${srv.base}/api/destinatarios/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 401, rota);
  }
  const publico = await (await fetch(srv.base + '/api/responsaveis')).text();
  assert.ok(!publico.includes('@'));
  const r = await fetch(srv.base + '/api/destinatarios/executar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: SENHA_TESTE, operador: 'Teste', id: 'teste-http-123', acao: 'cadastrar', registros: [{ email: 'http@exemplo.com' }], bases: [] }) });
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(central.historico({})).includes(SENHA_TESTE));
});
test('HTTP aceita 500 destinatários acima de 100 KB e duas confirmações concorrentes não duplicam auditoria', async t => {
  const srv = await subirApp(); t.after(srv.fechar);
  const bases = central.instalacoes().map(i => i.chave);
  const registros = Array.from({ length: 500 }, (_, i) => ({ nome: 'N'.repeat(100), email: `pessoa${i}@exemplo.com`, bases }));
  const body = JSON.stringify({ senha: SENHA_TESTE, operador: 'Operadora teste', id: 'lote-http-grande-123', acao: 'cadastrar', registros, bases: [] });
  assert.ok(Buffer.byteLength(body) > 100 * 1024);
  const enviar = () => fetch(srv.base + '/api/destinatarios/executar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const respostas = await Promise.all([enviar(), enviar()]);
  assert.deepEqual(respostas.map(r => r.status), [200, 200]);
  assert.deepEqual(await respostas[0].json(), await respostas[1].json());
  assert.equal(central.consultar({}).indicadores.cadastrados, 501);
  assert.equal(central.historico({}).total, 500);
});
