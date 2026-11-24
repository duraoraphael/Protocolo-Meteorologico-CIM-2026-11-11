const { renderEmailHeader, renderEmailHeaderStyles, esc } = require("./emailComponents");
const { comunicadoDoDia, paragrafosHtml } = require("./corRioEmail");
const { faixaSimulacaoEmail } = require("./simulationBanner");
const { formatarDataBrasilia } = require("../sources/sourceHealth");
const { ESTAGIOS, TINTA, situacao } = require("../../public/cor-rio-compartilhado");

const VERDE = "#006527";
const BORDA = "#D5DBD8";
const FONTE = "COR-Rio — Centro de Operações e Resiliência (Prefeitura do Rio)";
const ABRANGENCIA = "Município do Rio de Janeiro";
const TITULO_PREVISAO = /^previs[aã]o\s+para\s+os\s+pr[oó]ximos\s+dias\b\s*:?/iu;

// Síntese das orientações ao público, com a referência exibida no e-mail.
const OPERACIONAL = {
  fonte: "https://cor.rio/faq/",
  recomendacoes: {
    1: "Mantenha sua rotina habitual.",
    2: "Acompanhe os canais oficiais do COR-Rio e fique atento às condições da cidade.",
    3: "Evite circular pelas áreas afetadas.",
    4: "Evite deslocamentos pela cidade e procure um local seguro.",
    5: "Fique em local seguro até a situação ser resolvida.",
  },
};
const CALOR = {
  fonte: "https://cor.rio/niveis-de-calor/",
  recomendacoes: {
    1: "Mantenha a rotina habitual.",
    2: "Acompanhe as orientações do COR-Rio sobre exposição ao calor.",
    3: "Acompanhe os avisos reforçados nos canais oficiais do COR-Rio.",
    4: "Adapte atividades expostas ao calor extremo e prefira ambientes refrigerados ou sombreados.",
    5: "Acompanhe os boletins e as orientações do COR-Rio sobre pontos de resfriamento e suspensão de atividades ao ar livre.",
  },
};

function paragrafo(conteudo) {
  return `<p style="margin:0 0 9px;">${conteudo}</p>`;
}

function dataOficial(valor) {
  const data = formatarDataBrasilia(valor);
  return data ? `${data} (Brasília)` : "";
}

function linha(rotulo, valor) {
  return valor ? paragrafo(`<strong>${rotulo}:</strong> ${esc(valor)}`) : "";
}

function linkOficial(url, rotulo) {
  if (!/^https:\/\/cor\.rio\//.test(url || "")) return "";
  return `<a href="${esc(url)}" style="color:${VERDE};font-weight:bold;text-decoration:underline;">${rotulo}</a>`;
}

function quadro(id, titulo, corpo) {
  return `<tr><td class="cor-rio-margem" style="padding:0 20px 14px;">
    <table id="${id}" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="width:100%;table-layout:fixed;border:1px solid ${BORDA};border-collapse:separate;">
      <tr><td bgcolor="#F0F6F2" style="padding:12px 15px;border-bottom:1px solid ${BORDA};">
        <h2 style="margin:0;color:${VERDE};font:bold 16px/22px Arial,sans-serif;">${titulo}</h2>
      </td></tr>
      <tr><td style="padding:15px;color:#1F2A26;font:15px/23px Arial,sans-serif;overflow-wrap:anywhere;word-wrap:break-word;">${corpo}</td></tr>
    </table>
  </td></tr>`;
}

function comunicado(r, s) {
  if (r.publicacoesCorRio) {
    if (r.publicacoesCorRio.status !== 'operacional') return paragrafo('Não foi possível atualizar as publicações nesta consulta.');
    if (!r.publicacoesCorRio.itens.length) return paragrafo('Nenhuma publicação nova ou editada nesta consulta.');
    return r.publicacoesCorRio.itens.map(item => `
      <h3 style="margin:0 0 12px;font:bold 20px/27px Arial,sans-serif;">${esc(item.tituloIntegral || item.titulo)}</h3>
      ${(item.descricaoIntegral || []).map(texto => paragrafo(esc(texto))).join('') || paragrafo(esc(item.resumo || ''))}
      ${linha('Publicação', dataOficial(item.publicadoEm))}
      ${linha('Atualização', dataOficial(item.atualizadoEm))}
      ${linkOficial(item.link, 'Consultar publicação oficial')}
      <hr style="border:0;border-top:1px solid ${BORDA};margin:16px 0;">
    `).join('');
  }
  const item = s.comunicados === "indisponivel" ? null : comunicadoDoDia(s.itens, {
    geradoEm: r.geradoEmISO || Date.now(), integral: true,
  });
  if (!item) {
    return paragrafo(s.comunicados === "indisponivel"
      ? "Comunicado oficial indisponível."
      : "Nenhum comunicado meteorológico do dia disponível.");
  }

  const descricao = item.descricaoIntegral?.length
    ? item.descricaoIntegral.map((bloco) => paragrafo(esc(bloco).replace(TITULO_PREVISAO, "<strong>$&</strong>"))).join("")
    : paragrafosHtml(item.paragrafos || [], TITULO_PREVISAO);
  const link = linkOficial(item.link, "Consultar publicação oficial");
  return `<p style="margin:0 0 5px;color:${VERDE};font-weight:bold;">Título oficial</p>
    <h3 style="margin:0 0 15px;font:bold 20px/27px Arial,sans-serif;">${esc(item.tituloIntegral || item.titulo)}</h3>
    ${descricao ? `<p style="margin:0 0 6px;color:${VERDE};font-weight:bold;">Descrição oficial</p>${descricao}` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;"><tr>
      <td style="padding:12px 0 0;border-top:1px solid ${BORDA};font:14px/21px Arial,sans-serif;">
        ${linha("Abrangência", ABRANGENCIA)}
        ${linha("Publicação", dataOficial(item.publicadoEm))}
        ${linha("Fonte", FONTE)}
        ${link ? `<div style="padding-top:3px;">${link}</div>` : ""}
      </td>
    </tr></table>`;
}

function quadroEstagio({ id, titulo, nivel, rotulo, cor, tinta = TINTA, dados, desatualizado, orientacao, tipo }) {
  if (!nivel) return quadro(id, titulo, paragrafo("Estágio indisponível."));

  const recomendacao = orientacao.recomendacoes[nivel];
  const mensagens = new Set((dados.mensagens || []).filter((mensagem) => mensagem.trim()));
  const detalhes = [
    desatualizado ? paragrafo("Último estágio informado pelo COR-Rio.") : "",
    linha("Vigente desde", dataOficial(dados.vigenteDesde)),
    ...Array.from(mensagens, (mensagem) => paragrafo(esc(mensagem))),
  ].join("");
  return quadro(id, titulo, `
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td class="cor-rio-nivel" bgcolor="${cor}" style="padding:7px 12px;background:${cor};color:${tinta};font:bold 15px/21px Arial,sans-serif;">${esc(rotulo)}</td>
    </tr></table>
    ${detalhes ? `<div style="padding-top:10px;">${detalhes}</div>` : ""}
    ${recomendacao ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr><td height="10" style="height:10px;font-size:0;line-height:10px;">&nbsp;</td></tr>
      <tr><td bgcolor="#F3F7F5" style="padding:11px 12px;font:14px/21px Arial,sans-serif;">
        <h3 style="margin:0 0 6px;color:${VERDE};font:bold 13px/19px Arial,sans-serif;">RECOMENDAÇÕES — ${tipo}</h3>
        ${paragrafo(esc(recomendacao))}
        ${linkOficial(orientacao.fonte, "Orientações do COR-Rio")}
      </td></tr>
    </table>` : ""}`);
}

function renderCorRioStandaloneEmail(r) {
  const estado = r.corRio;
  const s = situacao(estado);
  const dataEdicao = formatarDataBrasilia(r.geradoEmISO)?.split(" ")[0];
  const contexto = ["COR-RIO — RJ", r.dataFormatadaLonga || dataEdicao].filter(Boolean).join(" — ");
  const operacional = quadroEstagio({
    id: "cor-rio-operacional", titulo: "ESTÁGIO OPERACIONAL DA CIDADE", tipo: "ESTÁGIO OPERACIONAL",
    nivel: s.nivel, rotulo: `Estágio ${s.nivel}`,
    cor: s.estagio?.cor, dados: estado?.estagio?.dados,
    desatualizado: s.estagioDesatualizado, orientacao: OPERACIONAL,
  });
  const calor = quadroEstagio({
    id: "cor-rio-calor", titulo: "ESTÁGIO DE CALOR — COR-RIO", tipo: "ESTÁGIO DE CALOR",
    nivel: s.nivelCalor, rotulo: `Calor ${s.nivelCalor}`,
    cor: s.nivelCalor === 1 ? ESTAGIOS[1].cor : VERDE,
    tinta: s.nivelCalor === 1 ? TINTA : "#FFFFFF", dados: estado?.calor?.dados,
    desatualizado: s.calorDesatualizado, orientacao: CALOR,
  });
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only">
  <title>AVISO COR-RIO</title>
  ${renderEmailHeaderStyles()}
  <style>@media only screen and (max-width:640px) { .cor-rio-margem { padding-left:10px !important; padding-right:10px !important; } }</style>
</head>
<body bgcolor="#F3F6F4" style="margin:0;padding:0;background:#F3F6F4;color:#222222;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F3F6F4" style="width:100%;background:#F3F6F4;">
    <tr><td align="center" style="padding:12px 6px;">
      <!--[if mso]><table role="presentation" width="700" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
      <table class="cim-email-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="width:100%;max-width:700px;background:#FFFFFF;border:1px solid ${BORDA};">
        ${faixaSimulacaoEmail(r)}
        ${renderEmailHeader({ titulo: "AVISO COR-RIO", contexto, cor: VERDE })}
        <tr><td height="16" style="height:16px;font-size:0;line-height:16px;">&nbsp;</td></tr>
        ${quadro("cor-rio-comunicado", "COMUNICADO OFICIAL COR-RIO", comunicado(r, s))}
        ${operacional}
        ${calor}
        <tr><td align="center" bgcolor="#F0F6F2" style="padding:12px 20px;border-top:1px solid ${BORDA};color:#46554E;text-align:center;font:12px/18px Arial,sans-serif;">
          Conteúdo oficial consultado no COR-RIO e distribuído pelo Centro Integrado de Monitoramento — COMPARTILHADO.
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { renderCorRioStandaloneEmail };
