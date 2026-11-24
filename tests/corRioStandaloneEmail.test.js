const test = require("node:test");
const assert = require("node:assert/strict");

test('aviso automático mostra trânsito e notícias editadas sem filtro de data ou categoria e escapa conteúdo', () => {
  const { renderCorRioStandaloneEmail } = require('../src/render/corRioStandaloneEmail');
  const html = renderCorRioStandaloneEmail({ corRio: {}, publicacoesCorRio: { status: 'operacional', itens: [
    { id: '1', titulo: 'Trânsito <bloqueado>', descricaoIntegral: ['Desvio <script>malicioso</script>'],
      publicadoEm: '2025-01-01T10:00:00Z', atualizadoEm: '2026-11-24T11:00:00Z', link: 'https://cor.rio/transito/', categorias: [99] },
    { id: '2', titulo: 'Notícia institucional', descricaoIntegral: ['Notícia integral'], link: 'https://cor.rio/noticia/' },
  ] } });
  assert.match(html, /Trânsito &lt;bloqueado&gt;/);
  assert.match(html, /Notícia institucional/);
  assert.match(html, /Atualização/);
  assert.match(html, /https:\/\/cor.rio\/transito\//);
  assert.doesNotMatch(html, /<script>|Nenhum comunicado meteorológico/);
});
const cheerio = require("cheerio");
const { renderCorRioStandaloneEmail } = require("../src/render/corRioStandaloneEmail");
const { interpretarComunicados, interpretarCalor } = require("../src/sources/corRio");

const geradoEmISO = "2026-11-18T18:00:00Z";
const consultadoEm = "2026-11-18T17:55:00Z";

test("aviso exibe uma publicação, com título e texto integrais e horário oficial", () => {
  const titulo = "Boletim meteorológico — " + "A".repeat(310);
  const itens = interpretarComunicados([{
    id: 1, categories: [29], title: { rendered: titulo },
    date_gmt: "2026-11-18T14:00:00", modified_gmt: "2026-11-18T16:00:00",
    link: "https://cor.rio/boletim/?a=1&b=2",
    content: { rendered: "<p>Texto oficial &amp; íntegro.</p><p>Previsão para os próximos dias: sem alterações.</p><h2>19 de novembro</h2><div>Trecho de amanhã.</div><p>Trecho final.</p>" },
  }]);
  const $ = cheerio.load(renderCorRioStandaloneEmail({
    geradoEmISO, corRio: { comunicados: { consultadoEm, itens } },
  }));
  const comunicado = $("#cor-rio-comunicado");
  assert.equal(comunicado.find("h3").text(), titulo);
  assert.equal(comunicado.find("p strong").first().text(), "Previsão para os próximos dias:");
  assert.match(comunicado.text(), /Texto oficial & íntegro\.[\s\S]*19 de novembro[\s\S]*Trecho de amanhã\.[\s\S]*Trecho final\./);
  assert.deepEqual(comunicado.text().match(/18\/11\/2026 \d{2}:\d{2}/g), ["18/11/2026 11:00"]);
  assert.equal(comunicado.find("a").attr("href"), "https://cor.rio/boletim/?a=1&b=2");
  assert.doesNotMatch($("body").text(), /Consulta à fonte|atualizado em|Protocolo independente/);
});

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
    assert.equal(calor.find(".cor-rio-nivel").attr("bgcolor"), nivel === 1 ? cores[0] : "#006527");
    if (nivel === 1) {
      assert.equal(calor.find(".cor-rio-nivel").attr("style"), estagio.find(".cor-rio-nivel").attr("style"));
    }
    assert.equal(estagio.find(".cor-rio-nivel").text(), `Estágio ${nivel}`);
    assert.equal(calor.find(".cor-rio-nivel").text(), `Calor ${nivel}`);
    assert.match(estagio.text(), /18\/11\/2026 09:00[\s\S]*Descrição da fonte\./);
    assert.match(estagio.text(), /Último estágio informado/);
    assert.match(calor.text(), /17\/11\/2026 11:00/);
    assert.doesNotMatch(calor.text(), /18\/11\/2026|Descrição da fonte/);
    assert.equal(estagio.find("a").attr("href"), "https://cor.rio/faq/");
    assert.equal(calor.find("a").attr("href"), "https://cor.rio/niveis-de-calor/");
  }
});

test("omite metadados e orientações ausentes e mantém o estado indisponível", () => {
  const $ = cheerio.load(renderCorRioStandaloneEmail({ geradoEmISO, simulado: true }));
  assert.match($("body").text(), /SIMULAÇÃO — NÃO ENVIAR/);
  assert.deepEqual($("h2").map((_, el) => $(el).text()).get(), [
    "COMUNICADO OFICIAL COR-RIO", "ESTÁGIO OPERACIONAL DA CIDADE", "ESTÁGIO DE CALOR — COR-RIO",
  ]);
  assert.doesNotMatch($("body").text(), /RECOMENDAÇÕES|Vigente desde|Consultar publicação oficial|Estágio 1|Calor 1/);
});
