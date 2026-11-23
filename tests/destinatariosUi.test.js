const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('cheerio');
const { carregarPainel } = require('./helpers/fakeDom');
function ui() { return carregarPainel().executar('CentralUI'); }
test('pessoa sem nome ou com nome igual ao e-mail não duplica endereço; nome e avatar são escapados', () => {
  const render = ui().pessoa;
  for (const nome of ['', 'PENDENTE@exemplo.com']) {
    const $ = load(render({ nome, email: 'pendente@exemplo.com' }));
    assert.equal(($.root().text().match(/pendente@exemplo.com/g) || []).length, 1);
    assert.equal($('.central-avatar').text(), 'P');
    assert.match($.root().text(), /Nome pendente/);
  }
  const $ = load(render({ nome: '<img src=x onerror=alert(1)>', email: 'x@exemplo.com' }));
  assert.equal($('img').length, 0);
  assert.ok($.root().text().includes('<img'));
});
test('vínculos mostram duas tags e permitem abrir os restantes por teclado', () => {
  const $ = load(ui().vinculos(['rio', 'santos', 'macae', 'cor'], b => ({ rio: 'Rio de Janeiro', santos: 'Santos', macae: 'Macaé', cor: 'COR-RIO' }[b])));
  assert.equal($('.central-tags-visiveis > .central-tag').length, 2);
  assert.match($('details summary').text(), /\+2/);
  assert.match($('details').text(), /Macaé.*COR-RIO/);
});
test('filtros de instalações usam contagens reais e combinam texto e presença de destinatários', () => {
  const f = ui().filtrarInstalacoes;
  const itens = [{ chave: 'rio', nome: 'Rio de Janeiro', uf: 'RJ', quantidade: 7 }, { chave: 'macae', nome: 'Macaé', uf: 'RJ', quantidade: 0 }, { chave: 'santos', nome: 'Santos', uf: 'SP', quantidade: 2 }];
  assert.deepEqual(JSON.parse(JSON.stringify(f(itens, 'macae', 'sem'))), { itens: [itens[1]], contagens: { todas: 1, com: 0, sem: 1 } });
  assert.equal(f(itens, '', 'com').itens.length, 2);
  const $ = load(ui().instalacao(itens[0]));
  assert.match($.root().text(), /7 destinatários/);
  assert.equal($('[data-instalar="rio"]').length, 1);
  assert.equal($('[data-adicionar-instalacao="rio"]').length, 1);
});
test('histórico exibe operador real, vínculo relacionado e antes/depois sem HTML ativo', () => {
  const $ = load('<table><tbody>' + ui().evento({ data: '2026-11-23T12:00:00Z', operador: 'Ana <script>x</script>', identificacao: 'declarada', acao: 'vincular', email: 'ana@exemplo.com', antes: { nome: 'Ana', email: 'ana@exemplo.com', bases: [], ativo: true }, depois: { nome: 'Ana', email: 'ana@exemplo.com', bases: ['santos'], ativo: true } }, b => b === 'santos' ? 'Santos' : b) + '</tbody></table>');
  assert.equal($('script').length, 0);
  assert.equal($('td').length, 6);
  assert.match($.root().text(), /Ana <script>x<\/script>/);
  assert.match($.root().text(), /Santos/);
  assert.match($('details').text(), /Antes.*Depois/s);
});
