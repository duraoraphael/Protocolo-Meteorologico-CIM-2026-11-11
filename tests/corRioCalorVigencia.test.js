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

test('data abreviada do comunicado de retorno ao Calor 1 usa o ano da publicação', () => {
  const atual = post('Município do Rio retornou ao primeiro nível do Protocolo de Calor (CALOR 1) às 3h15 desta quinta-feira (26/11)',
    '2026-11-26T06:20:11');
  assert.equal(interpretarVigenciaCalor([atual], 1, Date.parse('2026-11-26T12:00:00Z')).vigenteDesde,
    '2026-11-26T06:15:00.000Z');
  const virada = post('Rio retornou ao calor 1 às 23h30 de quarta-feira (31/12)', '2027-01-01T03:00:00');
  assert.equal(interpretarVigenciaCalor([virada], 1, Date.parse('2027-01-01T05:00:00Z')).vigenteDesde,
    '2027-01-01T02:30:00.000Z');
});

test('início pode estar no corpo do comunicado e usar hora com dois-pontos ou NC', () => {
  const p = post('Rio retornou ao Calor 1 nesta quinta-feira', '2026-11-26T06:20:11');
  p.content = { rendered: '<p>A cidade retornou ao CALOR 1 às 03:15 desta quinta-feira, 26 de novembro de 2026.</p><p>No dia 20 de novembro de 2026 entrou em Calor 3 às 10h45.</p>' };
  assert.equal(interpretarVigenciaCalor([p], 1, Date.parse('2026-11-26T12:00:00Z'))?.vigenteDesde,
    '2026-11-26T06:15:00.000Z');
  const nc = post('Rio passou ao NC2 às 11h30min de 26/11/2026', '2026-11-26T14:35:00');
  assert.equal(interpretarVigenciaCalor([nc], 2, Date.parse('2026-11-26T15:00:00Z'))?.vigenteDesde,
    '2026-11-26T14:30:00.000Z');
});

test('não associa horário histórico de outro nível nem usa horário da publicação como vigência', () => {
  const p = post('Rio retornou ao Calor 1 nesta quinta-feira', '2026-11-26T06:20:11');
  p.content = { rendered: '<p>No dia 20 de novembro de 2026 entrou em Calor 3 às 10h45.</p>' };
  assert.equal(interpretarVigenciaCalor([p], 1, Date.parse('2026-11-26T12:00:00Z')), null);
});

test('referência histórica do mesmo nível não substitui horário ausente do episódio atual', () => {
  const p = post('Rio retornou ao Calor 1 nesta quinta-feira', '2026-11-26T06:20:11');
  p.content = { rendered: '<p>O município retornou ao Calor 1 nesta quinta-feira (26/11).</p><p>Anteriormente, o Rio entrou em Calor 1 às 10h de 15 de novembro de 2026, antes do último episódio de calor extremo.</p>' };
  assert.equal(interpretarVigenciaCalor([p], 1, Date.parse('2026-11-26T12:00:00Z')), null);
  p.content.rendered = '<p>O município retornou ao Calor 1 nesta quinta-feira (26/11).</p><p>O Rio entrou em Calor 1 às 10h de 15 de novembro de 2026.</p>';
  assert.equal(interpretarVigenciaCalor([p], 1, Date.parse('2026-11-26T12:00:00Z')), null);
  p.content.rendered = '<p>O município retornou ao Calor 1 nesta quinta-feira.</p><p>O Rio entrou em Calor 1 às 10h de 15 de novembro de 2026, antes do último episódio de calor extremo.</p>';
  assert.equal(interpretarVigenciaCalor([p], 1, Date.parse('2026-11-26T12:00:00Z')), null);
});

test('notícia meteorológica posterior com histórico não bloqueia comunicado de mudança', () => {
  const atual = post('Rio retornou ao Calor 1 às 03h15 de 26/11/2026', '2026-11-26T06:20:11');
  const noticia = post('Quinta-feira com previsão de chuva e calor', '2026-11-26T10:00:00');
  noticia.content = { rendered: '<p>No dia 20 de novembro de 2026, o Rio entrou em Calor 3 às 10h45.</p>' };
  assert.equal(interpretarVigenciaCalor([noticia, atual], 1, Date.parse('2026-11-26T12:00:00Z'))?.vigenteDesde,
    '2026-11-26T06:15:00.000Z');
});

test('ausência de comunicado é reconsultada em 15 segundos, sem esperar 15 minutos', async () => {
  let tempo = Date.parse('2026-11-26T06:15:34Z'); let consultas = 0; let publicado = false;
  const p = post('Rio retornou ao Calor 1 às 03h15 de 26/11/2026', '2026-11-26T06:20:11');
  const buscar = criarConsultaVigenciaCalor({ agora: () => tempo, fetchImpl: async () => {
    consultas++; return { ok: true, status: 200, text: async () => JSON.stringify(publicado ? [p] : []) };
  } });
  assert.equal(await buscar(1), null);
  tempo += 15000; publicado = true;
  assert.equal((await buscar(1))?.vigenteDesde, '2026-11-26T06:15:00.000Z');
  assert.equal(consultas, 2);
});
