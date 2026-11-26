const { renderEmailHeader, renderEmailHeaderStyles, esc } = require('./emailComponents');
const { faixaSimulacaoEmail } = require('./simulationBanner');
const { formatarDataBrasilia } = require('../sources/sourceHealth');
const { TINTA, NEUTRO, situacao } = require('../../public/cor-rio-compartilhado');
const ORIENTACOES = require('../config/corRioOrientacoes.json');
const VERDE = '#006527';
const BORDA = '#D5DBD8';

function dataOficial(valor) {
  const data = formatarDataBrasilia(valor);
  return data ? `${data} (Brasília)` : '';
}
function paragrafo(texto) { return `<p style="margin:0 0 9px;">${texto}</p>`; }
function linkOficial(url, rotulo) {
  try {
    const destino = new URL(url);
    if (destino.protocol !== 'https:' || destino.hostname !== 'cor.rio' || destino.username || destino.password || destino.port) return '';
    return `<a href="${esc(destino.href)}" style="color:${VERDE};font-weight:bold;text-decoration:underline;">${esc(rotulo)}</a>`;
  } catch { return ''; }
}
function assuntoCorRio(r) {
  const s = situacao(r.corRio);
  return `COR-RIO| Estágio ${s.nivel || 'indisponível'} | Calor ${s.nivelCalor || 'indisponível'}`;
}
function vigenciaHtml(r, parte, dados) {
  const oficial = dataOficial(dados.vigenteDesde);
  if (oficial) return paragrafo(`<strong>Vigente desde:</strong> ${esc(oficial)}`);
  const mudou = (r.corRioMudancas || []).some(m => m.parte === parte && m.atual === dados.nivel);
  const identificada = mudou && dataOficial(r.corRioIdentificadoEm);
  if (identificada) return paragrafo(`<strong>Alteração identificada em:</strong> ${esc(identificada)}`)
    + paragrafo('Horário de início oficial ainda não confirmado nesta consulta. A fonte será consultada novamente automaticamente.');
  return paragrafo('<strong>Vigência:</strong> início oficial ainda não disponível nesta consulta.');
}
function quadroEstagio(r, parte, s) {
  const operacional = parte === 'estagio';
  const id = operacional ? 'cor-rio-operacional' : 'cor-rio-calor';
  const titulo = operacional ? 'ESTÁGIO OPERACIONAL DA CIDADE' : 'ESTÁGIO DE CALOR';
  const prefixo = operacional ? 'Estágio' : 'Calor';
  const nivel = operacional ? s.nivel : s.nivelCalor;
  const dados = r.corRio?.[parte]?.dados;
  const cor = (operacional ? s.estagio?.cor : s.calor?.cor) || NEUTRO.cor;
  const mapa = r.corRioOrientacoes || ORIENTACOES;
  const chave = operacional ? 'operacional' : 'calor';
  const textos = mapa[chave]?.[nivel]?.recomendacoes;
  const fonte = mapa.fontes?.[chave] || ORIENTACOES.fontes[chave];
  const desatualizado = operacional ? s.estagioDesatualizado : s.calorDesatualizado;
  const recomendacoes = nivel > 1 ? `
    <table data-cor-recomendacoes="${parte}" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin-top:14px;">
      <tr><td bgcolor="#F3F7F5" style="padding:12px;font:14px/21px Arial,sans-serif;">
        <h3 style="margin:0 0 9px;color:${VERDE};font:bold 13px/19px Arial,sans-serif;">RECOMENDAÇÕES OFICIAIS — ${operacional ? 'ESTÁGIO OPERACIONAL' : 'CALOR'}</h3>
        ${Array.isArray(textos) && textos.length ? textos.map(t => paragrafo(esc(t))).join('') : paragrafo('Recomendações oficiais indisponíveis nesta consulta.')}
        ${linkOficial(fonte, 'Orientações oficiais do COR-Rio')}
      </td></tr>
    </table>` : '';
  return `<tr><td class="cor-rio-margem" style="padding:0 20px 16px;">
    <table id="${id}" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF"
      style="width:100%;table-layout:fixed;border:1px solid ${BORDA};border-collapse:separate;">
      <tr><td bgcolor="#F0F6F2" style="padding:12px 15px;border-bottom:1px solid ${BORDA};">
        <h2 style="margin:0;color:${VERDE};font:bold 16px/22px Arial,sans-serif;">${titulo}</h2>
      </td></tr>
      <tr><td style="padding:15px;color:#1F2A26;font:15px/23px Arial,sans-serif;overflow-wrap:anywhere;word-wrap:break-word;">
        ${nivel ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="cor-rio-nivel" bgcolor="${cor}" style="padding:7px 12px;background:${cor};color:${TINTA};font:bold 15px/21px Arial,sans-serif;">${prefixo} ${nivel}</td></tr></table>` : paragrafo('Estágio indisponível. Nenhum nível é presumido.')}
        ${desatualizado ? paragrafo('<strong>Dados desatualizados.</strong> Último estágio informado pelo COR-Rio.') : ''}
        ${nivel ? `<div style="padding-top:10px;">${vigenciaHtml(r, parte, dados)}</div>` : ''}
        ${recomendacoes}
      </td></tr>
    </table>
  </td></tr>`;
}
function renderCorRioStandaloneEmail(r) {
  const s = situacao(r.corRio);
  const dataEmissao = r.dataFormatadaLonga || (Number.isFinite(Date.parse(r.geradoEmISO))
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'America/Sao_Paulo' }).format(new Date(r.geradoEmISO))
    : r.dataFormatadaCurta || '');
  const contexto = [dataEmissao, 'RJ'].filter(Boolean).join(' - ');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>AVISO COR-RIO</title>
    ${renderEmailHeaderStyles()}<style>@media only screen and (max-width:640px){.cor-rio-margem{padding-left:10px !important;padding-right:10px !important;}}</style></head>
  <body bgcolor="#F3F6F4" style="margin:0;padding:0;background:#F3F6F4;color:#222222;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F3F6F4" style="width:100%;background:#F3F6F4;"><tr><td align="center" style="padding:12px 6px;">
      <!--[if mso]><table role="presentation" width="700" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
      <table class="cim-email-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="width:100%;max-width:700px;background:#FFFFFF;border:1px solid ${BORDA};">
        ${faixaSimulacaoEmail(r)}${renderEmailHeader({ titulo: 'AVISO COR-RIO', contexto, cor: VERDE })}
        <tr><td style="padding:14px 20px;color:#46554E;font:12px/19px Arial,sans-serif;">
          Emissão: ${esc(dataOficial(r.geradoEmISO))}
          ${r.corRioIdentificadoEm ? `<br>Situação identificada em: ${esc(dataOficial(r.corRioIdentificadoEm))}` : ''}
        </td></tr>
        ${quadroEstagio(r, 'estagio', s)}${quadroEstagio(r, 'calor', s)}
        <tr><td align="center" bgcolor="#F0F6F2" style="padding:12px 20px;border-top:1px solid ${BORDA};color:#46554E;font:12px/18px Arial,sans-serif;">
          Fonte oficial: ${linkOficial('https://cor.rio/', 'COR-Rio — Centro de Operações e Resiliência')}<br>
          Município do Rio de Janeiro. Distribuição: Centro Integrado de Monitoramento — COMPARTILHADO.
        </td></tr>
      </table><!--[if mso]></td></tr></table><![endif]-->
    </td></tr></table></body></html>`;
}
module.exports = { renderCorRioStandaloneEmail, assuntoCorRio };
