const cheerio = require('cheerio');
const { buscarJsonComRetentativa } = require('./httpJsonClient');

const URL = 'https://cor.rio/wp-json/wp/v2/posts?search=calor&per_page=100&orderby=date&order=desc&_fields=date_gmt,title,link';
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// updated_at da API de calor e a publicação do post não são o início do estágio.
// Aceita apenas data e hora de entrada explicitamente informadas no título oficial.
function interpretarVigenciaCalor(posts, nivel, agora = Date.now()) {
  if (!Array.isArray(posts)) throw new Error('COR-Rio: lista de comunicados de calor inválida.');
  const candidatos = posts.map(post => ({ post, texto: cheerio.load(post.title?.rendered || '').text()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() }))
    .filter(({ texto }) => /\bcalor\s+[1-5]\b/.test(texto) && /\b(entrou|retornou|esta|atingiu|passou)\b/.test(texto))
    .sort((a, b) => String(b.post.date_gmt).localeCompare(String(a.post.date_gmt)));
  const atual = candidatos[0];
  if (!atual || Number(/\bcalor\s+([1-5])\b/.exec(atual.texto)[1]) !== nivel) return null;
  const hora = /\b(?:as|desde)\s+(\d{1,2})h(?:(\d{2})(?:min)?)?\b/.exec(atual.texto);
  const data = /\b(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\b/.exec(atual.texto);
  const abreviada = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/.exec(atual.texto);
  if (!hora || (!data && !abreviada)) return null;
  const dia = Number(data ? data[1] : abreviada[1]);
  const mes = data ? MESES.indexOf(data[2]) : Number(abreviada[2]) - 1;
  let ano = Number(data ? data[3] : abreviada[3]);
  if (!ano && abreviada) {
    const publicada = Date.parse(`${atual.post.date_gmt}Z`);
    if (!Number.isFinite(publicada)) return null;
    const referencia = new Date(publicada).getUTCFullYear();
    ano = [referencia - 1, referencia, referencia + 1]
      .sort((a, b) => Math.abs(Date.UTC(a, mes, dia) - publicada) - Math.abs(Date.UTC(b, mes, dia) - publicada))[0];
  }
  const horas = Number(hora[1]), minutos = Number(hora[2] || 0);
  if (mes < 0 || mes > 11 || ano < 2020 || horas > 23 || minutos > 59) return null;
  const civil = new Date(Date.UTC(ano, mes, dia, horas, minutos));
  if (civil.getUTCDate() !== dia || civil.getUTCMonth() !== mes) return null;
  const instante = civil.getTime() + 3 * 3600000; // Brasília, UTC−03 desde 2019.
  if (instante > agora) return null;
  let link;
  try {
    link = new globalThis.URL(atual.post.link);
    if (link.protocol !== 'https:' || link.hostname !== 'cor.rio' || link.username || link.password || link.port) return null;
  } catch { return null; }
  return { vigenteDesde: new Date(instante).toISOString(), fonteVigencia: link.href };
}

function criarConsultaVigenciaCalor({ fetchImpl = (...args) => fetch(...args), agora = Date.now } = {}) {
  let cache = null;
  return async function buscar(nivel) {
    if (cache?.nivel === nivel && agora() - cache.consultadoEm < 15 * 60000) return cache.dados;
    const posts = await buscarJsonComRetentativa(URL, {
      nomeFonte: 'COR-Rio (vigência do calor)', fetchImpl, tentativas: 1, timeoutMs: 10000,
      requestInit: { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error' },
    });
    const dados = interpretarVigenciaCalor(posts, nivel, agora());
    cache = { nivel, dados, consultadoEm: agora() };
    return dados;
  };
}

const buscarVigenciaCalor = criarConsultaVigenciaCalor();
module.exports = { interpretarVigenciaCalor, criarConsultaVigenciaCalor, buscarVigenciaCalor };
