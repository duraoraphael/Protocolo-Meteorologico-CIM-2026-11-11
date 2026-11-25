const test = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const { renderCorRioStandaloneEmail } = require('../src/render/corRioStandaloneEmail');
const { interpretarCalor } = require('../src/sources/corRio');
const geradoEmISO = '2026-11-18T18:00:00Z';
const consultadoEm = '2026-11-18T17:55:00Z';

test("classifica todos os níveis em escalas independentes, com vigências próprias", () => {
  const cores = ["#22C55E", "#FACC15", "#F97316", "#EF4444", "#A855F7"];
  for (let nivel = 1; nivel <= 5; nivel++) {
    const $ = cheerio.load(renderCorRioStandaloneEmail({ geradoEmISO, corRio: {
      estagio: { status: "desatualizado", consultadoEm, dados: { nivel, vigenteDesde: "2026-11-18T12:00:00Z", mensagens: ["Descrição da fonte."] } },
      calor: { dados: { ...interpretarCalor(`calor ${nivel}`), vigenteDesde: "2026-11-17T14:00:00Z" } },
    } }));
    const estagio = $("#cor-rio-operacional");
    const calor = $("#cor-rio-calor");
    assert.equal(estagio.find(".cor-rio-nivel").attr("bgcolor"), cores[nivel - 1]);
    assert.equal(calor.find(".cor-rio-nivel").attr("bgcolor"), cores[nivel - 1]);
    assert.equal(calor.find(".cor-rio-nivel").attr("style"), estagio.find(".cor-rio-nivel").attr("style"));
    assert.equal(estagio.find(".cor-rio-nivel").text(), `Estágio ${nivel}`);
    assert.equal(calor.find(".cor-rio-nivel").text(), `Calor ${nivel}`);
    assert.match(estagio.text(), /18\/11\/2026 09:00/);
    assert.match(estagio.text(), /Último estágio informado/);
    assert.match(calor.text(), /17\/11\/2026 11:00/);
    assert.doesNotMatch(calor.text(), /18\/11\/2026|Descrição da fonte/);
    assert.equal(estagio.find("a").attr("href"), nivel === 1 ? undefined : "https://cor.rio/faq/");
    assert.equal(calor.find("a").attr("href"), nivel === 1 ? undefined : "https://cor.rio/niveis-de-calor/");
  }
});

test("cores dos estágios operacional e de calor acompanham mudanças de nível independentemente", () => {
  const cores = ["#22C55E", "#FACC15", "#F97316", "#EF4444", "#A855F7"];
  for (const [operacional, calor] of [[1, 3], [4, 2], [2, 5], [5, 4], [3, 1]]) {
    const $ = cheerio.load(renderCorRioStandaloneEmail({ geradoEmISO, corRio: {
      estagio: { status: "operacional", dados: { nivel: operacional } },
      calor: { status: "operacional", dados: { nivel: calor } },
    } }));
    for (const [id, nivel] of [["cor-rio-operacional", operacional], ["cor-rio-calor", calor]]) {
      const selo = $(`#${id} .cor-rio-nivel`);
      assert.equal(selo.attr("bgcolor"), cores[nivel - 1]);
      assert.ok(selo.attr("style").includes(`background:${cores[nivel - 1]};`));
      assert.ok(selo.attr("style").includes("color:#0B1A12;"));
    }
  }
});

test("omite metadados e orientações ausentes e mantém o estado indisponível", () => {
  const $ = cheerio.load(renderCorRioStandaloneEmail({ geradoEmISO, simulado: true }));
  assert.match($("body").text(), /SIMULAÇÃO — NÃO ENVIAR/);
  assert.deepEqual($("h2").map((_, el) => $(el).text()).get(), [
    "ESTÁGIO OPERACIONAL DA CIDADE", "ESTÁGIO DE CALOR",
  ]);
  assert.doesNotMatch($("body").text(), /RECOMENDAÇÕES|Vigente desde|Consultar publicação oficial|Estágio 1|Calor 1/);
});

test('calor informa ausência de início oficial sem usar horário de consulta como vigência', () => {
  const $ = cheerio.load(renderCorRioStandaloneEmail({ geradoEmISO, corRio: {
    calor: { status: 'operacional', consultadoEm, dados: { nivel: 3 } },
  } }));
  assert.match($('#cor-rio-calor').text(), /Vigente desde:.*início não informado pelo COR-Rio/);
  assert.doesNotMatch($('#cor-rio-calor').text(), /18\/11\/2026/);
});
