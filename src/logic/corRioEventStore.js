const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const PARTES = ['estagio', 'calor'];
const nivelValido = n => Number.isInteger(n) && n >= 1 && n <= 5;

function carregar(arquivo) {
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('Formato inválido.');
    if (dados.versao === undefined) {
      if (Object.entries(dados).some(([p, n]) => p !== 'publicacoes' && (!PARTES.includes(p) || !nivelValido(n)))) {
        throw new Error('Referência de estágios inválida.');
      }
      return { versao: 2, observados: Object.fromEntries(PARTES.filter(p => dados[p] !== undefined).map(p => [p, dados[p]])),
        eventos: [], legado: dados };
    }
    if (dados.versao !== 2 || !dados.observados || typeof dados.observados !== 'object' || Array.isArray(dados.observados)
      || Object.entries(dados.observados).some(([p, n]) => !PARTES.includes(p) || !nivelValido(n))
      || !Array.isArray(dados.eventos)) throw new Error('Estado de eventos inválido.');
    const ids = new Set();
    for (const e of dados.eventos) {
      if (typeof e.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(e.id) || ids.has(e.id)
        || !['pendente', 'processando', 'enviado'].includes(e.status) || !e.report?.corRio
        || !Number.isFinite(Date.parse(e.identificadoEm)) || !Array.isArray(e.mudancas) || !e.mudancas.length
        || e.mudancas.some(m => !PARTES.includes(m.parte) || !nivelValido(m.anterior) || !nivelValido(m.atual)
          || m.anterior === m.atual || m.tipo !== (m.atual > m.anterior ? 'AGRAVAMENTO' : 'REDUÇÃO'))) {
        throw new Error('Evento de mudança inválido.');
      }
      ids.add(e.id);
    }
    return dados;
  } catch (erro) {
    if (erro.code === 'ENOENT') return { versao: 2, observados: {}, eventos: [] };
    throw new Error(`Estado COR-Rio ilegível; envio suspenso: ${erro.message}`, { cause: erro });
  }
}

function salvar(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const temporario = `${arquivo}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporario, JSON.stringify(dados, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temporario, arquivo);
  } finally { if (fs.existsSync(temporario)) fs.unlinkSync(temporario); }
}

// A trava é mantida durante coleta e SMTP. Um processo vivo não a perde por timeout.
function adquirirTrava(arquivo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const nome = `${arquivo}.lock`;
  const token = randomUUID();
  const dono = `${nome}.owner-${token}`;
  const recuperacao = `${nome}.recuperacao`;
  const vivo = pid => {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
  };
  const ler = caminho => {
    const bruto = fs.readFileSync(caminho, 'utf8');
    try { return { bruto, dados: JSON.parse(bruto) }; } catch { return { bruto, dados: null }; }
  };
  let adquirida = false;
  // O nome público é criado por hard link somente depois de o conteúdo estar completo.
  fs.writeFileSync(dono, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', mode: 0o600 });
  try {
    if (fs.existsSync(recuperacao)) {
      const guarda = ler(recuperacao);
      if (vivo(guarda.dados?.pid)) return null;
      if (ler(recuperacao).bruto !== guarda.bruto) return null;
      fs.unlinkSync(recuperacao);
    }
    try { fs.linkSync(dono, nome); adquirida = true; }
    catch (erro) {
      if (erro.code !== 'EEXIST') throw erro;
      const anterior = ler(nome);
      if (vivo(anterior.dados?.pid)) return null;
      // Trava inválida recente pode ser de uma versão antiga ainda terminando a escrita.
      if (!anterior.dados && Date.now() - fs.statSync(nome).mtimeMs < 300000) return null;
      try { fs.linkSync(dono, recuperacao); }
      catch (e) { if (e.code === 'EEXIST') return null; throw e; }
      try {
        if (ler(nome).bruto !== anterior.bruto) return null;
        fs.unlinkSync(nome);
        try { fs.linkSync(dono, nome); adquirida = true; }
        catch (e) { if (e.code !== 'EEXIST') throw e; }
      } finally {
        if (ler(recuperacao).dados?.token === token) fs.unlinkSync(recuperacao);
      }
    }
  } finally {
    fs.unlinkSync(dono);
  }
  if (!adquirida) return null;
  return () => {
    if (ler(nome).dados?.token === token) fs.unlinkSync(nome);
  };
}

module.exports = { PARTES, nivelValido, carregar, salvar, adquirirTrava };
