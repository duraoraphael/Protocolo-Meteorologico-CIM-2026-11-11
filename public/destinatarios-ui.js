/* Renderizadores compartilhados da central. Somente apresentação, sem mutações. */
const CentralUI = (() => {
  const esc = Dashboard.escape;
  const icon = Dashboard.icon;
  const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function indicadores(valores) {
    return [['Cadastrados', valores.cadastrados, 'users'], ['Ativos', valores.ativos, 'usercheck'], ['Sem vínculo', valores.semVinculo, 'unlink']]
      .map(([titulo, n, icone]) => `<article class="central-indicador"><span class="central-indicador-icone">${icon(icone)}</span><div><strong>${esc(n)}</strong><span>${titulo}</span></div></article>`).join('');
  }
  function pessoa(p) {
    const nome = String(p.nome || '').trim();
    const temNome = nome && normalizar(nome) !== normalizar(p.email);
    const principal = temNome ? nome : p.email;
    return `<div class="central-pessoa"><span class="central-avatar" aria-hidden="true">${esc(String(principal || '?').slice(0, 1).toLocaleUpperCase('pt-BR'))}</span><div class="central-pessoa-texto"><strong>${esc(principal)}</strong><span class="central-email">${esc(temNome ? p.email : 'Nome pendente')}</span></div></div>`;
  }
  function vinculos(bases, nomeInstalacao) {
    if (!bases.length) return '<span class="central-sem-vinculo">Sem vínculo</span>';
    const tag = chave => `<span class="central-tag" title="${esc(nomeInstalacao(chave))}">${esc(nomeInstalacao(chave))}</span>`;
    return `<div class="central-vinculos"><div class="central-tags-visiveis">${bases.slice(0, 2).map(tag).join('')}</div>${bases.length > 2 ? `<details class="central-mais-vinculos"><summary aria-label="Ver outras ${bases.length - 2} instalações">+${bases.length - 2}</summary><div>${bases.slice(2).map(tag).join('')}</div></details>` : ''}</div>`;
  }
  const status = ativo => `<span class="central-status ${ativo ? 'ativo' : ''}"><span aria-hidden="true"></span>${ativo ? 'Ativo' : 'Inativo'}</span>`;
  function linha(p, selecionado, nomeInstalacao) {
    const descricao = p.nome && p.nome.toLowerCase() !== p.email.toLowerCase() ? p.nome : p.email;
    const acao = p.ativo ? 'Desativar' : 'Ativar';
    return `<tr><td class="central-col-selecao"><input type="checkbox" data-selecionar="${esc(p.email)}" aria-label="Selecionar ${esc(descricao)}"${selecionado ? ' checked' : ''}></td><td class="central-col-pessoa" data-coluna="Pessoa / e-mail">${pessoa(p)}</td><td class="central-col-vinculos" data-coluna="Instalações">${vinculos(p.bases, nomeInstalacao)}</td><td class="central-col-status" data-coluna="Status">${status(p.ativo)}</td><td class="central-col-acoes" data-coluna="Ações"><div class="central-acoes"><button type="button" data-editar="${esc(p.email)}" title="Editar" aria-label="Editar ${esc(descricao)}">${icon('edit')}<span>Editar</span></button><button type="button" data-status="${esc(p.email)}" title="${acao}" aria-label="${acao} ${esc(descricao)}">${icon('power')}<span>${acao}</span></button><button type="button" data-excluir="${esc(p.email)}" class="central-perigo" title="Excluir" aria-label="Excluir ${esc(descricao)}">${icon('trash')}<span class="sr-only">Excluir</span></button></div></td></tr>`;
  }
  function filtrarInstalacoes(todas, busca = '', filtro = 'todas') {
    const texto = normalizar(busca).trim();
    const encontradas = todas.filter(i => !texto || normalizar(`${i.nome} ${i.uf}`).includes(texto));
    const com = encontradas.filter(i => i.quantidade > 0).length;
    return { itens: encontradas.filter(i => filtro === 'todas' || (filtro === 'com' ? i.quantidade > 0 : i.quantidade === 0)), contagens: { todas: encontradas.length, com, sem: encontradas.length - com } };
  }
  function instalacao(i) {
    return `<article class="central-instalacao${i.quantidade ? ' central-instalacao-vinculada' : ''}"><button type="button" class="central-instalacao-consulta" data-instalar="${esc(i.chave)}" aria-label="Consultar destinatários de ${esc(i.nome)} — ${esc(i.uf)}"><span class="central-local-icone">${icon('pin')}</span><strong>${esc(i.nome)} <span>— ${esc(i.uf)}</span></strong><span class="central-local-contagem"><b>${i.quantidade}</b> ${i.quantidade === 1 ? 'destinatário' : 'destinatários'}</span></button><button type="button" class="central-local-adicionar" data-adicionar-instalacao="${esc(i.chave)}" aria-label="Adicionar destinatários a ${esc(i.nome)}">${icon('plus')}<span>Adicionar destinatários</span></button></article>`;
  }
  const acoes = { cadastrar: 'Cadastro', editar: 'Edição', alterar: 'Alteração', vincular: 'Vinculação', desvincular: 'Remoção de vínculo', ativar: 'Ativação', desativar: 'Desativação', excluir: 'Exclusão' };
  function evento(h, nomeInstalacao) {
    const data = new Date(h.data);
    const antes = h.antes?.bases || [], depois = h.depois?.bases || [];
    const relacionadas = [...new Set([...antes, ...depois])];
    const mudaram = relacionadas.filter(b => antes.includes(b) !== depois.includes(b));
    const resumo = p => !p ? 'Registro inexistente' : `${p.nome || 'Nome pendente'} · ${p.email} · ${p.ativo !== false ? 'Ativo' : 'Inativo'} · ${(p.bases || []).map(nomeInstalacao).join(', ') || 'Sem vínculo'}`;
    return `<tr data-hist-acao="${esc(h.acao)}"><td data-coluna="Data e horário"><time datetime="${esc(h.data)}"><strong>${esc(data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</strong><span class="central-email">${esc(data.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</span></time></td><td data-coluna="Usuário"><strong>${esc(h.operador)}</strong><span class="central-email">Identificação ${esc(h.identificacao)}</span></td><td data-coluna="Ação"><span class="central-acao-badge">${esc(acoes[h.acao] || h.acao)}</span></td><td data-coluna="Destinatário"><span class="central-evento-email">${esc(h.email)}</span></td><td data-coluna="Instalação">${relacionadas.length ? vinculos(mudaram.length ? mudaram : relacionadas, nomeInstalacao) : '<span class="central-sem-vinculo">—</span>'}</td><td data-coluna="Detalhes"><details class="central-evento-detalhes"><summary>Ver alteração</summary><dl><dt>Antes</dt><dd>${esc(resumo(h.antes))}</dd><dt>Depois</dt><dd>${esc(resumo(h.depois))}</dd></dl></details></td></tr>`;
  }
  return { indicadores, pessoa, vinculos, status, linha, filtrarInstalacoes, instalacao, evento };
})();
