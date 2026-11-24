const test = require('node:test');
const assert = require('node:assert/strict');
const { assuntoAlerta } = require('../src/render/alertEmailTemplate');

const base = alertas => ({ cidade: { nome: 'Manaus', uf: 'AM' }, alertas });

test('assunto começa pela cidade, seguido pelo fenômeno e nível em texto legível', () => {
  assert.equal(assuntoAlerta(base([{ tipo: 'Qualidade do ar', grau: 'ATENÇÃO' }])),
    'Manaus - Qualidade do ar - Atenção');
});

test('assunto de vários fenômenos mantém o nível correspondente a cada um e as siglas', () => {
  const assunto = assuntoAlerta(base([
    { tipo: 'Qualidade do ar', grau: 'ATENÇÃO' },
    { tipo: 'Índice UV', grau: 'ALERTA' },
    { tipo: 'ventoForte', grau: 'EMERGÊNCIA' },
    { tipo: 'Índice UV', grau: 'ALERTA' },
  ]));
  assert.ok(assunto.startsWith('Manaus - '));
  assert.match(assunto, /Qualidade do ar - Atenção/);
  assert.match(assunto, /Índice UV - Alerta/);
  assert.match(assunto, /Vento - Emergência/);
  assert.equal((assunto.match(/Índice UV/g) || []).length, 1);
});

test('assunto mantém nome oficial e informa normalização com o nível Normal', () => {
  assert.equal(assuntoAlerta(base([{ tipo: 'Tempestade', naturezaDado: 'Aviso oficial', grau: 'ALERTA' }])),
    'Manaus - Tempestade - Alerta');
  assert.equal(assuntoAlerta(base([{ tipo: 'Vento', grau: 'NORMAL', grauAnterior: 'ATENÇÃO', motivo: 'normalizou' }])),
    'Manaus - Vento - Normal');
  assert.equal(assuntoAlerta(base([])), '');
});
