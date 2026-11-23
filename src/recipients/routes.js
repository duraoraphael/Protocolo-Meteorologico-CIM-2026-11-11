const central = require('./management');
const planilhas = require('./spreadsheets');
const { erroEntrada, validarEmail } = require('../config/recipients');

function registrarRotasDestinatarios(app, { verificarSenha, responderErro }) {
  app.post('/api/destinatarios/:operacao', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const acesso = await verificarSenha(req);
    if (!acesso.ok) return res.status(acesso.status).json({ ok: false, erro: acesso.erro });
    try {
      const corpo = req.body;
      if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw erroEntrada('Requisição inválida.');
      const filtros = corpo.filtros === undefined ? {} : corpo.filtros;
      if (!filtros || typeof filtros !== 'object' || Array.isArray(filtros)) throw erroEntrada('Filtros inválidos.');
      let dados;
      switch (req.params.operacao) {
        case 'consultar': dados = central.consultar(filtros); break;
        case 'previa': dados = central.previa(corpo); break;
        case 'executar': dados = { resultado: central.executar(corpo) }; break;
        case 'historico': dados = central.historico(filtros); break;
        case 'importar': {
          const registros = await planilhas.importar(corpo);
          dados = central.previa({ registros });
          break;
        }
        case 'exportar':
        case 'modelo': {
          const formato = corpo.formato || 'csv';
          if (!['csv', 'xlsx'].includes(formato)) throw erroEntrada('Formato inválido.');
          let buffer;
          if (req.params.operacao === 'modelo') buffer = await planilhas.modelo(formato);
          else {
            let pessoas = central.filtrar(filtros).itens;
            if (corpo.emails !== undefined) {
              if (!Array.isArray(corpo.emails) || !corpo.emails.length || corpo.emails.length > 500) throw erroEntrada('Seleção inválida.');
              const emails = new Set(corpo.emails.map(validarEmail));
              // Seleção pode atravessar páginas e filtros.
              pessoas = central.filtrar({}).itens.filter(p => emails.has(p.email));
              if (pessoas.length !== emails.size) throw erroEntrada('Atualize a seleção antes de exportar.');
            }
            buffer = await planilhas.exportar(pessoas, formato);
          }
          res.type(formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.set('Content-Disposition', `attachment; filename="${req.params.operacao === 'modelo' ? 'modelo' : 'destinatarios'}.${formato}"`);
          return res.send(buffer);
        }
        default: return res.status(404).json({ ok: false, erro: 'Não encontrado.' });
      }
      res.json({ ok: true, ...dados });
    } catch (erro) { responderErro(res, erro, 'Operação na central de destinatários'); }
  });
}
module.exports = { registrarRotasDestinatarios };
