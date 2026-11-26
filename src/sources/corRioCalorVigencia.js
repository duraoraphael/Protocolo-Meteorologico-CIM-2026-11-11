const cheerio = require('cheerio');
const { buscarJsonComRetentativa } = require('./httpJsonClient');

const URL = 'https://cor.rio/wp-json/wp/v2/posts?search=calor&per_page=100&orderby=date&order=desc&_fields=date_gmt,title,content,excerpt,link';
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const TRANSICAO = /\b(entrou|retornou|atingiu|passou|voltou|regressou)\b|\besta\b[^.!?;]{0,180}\bdesde\b/;
const HISTORICO = /\b(anteriormente|no passado|na semana passada|no episodio anterior|antes disso)\b/;
const normalizar = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function textosHtml(html) {
  const $ = cheerio.load(typeof html === 'string' ? html : '');
  $('script,style,iframe,noscript').remove();
  const blocos = $('p,li,h1,h2,h3').map((i, e) => $(e).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean);
  return (blocos.length ? blocos : [$('body').text().replace(/\s+/g, ' ').trim()]).filter(Boolean)
    .flatMap(texto => texto.split(/(?<=[.!?;])\s+/)).map(normalizar);
}
function nivelTexto(texto) {
  const m = /\b(?:calor|nc)\s*([1-5])\b/.exec(texto)
    || /\bnivel\s*([1-5])\s+(?:do\s+)?(?:protocolo\s+de\s+)?calor\b/.exec(texto);
  if (m) return Number(m[1]);
  const ordinal = /\b(primeiro|segundo|terceiro|quarto|quinto)\s+nivel\s+(?:do\s+)?(?:protocolo\s+de\s+)?calor\b/.exec(texto);
  return ordinal ? ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto'].indexOf(ordinal[1]) + 1 : null;
}
function dataTexto(texto, publicacao) {
  const data = /\b(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\b/.exec(texto);
  const abreviada = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/.exec(texto);
  if (!data && !abreviada) return null;
  const dia = Number(data ? data[1] : abreviada[1]);
  const mes = data ? MESES.indexOf(data[2]) : Number(abreviada[2]) - 1;
  let ano = Number(data ? data[3] : abreviada[3]);
  if (!ano && abreviada) {
    const publicada = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(publicacao || '') ? publicacao : `${publicacao}Z`);
    if (!Number.isFinite(publicada)) return null;
    const referencia = new Date(publicada).getUTCFullYear();
    ano = [referencia - 1, referencia, referencia + 1]
      .sort((a, b) => Math.abs(Date.UTC(a, mes, dia) - publicada) - Math.abs(Date.UTC(b, mes, dia) - publicada))[0];
  }
  if (mes < 0 || mes > 11 || ano < 2020) return null;
  const civil = new Date(Date.UTC(ano, mes, dia));
  if (civil.getUTCDate() !== dia || civil.getUTCMonth() !== mes) return null;
  return { ano, mes, dia, chave: civil.toISOString().slice(0, 10) };
}
function instanteTexto(texto, publicacao, agora) {
  const hora = /\b(?:as|desde|a\s+partir\s+das?)\s+(\d{1,2})(?:h(?:(\d{2})(?:min)?)?|:(\d{2}))\b/.exec(texto);
  const data = dataTexto(texto, publicacao);
  if (!hora || !data) return null;
  const horas = Number(hora[1]), minutos = Number(hora[2] || hora[3] || 0);
  if (horas > 23 || minutos > 59) return null;
  const instante = Date.UTC(data.ano, data.mes, data.dia, horas + 3, minutos); // Brasília, UTC-03 desde 2019.
  return instante <= agora ? new Date(instante).toISOString() : null;
}

// Hora e data devem estar na mesma declaração de mudança, nunca em um trecho histórico de outro nível.
// updated_at e o horário de publicação não são o início de vigência.
function interpretarVigenciaCalor(posts, nivel, agora = Date.now()) {
  if (!Array.isArray(posts)) throw new Error('COR-Rio: lista de comunicados de calor inválida.');
  const candidatos = posts.filter(p => p && typeof p === 'object').map(post => {
    const titulo = textosHtml(post.title?.rendered).join(' ');
    const textos = [titulo, ...textosHtml(post.content?.rendered), ...textosHtml(post.excerpt?.rendered)];
    // O título identifica o comunicado do episódio; o corpo apenas completa sua data/hora.
    // Notícias de previsão com referências históricas não representam outra mudança.
    return { post, textos, nivel: TRANSICAO.test(titulo) && !HISTORICO.test(titulo) ? nivelTexto(titulo) : null };
  }).filter(p => p.nivel).sort((a, b) => String(b.post.date_gmt).localeCompare(String(a.post.date_gmt)));
  const atual = candidatos[0];
  if (!atual || atual.nivel !== nivel) return null;
  let link;
  try {
    link = new globalThis.URL(atual.post.link);
    if (link.protocol !== 'https:' || link.hostname !== 'cor.rio' || link.username || link.password || link.port) return null;
  } catch { return null; }
  const declaracoes = atual.textos.filter(t => TRANSICAO.test(t) && nivelTexto(t) === nivel && !HISTORICO.test(t));
  // A data deve vir do título ou da primeira declaração do corpo sobre o episódio atual.
  // Não buscar uma data posterior no texto: ela pode descrever outro episódio do mesmo nível.
  const dataAtual = dataTexto(atual.textos[0], atual.post.date_gmt)?.chave
    || (declaracoes[0] === atual.textos[0]
      ? dataTexto(declaracoes[1] || '', atual.post.date_gmt)?.chave
      : dataTexto(declaracoes[0] || '', atual.post.date_gmt)?.chave);
  if (!dataAtual) return null;
  const vigencias = [];
  for (const texto of declaracoes) {
    if (dataTexto(texto, atual.post.date_gmt)?.chave !== dataAtual) continue;
    const niveis = [...texto.matchAll(/\b(?:calor|nc)\s*([1-5])\b/g)].map(m => Number(m[1]));
    if (niveis.some(n => n !== nivel)) continue;
    const vigenteDesde = instanteTexto(texto, atual.post.date_gmt, agora);
    if (vigenteDesde) vigencias.push(vigenteDesde);
  }
  return vigencias.length ? { vigenteDesde: vigencias.sort().at(-1), fonteVigencia: link.href } : null;
}

function criarConsultaVigenciaCalor({ fetchImpl = (...args) => fetch(...args), agora = Date.now } = {}) {
  let cache = null;
  return async function buscar(nivel) {
    // O comunicado pode ser publicado minutos depois da alteração da API.
    const validade = cache?.dados ? 15 * 60000 : 15000;
    if (cache?.nivel === nivel && agora() - cache.consultadoEm < validade) return cache.dados;
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
