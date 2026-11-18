(function () {
  const URL_LOTES = "/api/relatorios/lotes";
  const CHAVE_SESSAO = "cim-lote-relatorios";
  const CHAVE_AGENDAMENTOS = "cim-lotes-agendados";
  const situacoes = {
    aguardando: "Aguardando",
    coletando: "Coletando dados",
    gerando_pdf: "Gerando PDF",
    enviando_email: "Enviando e-mail",
    enviado: "Enviado com sucesso",
    edicao_existente: "Edição já enviada ou em processamento pelo agendador",
    falha: "Falha no envio",
  };

  function idNovo() {
    // getRandomValues também funciona em painéis internos servidos por HTTP.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (valor) => valor.toString(16).padStart(2, "0")).join("");
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
  }

  async function postar(caminho, senha, dados = {}) {
    const resposta = await fetch(URL_LOTES + caminho, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...dados, senha }),
      signal: AbortSignal.timeout(15_000),
    });
    const corpo = await resposta.json();
    if (!resposta.ok || !corpo.ok) {
      throw Object.assign(new Error(corpo.erro || "Não foi possível consultar o lote."), { status: resposta.status });
    }
    return corpo.lote;
  }

  function criar({ overlay, tipo, senha, confirmar, cancelar, mensagem, escape, aoConcluir }) {
    const modal = overlay.querySelector(".modal");
    const selecao = document.getElementById("lote-selecao");
    const horario = document.getElementById("lote-horario");
    const historico = document.getElementById("lote-historico");
    const agendamentos = document.getElementById("lote-agendamentos");
    const novo = document.getElementById("lote-novo");
    const grade = document.getElementById("lote-bases");
    const todas = document.getElementById("lote-todas");
    const contador = document.getElementById("lote-contador");
    const progresso = document.getElementById("lote-progresso");
    const resumo = document.getElementById("lote-resumo");
    const resultados = document.getElementById("lote-resultados");
    const titulo = document.getElementById("lote-titulo");
    const pergunta = document.getElementById("lote-confirmacao");
    let lote = null;
    let ocupado = false;
    let pedido = null;
    let acaoConfirmada = null;
    let id = null;
    let agendados = [];
    const dataBrasilia = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
    });
    try {
      const ultimo = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO));
      id = ultimo?.id || null;
      pedido = ultimo?.pedido || null;
      agendados = JSON.parse(sessionStorage.getItem(CHAVE_AGENDAMENTOS)) || [];
    } catch { /* O modal continua funcional sem armazenamento no navegador. */ }

    function lembrar(novoId) {
      id = novoId;
      try {
        if (id) sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ id, pedido }));
        else sessionStorage.removeItem(CHAVE_SESSAO);
      } catch { /* O identificador permanece em memória. */ }
    }

    const caixas = () => [...grade.querySelectorAll("input")];
    const marcadas = () => caixas().filter((caixa) => caixa.checked).map((caixa) => caixa.value);
    const repetiveis = () => lote?.itens.filter((item) => item.repetivel).length || 0;

    function atualizar() {
      const emLote = tipo.value === "lote";
      const total = caixas().length;
      const quantidade = marcadas().length;
      todas.checked = total > 0 && quantidade === total;
      todas.indeterminate = quantidade > 0 && quantidade < total;
      contador.textContent = `${quantidade} ${quantidade === 1 ? "instalação selecionada" : "instalações selecionadas"} de ${total} ${total === 1 ? "disponível" : "disponíveis"}`;
      modal.classList.toggle("modal-lote", emLote);
      selecao.classList.toggle("oculto", !emLote || Boolean(id) || ocupado);
      progresso.classList.toggle("oculto", !emLote || !lote);
      pergunta.classList.toggle("oculto", !emLote || !acaoConfirmada);
      novo.classList.toggle("oculto", !emLote || !lote?.agendado || ocupado);
      historico.classList.toggle("oculto", agendados.length === 0);
      if (!emLote) {
        if (!tipo.disabled) {
          confirmar.disabled = false;
          confirmar.textContent = "Gerar e Enviar";
          cancelar.textContent = "Cancelar";
        }
        return;
      }
      selecao.disabled = Boolean(acaoConfirmada);
      todas.disabled = total === 0;
      tipo.disabled = ocupado || Boolean(acaoConfirmada);
      senha.disabled = ocupado;
      cancelar.disabled = ocupado;
      cancelar.textContent = (lote?.concluidoEm || lote?.agendado) && !acaoConfirmada ? "Fechar" : "Cancelar";
      confirmar.disabled = ocupado || (!id && quantidade === 0) || Boolean(lote?.concluidoEm && !repetiveis());
      confirmar.textContent = ocupado ? "Acompanhando…"
        : acaoConfirmada ? "Confirmar envio"
        : pedido ? "Retomar tentativa"
        : lote?.concluidoEm ? "Reenviar falhas"
        : id ? "Consultar lote"
        : horario.value ? "Agendar envio" : "Gerar e Enviar";
    }

    function popular(cidades) {
      grade.innerHTML = cidades.map((cidade) =>
        `<label class="lote-opcao"><input type="checkbox" value="${escape(cidade.chave)}"><span>${escape(cidade.nome)} — ${escape(cidade.uf)}</span></label>`
      ).join("");
      atualizar();
    }

    function exibir(registro) {
      lote = registro;
      if (lote.agendado && !agendados.some((registro) => registro.id === lote.id)) {
        agendados.unshift({ id: lote.id, agendadoPara: lote.agendadoPara });
        agendados = agendados.slice(0, 20);
        try { sessionStorage.setItem(CHAVE_AGENDAMENTOS, JSON.stringify(agendados)); }
        catch { /* O histórico continua disponível em memória. */ }
        exibirAgendamentos();
      }
      const enviados = lote.itens.filter((item) => item.status === "enviado").length;
      const falhas = lote.itens.filter((item) => item.status === "falha").length;
      const edicaoExistente = lote.itens.filter((item) => item.status === "edicao_existente").length;
      titulo.textContent = lote.agendado ? "Envio em lote agendado"
        : lote.concluidoEm ? "Envio em lote concluído" : "Envio em lote de informativos meteorológicos";
      resumo.textContent = lote.agendado
        ? `${dataBrasilia.format(new Date(lote.agendadoPara))} (Brasília) · ${lote.total} ${lote.total === 1 ? "instalação" : "instalações"}`
        : lote.concluidoEm
          ? `Total de instalações: ${lote.total} · Enviadas com sucesso: ${enviados} · Falhas: ${falhas}${edicaoExistente ? ` · Edições já registradas: ${edicaoExistente}` : ""}`
          : `Progresso: ${enviados + falhas + edicaoExistente} de ${lote.total} instalações concluídas`;
      resultados.innerHTML = lote.itens.map((item) => {
        const estado = lote.agendado ? "Aguardando horário" : situacoes[item.status];
        return `<li><strong>${escape(item.nome)} — ${escape(item.uf)}</strong> · ${escape(estado)}${item.erro ? `<small>${escape(item.erro)}</small>` : ""}</li>`;
      }).join("");
      atualizar();
    }

    async function acompanhar(senhaOperacional) {
      ocupado = true;
      mensagem.textContent = "";
      atualizar();
      try {
        if (pedido) {
          const registro = await postar(pedido.caminho, senhaOperacional, pedido.dados);
          pedido = null;
          lembrar(id);
          exibir(registro);
        } else if (id) {
          exibir(await postar(`/${id}/status`, senhaOperacional));
        }
        while (!lote?.concluidoEm && !lote?.agendado) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          exibir(await postar(`/${id}/status`, senhaOperacional));
        }
        if (lote?.concluidoEm) aoConcluir();
      } catch (erro) {
        if (erro.status && erro.status < 500 && ![401, 403].includes(erro.status)) {
          const criacaoRecusada = pedido?.caminho === "";
          pedido = null;
          lembrar(erro.status === 404 || criacaoRecusada ? null : id);
        }
        mensagem.textContent = erro.status ? erro.message : "Conexão interrompida. Retome o acompanhamento para verificar o lote.";
      } finally {
        ocupado = false;
        atualizar();
      }
    }

    async function acionar() {
      if (ocupado || confirmar.disabled) return;
      if (!senha.value) {
        mensagem.textContent = "Digite a senha.";
        senha.focus();
        return;
      }
      if (acaoConfirmada) {
        pedido = acaoConfirmada;
        acaoConfirmada = null;
        lembrar(id || pedido.dados.id);
        await acompanhar(senha.value);
        return;
      }
      if (pedido || (id && !lote?.concluidoEm)) {
        await acompanhar(senha.value);
        return;
      }
      mensagem.textContent = "";
      if (lote?.concluidoEm) {
        const quantidade = repetiveis();
        pergunta.textContent = `Deseja tentar novamente o envio para ${quantidade} ${quantidade === 1 ? "instalação com falha" : "instalações com falha"}?`;
        acaoConfirmada = { caminho: `/${id}/repetir`, dados: { tentativaId: idNovo() } };
      } else {
        const cidades = marcadas();
        const instalacoes = cidades.length === 1 ? "a instalação selecionada" : `as ${cidades.length} instalações selecionadas`;
        const hora = horario.value;
        pergunta.textContent = hora
          ? `Deseja agendar o envio para ${instalacoes} na próxima ocorrência das ${hora} (Brasília)?`
          : `Deseja gerar e enviar os informativos meteorológicos para ${instalacoes}?`;
        acaoConfirmada = { caminho: "", dados: { id: idNovo(), cidades, horario: hora || null } };
      }
      atualizar();
      confirmar.focus();
    }

    function cancelarFechamento() {
      if (ocupado) return true;
      if (acaoConfirmada) {
        acaoConfirmada = null;
        atualizar();
        return true;
      }
      if (lote?.concluidoEm && !pedido) {
        lote = null;
        lembrar(null);
        caixas().forEach((caixa) => { caixa.checked = false; });
      }
      return false;
    }

    function exibirAgendamentos() {
      agendamentos.innerHTML = '<option value="">Selecionar para consultar</option>' + agendados.map((item) =>
        `<option value="${escape(item.id)}">${escape(dataBrasilia.format(new Date(item.agendadoPara)))} · ${escape(item.id.slice(0, 8))}</option>`
      ).join("");
    }
    exibirAgendamentos();
    novo.addEventListener("click", () => {
      lote = null;
      lembrar(null);
      caixas().forEach((caixa) => { caixa.checked = false; });
      horario.value = "";
      mensagem.textContent = "";
      atualizar();
      horario.focus();
    });
    agendamentos.addEventListener("change", () => {
      if (!agendamentos.value) return;
      lembrar(agendamentos.value);
      agendamentos.value = "";
      atualizar();
      senha.focus();
    });
    tipo.addEventListener("change", () => {
      mensagem.textContent = "";
      atualizar();
    });
    grade.addEventListener("change", atualizar);
    horario.addEventListener("change", atualizar);
    todas.addEventListener("change", () => {
      caixas().forEach((caixa) => { caixa.checked = todas.checked; });
      atualizar();
    });
    return { popular, atualizar, acionar, cancelarFechamento };
  }

  window.EnvioLote = { criar };
})();
