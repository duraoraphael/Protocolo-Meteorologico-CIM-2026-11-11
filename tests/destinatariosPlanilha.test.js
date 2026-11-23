const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
let planilhas;
test.before(() => { planilhas = require('../src/recipients/spreadsheets'); });
test('CSV aceita UTF-8, campos entre aspas e instalações configuradas', async () => {
  const csv = '\ufeffnome;email;instalacoes\r\n"Maria; Operação";maria@exemplo.com;"santos|cor_rio"\r\n;outro@exemplo.com;\r\n';
  const r = await planilhas.importar({ nome: 'teste.csv', conteudo: Buffer.from(csv).toString('base64') });
  assert.deepEqual(r, [{ nome: 'Maria; Operação', email: 'maria@exemplo.com', bases: ['santos', 'cor_rio'] }, { nome: '', email: 'outro@exemplo.com', bases: [] }]);
});
test('importação rejeita cabeçalhos inesperados, instalação desconhecida e arquivo malformado', async () => {
  for (const csv of ['senha;email\nx;y@exemplo.com', 'nome;email;instalacoes\nx;y@exemplo.com;inventada', 'nome;email\n"sem fim;y@exemplo.com']) {
    await assert.rejects(planilhas.importar({ nome: 'teste.csv', conteudo: Buffer.from(csv).toString('base64') }), { status: 400 });
  }
  await assert.rejects(planilhas.importar({ nome: 'teste.exe', conteudo: 'YWJj' }), { status: 400 });
  await assert.rejects(planilhas.importar({ nome: 'teste.xlsx', conteudo: 'YWJj' }), { status: 400 });
});
test('modelo XLSX pode ser importado; fórmulas e XML com entidades são rejeitados', async () => {
  const arquivo = await planilhas.modelo('xlsx');
  const linhas = await planilhas.importar({ nome: 'modelo.xlsx', conteudo: arquivo.toString('base64') });
  assert.equal(linhas[0].email, 'maria@exemplo.com');
  const zip = await JSZip.loadAsync(arquivo);
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  zip.file('xl/worksheets/sheet1.xml', sheet.replace('<t>Maria</t>', '<t>Maria</t>').replace('<c r="A2" t="inlineStr">', '<c r="A2" t="inlineStr"><f>HYPERLINK("http://x")</f>'));
  await assert.rejects(planilhas.importar({ nome: 'formula.xlsx', conteudo: (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64') }), { status: 400 });
});
test('exportação CSV neutraliza fórmulas e XLSX mantém valores como texto', async () => {
  const csv = await planilhas.exportar([{ nome: '=1+1', email: 'x@exemplo.com', bases: ['santos'], ativo: true }], 'csv');
  assert.ok(csv.toString().includes("'=1+1"));
  const arquivo = await planilhas.exportar([{ nome: '=1+1', email: 'x@exemplo.com', bases: [], ativo: false }], 'xlsx');
  const zip = await JSZip.loadAsync(arquivo);
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.ok(!sheet.includes('<f>'));
  assert.ok(sheet.includes('=1+1'));
});
test('limita a descompactação real mesmo quando ZIP declara tamanho falso', async () => {
  const zip = await JSZip.loadAsync(await planilhas.modelo('xlsx'));
  zip.file('xl/worksheets/sheet1.xml', '<worksheet>' + 'X'.repeat(9 * 1024 * 1024) + '</worksheet>');
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  for (let offset = 0; offset < buffer.length - 46; offset++) {
    if (buffer.readUInt32LE(offset) === 0x02014b50) {
      const length = buffer.readUInt16LE(offset + 28);
      if (buffer.subarray(offset + 46, offset + 46 + length).toString() === 'xl/worksheets/sheet1.xml') buffer.writeUInt32LE(100, offset + 24);
    }
  }
  await assert.rejects(planilhas.importar({ nome: 'tamanho-falso.xlsx', conteudo: buffer.toString('base64') }), e => e.status === 400 && /descompactada muito grande/.test(e.message));
});
