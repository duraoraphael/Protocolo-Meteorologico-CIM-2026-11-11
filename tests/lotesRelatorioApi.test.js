const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { setTimeout: esperar } = require("node:timers/promises");
const { subirApp, SENHA_TESTE } = require("./helpers/servidor");
const { criarLotesRelatorio } = require("../src/logic/lotesRelatorio");
const { CIDADES } = require("../src/config/cities");

async function postar(base, caminho, dados = {}, senha = SENHA_TESTE) {
  const resposta = await fetch(base + "/api/relatorios/lotes" + caminho, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...dados, senha }),
  });
  return { status: resposta.status, corpo: await resposta.json() };
}

async function acompanhar(base, id, condicao) {
  for (let i = 0; i < 100; i++) {
    const { corpo } = await postar(base, `/${id}/status`);
    if (condicao(corpo.lote)) return corpo.lote;
    await esperar(10);
  }
  assert.fail("O lote não atingiu o estado esperado.");
}

test("lote autenticado registra progresso, isola falhas e repete apenas envios seguros", async (t) => {
  const pastaLotes = fs.mkdtempSync(path.join(os.tmpdir(), "cim-lotes-"));
  const chamadas = [];
  let liberar;
  const pausa = new Promise((resolve) => { liberar = resolve; });
  const srv = await subirApp({
    pastaLotes,
    listarDestinatariosLote: (chave) => chave === "santos" ? [] : [`${chave}@example.test`],
    executarPipelineRelatorio: async (opcoes) => {
      const { cidadeChave, aoMudarEtapa, somenteDestinatariosCadastrados } = opcoes;
      assert.equal(somenteDestinatariosCadastrados, true);
      chamadas.push(cidadeChave);
      aoMudarEtapa("gerando_pdf");
      if (cidadeChave === "macae" && chamadas.filter((c) => c === "macae").length === 1) {
        throw Object.assign(new Error("dado interno example@test.invalid"), { etapa: "pdf" });
      }
      aoMudarEtapa("enviando_email");
      if (cidadeChave === "rio_de_janeiro") await pausa;
      if (cidadeChave === "manaus") throw new Error("Timeout após o envio.");
      return { envio: { aceitos: 1, rejeitados: 0 } };
    },
  });
  t.after(async () => {
    liberar();
    await srv.fechar();
    fs.rmSync(pastaLotes, { recursive: true, force: true });
  });
  const id = randomUUID();
  const pedido = { id, cidades: ["rio_de_janeiro", "macae", "santos", "manaus"] };
  assert.equal((await postar(srv.base, "", pedido, "incorreta")).status, 401);
  assert.equal((await postar(srv.base, "", { id, cidades: ["cor_rio"] })).status, 400);
  assert.equal((await postar(srv.base, "", pedido)).status, 202);
  assert.equal((await postar(srv.base, "", pedido)).status, 202);
  assert.equal((await postar(srv.base, "", { ...pedido, id: randomUUID() })).status, 409);
  assert.equal((await postar(srv.base, `/${id}/status`, {}, "incorreta")).status, 401);
  const ativo = await acompanhar(srv.base, id, (lote) => lote.itens[0].status === "enviando_email");
  assert.deepEqual(ativo.itens.map((item) => item.status), ["enviando_email", "aguardando", "aguardando", "aguardando"]);
  liberar();
  const concluido = await acompanhar(srv.base, id, (lote) => lote.concluidoEm);
  assert.deepEqual(concluido.itens.map((item) => item.status), ["enviado", "falha", "falha", "falha"]);
  assert.deepEqual(concluido.itens.map((item) => item.repetivel), [false, true, true, false]);
  assert.doesNotMatch(JSON.stringify(concluido), /example\.test|test\.invalid|senha-de-teste/);
  const tentativaId = randomUUID();
  assert.equal((await postar(srv.base, `/${id}/repetir`, { tentativaId })).status, 202);
  await acompanhar(srv.base, id, (lote) => lote.concluidoEm && lote.itens[1].status === "enviado");
  assert.equal((await postar(srv.base, `/${id}/repetir`, { tentativaId })).status, 202);
  assert.deepEqual(chamadas, ["rio_de_janeiro", "macae", "manaus", "macae"]);
  assert.ok(fs.existsSync(path.join(pastaLotes, `${id}.json`)));
});

test("reinício preserva envios confirmados e só libera tarefas interrompidas antes do SMTP", async (t) => {
  const pastaLotes = fs.mkdtempSync(path.join(os.tmpdir(), "cim-lote-recuperado-"));
  const id = randomUUID();
  const cidades = ["macae", "santos", "manaus"];
  const iniciadoEm = "2026-11-18T12:00:00Z";
  fs.writeFileSync(path.join(pastaLotes, `${id}.json`), JSON.stringify({
    id, iniciadoEm, concluidoEm: null, total: 3,
    tentativas: [{ id, iniciadaEm: iniciadoEm, cidades }],
    itens: cidades.map((chave, i) => ({
      chave, status: ["enviado", "enviando_email", "gerando_pdf"][i],
      email: i === 0 ? "aceito" : "pendente", repetivel: false,
    })),
  }));
  const chamadas = [];
  const srv = await subirApp({
    pastaLotes,
    listarDestinatariosLote: () => ["mock@example.test"],
    executarPipelineRelatorio: async ({ cidadeChave }) => {
      chamadas.push(cidadeChave);
      return { envio: { aceitos: 1, rejeitados: 0 } };
    },
  });
  t.after(async () => {
    await srv.fechar();
    fs.rmSync(pastaLotes, { recursive: true, force: true });
  });
  const { corpo } = await postar(srv.base, `/${id}/status`);
  assert.deepEqual(corpo.lote.itens.map((item) => item.status), ["enviado", "falha", "falha"]);
  assert.equal(corpo.lote.itens[1].email, "incerto");
  assert.deepEqual(corpo.lote.itens.map((item) => item.repetivel), [false, false, true]);
  assert.equal((await postar(srv.base, "", { id, cidades })).status, 202);
  assert.deepEqual(chamadas, []);
  await postar(srv.base, `/${id}/repetir`, { tentativaId: randomUUID() });
  const final = await acompanhar(srv.base, id, (lote) => lote.concluidoEm && lote.itens[2].status === "enviado");
  assert.deepEqual(chamadas, ["manaus"]);
  assert.equal(final.tentativas.length, 2);
});

test("lote agendado usa Brasília, restaura o horário e evita enviar uma edição diária duplicada", async (t) => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "cim-lote-horario-"));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  const id = randomUUID();
  let instante = new Date("2026-11-18T12:00:00Z");
  const tarefas = [];
  const chamadas = [];
  const opcoes = {
    pasta, cidades: CIDADES, relogio: () => instante,
    agendar: (fn, atraso) => { tarefas.push({ fn, atraso }); },
    listarDestinatarios: () => ["mock@example.test"],
    geracaoIndividualAtiva: () => false,
    publicar() {},
    carregarEdicoes: () => ({ "2026-11-19|macae|08:00": {} }),
    adquirir: () => ({ adquirida: true, concluir() {}, liberar() {} }),
    executar: async (opcoesEnvio) => {
      chamadas.push(opcoesEnvio);
      return { envio: { aceitos: 1, rejeitados: 0 } };
    },
  };
  const servico = criarLotesRelatorio(opcoes);
  assert.throws(() => servico.criar(id, ["macae"], "09:00"), { status: 400 });
  const lote = servico.criar(id, ["macae", "santos"], "08:00");
  assert.equal(lote.agendadoPara, "2026-11-19T11:00:00.000Z");
  assert.equal(servico.criar(randomUUID(), ["macae"], "15:00").agendadoPara, "2026-11-18T18:00:00.000Z");
  assert.equal(servico.obter(id).agendado, true);
  assert.equal(chamadas.length, 0);
  tarefas.length = 0;
  const reiniciado = criarLotesRelatorio(opcoes);
  reiniciado.restaurarAgendamentos();
  assert.equal(tarefas.length, 2);
  const proximoDia = tarefas.find((tarefa) => tarefa.atraso === 23 * 60 * 60 * 1000);
  instante = new Date(lote.agendadoPara);
  proximoDia.fn();
  for (let i = 0; i < 30 && !reiniciado.obter(id).concluidoEm; i++) await esperar(10);
  assert.deepEqual(reiniciado.obter(id).itens.map((item) => item.status), ["edicao_existente", "enviado"]);
  assert.deepEqual(chamadas.map((item) => [item.cidadeChave, item.horarioAgendado]), [["santos", "08:00"]]);
});
