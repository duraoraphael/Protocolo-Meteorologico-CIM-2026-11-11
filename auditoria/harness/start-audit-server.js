// Harness de AUDITORIA: sobe o app real (criarApp) SEM ler o .env, SEM agendadores
// e com o envio de relatorio SIMULADO (nenhum e-mail/SharePoint e disparado).
// Cadastro de responsaveis aponta para arquivo descartavel (nao toca data/).
const os = require("os"), path = require("path"), fs = require("fs"), http = require("http");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cim-audit-"));
process.env.RESPONSAVEIS_ARQUIVO = path.join(tmp, "responsaveis.json");
const { criarApp } = require("../../server.js");
const SENHA = "senha-de-auditoria-forte-123";
let chamadasPipeline = 0;
const app = criarApp({
  senhaPainel: SENHA,
  pastaRelatorios: tmp,
  executarPipelineRelatorio: async (arg) => {
    chamadasPipeline++;
    await new Promise((r) => setTimeout(r, 1500));
    return { arquivoPdf: null, envio: { destinatarios: ["simulado@example.test"] }, report: { geradoEmISO: new Date().toISOString(), avisosColeta: [], snapshotId: null } , _simulado: arg };
  },
});
app.get("/__audit/chamadas", (q, r) => r.json({ chamadasPipeline }));
const porta = Number(process.env.AUDIT_PORT || 3999);
http.createServer(app).listen(porta, "127.0.0.1", () => console.log(`[AUDIT] http://127.0.0.1:${porta} senha=${SENHA} tmp=${tmp}`));
