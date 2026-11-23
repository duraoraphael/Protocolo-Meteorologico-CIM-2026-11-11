// Administração do cadastro existente. Todas as operações síncronas validam
// o conjunto antes da única troca de arquivo (cadastros + auditoria + recibo).
const { createHash } = require('node:crypto');
const cadastro = require('../config/recipients');
const { BASES_DISTRIBUICAO } = require('../config/distributionBases');
const MAX_REGISTROS = 500;
const falhar = cadastro.erroEntrada;
const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const instalacoes = () => Object.values(BASES_DISTRIBUICAO).map(({ chave, nome, uf, tipo }) => ({ chave, nome, uf, tipo }));
function registrosEntrada({ texto, registros } = {}) {
  if (texto !== undefined) {
    if (typeof texto !== 'string' || texto.length > 150000) throw falhar('Texto inválido ou muito grande.');
    registros = texto.split(/[;\r\n]+/).map(email => email.trim()).filter(Boolean).map(email => ({ email }));
  }
  if (!Array.isArray(registros) || !registros.length || registros.length > MAX_REGISTROS) throw falhar(`Informe de 1 a ${MAX_REGISTROS} destinatários.`);
  return registros;
}
function previa(entrada, dados = cadastro.carregarTodos()) {
  const vistos = new Set();
  const existentes = new Set(dados.responsaveis.map(p => String(p.email).toLowerCase()));
  const contagens = { validos: 0, invalidos: 0, repetidos: 0, existentes: 0 };
  const itens = registrosEntrada(entrada).map((registro, index) => {
    let email = typeof registro?.email === 'string' ? registro.email.trim().slice(0, 300) : '';
    let nome = '';
    let bases = [];
    let status, erro;
    try {
      if (!registro || typeof registro !== 'object' || Array.isArray(registro)) throw falhar('Linha inválida.');
      email = cadastro.validarEmail(registro.email);
      nome = registro.nome === undefined || registro.nome === '' ? '' : cadastro.validarNome(registro.nome);
      bases = cadastro.validarBases(registro.bases === undefined ? [] : registro.bases);
      status = vistos.has(email) ? 'repetidos' : existentes.has(email) ? 'existentes' : 'validos';
      vistos.add(email);
    } catch (e) { status = 'invalidos'; erro = e.publico ? e.message : 'Linha inválida.'; }
    contagens[status]++;
    return { linha: index + 1, nome, email, bases, status, ...(erro ? { erro } : {}) };
  });
  return { itens, contagens };
}
function positivo(v, padrao, max) {
  const n = Number(v === undefined ? padrao : v);
  if (!Number.isInteger(n) || n < 1 || n > max) throw falhar('Paginação inválida.');
  return n;
}
function filtrar(f = {}) {
  for (const chave of ['busca', 'instalacao', 'status', 'vinculos', 'ordem', 'direcao']) {
    if (f[chave] !== undefined && (typeof f[chave] !== 'string' || f[chave].length > 200)) throw falhar('Filtro inválido.');
  }
  if (f.instalacao) cadastro.validarCidade(f.instalacao);
  if (f.status && !['ativos', 'inativos', 'todos'].includes(f.status)) throw falhar('Status inválido.');
  if (f.vinculos && !['com', 'sem', 'todos'].includes(f.vinculos)) throw falhar('Filtro de vínculos inválido.');
  const todos = cadastro.listarResponsaveis();
  const nomes = new Map(instalacoes().map(i => [i.chave, `${i.nome} ${i.uf}`]));
  const busca = normalizar(f.busca).trim();
  const itens = todos.filter(p => (!f.instalacao || p.bases.includes(f.instalacao))
    && (!f.status || f.status === 'todos' || (f.status === 'ativos' ? p.ativo : !p.ativo))
    && (!f.vinculos || f.vinculos === 'todos' || (f.vinculos === 'com' ? p.bases.length : !p.bases.length))
    && (!busca || normalizar(`${p.nome} ${p.email} ${p.bases.map(b => nomes.get(b)).join(' ')}`).includes(busca)));
  const ordem = ['nome', 'email', 'instalacoes', 'status'].includes(f.ordem) ? f.ordem : 'nome';
  const dir = f.direcao === 'desc' ? -1 : 1;
  itens.sort((a, b) => {
    const valor = p => ordem === 'instalacoes' ? p.bases.length : ordem === 'status' ? Number(p.ativo) : (p[ordem] || '');
    const x = valor(a), y = valor(b);
    return dir * (typeof x === 'number' ? x - y : x.localeCompare(y, 'pt-BR', { sensitivity: 'base' })) || a.email.localeCompare(b.email);
  });
  return { itens, indicadores: { cadastrados: todos.length, ativos: todos.filter(p => p.ativo).length, semVinculo: todos.filter(p => !p.bases.length).length },
    instalacoes: instalacoes().map(i => ({ ...i, quantidade: todos.filter(p => p.bases.includes(i.chave)).length })) };
}
function consultar(f = {}) {
  const { itens, ...resto } = filtrar(f);
  const tamanho = positivo(f.tamanho, 25, 100);
  const pagina = Math.min(positivo(f.pagina, 1, 1000000), Math.max(1, Math.ceil(itens.length / tamanho)));
  return { ...resto, total: itens.length, pagina, tamanho, itens: itens.slice((pagina - 1) * tamanho, pagina * tamanho) };
}
function historico(f = {}) {
  if (f.busca !== undefined && (typeof f.busca !== 'string' || f.busca.length > 200)) throw falhar('Pesquisa inválida.');
  if (f.operador !== undefined && (typeof f.operador !== 'string' || f.operador.length > 100)) throw falhar('Operador inválido.');
  for (const k of ['desde', 'ate']) {
    if (!f[k]) continue;
    const data = typeof f[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f[k]) ? new Date(f[k] + 'T00:00:00Z') : null;
    if (!data || !Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== f[k]) throw falhar('Data inválida.');
  }
  if (f.desde && f.ate && f.desde > f.ate) throw falhar('A data inicial deve ser anterior à data final.');
  const dataBrasilia = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const busca = normalizar(f.busca);
  const itens = (cadastro.carregarTodos().historico || []).filter(h => (!f.acao || h.acao === f.acao)
    && (!f.operador || normalizar(h.operador).includes(normalizar(f.operador).trim()))
    && (!f.desde || dataBrasilia(h.data) >= f.desde) && (!f.ate || dataBrasilia(h.data) <= f.ate)
    && (!busca || normalizar(JSON.stringify(h)).includes(busca))).reverse();
  const tamanho = positivo(f.tamanho, 25, 100);
  const pagina = Math.min(positivo(f.pagina, 1, 1000000), Math.max(1, Math.ceil(itens.length / tamanho)));
  return { total: itens.length, pagina, tamanho, itens: itens.slice((pagina - 1) * tamanho, pagina * tamanho) };
}
function executar(entrada) {
  const { id, operador, acao } = entrada;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw falhar('Identificador da operação inválido.');
  const autor = cadastro.validarNome(operador);
  const acoes = ['cadastrar', 'editar', 'vincular', 'desvincular', 'ativar', 'desativar', 'excluir'];
  if (!acoes.includes(acao)) throw falhar('Ação inválida.');
  // Somente campos conhecidos entram no recibo; senha/tokens nunca são gravados.
  const payload = Object.fromEntries(['acao', 'operador', 'registros', 'bases', 'existentes', 'emails', 'nome', 'email', 'confirmado'].filter(k => entrada[k] !== undefined).map(k => [k, entrada[k]]));
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const dados = cadastro.carregarTodos();
  const recibo = (dados.operacoes || []).find(o => o.id === id);
  if (recibo) {
    if (recibo.digest !== digest) throw Object.assign(falhar('Identificador já utilizado para outra operação.'), { status: 409 });
    return recibo.resultado;
  }
  const resultado = { sucessos: 0, ignorados: 0, falhas: 0, itens: [] };
  const adicionarResultado = (email, status) => { resultado[status]++; resultado.itens.push({ email, status }); };
  if (acao === 'cadastrar') {
    const bases = cadastro.validarBases(entrada.bases === undefined ? [] : entrada.bases);
    if (entrada.existentes !== undefined && !['ignorar', 'vincular'].includes(entrada.existentes)) throw falhar('Tratamento de existentes inválido.');
    const p = previa({ registros: entrada.registros }, dados);
    if (p.contagens.invalidos) throw falhar('O lote contém registros inválidos. Corrija a prévia antes de confirmar.');
    for (const item of p.itens) {
      if (item.status === 'repetidos' || (item.status === 'existentes' && entrada.existentes !== 'vincular')) { adicionarResultado(item.email, 'ignorados'); continue; }
      let pessoa = dados.responsaveis.find(r => r.email.toLowerCase() === item.email);
      if (!pessoa) { pessoa = { nome: item.nome, email: item.email, bases: [], ativo: true }; dados.responsaveis.push(pessoa); }
      const novas = [...new Set([...pessoa.bases, ...bases, ...item.bases])];
      if (item.status === 'existentes' && novas.length === pessoa.bases.length) { adicionarResultado(item.email, 'ignorados'); continue; }
      pessoa.bases = novas;
      adicionarResultado(item.email, 'sucessos');
    }
  } else {
    if (entrada.confirmado !== true) throw falhar('Confirme a alteração antes de continuar.');
    if (!Array.isArray(entrada.emails) || !entrada.emails.length || entrada.emails.length > MAX_REGISTROS) throw falhar('Selecione de 1 a 500 destinatários.');
    const emails = [...new Set(entrada.emails.map(cadastro.validarEmail))];
    const pessoas = emails.map(email => dados.responsaveis.find(p => String(p.email).toLowerCase() === email));
    if (pessoas.some(p => !p)) throw falhar('Um dos destinatários não foi encontrado. Atualize a lista.');
    const bases = ['editar', 'vincular', 'desvincular'].includes(acao) ? cadastro.validarBases(entrada.bases) : [];
    if (['vincular', 'desvincular'].includes(acao) && !bases.length) throw falhar('Selecione ao menos uma instalação.');
    if (acao === 'editar') {
      if (pessoas.length !== 1) throw falhar('Edite uma pessoa de cada vez.');
      const email = cadastro.validarEmail(entrada.email);
      const nome = entrada.nome === '' ? '' : cadastro.validarNome(entrada.nome);
      if (dados.responsaveis.some(p => p !== pessoas[0] && p.email.toLowerCase() === email)) throw falhar('Este e-mail já está cadastrado.');
      pessoas[0].email = email; pessoas[0].nome = nome;
      pessoas[0].bases = [...pessoas[0].bases.filter(b => !Object.hasOwn(BASES_DISTRIBUICAO, b)), ...bases];
    }
    for (const p of pessoas) {
      if (acao === 'vincular') p.bases = [...new Set([...p.bases, ...bases])];
      if (acao === 'desvincular') p.bases = p.bases.filter(b => !bases.includes(b));
      if (acao === 'ativar' || acao === 'desativar') p.ativo = acao === 'ativar';
      if (acao === 'excluir') dados.responsaveis = dados.responsaveis.filter(r => r !== p);
      adicionarResultado(p.email, 'sucessos');
    }
  }
  dados.operacoes = [...(dados.operacoes || []), { id, digest, resultado }];
  cadastro.salvarTodos(dados, { operador: autor, acao,
    ...(acao === 'editar' ? { emailAnterior: cadastro.validarEmail(entrada.emails[0]), emailNovo: cadastro.validarEmail(entrada.email) } : {}),
  });
  return resultado;
}
module.exports = { previa, executar, consultar, historico, filtrar, instalacoes, MAX_REGISTROS };
