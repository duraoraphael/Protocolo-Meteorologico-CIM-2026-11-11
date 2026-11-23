const JSZip = require('jszip');
const { load } = require('cheerio');
const path = require('node:path').posix;
const { inflateRawSync } = require('node:zlib');
const { erroEntrada, validarBases } = require('../config/recipients');
const { instalacoes, MAX_REGISTROS } = require('./management');
const MAX_ARQUIVO = 1024 * 1024;
const MAX_XML = 8 * 1024 * 1024;
const xmlEscape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const neutralizar = v => /^[\s]*[=+@\-\t\r]/.test(String(v)) ? `'${v}` : String(v);
function csvLinhas(texto) {
  const primeira = texto.split(/\r?\n/, 1)[0];
  const separador = primeira.includes(';') ? ';' : ',';
  const linhas = []; let linha = [], campo = '', aspas = false, fechou = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else { aspas = false; fechou = true; } }
      else campo += c;
    } else if (c === '"' && !campo && !fechou) aspas = true;
    else if (c === separador || c === '\n' || c === '\r') {
      linha.push(campo); campo = ''; fechou = false;
      if (c !== separador) {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        if (linha.some(v => v.trim())) linhas.push(linha);
        linha = [];
      }
    } else {
      if (fechou || c === '"') throw erroEntrada('CSV malformado: confira as aspas.');
      campo += c;
    }
    if (campo.length > 2000 || linha.length > 3 || linhas.length > MAX_REGISTROS + 1) throw erroEntrada('Planilha excede os limites de linhas ou colunas.');
  }
  if (aspas) throw erroEntrada('CSV malformado: aspas não fechadas.');
  linha.push(campo); if (linha.some(v => v.trim())) linhas.push(linha);
  return linhas;
}
function lerXml(xml) {
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml)) throw erroEntrada('XML não permitido.');
  return load(xml, { xmlMode: true });
}
async function xlsxLinhas(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files);
  if (files.length > 100 || files.some(f => /vbaProject|externalLinks|embeddings/i.test(f.name))) throw erroEntrada('Planilha contém recursos não permitidos.');
  let total = 0;
  for (const f of files) { total += f._data?.uncompressedSize || 0; if (total > MAX_XML) throw erroEntrada('Planilha descompactada muito grande.'); }
  let produzidos = 0;
  async function xml(nome) {
    const file = zip.file(nome);
    if (!file) throw erroEntrada('Estrutura XLSX incompleta.');
    // JSZip valida o tamanho declarado somente depois da expansão. Usamos
    // seu conteúdo comprimido com o limite nativo do zlib durante a expansão.
    const entrada = file._data;
    const limite = MAX_XML - produzidos;
    if (!entrada || limite < 1) throw erroEntrada('Planilha descompactada muito grande.');
    let data;
    try {
      if (entrada.compression.magic === '\x08\x00') data = inflateRawSync(entrada.compressedContent, { maxOutputLength: limite });
      else if (entrada.compression.magic === '\x00\x00') {
        if (entrada.compressedContent.length > limite) throw erroEntrada('Planilha descompactada muito grande.');
        data = Buffer.from(entrada.compressedContent);
      } else throw erroEntrada('Compactação XLSX não suportada.');
    } catch (e) {
      if (e.code === 'ERR_BUFFER_TOO_LARGE') throw erroEntrada('Planilha descompactada muito grande.');
      throw e;
    }
    produzidos += data.length;
    if (data.length !== entrada.uncompressedSize) throw erroEntrada('Tamanho XLSX inválido.');
    return lerXml(new TextDecoder('utf-8', { fatal: true }).decode(data));
  }
  const wb = await xml('xl/workbook.xml');
  const rel = await xml('xl/_rels/workbook.xml.rels');
  const rid = wb('sheet').first().attr('r:id');
  const relationship = rel('Relationship').toArray().find(e => rel(e).attr('Id') === rid);
  if (!relationship || rel(relationship).attr('TargetMode') === 'External') throw erroEntrada('Referência da planilha inválida.');
  const target = rel(relationship).attr('Target') || '';
  const sheetPath = target.startsWith('/') ? target.slice(1) : path.normalize(path.join('xl', target));
  if (!sheetPath.startsWith('xl/worksheets/')) throw erroEntrada('Referência da planilha inválida.');
  const strings = [];
  if (zip.file('xl/sharedStrings.xml')) {
    const shared = await xml('xl/sharedStrings.xml');
    shared('si').each((_, el) => strings.push(shared(el).find('t').text()));
  }
  const sheet = await xml(sheetPath);
  if (!sheet('worksheet').length || sheet('f').length) throw erroEntrada('Planilhas com fórmulas não são aceitas. Cole apenas valores.');
  const linhas = [];
  sheet('sheetData > row').each((_, el) => {
    const linha = [];
    sheet(el).children('c').each((__, cel) => {
      const c = sheet(cel), endereco = c.attr('r') || '';
      const col = /^([A-C])[1-9]\d*$/.exec(endereco);
      if (!col) throw erroEntrada('A planilha deve ter somente as colunas A, B e C.');
      const tipo = c.attr('t');
      if (tipo && !['s', 'inlineStr', 'str', 'n'].includes(tipo)) throw erroEntrada('Tipo de célula inválido.');
      let valor = tipo === 'inlineStr' ? c.find('t').text() : c.children('v').text();
      if (tipo === 's') { if (!/^\d+$/.test(valor) || Number(valor) >= strings.length) throw erroEntrada('Texto XLSX inválido.'); valor = strings[Number(valor)]; }
      if (valor.length > 2000) throw erroEntrada('Célula muito grande.');
      const index = col[1].charCodeAt(0) - 65;
      if (linha[index] !== undefined) throw erroEntrada('Células duplicadas na planilha.');
      linha[index] = valor;
    });
    if (linha.some(v => v?.trim())) linhas.push(linha);
    if (linhas.length > MAX_REGISTROS + 1) throw erroEntrada(`Limite de ${MAX_REGISTROS} destinatários por importação.`);
  });
  return linhas;
}
function registros(linhas) {
  if (linhas.length < 2 || linhas.length > MAX_REGISTROS + 1) throw erroEntrada(`Informe de 1 a ${MAX_REGISTROS} linhas de dados.`);
  const normalizar = v => String(v || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace('-', '');
  const cabecalho = linhas[0].map(normalizar);
  if (!cabecalho.includes('email') || cabecalho.some(v => !['nome', 'email', 'instalacoes'].includes(v)) || new Set(cabecalho).size !== cabecalho.length) throw erroEntrada('Colunas permitidas: nome, email e instalacoes. A coluna email é obrigatória.');
  const conhecidas = instalacoes();
  return linhas.slice(1).map((linha, index) => {
    if (linha.length > cabecalho.length) throw erroEntrada(`Linha ${index + 2}: número de colunas inválido.`);
    const get = k => String(linha[cabecalho.indexOf(k)] || '').trim();
    const bases = get('instalacoes').split('|').map(v => v.trim()).filter(Boolean).map(v => {
      const base = conhecidas.find(b => b.chave === v || normalizar(b.nome) === normalizar(v));
      if (!base) throw erroEntrada(`Linha ${index + 2}: instalação desconhecida. Use as chaves do modelo.`);
      return base.chave;
    });
    return { nome: get('nome'), email: get('email'), bases: validarBases(bases) };
  });
}
async function importar({ nome, conteudo } = {}) {
  if (typeof nome !== 'string' || !/\.(csv|xlsx)$/i.test(nome) || typeof conteudo !== 'string' || conteudo.length > Math.ceil(MAX_ARQUIVO / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(conteudo)) throw erroEntrada('Envie um CSV ou XLSX de até 1 MB.');
  try {
    const buffer = Buffer.from(conteudo, 'base64');
    if (!buffer.length || buffer.length > MAX_ARQUIVO) throw erroEntrada('Arquivo vazio ou muito grande.');
    const linhas = /\.csv$/i.test(nome) ? csvLinhas(new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\ufeff/, '')) : await xlsxLinhas(buffer);
    return registros(linhas);
  } catch (e) { if (e.publico) throw e; throw erroEntrada('Arquivo malformado. Utilize o modelo CSV UTF-8 ou XLSX.'); }
}
async function criarXlsx(linhas) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Destinatarios" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + linhas.map((l, i) => `<row r="${i + 1}">${l.map((v, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`).join('')}</row>`).join('') + '</sheetData></worksheet>');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
async function exportar(pessoas, formato = 'csv') {
  if (!['csv', 'xlsx'].includes(formato)) throw erroEntrada('Formato inválido.');
  const linhas = [['nome', 'email', 'instalacoes'], ...pessoas.map(p => [p.nome || '', p.email, p.bases.join('|')])];
  if (formato === 'xlsx') return criarXlsx(linhas);
  return Buffer.from('\ufeff' + linhas.map(l => l.map(v => '"' + neutralizar(v).replace(/"/g, '""') + '"').join(';')).join('\r\n'), 'utf8');
}
const modelo = formato => exportar([{ nome: 'Maria', email: 'maria@exemplo.com', bases: ['santos'] }], formato);
module.exports = { importar, exportar, modelo };
