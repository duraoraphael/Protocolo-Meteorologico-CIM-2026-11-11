const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { dataBrasilia, lerEstado, adquirirExecucao } = require("./scheduledReport");
const { partesNoFuso, instanteNoFuso, adicionarDias, validadeInformativo, informativoVigente } = require("./informativoValidity");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const agora = () => new Date().toISOString();

function erroLote(status, mensagem) {
  return Object.assign(new Error(mensagem), { status, publico: true });
}

function falha(item, mensagem, repetivel) {
  item.status = "falha";
  item.erro = mensagem;
  item.repetivel = repetivel;
  item.concluidoEm = agora();
}

function concluir(lote) {
  lote.concluidoEm = agora();
  lote.tentativas.at(-1).concluidaEm = lote.concluidoEm;
}

function proximoHorario(horario, instante) {
  const hora = Number(horario.slice(0, 2));
  const dia = partesNoFuso(instante);
  const noDia = (data) => instanteNoFuso({ ...data, hour: hora, minute: 0, second: 0 });
  const hoje = noDia(dia);
  return (hoje >= instante ? hoje : noDia(adicionarDias(dia, 1))).toISOString();
}

function criarLotesRelatorio({
  pasta, cidades, executar, listarDestinatarios, geracaoIndividualAtiva, publicar,
  relogio = () => new Date(), agendar = setTimeout, adquirir = adquirirExecucao, carregarEdicoes = lerEstado,
}) {
  let ativo = null;
  const agendados = new Set();
  const arquivo = (id) => path.join(pasta, `${id}.json`);

  function salvar(lote) {
    fs.mkdirSync(pasta, { recursive: true });
    const destino = arquivo(lote.id);
    const temporario = `${destino}.${process.pid}.tmp`;
    fs.writeFileSync(temporario, JSON.stringify(lote), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporario, destino);
  }

  function consultar(id) {
    if (typeof id !== "string" || !UUID.test(id)) throw erroLote(400, "Identificador de lote inválido.");
    if (ativo?.id === id) return ativo;
    let lote;
    try {
      lote = JSON.parse(fs.readFileSync(arquivo(id), "utf8"));
    } catch (erro) {
      if (erro.code === "ENOENT") return null;
      throw erro;
    }
    if (!lote.concluidoEm && !lote.agendado) {
      for (const item of lote.itens) {
        if (["enviado", "falha", "edicao_existente"].includes(item.status)) continue;
        const incerto = item.status === "enviando_email";
        if (incerto) item.email = "incerto";
        falha(item, incerto
          ? "Processamento interrompido durante o envio. Confirme a entrega no relay SMTP."
          : "Processamento interrompido antes do envio.", !incerto);
      }
      concluir(lote);
      salvar(lote);
    }
    return lote;
  }

  async function enviarItem(lote, item) {
    item.iniciadoEm = agora();
    let trava;
    try {
      if (lote.agendadoPara) {
        if (!edicaoPodeSerEnviada(lote, relogio())) {
          falha(item, "A edição agendada perdeu a validade. Envie um novo lote se necessário.", false);
          return;
        }
        const chave = `${dataBrasilia(new Date(lote.agendadoPara))}|${item.chave}|${lote.horario}`;
        if (carregarEdicoes()[chave]) {
          item.status = "edicao_existente";
          item.concluidoEm = agora();
          return;
        }
        trava = adquirir(chave);
        if (!trava.adquirida) {
          item.status = "edicao_existente";
          item.concluidoEm = agora();
          return;
        }
      }
      if (!listarDestinatarios(item.chave).length) {
        falha(item, "Nenhum destinatário cadastrado para esta instalação.", true);
        return;
      }
      item.status = "coletando";
      salvar(lote);
      const resultado = await executar({
        cidadeChave: item.chave,
        enviarEmail: true,
        tipoEnvio: "informativo",
        somenteDestinatariosCadastrados: true,
        ...(lote.horario ? { horarioAgendado: lote.horario } : {}),
        aoMudarEtapa(status) {
          item.status = status;
          if (status === "enviando_email") item.pdf = "gerado";
          salvar(lote);
        },
      });
      item.pdf = "gerado";
      const { aceitos, rejeitados } = resultado.envio || {};
      if (aceitos > 0 && rejeitados > 0) {
        item.email = "parcial";
        falha(item, "O relay aceitou parte dos destinatários. Confira a entrega antes de qualquer reenvio.", false);
      } else if (aceitos > 0 && rejeitados === 0) {
        item.email = "aceito";
        item.status = "enviado";
        item.concluidoEm = agora();
      } else if (aceitos === 0) {
        item.email = "recusado";
        falha(item, "O relay não aceitou nenhum destinatário.", true);
      } else {
        item.email = "incerto";
        falha(item, "O relay não confirmou a aceitação. Confira a entrega antes de qualquer reenvio.", false);
      }
      try {
        publicar(resultado);
      } catch {
        console.warn(`[LOTE] ${lote.id} ${item.chave}: falha ao atualizar o painel.`);
      }
    } catch (erro) {
      if (item.status === "enviando_email") {
        const codigo = erro.cause?.responseCode;
        const recusado = Number.isInteger(codigo) && codigo >= 400 && codigo < 600;
        item.email = recusado ? "recusado" : "incerto";
        falha(item, recusado
          ? `O relay recusou o envio (SMTP ${codigo}).`
          : "O envio não foi confirmado. Confira a entrega no relay SMTP.", recusado);
      } else {
        if (erro.etapa === "pdf") item.pdf = "falha";
        if (erro.etapa === "email") item.pdf = "gerado";
        const mensagem = {
          weather: "Falha ao obter dados meteorológicos.",
          pdf: "Falha ao gerar ou gravar o PDF.",
          email: "Falha ao preparar o envio. Confira os destinatários cadastrados.",
        }[erro.etapa];
        falha(item, mensagem || "Falha no processamento antes do envio.", true);
      }
    } finally {
      if (trava?.adquirida) {
        if (["aceito", "incerto", "parcial"].includes(item.email)) {
          trava.concluir(item.email === "aceito" ? "enviado" : item.email);
        } else {
          trava.liberar();
        }
      }
    }
  }

  async function processar(lote) {
    try {
      for (const item of lote.itens.filter((registro) => registro.status === "aguardando")) {
        await enviarItem(lote, item);
        salvar(lote);
        console.info(`[LOTE] ${lote.id} ${item.chave}: ${item.status} (PDF: ${item.pdf}, e-mail: ${item.email}).`);
      }
      concluir(lote);
      salvar(lote);
    } catch {
      console.error(`[LOTE] ${lote.id}: falha ao gravar o progresso. Processamento interrompido.`);
    } finally {
      ativo = null;
    }
  }

  function verificarDisponibilidade() {
    if (ativo || geracaoIndividualAtiva()) {
      throw erroLote(409, "Já existe uma geração de relatório em andamento. Aguarde a conclusão.");
    }
  }

  function iniciarTentativa(lote, tentativaId, itens, programada = false) {
    if (!programada) verificarDisponibilidade();
    const iniciadaEm = agora();
    lote.concluidoEm = null;
    lote.tentativas.push({
      id: tentativaId, iniciadaEm, concluidaEm: null, cidades: itens.map((item) => item.chave),
      anteriores: itens.filter((item) => item.status === "falha").map((item) => ({ ...item })),
    });
    for (const item of itens) {
      Object.assign(item, {
        status: "aguardando", iniciadoEm: null, concluidoEm: null, erro: null,
        repetivel: false, pdf: "pendente", email: "pendente",
      });
    }
    salvar(lote);
    console.info(`[LOTE] ${lote.id} tentativa ${tentativaId}: ${itens.length} instalação(ões).`);
    if (programada) {
      programar(lote);
      return lote;
    }
    executarLote(lote);
    return lote;
  }

  function executarLote(lote) {
    ativo = lote;
    setImmediate(() => { void processar(lote); });
  }

  function edicaoPodeSerEnviada(lote, instante) {
    const dataEdicao = new Date(lote.agendadoPara);
    return dataBrasilia(instante) === dataBrasilia(dataEdicao)
      && informativoVigente(validadeInformativo(lote.horario, dataEdicao), instante);
  }

  function programar(lote) {
    if (agendados.has(lote.id)) return;
    agendados.add(lote.id);
    function agendarVerificacao(atraso) {
      agendar(verificarHorario, atraso)?.unref?.();
    }
    function verificarHorario() {
      try {
        const instante = relogio();
        const restante = Date.parse(lote.agendadoPara) - instante.getTime();
        if (restante > 0) return agendarVerificacao(restante);
        if (!edicaoPodeSerEnviada(lote, instante)) {
          for (const item of lote.itens) falha(item, "A edição agendada perdeu a validade. Envie um novo lote se necessário.", false);
          lote.agendado = false;
          concluir(lote);
          salvar(lote);
          agendados.delete(lote.id);
          return;
        }
        if (ativo || geracaoIndividualAtiva()) return agendarVerificacao(5000);
        lote.agendado = false;
        salvar(lote);
        agendados.delete(lote.id);
        executarLote(lote);
      } catch {
        console.error(`[LOTE] ${lote.id}: não foi possível iniciar a edição agendada.`);
        agendarVerificacao(30_000);
      }
    }
    agendarVerificacao(Math.max(0, Date.parse(lote.agendadoPara) - relogio().getTime()));
  }

  function restaurarAgendamentos() {
    if (!fs.existsSync(pasta)) return;
    for (const nome of fs.readdirSync(pasta)) {
      const id = nome.endsWith(".json") ? nome.slice(0, -5) : "";
      if (!UUID.test(id)) continue;
      try {
        const lote = consultar(id);
        if (lote?.agendado) programar(lote);
      } catch {
        console.error(`[LOTE] ${id}: não foi possível restaurar o registro.`);
      }
    }
  }

  function criar(id, chaves, horario = null) {
    if (horario !== null && horario !== "08:00" && horario !== "15:00") {
      throw erroLote(400, "Escolha 08h, 15h ou envio esporádico.");
    }
    if (!Array.isArray(chaves) || !chaves.length || chaves.length > Object.keys(cidades).length ||
        chaves.some((chave) => typeof chave !== "string" || !Object.hasOwn(cidades, chave)) ||
        new Set(chaves).size !== chaves.length) {
      throw erroLote(400, "Selecione uma ou mais instalações meteorológicas válidas.");
    }
    const existente = consultar(id);
    if (existente) {
      const anteriores = existente.itens.map((item) => item.chave);
      if ((existente.horario ?? null) !== horario || anteriores.length !== chaves.length || chaves.some((chave) => !anteriores.includes(chave))) {
        throw erroLote(409, "Este identificador já pertence a outra seleção.");
      }
      return existente;
    }
    const itens = chaves.map((chave) => ({ chave, nome: cidades[chave].nome, uf: cidades[chave].uf }));
    const agendadoPara = horario ? proximoHorario(horario, relogio()) : null;
    return iniciarTentativa({
      id, iniciadoEm: agora(), usuario: null, total: itens.length, itens, tentativas: [],
      horario, agendadoPara, agendado: Boolean(agendadoPara),
    }, id, itens, Boolean(agendadoPara));
  }

  function obter(id) {
    const lote = consultar(id);
    if (!lote) throw erroLote(404, "Lote não encontrado.");
    return lote;
  }

  function repetir(id, tentativaId) {
    if (typeof tentativaId !== "string" || !UUID.test(tentativaId)) throw erroLote(400, "Identificador de tentativa inválido.");
    const lote = obter(id);
    if (lote.tentativas.some((tentativa) => tentativa.id === tentativaId)) return lote;
    if (lote.agendadoPara && !edicaoPodeSerEnviada(lote, relogio())) {
      throw erroLote(409, "A edição agendada não está vigente. Crie um novo lote para enviar outros informativos.");
    }
    verificarDisponibilidade();
    const itens = lote.itens.filter((item) => item.repetivel && Object.hasOwn(cidades, item.chave));
    if (!itens.length) throw erroLote(409, "Este lote não tem falhas disponíveis para nova tentativa.");
    return iniciarTentativa(lote, tentativaId, itens);
  }

  return { criar, obter, repetir, restaurarAgendamentos, emAndamento: () => Boolean(ativo) };
}

module.exports = { criarLotesRelatorio };
