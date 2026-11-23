/* Central administrativa. Credencial e dados pessoais permanecem só na sessão aberta. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  let ocupado = false, senha = '', operador = '', aba = 'pessoas', dados = null;
  let selecionados = new Set(), pagina = 1, histPagina = 1, histTotal = 0;
  let previa = [], editando = null, operacao = null, pendente = null, seq = 0, histSeq = 0;
  let timer, histTimer, onChange = () => {}, focoAnterior, destinoVinculo = '';
  let filtroInstalacoes = 'todas';
  const dialogFoco = new Map();
  const dialogIds = ['central-cadastro', 'central-edicao', 'central-confirmacao'];
  const labels = { vincular: 'Vincular instalações', desvincular: 'Remover vínculos', ativar: 'Ativar destinatários', desativar: 'Desativar destinatários', excluir: 'Excluir destinatários', editar: 'Editar destinatário' };
  function mensagem(texto, alvo = 'central-mensagem', sucesso = false) {
    $(alvo).textContent = texto;
    $(alvo).classList.toggle('sucesso', sucesso);
  }
  async function trabalhar(fn, alvo = 'central-mensagem') {
    if (ocupado) return;
    ocupado = true;
    const root = $('overlay-responsaveis');
    root.setAttribute('aria-busy', 'true');
    const acionador = document.activeElement?.tagName === 'BUTTON' ? document.activeElement : null;
    const conteudoAcionador = acionador?.innerHTML;
    if (acionador) acionador.innerHTML = '<span class="central-spinner" aria-hidden="true"></span>Processando…';
    const controles = [...root.querySelectorAll('button,input,select,textarea')].map(el => [el, el.disabled]);
    controles.forEach(([el]) => { el.disabled = true; });
    try { return await fn(); }
    catch (e) { mensagem(e.message || 'Não foi possível concluir a operação.', alvo); }
    finally {
      ocupado = false; root.setAttribute('aria-busy', 'false');
      if (acionador?.isConnected) acionador.innerHTML = conteudoAcionador;
      controles.forEach(([el, disabled]) => { el.disabled = disabled; });
      if (dados) {
        $('central-anterior').disabled = pagina <= 1;
        $('central-proxima').disabled = pagina * dados.tamanho >= dados.total;
        $('central-hist-anterior').disabled = histPagina <= 1;
        $('central-hist-proxima').disabled = histPagina * 25 >= histTotal;
      }
      atualizarSelecao();
      if (senha && !dialogIds.some(id => $(id).open) && document.activeElement === document.body) $('central-tab-' + aba).focus();
    }
  }
  async function api(rota, corpo = {}, arquivo = false) {
    const res = await fetch(`/api/destinatarios/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpo, senha }), signal: AbortSignal.timeout(45000) });
    if (res.status === 401 || res.status === 429) {
      fechar(true);
      abrir();
      throw new Error('Acesso expirado ou recusado. Desbloqueie a central novamente.');
    }
    if (arquivo && res.ok) return res.blob();
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.erro || 'Falha na operação.');
    return json;
  }
  function filtros() {
    return { busca: $('central-busca').value, instalacao: $('central-filtro-instalacao').value, status: $('central-filtro-status').value, vinculos: $('central-filtro-vinculos').value,
      ordem: $('central-ordem').value, direcao: $('central-direcao').value, tamanho: Number($('central-tamanho').value), pagina };
  }
  function atualizarSelecao() {
    if (!$('central-selecionados')) return;
    $('central-selecionados').textContent = `${selecionados.size} ${selecionados.size === 1 ? 'pessoa selecionada' : 'pessoas selecionadas'}`;
    $('central-aplicar').disabled = ocupado || !selecionados.size;
    $('central-desmarcar').disabled = ocupado || !selecionados.size;
    $('central-acao').disabled = ocupado || !selecionados.size;
    const pessoas = dados?.itens || [];
    const n = pessoas.filter(p => selecionados.has(p.email)).length;
    $('central-selecionar-pagina').checked = !!pessoas.length && n === pessoas.length;
    $('central-selecionar-pagina').indeterminate = n > 0 && n < pessoas.length;
    $('central-selecionar-pagina').disabled = ocupado || !pessoas.length;
    $('central-linhas').querySelectorAll('[data-selecionar]').forEach(el => { el.checked = selecionados.has(el.dataset.selecionar); });
  }
  const nomeInstalacao = chave => dados?.instalacoes.find(i => i.chave === chave)?.nome || chave;
  async function carregar() {
    const geracao = ++seq;
    $('central-resultados').textContent = 'Carregando…';
    const r = await api('consultar', { filtros: filtros() });
    if (geracao !== seq || !senha) return;
    dados = r; pagina = r.pagina;
    $('central-indicadores').innerHTML = CentralUI.indicadores(r.indicadores);
    const atual = $('central-filtro-instalacao').value;
    $('central-filtro-instalacao').innerHTML = '<option value="">Todas as instalações</option>' + r.instalacoes.map(i => `<option value="${esc(i.chave)}">${esc(i.nome)} — ${esc(i.uf)}</option>`).join('');
    $('central-filtro-instalacao').value = atual;
    $('central-linhas').innerHTML = r.itens.length ? r.itens.map(p => CentralUI.linha(p, selecionados.has(p.email), nomeInstalacao)).join('') : '<tr><td colspan="5" class="central-vazio">Nenhum resultado encontrado. Revise a pesquisa e os filtros.</td></tr>';
    $('central-resultados').textContent = `${r.total} resultado(s)`;
    $('central-pagina').textContent = `Página ${pagina} de ${Math.max(1, Math.ceil(r.total / r.tamanho))}`;
    $('central-anterior').disabled = pagina <= 1;
    $('central-proxima').disabled = pagina * r.tamanho >= r.total;
    renderInstalacoes();
    atualizarSelecao();
  }
  function consultarComErro() { carregar().catch(e => mensagem(e.message)); }
  function renderInstalacoes() {
    const r = CentralUI.filtrarInstalacoes(dados?.instalacoes || [], $('central-inst-busca').value, filtroInstalacoes);
    $('central-grade-instalacoes').innerHTML = r.itens.map(CentralUI.instalacao).join('') || '<p class="central-vazio">Nenhuma instalação encontrada para esta pesquisa.</p>';
    $('central-inst-resultados').textContent = `${r.itens.length} ${r.itens.length === 1 ? 'instalação' : 'instalações'}`;
    $('central-instalacoes').querySelectorAll('[data-inst-contagem]').forEach(el => { el.textContent = r.contagens[el.dataset.instContagem]; });
    $('central-instalacoes').querySelectorAll('[data-inst-filtro]').forEach(el => { el.setAttribute('aria-pressed', String(el.dataset.instFiltro === filtroInstalacoes)); });
  }
  async function historico() {
    const geracao = ++histSeq;
    const r = await api('historico', { filtros: { busca: $('central-hist-busca').value, operador: $('central-hist-operador').value, acao: $('central-hist-acao').value, desde: $('central-hist-desde').value, ate: $('central-hist-ate').value, pagina: histPagina } });
    if (geracao !== histSeq || !senha) return;
    histPagina = r.pagina; histTotal = r.total;
    $('central-hist-lista').innerHTML = `<div class="central-tabela-wrap"><table class="central-tabela central-historico-tabela"><caption class="sr-only">Histórico de alterações dos destinatários</caption><thead><tr><th scope="col">Data e horário</th><th scope="col">Usuário</th><th scope="col">Tipo de ação</th><th scope="col">Destinatário</th><th scope="col">Instalação</th><th scope="col">Detalhes</th></tr></thead><tbody>${r.itens.length ? r.itens.map(h => CentralUI.evento(h, nomeInstalacao)).join('') : '<tr><td colspan="6" class="central-vazio">Nenhum evento encontrado.</td></tr>'}</tbody></table></div>`;
    $('central-hist-pagina').textContent = `${r.total} evento(s) · Página ${histPagina} de ${Math.max(1, Math.ceil(r.total / r.tamanho))}`;
    $('central-hist-anterior').disabled = histPagina <= 1;
    $('central-hist-proxima').disabled = histPagina * r.tamanho >= histTotal;
  }
  function trocarAba(nova, foco = false) {
    if (nova !== aba && $('central-mensagem').classList.contains('sucesso')) mensagem('');
    aba = nova;
    for (const item of ['pessoas', 'instalacoes', 'historico']) {
      const tab = $(`central-tab-${item}`), selecionada = item === aba;
      tab.setAttribute('aria-selected', String(selecionada)); tab.tabIndex = selecionada ? 0 : -1;
      $(`central-${item}`).hidden = !selecionada;
    }
    if (foco) $(`central-tab-${aba}`).focus();
    $('central-conteudo').scrollTop = 0;
    if (aba === 'historico') historico().catch(e => mensagem(e.message));
  }
  function basesGrade(tipo, escolhidas = []) {
    $(`central-${tipo}-bases`).innerHTML = (dados?.instalacoes || []).map(i => `<label><input type="checkbox" value="${esc(i.chave)}"${escolhidas.includes(i.chave) ? ' checked' : ''}><span>${esc(i.nome)} — ${esc(i.uf)}<small>${esc(i.chave)}</small></span></label>`).join('');
  }
  const basesMarcadas = tipo => [...$(`central-${tipo}-bases`).querySelectorAll('input:checked')].map(el => el.value);
  function dialogAbrir(id) {
    const trigger = document.activeElement;
    dialogFoco.set(id, trigger?.closest('[data-cadastro]') ? $('central-adicionar') : trigger);
    menuCadastro(false); $(id).showModal();
  }
  function fecharDialogs() { dialogIds.forEach(id => { if ($(id).open) $(id).close(); }); }
  function abrir() {
    focoAnterior = document.activeElement;
    $('overlay-responsaveis').classList.remove('oculto');
    $('central-titulo').closest('.modal-responsaveis').classList.add('central-bloqueada');
    $('resp-bloco-senha').classList.remove('oculto'); $('resp-bloco-gestao').classList.add('oculto');
    $('resp-input-senha').value = ''; mensagem('', 'resp-senha-mensagem');
    $('central-operador').focus();
  }
  function fechar(forcar = false) {
    if (ocupado && !forcar) return;
    seq++; histSeq++; clearTimeout(timer); clearTimeout(histTimer);
    fecharDialogs(); menuCadastro(false); senha = ''; operador = ''; dados = null; previa = []; editando = null; operacao = null; pendente = null; destinoVinculo = ''; selecionados.clear();
    dialogFoco.clear();
    $('resp-input-senha').value = ''; $('central-operador').value = '';
    $('central-busca').value = ''; $('central-hist-busca').value = '';
    $('central-hist-operador').value = ''; $('central-inst-busca').value = ''; filtroInstalacoes = 'todas';
    $('resp-form').reset(); $('central-form-edicao').reset();
    for (const id of ['central-linhas', 'central-hist-lista', 'central-previa-linhas', 'central-relatorio', 'central-grade-instalacoes', 'central-indicadores', 'central-cadastro-bases', 'central-edicao-bases', 'central-confirmacao-bases']) $(id).innerHTML = '';
    for (const id of ['resp-form-mensagem', 'central-mensagem', 'central-edicao-mensagem', 'central-confirmacao-mensagem', 'central-confirmacao-texto', 'central-previa-contagens']) $(id).textContent = '';
    $('overlay-responsaveis').classList.add('oculto'); focoAnterior?.focus();
  }
  async function desbloquear() {
    senha = $('resp-input-senha').value; operador = $('central-operador').value.trim();
    if (!senha || !operador) { mensagem('Informe seu nome e a senha operacional.', 'resp-senha-mensagem'); senha = ''; return; }
    try {
      await carregar();
      $('resp-input-senha').value = '';
      $('resp-bloco-senha').classList.add('oculto'); $('resp-bloco-gestao').classList.remove('oculto');
      $('central-titulo').closest('.modal-responsaveis').classList.remove('central-bloqueada');
      trocarAba(aba); $('central-tab-' + aba).focus();
    } catch (e) { senha = ''; throw e; }
  }
  function invalidarPrevia() { previa = []; $('central-previa').hidden = true; $('central-relatorio').innerHTML = ''; mensagem('', 'resp-form-mensagem'); }
  function ajustarModo() {
    const modo = $('central-modo').value;
    for (const nome of ['individual', 'lote', 'arquivo']) $(`central-${nome}`).hidden = modo !== nome;
    for (const id of ['resp-input-nome', 'resp-input-email']) { $(id).required = modo === 'individual'; $(id).disabled = modo !== 'individual'; }
    $('resp-botao-cadastrar').textContent = modo === 'individual' ? 'Cadastrar responsável' : 'Validar e visualizar prévia';
    invalidarPrevia();
  }
  function adicionar(instalacao, modo = 'individual') {
    $('resp-form').reset(); $('central-modo').value = modo; ajustarModo(); basesGrade('cadastro', instalacao ? [instalacao] : []);
    mensagem('', 'resp-form-mensagem'); dialogAbrir('central-cadastro');
    $(modo === 'lote' ? 'central-texto-lote' : modo === 'arquivo' ? 'central-input-arquivo' : 'resp-input-nome').focus();
  }
  function menuCadastro(aberto, foco = false) {
    $('central-menu-cadastro').hidden = !aberto;
    $('central-adicionar').setAttribute('aria-expanded', String(aberto));
    if (aberto && foco) $('central-menu-cadastro').querySelector('button').focus();
  }
  async function arquivoBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file);
    });
  }
  async function visualizarPrevia() {
    invalidarPrevia();
    const modo = $('central-modo').value;
    let r;
    if (modo === 'arquivo') {
      const file = $('central-input-arquivo').files[0];
      if (!file || file.size > 1024 * 1024) throw new Error('Selecione um CSV ou XLSX de até 1 MB.');
      r = await api('importar', { nome: file.name, conteudo: await arquivoBase64(file) });
    } else r = await api('previa', modo === 'individual' ? { registros: [{ nome: $('resp-input-nome').value, email: $('resp-input-email').value }] } : { texto: $('central-texto-lote').value });
    previa = r.itens;
    $('central-previa-contagens').textContent = `${r.contagens.validos} válido(s) novo(s) · ${r.contagens.invalidos} inválido(s) · ${r.contagens.repetidos} repetido(s) · ${r.contagens.existentes} já cadastrado(s)`;
    const status = { validos: 'Válido', invalidos: 'Inválido', repetidos: 'Repetido no lote', existentes: 'Já cadastrado' };
    $('central-previa-linhas').innerHTML = previa.map((p, i) => {
      const apto = ['validos', 'existentes'].includes(p.status);
      return `<tr><td><input data-previa="${i}" type="checkbox" aria-label="Processar linha ${i + 1}"${apto ? ' checked' : ' disabled'}></td><td>${esc(p.email)}<small class="central-email">${esc(p.erro || status[p.status])}</small></td><td><input data-previa-nome="${i}" value="${esc(p.nome)}" aria-label="Nome da linha ${i + 1}" maxlength="100" placeholder="Nome pendente"${apto ? '' : ' disabled'}></td></tr>`;
    }).join('');
    $('central-previa').hidden = false;
  }
  async function mutacao(payload) {
    const body = { ...payload, operador };
    const signature = JSON.stringify(body);
    if (pendente?.signature !== signature) pendente = { signature, id: crypto.randomUUID() };
    const r = await api('executar', { ...body, id: pendente.id });
    pendente = null;
    mensagem(`${r.resultado.sucessos} sucesso(s), ${r.resultado.falhas} falha(s), ${r.resultado.ignorados} ignorado(s).`, 'central-mensagem', true);
    // A escrita já foi confirmada; falhas na atualização não devem sugerir repetir a mutação.
    try { await carregar(); await onChange(); } catch { mensagem('Operação concluída. Reabra a central para atualizar a lista.', 'central-mensagem', true); }
    return r.resultado;
  }
  async function confirmarCadastro() {
    const registros = [...$('central-previa-linhas').querySelectorAll('input[data-previa]:checked')].map(el => {
      const i = Number(el.dataset.previa), p = previa[i];
      return { email: p.email, nome: $('central-previa-linhas').querySelector(`[data-previa-nome="${i}"]`).value, bases: p.bases };
    });
    if (!registros.length) throw new Error('Selecione ao menos uma linha válida na prévia.');
    const r = await mutacao({ acao: 'cadastrar', registros, bases: basesMarcadas('cadastro'), existentes: $('central-existentes').value });
    $('central-relatorio').innerHTML = `<h3>Relatório final</h3><p>${r.sucessos} sucesso(s) · ${r.falhas} falha(s) · ${r.ignorados} ignorado(s)</p><details><summary>Ver resultado por endereço</summary><ul>${r.itens.map(i => `<li>${esc(i.email)} — ${esc(i.status)}</li>`).join('')}</ul></details>`;
    $('central-previa').hidden = true; previa = [];
    mensagem('Processamento concluído.', 'resp-form-mensagem', true);
  }
  function editar(email) {
    editando = dados.itens.find(p => p.email === email);
    $('central-editar-nome').value = editando.nome || ''; $('central-editar-email').value = editando.email;
    basesGrade('edicao', editando.bases); mensagem('', 'central-edicao-mensagem'); dialogAbrir('central-edicao');
  }
  function confirmarAcao(acao, emails) {
    if (!emails.length) { mensagem('Selecione destinatários para continuar.'); return; }
    if (emails.length > 500) { mensagem('Selecione no máximo 500 destinatários por operação.'); return; }
    operacao = { acao, emails };
    $('central-confirmacao-titulo').textContent = labels[acao];
    $('central-confirmacao-texto').textContent = `${labels[acao]}: ${emails.length} destinatário(s). ${acao === 'excluir' ? 'A exclusão remove o cadastro e todos os seus vínculos.' : 'Revise a seleção antes de confirmar.'}`;
    $('central-confirmacao-bases-grupo').hidden = !['vincular', 'desvincular'].includes(acao);
    const destino = destinoVinculo || $('central-filtro-instalacao').value;
    basesGrade('confirmacao', destino ? [destino] : []);
    mensagem('', 'central-confirmacao-mensagem'); dialogAbrir('central-confirmacao');
  }
  async function baixar(modelo = false, selecao = false) {
    const formato = $('central-formato').value;
    const blob = await api(modelo ? 'modelo' : 'exportar', { formato, filtros: filtros(), ...(selecao ? { emails: [...selecionados] } : {}) }, true);
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `${modelo ? 'modelo' : 'destinatarios'}.${formato}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function iniciar(opcoes = {}) {
    onChange = opcoes.onChange || onChange;
    $('overlay-responsaveis').querySelectorAll('[data-central-icon]').forEach(el => { el.innerHTML = Dashboard.icon(el.dataset.centralIcon); });
    $('botao-responsaveis').addEventListener('click', abrir);
    for (const id of ['resp-botao-fechar', 'resp-botao-cancelar', 'central-fechar-topo']) $(id).addEventListener('click', () => fechar());
    $('resp-botao-desbloquear').addEventListener('click', () => trabalhar(desbloquear, 'resp-senha-mensagem'));
    for (const id of ['resp-input-senha', 'central-operador']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); trabalhar(desbloquear, 'resp-senha-mensagem'); } });
    $('overlay-responsaveis').addEventListener('click', e => { if (e.target === $('overlay-responsaveis')) fechar(); });
    $('central-adicionar').addEventListener('click', () => menuCadastro($('central-menu-cadastro').hidden));
    $('central-adicionar').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); menuCadastro(true, true); }
      if (e.key === 'Escape' && !$('central-menu-cadastro').hidden) { e.preventDefault(); e.stopPropagation(); menuCadastro(false); }
    });
    $('central-menu-cadastro').addEventListener('click', e => { const el = e.target.closest('[data-cadastro]'); if (el) adicionar(destinoVinculo, el.dataset.cadastro); });
    $('central-menu-cadastro').addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); menuCadastro(false); $('central-adicionar').focus(); }
      const opcoes = [...$('central-menu-cadastro').querySelectorAll('button')], i = opcoes.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); opcoes[(i + (e.key === 'ArrowDown' ? 1 : opcoes.length - 1)) % opcoes.length].focus(); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.central-adicionar-grupo')) menuCadastro(false); });
    $('overlay-responsaveis').querySelectorAll('.central-adicionar-grupo').forEach(el => el.addEventListener('focusout', e => { if (!e.currentTarget.contains(e.relatedTarget)) menuCadastro(false); }));
    $('central-modelo').addEventListener('click', () => trabalhar(() => baixar(true)));
    $('central-exportar').addEventListener('click', () => trabalhar(() => baixar()));
    for (const a of ['pessoas', 'instalacoes', 'historico']) {
      $(`central-tab-${a}`).addEventListener('click', () => trocarAba(a));
      $(`central-tab-${a}`).addEventListener('keydown', e => {
        const tabs = ['pessoas', 'instalacoes', 'historico'], i = tabs.indexOf(a);
        const destino = { ArrowRight: tabs[(i + 1) % 3], ArrowLeft: tabs[(i + 2) % 3], Home: tabs[0], End: tabs[2] }[e.key];
        if (destino) { e.preventDefault(); trocarAba(destino, true); }
      });
    }
    $('central-busca').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { pagina = 1; consultarComErro(); }, 300); });
    $('central-limpar').addEventListener('click', () => { clearTimeout(timer); $('central-busca').value = ''; pagina = 1; consultarComErro(); $('central-busca').focus(); });
    for (const id of ['central-filtro-instalacao', 'central-filtro-status', 'central-filtro-vinculos', 'central-ordem', 'central-direcao', 'central-tamanho']) $(id).addEventListener('change', () => { pagina = 1; consultarComErro(); });
    $('central-anterior').addEventListener('click', () => { pagina--; consultarComErro(); });
    $('central-proxima').addEventListener('click', () => { pagina++; consultarComErro(); });
    $('central-selecionar-pagina').addEventListener('change', e => { for (const p of dados.itens) { if (e.target.checked) selecionados.add(p.email); else selecionados.delete(p.email); } $('central-linhas').querySelectorAll('[data-selecionar]').forEach(el => { el.checked = e.target.checked; }); atualizarSelecao(); });
    $('central-desmarcar').addEventListener('click', () => { selecionados.clear(); $('central-linhas').querySelectorAll('[data-selecionar]').forEach(el => { el.checked = false; }); atualizarSelecao(); });
    $('central-linhas').addEventListener('change', e => { if (e.target.dataset.selecionar) { if (e.target.checked) selecionados.add(e.target.dataset.selecionar); else selecionados.delete(e.target.dataset.selecionar); atualizarSelecao(); } });
    $('central-linhas').addEventListener('click', e => {
      const el = e.target.closest('button'); if (!el) return;
      if (el.dataset.editar) editar(el.dataset.editar);
      if (el.dataset.status) confirmarAcao(dados.itens.find(p => p.email === el.dataset.status).ativo ? 'desativar' : 'ativar', [el.dataset.status]);
      if (el.dataset.excluir) confirmarAcao('excluir', [el.dataset.excluir]);
    });
    $('central-aplicar').addEventListener('click', () => { const acao = $('central-acao').value; if (acao === 'exportar') trabalhar(() => baixar(false, true)); else confirmarAcao(acao, [...selecionados]); });
    $('central-confirmar-acao').addEventListener('click', () => trabalhar(async () => {
      const acao = { ...operacao, confirmado: true, ...(['vincular', 'desvincular'].includes(operacao.acao) ? { bases: basesMarcadas('confirmacao') } : {}) };
      await mutacao(acao);
      if (acao.acao === 'excluir') acao.emails.forEach(email => selecionados.delete(email));
      $('central-confirmacao').close();
    }, 'central-confirmacao-mensagem'));
    $('central-grade-instalacoes').addEventListener('click', e => {
      const el = e.target.closest('button'); if (!el) return;
      if (el.dataset.instalar) { destinoVinculo = ''; $('central-busca').value = ''; $('central-filtro-status').value = 'todos'; $('central-filtro-vinculos').value = 'todos'; $('central-filtro-instalacao').value = el.dataset.instalar; pagina = 1; trocarAba('pessoas', true); consultarComErro(); }
      if (el.dataset.adicionarInstalacao) {
        destinoVinculo = el.dataset.adicionarInstalacao;
        selecionados.clear();
        $('central-busca').value = ''; $('central-filtro-status').value = 'todos'; $('central-filtro-vinculos').value = 'todos'; $('central-filtro-instalacao').value = '';
        $('central-acao').value = 'vincular'; pagina = 1;
        mensagem(`Selecione as pessoas para vincular a ${nomeInstalacao(destinoVinculo)} e use Aplicar aos selecionados. Para novos cadastros, use + Adicionar destinatários.`);
        trocarAba('pessoas', true); consultarComErro();
      }
    });
    $('central-inst-busca').addEventListener('input', renderInstalacoes);
    $('central-inst-limpar').addEventListener('click', () => { $('central-inst-busca').value = ''; renderInstalacoes(); $('central-inst-busca').focus(); });
    $('central-instalacoes').querySelectorAll('[data-inst-filtro]').forEach(el => el.addEventListener('click', () => { filtroInstalacoes = el.dataset.instFiltro; renderInstalacoes(); }));
    $('central-modo').addEventListener('change', ajustarModo);
    $('resp-form').addEventListener('input', invalidarPrevia);
    $('resp-form').addEventListener('change', invalidarPrevia);
    $('resp-form').addEventListener('submit', e => { e.preventDefault(); trabalhar(visualizarPrevia, 'resp-form-mensagem'); });
    $('central-confirmar-cadastro').addEventListener('click', () => trabalhar(confirmarCadastro, 'resp-form-mensagem'));
    $('central-form-edicao').addEventListener('submit', e => { e.preventDefault(); trabalhar(async () => {
      const antigo = editando.email;
      await mutacao({ acao: 'editar', emails: [antigo], nome: $('central-editar-nome').value, email: $('central-editar-email').value, bases: basesMarcadas('edicao'), confirmado: true });
      if (selecionados.delete(antigo)) selecionados.add($('central-editar-email').value.trim().toLowerCase());
      $('central-edicao').close();
    }, 'central-edicao-mensagem'); });
    for (const id of ['central-hist-busca', 'central-hist-operador']) $(id).addEventListener('input', () => { clearTimeout(histTimer); histTimer = setTimeout(() => { histPagina = 1; historico().catch(e => mensagem(e.message)); }, 300); });
    for (const id of ['central-hist-acao', 'central-hist-desde', 'central-hist-ate']) $(id).addEventListener('change', () => { histPagina = 1; historico().catch(e => mensagem(e.message)); });
    $('central-hist-anterior').addEventListener('click', () => { histPagina--; historico().catch(e => mensagem(e.message)); });
    $('central-hist-proxima').addEventListener('click', () => { histPagina++; historico().catch(e => mensagem(e.message)); });
    for (const id of dialogIds) {
      $(id).addEventListener('close', () => setTimeout(() => {
        const trigger = dialogFoco.get(id); dialogFoco.delete(id);
        if ($('overlay-responsaveis').classList.contains('oculto')) return;
        if (trigger?.isConnected && !trigger.disabled && trigger.getClientRects().length) trigger.focus();
        else $('central-tab-' + aba).focus();
      }, 0));
      $(id).addEventListener('cancel', e => { if (ocupado) e.preventDefault(); e.stopPropagation(); });
      $(id).addEventListener('keydown', e => { if (e.key === 'Escape') e.stopPropagation(); });
      $(id).addEventListener('click', e => {
        if (ocupado) return;
        const close = e.target.closest('[data-fechar-dialog]'); if (close) $(id).close();
        const marcar = e.target.closest('[data-marcar]'), desmarcar = e.target.closest('[data-desmarcar]');
        const tipo = marcar?.dataset.marcar || desmarcar?.dataset.desmarcar;
        if (tipo) { $(`central-${tipo}-bases`).querySelectorAll('input').forEach(el => { el.checked = !!marcar; }); if (tipo === 'cadastro') invalidarPrevia(); }
      });
    }
  }
  window.CentralDestinatarios = { iniciar, abrir, fechar, dialogAberto: () => dialogIds.some(id => $(id).open) };
})();
