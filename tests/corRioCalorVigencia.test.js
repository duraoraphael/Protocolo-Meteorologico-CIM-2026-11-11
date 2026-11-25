const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretarVigenciaCalor, criarConsultaVigenciaCalor } = require('../src/sources/corRioCalorVigencia');
const agora = () => Date.parse('2026-11-25T12:00:00Z');
const post = (titulo, data = '2026-11-20T13:50:37') => ({ title: { rendered: titulo }, date_gmt: data,
  link: 'https://cor.rio/mudanca-calor/' });
const comunicado = post('Município do Rio de Janeiro está em calor 3 desde 10h45 de sexta-feira, dia 20 de novembro de 2026');

test('vigência vem do início explícito no comunicado, em Brasília, e não da publicação', () => {
  assert.deepEqual(interpretarVigenciaCalor([comunicado], 3, agora()), {
    vigenteDesde: '2026-11-20T13:45:00.000Z', fonteVigencia: comunicado.link,
  });
  assert.equal(interpretarVigenciaCalor([comunicado], 2, agora()), null);
  assert.equal(interpretarVigenciaCalor([post('Previsão de calor para sexta-feira')], 3, agora()), null);
  assert.equal(interpretarVigenciaCalor([post('Rio entrou em calor 3 às 10h45 de 31 de novembro de 2026')], 3, agora()), null);
  assert.equal(interpretarVigenciaCalor([post('Rio entrou em calor 3 às 10h45 de 26 de novembro de 2026')], 3, agora()), null);
});

test('comunicado mais recente de outro nível impede reaproveitar vigência antiga', () => {
  const novo = post('Rio entrou em calor 4 às 11h de 25 de novembro de 2026', '2026-11-25T14:05:00');
  assert.equal(interpretarVigenciaCalor([comunicado, novo], 3, Date.parse('2026-11-25T15:00:00Z')), null);
});

test('consulta reutiliza vigência e consulta novamente quando muda o nível', async () => {
  let consultas = 0;
  const buscar = criarConsultaVigenciaCalor({ agora, fetchImpl: async () => {
    consultas++; return { ok: true, status: 200, text: async () => JSON.stringify([comunicado]) };
  } });
  assert.equal((await buscar(3)).vigenteDesde, '2026-11-20T13:45:00.000Z');
  await buscar(3); assert.equal(consultas, 1);
  assert.equal(await buscar(2), null); assert.equal(consultas, 2);
});
