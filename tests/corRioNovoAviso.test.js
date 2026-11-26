const test = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const { renderCorRioStandaloneEmail, assuntoCorRio } = require('../src/render/corRioStandaloneEmail');
const orientacoes = require('../src/config/corRioOrientacoes.json');

const report = (estagio, calor, mudancas = []) => ({ geradoEmISO: '2026-11-25T12:00:00Z',
  dataFormatadaCurta: '25/11/2026', corRioIdentificadoEm: '2026-11-25T11:59:00Z',
  corRioMudancas: mudancas, publicacoesCorRio: { itens: [{ titulo: 'NÃO EXIBIR PUBLICAÇÃO', descricaoIntegral: ['Previsão para os próximos dias'] }] },
  corRio: Object.fromEntries(Object.entries({ estagio, calor }).map(([p, nivel]) => [p, {
    status: 'operacional', dados: { nivel, vigenteDesde: '2026-11-20T13:45:00Z', fonteVigencia: 'https://cor.rio/comunicado-calor/' },
  }])) });

test('novo aviso tem somente os dois cards, cabeçalho institucional e fonte oficial', () => {
  const $ = cheerio.load(renderCorRioStandaloneEmail(report(1, 3)));
  assert.deepEqual($('h2').map((i, e) => $(e).text()).get(), ['ESTÁGIO OPERACIONAL DA CIDADE', 'ESTÁGIO DE CALOR']);
  assert.match($.text(), /AVISO COR-RIO/);
  const cabecalho = $('[data-email-header="true"]').text();
  assert.match(cabecalho, /quarta-feira, 25 de novembro de 2026 - RJ/);
  assert.doesNotMatch(cabecalho, /COR-RIO — RJ/);
  assert.doesNotMatch($.text(), /COMUNICADO OFICIAL COR-RIO|NÃO EXIBIR PUBLICAÇÃO|Previsão para os próximos dias/);
  assert.match($.text(), /Fonte oficial/);
});

test('níveis 1 não deixam título, link ou bloco de recomendações', () => {
  const $ = cheerio.load(renderCorRioStandaloneEmail(report(1, 1)));
  assert.doesNotMatch($.text(), /RECOMENDAÇÕES/);
  assert.equal($('[data-cor-recomendacoes]').length, 0);
  assert.equal($('#cor-rio-operacional a, #cor-rio-calor a').length, 0);
});

test('cada nível usa as orientações oficiais correspondentes e mantém as cores', () => {
  const cores = ['#22C55E', '#FACC15', '#F97316', '#EF4444', '#A855F7'];
  for (let n = 2; n <= 5; n++) {
    const $ = cheerio.load(renderCorRioStandaloneEmail(report(n, n)));
    for (const [id, parte] of [['cor-rio-operacional', 'operacional'], ['cor-rio-calor', 'calor']]) {
      const card = $('#' + id);
      assert.equal(card.find('.cor-rio-nivel').attr('bgcolor'), cores[n - 1]);
      for (const texto of orientacoes[parte][n].recomendacoes) assert.ok(card.text().includes(texto));
      assert.equal(card.find('[data-cor-recomendacoes] a').attr('href'), orientacoes.fontes[parte]);
    }
  }
});

test('mudança mostra apenas o nível vigente e sua cor, sem indicadores nem fonte da vigência', () => {
  const mudancas = [{ parte: 'calor', anterior: 3, atual: 1, tipo: 'REDUÇÃO' }];
  const $ = cheerio.load(renderCorRioStandaloneEmail(report(2, 1, mudancas)));
  assert.doesNotMatch($.text(), /AGRAVAMENTO|REDUÇÃO|SEM ALTERAÇÃO|→|↑|↓|Fonte oficial da vigência/);
  assert.equal($('a[href="https://cor.rio/comunicado-calor/"]').length, 0);
  assert.equal($('#cor-rio-calor .cor-rio-nivel').attr('bgcolor'), '#22C55E');
  assert.equal(assuntoCorRio(report(2, 1, mudancas)), 'COR-RIO| Estágio 2 | Calor 1');
});

test('mudanças simultâneas atualizam os dois níveis sem rótulos de transição', () => {
  const r = report(4, 3, [{ parte: 'estagio', anterior: 1, atual: 4, tipo: 'AGRAVAMENTO' },
    { parte: 'calor', anterior: 5, atual: 3, tipo: 'REDUÇÃO' }]);
  const $ = cheerio.load(renderCorRioStandaloneEmail(r));
  assert.equal($('#cor-rio-operacional .cor-rio-nivel').text(), 'Estágio 4');
  assert.equal($('#cor-rio-calor .cor-rio-nivel').text(), 'Calor 3');
  assert.doesNotMatch($.text(), /AGRAVAMENTO|REDUÇÃO|SEM ALTERAÇÃO|→|↑|↓/);
  assert.equal(assuntoCorRio(r), 'COR-RIO| Estágio 4 | Calor 3');
});

test('assunto usa o formato solicitado para os níveis atuais', () => {
  assert.equal(assuntoCorRio(report(1, 3)), 'COR-RIO| Estágio 1 | Calor 3');
});

test('indisponibilidade de orientações não impede renderizar o estágio', () => {
  const r = report(3, 3); r.corRioOrientacoes = { operacional: {}, calor: {} };
  const $ = cheerio.load(renderCorRioStandaloneEmail(r));
  assert.match($('#cor-rio-calor').text(), /Recomendações oficiais indisponíveis/);
  assert.match($('#cor-rio-calor').text(), /Calor 3/);
});

test('sem início oficial, mudança informa detecção do monitor sem apresentar como vigência', () => {
  const r = report(1, 1, [{ parte: 'calor', anterior: 3, atual: 1, tipo: 'REDUÇÃO' }]);
  delete r.corRio.calor.dados.vigenteDesde;
  const $ = cheerio.load(renderCorRioStandaloneEmail(r));
  const texto = $('#cor-rio-calor').text();
  assert.match(texto, /Alteração identificada em: 25\/11\/2026 08:59/);
  assert.match(texto, /início oficial ainda não confirmado/);
  assert.doesNotMatch(texto, /Vigente desde:|início não informado pelo COR-Rio nesta consulta/);
});
