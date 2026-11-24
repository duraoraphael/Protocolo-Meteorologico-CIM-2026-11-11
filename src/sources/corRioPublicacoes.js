const { createHash } = require('node:crypto');
const { buscarJsonComRetentativa } = require('./httpJsonClient');
const { interpretarComunicados } = require('./corRio');

// Coleta exclusiva do monitor: todas as categorias, inclusive notícias e trânsito.
// O cursor considera a edição, para encontrar também mudanças em posts antigos.
async function buscarPublicacoesCorRio({ desde = null, fetchImpl = fetch, agora = Date.now } = {}) {
  const corte = new Date(agora()).toISOString();
  const itens = new Map();
  let totalPaginas = 1;
  let totalEsperado = null;
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    const url = new URL('https://cor.rio/wp-json/wp/v2/posts');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(pagina));
    url.searchParams.set('orderby', 'modified');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('_fields', 'id,date_gmt,modified_gmt,link,title,excerpt,content,categories');
    url.searchParams.set('modified_after', new Date(Date.parse(desde || corte) - 120000).toISOString().slice(0, 19));
    url.searchParams.set('modified_before', corte.slice(0, 19));
    let paginasResposta = null;
    let totalResposta = null;
    const json = await buscarJsonComRetentativa(url.href, {
      nomeFonte: 'COR-Rio (todas as publicações)', tentativas: 1, timeoutMs: 10000,
      fetchImpl: async (...args) => {
        const resposta = await fetchImpl(...args);
        paginasResposta = resposta.headers?.get?.('x-wp-totalpages') ?? null;
        totalResposta = resposta.headers?.get?.('x-wp-total') ?? null;
        return resposta;
      },
      requestInit: { headers: { Accept: 'application/json', 'User-Agent': 'Protocolo-Meteorologico-CIM/1.0' },
        cache: 'no-store', redirect: 'error' },
    });
    if (!Array.isArray(json)) throw new Error('COR-Rio: lista de publicações inválida.');
    if (paginasResposta === null && json.length >= 100) {
      throw new Error('COR-Rio: paginação indisponível; referência preservada.');
    }
    const quantidade = paginasResposta === null ? pagina : Number(paginasResposta);
    if (!Number.isInteger(quantidade) || quantidade < 0) throw new Error('COR-Rio: paginação inválida.');
    if ((quantidade > 1 || pagina > 1) && totalResposta === null) {
      throw new Error('COR-Rio: total da paginação indisponível; referência preservada.');
    }
    if (totalResposta !== null) {
      const total = Number(totalResposta);
      if (!Number.isInteger(total) || total < 0) throw new Error('COR-Rio: total de publicações inválido.');
      // Uma edição posterior ao corte remove o post desta faixa e desloca offsets.
      // Nesse caso a consulta inteira deve ser repetida com o cursor anterior.
      if (totalEsperado !== null && total !== totalEsperado) {
        throw new Error('COR-Rio: lista mudou durante a paginação; referência preservada.');
      }
      totalEsperado = total;
    }
    totalPaginas = Math.max(pagina, quantidade);
    for (const post of json) {
      // Interpretar separadamente preserva publicações diferentes com o mesmo título.
      const item = interpretarComunicados([post])[0];
      if (!item) throw new Error('COR-Rio: publicação fora do formato esperado; referência preservada.');
      const revisao = createHash('sha256').update(JSON.stringify([
        post.modified_gmt, post.title, post.content, post.excerpt, post.link, post.categories,
      ])).digest('hex');
      itens.set(item.id, { ...item, revisao });
    }
  }
  if (totalEsperado !== null && itens.size !== totalEsperado) {
    throw new Error('COR-Rio: lista incompleta ou mudou durante a paginação; referência preservada.');
  }
  return { status: 'operacional', itens: [...itens.values()], desde: corte };
}

module.exports = { buscarPublicacoesCorRio };
