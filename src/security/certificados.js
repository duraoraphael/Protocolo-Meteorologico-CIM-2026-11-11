// =============================================================================
// certificadosAjustado.js — versão corrigida de certificados.js
// =============================================================================
//
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------
// O certificados.js original copia para o Node TODAS as autoridades
// certificadoras (CAs) do repositório do Windows. No servidor NPAB2542 esse
// repositório tem DUAS gerações das CAs Petrobras com o mesmo nome:
//
//   - "Petrobras CA Root Corporativa"      -> versão sha512RSA (atual) e sha1RSA (antiga)
//   - "Petrobras CA Emissora Corporativa"  -> versão sha512RSA (atual) e sha1RSA (antiga)
//
// O Windows (e o curl.exe, que usa o TLS do Windows) sempre escolhe a cadeia
// mais forte. O Node, que usa o OpenSSL 3, pode escolher a versão SHA-1 e então
// recusa a conexão com o erro "CA signature digest algorithm too weak". Foi o
// que aconteceu com a API da OCEANOP (oceanop-api-disp.petrobras.com.br).
//
// O QUE MUDOU EM RELAÇÃO AO ORIGINAL
// ----------------------------------
// 1. Antes de entregar as CAs do Windows ao Node, descartamos as que foram
//    assinadas com algoritmos fracos (SHA-1, MD5, MD2). O OpenSSL 3 recusaria
//    essas CAs de qualquer forma; removê-las só impede que ele as escolha por
//    engano no lugar da versão SHA-256/SHA-512 equivalente.
// 2. Descartamos também as CAs do Windows já vencidas, que não servem para
//    validar nada e só atrapalham a montagem da cadeia.
// 3. O pacote padrão de CAs do próprio Node ("default") NÃO é filtrado.
// 4. A validação TLS continua LIGADA. Nada aqui aceita certificado inválido.
// 5. É registrado no log um resumo de quantas CAs foram aceitas e descartadas.
//
// O resto do comportamento (preferir IPv4 e o timeout de conexão de 30 s) é
// idêntico ao original.
//
// COMO APLICAR
// ------------
// Os demais arquivos importam "./security/certificados". Depois de validar,
// substitua o conteúdo de src/security/certificados.js pelo conteúdo deste
// arquivo (mantendo o nome certificados.js) e reinicie a aplicação.
// =============================================================================

const tls = require("node:tls"); // API de TLS do Node (lê e define as CAs confiáveis)
const dns = require("node:dns"); // Usado para preferir IPv4 na resolução de nomes
const { X509Certificate } = require("node:crypto"); // Lê as datas de validade de cada certificado
const { Agent, setGlobalDispatcher } = require("undici"); // Cliente HTTP usado pelo fetch do Node

let configurado = false; // Garante que a configuração rode uma única vez por processo
const TIMEOUT_CONEXAO_HTTP_MS = 30000; // Prazo máximo para abrir a conexão HTTPS (igual ao original)

// Resumo da última filtragem, exportado para diagnóstico (ex.: exibir no log ou em testes).
let ultimoResumo = null;

// -----------------------------------------------------------------------------
// Algoritmos de assinatura considerados FRACOS.
// -----------------------------------------------------------------------------
// Cada certificado informa, por um código chamado OID, qual algoritmo foi usado
// para assiná-lo. Abaixo estão os OIDs dos algoritmos fracos, já na forma de
// bytes (hexadecimal) em que aparecem dentro do certificado. Comparar bytes
// evita depender de bibliotecas externas ou de recursos novos do Node.
const OIDS_ASSINATURA_FRACA = new Map([
  ["2a864886f70d010102", "md2WithRSAEncryption"], // 1.2.840.113549.1.1.2
  ["2a864886f70d010104", "md5WithRSAEncryption"], // 1.2.840.113549.1.1.4
  ["2a864886f70d010105", "sha1WithRSAEncryption"], // 1.2.840.113549.1.1.5  <- caso das CAs Petrobras antigas
  ["2b0e03021d", "sha1WithRSA (OIW)"], // 1.3.14.3.2.29
  ["2a8648ce380403", "dsaWithSHA1"], // 1.2.840.10040.4.3
  ["2a8648ce3d0401", "ecdsaWithSHA1"], // 1.2.840.10045.4.1
]);

function preferirIpv4NoWindows() {
  if (process.platform !== "win32") return false; // Só faz sentido no servidor Windows
  dns.setDefaultResultOrder("ipv4first"); // Tenta o endereço IPv4 antes do IPv6
  return true;
}

// -----------------------------------------------------------------------------
// Conversão de PEM (texto) para DER (bytes).
// -----------------------------------------------------------------------------
// O Node entrega cada CA como texto PEM:
//   -----BEGIN CERTIFICATE-----
//   MIIF... (base64)
//   -----END CERTIFICATE-----
// Para ler o algoritmo de assinatura precisamos dos bytes originais (DER), que
// são o conteúdo base64 entre as linhas BEGIN e END.
function pemParaDer(pem) {
  const base64 = String(pem)
    .replace(/-----BEGIN CERTIFICATE-----/, "") // Remove a linha de abertura
    .replace(/-----END CERTIFICATE-----/, "") // Remove a linha de fechamento
    .replace(/\s+/g, ""); // Remove quebras de linha e espaços
  return Buffer.from(base64, "base64"); // Decodifica o base64 em bytes
}

// -----------------------------------------------------------------------------
// Leitura mínima do formato DER (ASN.1).
// -----------------------------------------------------------------------------
// Um certificado X.509 tem esta estrutura simplificada:
//
//   Certificate ::= SEQUENCE {
//     tbsCertificate       SEQUENCE { ... dados do certificado ... },
//     signatureAlgorithm   SEQUENCE { OID do algoritmo, parâmetros },   <- o que queremos
//     signatureValue       BIT STRING
//   }
//
// Cada elemento DER é: [1 byte de tipo][tamanho][conteúdo]. A função abaixo lê
// o tipo e o tamanho de um elemento a partir de uma posição do buffer.
function lerElementoDer(buffer, posicao) {
  if (posicao + 2 > buffer.length) throw new Error("DER truncado");
  const tipo = buffer[posicao]; // Ex.: 0x30 = SEQUENCE, 0x06 = OID
  let tamanho = buffer[posicao + 1]; // Primeiro byte do tamanho
  let inicioConteudo = posicao + 2;

  // Se o bit mais alto estiver ligado (>= 0x80), o tamanho é "longo": os 7 bits
  // de baixo dizem quantos bytes seguintes guardam o tamanho real.
  if (tamanho & 0x80) {
    const quantidadeBytes = tamanho & 0x7f;
    if (quantidadeBytes < 1 || quantidadeBytes > 4)
      throw new Error("Tamanho DER não suportado");
    tamanho = 0;
    for (let i = 0; i < quantidadeBytes; i++) {
      tamanho = tamanho * 256 + buffer[inicioConteudo + i]; // Monta o número byte a byte
    }
    inicioConteudo += quantidadeBytes;
  }

  const fim = inicioConteudo + tamanho; // Posição logo após o conteúdo
  if (fim > buffer.length) throw new Error("DER truncado");
  return { tipo, inicioConteudo, fim };
}

// Devolve o OID do algoritmo de assinatura (em hexadecimal) de um certificado DER.
function oidAssinaturaDoCertificado(der) {
  const certificado = lerElementoDer(der, 0); // SEQUENCE externa (o certificado)
  if (certificado.tipo !== 0x30) throw new Error("Não é um certificado DER");

  const tbs = lerElementoDer(der, certificado.inicioConteudo); // 1º item: tbsCertificate
  const algoritmo = lerElementoDer(der, tbs.fim); // 2º item: signatureAlgorithm
  if (algoritmo.tipo !== 0x30) throw new Error("signatureAlgorithm inesperado");

  const oid = lerElementoDer(der, algoritmo.inicioConteudo); // 1º item dentro: o OID
  if (oid.tipo !== 0x06) throw new Error("OID de assinatura inesperado");
  return der.subarray(oid.inicioConteudo, oid.fim).toString("hex");
}

// -----------------------------------------------------------------------------
// Decide se uma CA do Windows deve ser usada ou descartada.
// -----------------------------------------------------------------------------
// Retorna { usar: true } ou { usar: false, motivo: "..." }.
// Se não conseguirmos interpretar o certificado, ele é MANTIDO, preservando o
// comportamento original (o objetivo é só remover o que sabemos ser problema).
function avaliarCertificado(pem, agora = new Date()) {
  try {
    const oid = oidAssinaturaDoCertificado(pemParaDer(pem));
    const algoritmoFraco = OIDS_ASSINATURA_FRACA.get(oid);
    if (algoritmoFraco)
      return { usar: false, motivo: `assinatura fraca (${algoritmoFraco})` };

    const validoAte = Date.parse(new X509Certificate(pem).validTo); // Data de vencimento da CA
    if (Number.isFinite(validoAte) && validoAte < agora.getTime()) {
      return { usar: false, motivo: "certificado vencido" };
    }
    return { usar: true };
  } catch {
    return { usar: true }; // Formato inesperado: mantém, como o código original faria
  }
}

// Filtra a lista de CAs do Windows e devolve só as seguras, com um resumo.
function filtrarCertificadosDoSistema(certificadosPem, agora = new Date()) {
  const aceitos = [];
  const descartados = { assinaturaFraca: 0, vencidos: 0 };
  for (const pem of certificadosPem) {
    const avaliacao = avaliarCertificado(pem, agora);
    if (avaliacao.usar) {
      aceitos.push(pem);
    } else if (avaliacao.motivo === "certificado vencido") {
      descartados.vencidos++;
    } else {
      descartados.assinaturaFraca++;
    }
  }
  return { aceitos, descartados };
}

// CAs do Windows já filtradas. Exportada para que outros módulos que montam o
// próprio Agent (inmetObservations.js, climaSaudeService.js, monitorSecas.js)
// possam usar a mesma lista segura no lugar de tls.getCACertificates("system").
function certificadosDoSistemaSeguros() {
  if (typeof tls.getCACertificates !== "function") return [];
  return filtrarCertificadosDoSistema(tls.getCACertificates("system")).aceitos;
}

function configurarCertificadosDoSistema() {
  // Executa só uma vez e só no Windows (onde existe o repositório do sistema).
  if (configurado || process.platform !== "win32") return false;

  // Essas funções só existem em versões recentes do Node. Sem elas, nada é
  // alterado (mesmo comportamento do arquivo original).
  if (
    typeof tls.getCACertificates !== "function" ||
    typeof tls.setDefaultCACertificates !== "function"
  ) {
    return false;
  }

  const padraoNode = tls.getCACertificates("default"); // CAs públicas embutidas no Node (não são filtradas)
  const sistema = tls.getCACertificates("system"); // CAs do repositório do Windows (serão filtradas)
  const { aceitos, descartados } = filtrarCertificadosDoSistema(sistema);

  // Junta as CAs do Node com as CAs seguras do Windows, sem repetições, e
  // define essa lista como a lista oficial de CAs confiáveis do processo.
  tls.setDefaultCACertificates([...new Set([...padraoNode, ...aceitos])]);

  ultimoResumo = {
    sistemaTotal: sistema.length,
    sistemaAceitos: aceitos.length,
    descartadosAssinaturaFraca: descartados.assinaturaFraca,
    descartadosVencidos: descartados.vencidos,
  };
  // Uma linha no log facilita confirmar, no servidor, que o ajuste está ativo.
  console.log(
    `[CERTIFICADOS] CAs do Windows: ${aceitos.length} aceitas de ${sistema.length} ` +
      `(${descartados.assinaturaFraca} descartadas por assinatura fraca, ${descartados.vencidos} vencidas).`,
  );

  configurado = true;
  return true;
}

// O fetch nativo do Node encerra a conexão em 10 s, mesmo quando a chamada
// possui um AbortSignal mais longo. Em redes corporativas, o handshake TLS
// pode ultrapassar esse limite. Mantemos os timeouts totais de cada fonte e
// aumentamos apenas o prazo de estabelecimento da conexão HTTPS.
function configurarClienteHttp() {
  setGlobalDispatcher(new Agent({ connectTimeout: TIMEOUT_CONEXAO_HTTP_MS }));
}

// Mesma ordem do original: as CAs precisam estar definidas ANTES de criar o
// Agent global, para que as novas conexões já usem a lista filtrada.
preferirIpv4NoWindows();
configurarCertificadosDoSistema();
configurarClienteHttp();

module.exports = {
  TIMEOUT_CONEXAO_HTTP_MS,
  configurarCertificadosDoSistema,
  configurarClienteHttp,
  preferirIpv4NoWindows,
  // Novas exportações (diagnóstico, testes e reaproveitamento por outros módulos):
  certificadosDoSistemaSeguros,
  filtrarCertificadosDoSistema,
  oidAssinaturaDoCertificado,
  pemParaDer,
  obterResumoCertificados: () => ultimoResumo,
};
