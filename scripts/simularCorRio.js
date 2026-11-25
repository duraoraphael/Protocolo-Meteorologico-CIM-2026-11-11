#!/usr/bin/env node
// Simulação isolada: não carrega .env, não conecta a APIs/SMTP e não usa data/.
const fs = require('node:fs');
const path = require('node:path');
const { criarMonitorCorRio } = require('../src/logic/corRioAlertMonitor');
const { renderCorRioStandaloneEmail, assuntoCorRio } = require('../src/render/corRioStandaloneEmail');
const { emailComLogosEmbutidas } = require('../src/config/headerAssets');

const argumento = (nome, padrao) => process.argv.find(a => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) || padrao;
const numero = (nome, padrao) => {
  const valor = Number(argumento(nome, padrao));
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) throw new Error(`${nome}: use um nível de 1 a 5.`);
  return valor;
};

async function main() {
  const cenario = argumento('cenario', 'simultanea');
  const cenarios = ['agravamento', 'reducao', 'simultanea', 'sem-alteracao', 'api-indisponivel', 'falha-envio', 'reinicio'];
  if (!cenarios.includes(cenario)) throw new Error(`Cenários: ${cenarios.join(', ')}`);
  const pasta = path.resolve('output', 'simulacoes-cor-rio', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(pasta, { recursive: true });
  const niveis = { estagio: numero('anterior-operacional', cenario === 'reducao' ? 4 : 1),
    calor: numero('anterior-calor', cenario === 'reducao' ? 5 : 1) };
  const atual = { estagio: numero('operacional', cenario === 'reducao' ? 1 : 3),
    calor: numero('calor', cenario === 'reducao' ? 1 : 4) };
  const resultados = [];
  let falhaApi = false, falhaEnvio = false;
  const report = () => ({ simulado: true, geradoEmISO: new Date().toISOString(),
    dataFormatadaCurta: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    corRio: Object.fromEntries(Object.entries(niveis).map(([parte, nivel]) => [parte, {
      status: 'operacional', consultadoEm: new Date().toISOString(), dados: { nivel, vigenteDesde: new Date().toISOString() },
    }])) });
  const opcoes = { arquivo: path.join(pasta, 'estado-simulado.json'), logger: { log() {}, error() {} },
    coletar: async () => { if (falhaApi) throw new Error('API indisponível (simulação)'); return { report: report() }; },
    prepararEnvio: e => ({ ...e.report, simulado: true, corRioMudancas: e.mudancas, corRioEventoId: e.id, corRioIdentificadoEm: e.identificadoEm }),
    enviar: async r => {
      if (falhaEnvio) throw new Error('SMTP indisponível (simulação)');
      const nome = `aviso-${resultados.length + 1}.html`;
      fs.writeFileSync(path.join(pasta, nome), emailComLogosEmbutidas(renderCorRioStandaloneEmail(r)));
      resultados.push({ evento: r.corRioEventoId, assunto: assuntoCorRio(r), arquivo: nome });
      return { messageId: `simulado-${r.corRioEventoId}`, destinatarios: [] };
    } };
  let monitor = criarMonitorCorRio(opcoes);
  await monitor(); // Referência inicial silenciosa.
  if (cenario !== 'sem-alteracao') {
    niveis.estagio = atual.estagio;
    if (cenario !== 'agravamento') niveis.calor = atual.calor;
  }
  falhaApi = cenario === 'api-indisponivel';
  falhaEnvio = ['falha-envio', 'reinicio'].includes(cenario);
  try { await monitor(); } catch (erro) { console.log(erro.message); }
  if (falhaEnvio) {
    falhaEnvio = false;
    if (cenario === 'reinicio') monitor = criarMonitorCorRio(opcoes);
    await monitor();
  }
  if (falhaApi) { falhaApi = false; await monitor(); }
  await monitor(); // Permanência não duplica o envio.
  fs.writeFileSync(path.join(pasta, 'previa.html'), emailComLogosEmbutidas(renderCorRioStandaloneEmail(report())));
  fs.writeFileSync(path.join(pasta, 'resultado.json'), JSON.stringify({ simulado: true, cenario, resultados }, null, 2));
  console.log(JSON.stringify({ simulado: true, cenario, enviosReais: 0, eventosSimulados: resultados.length, pasta }, null, 2));
}
main().catch(erro => { console.error(erro.message); process.exitCode = 1; });
