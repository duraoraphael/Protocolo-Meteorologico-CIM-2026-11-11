const test = require('node:test');
const assert = require('node:assert/strict');
const { buscarPublicacoesCorRio } = require('../src/sources/corRioPublicacoes');

const bruto = (id, extra = {}) => ({ id, date_gmt: '2026-11-24T10:00:00', modified_gmt: '2026-11-24T11:00:00',
  title: { rendered: 'Notícia com título repetido' }, content: { rendered: '<p>Trânsito na avenida</p>' },
  link: `https://cor.rio/noticia-${id}/`, categories: [99], ...extra });

test('inicialização cria referência de toda a janela sobreposta, mesmo com mais de uma página', async () => {
  const urls = [];
  const r = await buscarPublicacoesCorRio({ agora: () => Date.parse('2026-11-24T11:01:00Z'),
    fetchImpl: async url => {
      const u = new URL(url); urls.push(u);
      return { ok: true, status: 200, headers: new Headers({ 'X-WP-TotalPages': '2', 'X-WP-Total': '2' }),
        text: async () => JSON.stringify([bruto(Number(u.searchParams.get('page')))]) };
    } });
  assert.equal(urls[0].searchParams.get('modified_after'), '2026-11-24T10:59:00');
  assert.equal(r.itens.length, 2);
});

test('coleta todas as categorias, pagina, preserva títulos repetidos e detecta edição de post antigo', async () => {
  const urls = [];
  const opcoes = { desde: '2026-11-24T10:59:00Z', agora: () => Date.parse('2026-11-24T11:01:00Z'),
    fetchImpl: async (url) => {
      const u = new URL(url); urls.push(u);
      const itens = u.searchParams.get('page') === '1' ? [bruto(1)] : [bruto(2, { date_gmt: '2025-01-01T10:00:00' })];
      return { ok: true, status: 200, headers: new Headers({ 'X-WP-TotalPages': '2', 'X-WP-Total': '2' }), text: async () => JSON.stringify(itens) };
    } };
  const r = await buscarPublicacoesCorRio(opcoes);
  assert.equal(r.itens.length, 2);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].searchParams.has('categories'), false);
  assert.equal(urls[0].searchParams.get('orderby'), 'modified');
  assert.equal(urls[0].searchParams.get('modified_after'), '2026-11-24T10:57:00');
  assert.equal(r.desde, '2026-11-24T11:01:00.000Z');
  const antes = r.itens[0].revisao;
  const editado = await buscarPublicacoesCorRio({ ...opcoes, fetchImpl: async () => ({ ok: true, status: 200,
    text: async () => JSON.stringify([bruto(1, { content: { rendered: '<p>Conteúdo editado</p>' } })]) }) });
  assert.notEqual(editado.itens[0].revisao, antes);
});

test('falha em página posterior impede confirmar coleta parcial', async () => {
  await assert.rejects(buscarPublicacoesCorRio({ desde: '2026-11-24T10:59:00Z',
    fetchImpl: async (url) => {
      if (new URL(url).searchParams.get('page') === '2') throw new Error('rede indisponível');
      return { ok: true, status: 200, headers: new Headers({ 'X-WP-TotalPages': '2', 'X-WP-Total': '2' }), text: async () => JSON.stringify([bruto(1)]) };
    } }), /rede indisponível/);
});

for (const quantidade of [201, 150]) test(`edição durante paginação preserva cursor (${quantidade} publicações)`, async () => {
  await assert.rejects(buscarPublicacoesCorRio({ desde: '2026-11-24T10:00:00Z',
    fetchImpl: async url => {
      const pagina = Number(new URL(url).searchParams.get('page'));
      const ids = pagina === 1 ? Array.from({ length: 100 }, (_, i) => i + 1)
        : Array.from({ length: quantidade - 101 }, (_, i) => i + 102);
      return { ok: true, status: 200, headers: new Headers({
        'X-WP-TotalPages': String(Math.ceil((quantidade - (pagina === 1 ? 0 : 1)) / 100)),
        'X-WP-Total': String(quantidade - (pagina === 1 ? 0 : 1)),
      }), text: async () => JSON.stringify(ids.map(id => bruto(id))) };
    } }), /mudou durante a paginação/);
});
