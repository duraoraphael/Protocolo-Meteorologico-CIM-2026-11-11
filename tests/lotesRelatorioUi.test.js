const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CIDADES } = require("../src/config/cities");
const { subirApp, SENHA_TESTE } = require("./helpers/servidor");
const { registrarOperacionalTeste } = require("./helpers/provenance");

const navegador = process.env.CIM_TEST_NAVEGADOR;

test("modal de lote em desktop e celular acompanha a API real com SMTP simulado", {
  skip: !navegador && "Defina CIM_TEST_NAVEGADOR com o executável do Chromium, Chrome ou Edge.",
  timeout: 35_000,
}, async (t) => {
  const pastaLotes = fs.mkdtempSync(path.join(os.tmpdir(), "cim-lotes-ui-"));
  const chamadas = [];
  let liberar;
  const pausa = new Promise((resolve) => { liberar = resolve; });
  const srv = await subirApp({
    pastaLotes,
    listarDestinatariosLote: () => ["mock@example.test"],
    executarPipelineRelatorio: async ({ cidadeChave, aoMudarEtapa }) => {
      chamadas.push(cidadeChave);
      aoMudarEtapa("gerando_pdf");
      if (chamadas.length === 1) await pausa;
      aoMudarEtapa("enviando_email");
      return {
        report: registrarOperacionalTeste({ cidade: CIDADES[cidadeChave] }),
        envio: { aceitos: 1, rejeitados: 0 },
      };
    },
  });
  t.after(async () => {
    liberar();
    await srv.fechar();
    fs.rmSync(pastaLotes, { recursive: true, force: true });
  });
  const browser = await require("puppeteer").launch({
    executablePath: navegador, pipe: true, timeout: 10_000,
    userDataDir: path.join(pastaLotes, "navegador"),
    args: ["--no-first-run", "--disable-gpu", "--no-sandbox"],
  });
  try {
    for (const width of [1100, 375]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: width === 375 ? 690 : 850 });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = new URL(req.url());
        if (url.origin !== srv.base) return req.abort();
        if (url.pathname.startsWith("/api/") && url.pathname !== "/api/cidades" && !url.pathname.startsWith("/api/relatorios/lotes")) {
          return req.respond({ status: 503, contentType: "application/json", body: "{}" });
        }
        return req.continue();
      });
      await page.goto(srv.base, { waitUntil: "domcontentloaded" });
      if (width < 580) await page.click("#menu-toggle");
      await page.click("#botao-config");
      await page.select("#tipo-envio", "lote");
      const chaves = Object.keys(CIDADES);
      await page.waitForFunction((total) => document.querySelectorAll("#lote-bases input").length === total, {}, chaves.length);
      const campos = () => page.$$eval("#lote-bases input", (inputs) => inputs.map((input) => input.value));
      assert.deepEqual(await campos(), chaves);
      assert.equal(await page.$eval("#botao-confirmar", (el) => el.disabled), true);
      assert.equal(await page.$eval("#lote-bases", (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length), width < 580 ? 2 : 3);
      await page.click("#lote-todas");
      assert.equal(await page.$$eval("#lote-bases input:checked", (inputs) => inputs.length), chaves.length);
      assert.match(await page.$eval("#lote-contador", (el) => el.textContent), new RegExp(`^${chaves.length}.* de ${chaves.length}`));
      await page.click("#lote-bases input");
      assert.equal(await page.$eval("#lote-todas", (el) => el.indeterminate), true);
      await page.click("#lote-bases input");
      assert.equal(await page.$eval("#lote-todas", (el) => el.checked && !el.indeterminate), true);
      await page.click("#lote-todas");
      assert.equal(await page.$$eval("#lote-bases input:checked", (inputs) => inputs.length), 0);
      await page.click("#lote-bases input");
      const dentro = await page.$eval("#botao-confirmar", (el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      });
      assert.equal(dentro, true);
      await page.type("#input-senha", SENHA_TESTE);
      if (width === 375) {
        await page.select("#lote-horario", "15:00");
        await page.click("#botao-confirmar");
        assert.match(await page.$eval("#lote-confirmacao", (el) => el.textContent), /15:00 \(Brasília\)/);
        await page.click("#botao-confirmar");
        await page.waitForFunction(() => document.querySelector("#lote-titulo").textContent === "Envio em lote agendado");
        assert.match(await page.$eval("#lote-resultados", (el) => el.textContent), /Aguardando horário/);
        assert.deepEqual(chamadas, chaves.slice(0, 2));
        await page.click("#lote-novo");
        assert.equal(await page.$eval("#lote-horario", (el) => el.value), "");
        const agendado = await page.$eval("#lote-agendamentos", (el) => el.options[1].value);
        await page.select("#lote-agendamentos", agendado);
        await page.click("#botao-confirmar");
        await page.waitForFunction(() => !document.querySelector("#lote-progresso").classList.contains("oculto"));
        assert.match(await page.$eval("#lote-resumo", (el) => el.textContent), /15:00/);
        await page.close();
        continue;
      }
      await page.click("#botao-confirmar");
      assert.match(await page.$eval("#lote-confirmacao", (el) => el.textContent), /a instalação selecionada/);
      await page.click("#botao-cancelar");
      assert.equal(await page.$eval("#lote-confirmacao", (el) => el.classList.contains("oculto")), true);
      if (width === 1100) {
        assert.deepEqual(chamadas, []);
        await page.click("#lote-bases label:nth-child(2) input");
        await page.click("#botao-confirmar");
        assert.match(await page.$eval("#lote-confirmacao", (el) => el.textContent), /2 instalações selecionadas/);
        await page.click("#botao-confirmar");
        await page.waitForFunction(() => document.querySelector("#lote-resultados").textContent.includes("Gerando PDF"));
        assert.match(await page.$eval("#lote-resultados", (el) => el.textContent), /Aguardando/);
        liberar();
        await page.waitForFunction(() => document.querySelector("#lote-resumo").textContent.includes("Enviadas com sucesso: 2"));
        assert.deepEqual(chamadas, chaves.slice(0, 2));
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
