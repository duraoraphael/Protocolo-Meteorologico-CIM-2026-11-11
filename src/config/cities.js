// Cadastro de instalações/bases monitoradas pelo CIM.
// Para adicionar uma nova instalação, copie um bloco, ajuste os dados e
// inclua a chave na lista CIDADE_ATIVA (env CIDADE) ou selecione no painel.
//
// codigoIbge: código IBGE de 7 dígitos usado pela API de previsão do INMET
// (mesmo código usado na URL publica https://previsao.inmet.gov.br/<codigo>).
// Códigos e coordenadas conferidos em servicodados.ibge.gov.br e OpenStreetMap.
// climaSaudeUrl: página municipal pública conferida por HTTP 200 e título da
// localidade. Campo manual; não derivar URL automaticamente da chave da base.
// integracaoCorRio: exibe o painel de comunicados e estágio do COR-Rio. O
// COR-Rio cobre só o município do Rio de Janeiro — não habilitar em outras bases.

const CIDADES = {
  rio_de_janeiro: {
    chave: "rio_de_janeiro",
    costeira: true,
    nome: "Rio de Janeiro",
    uf: "RJ",
    latitude: -22.9068,
    longitude: -43.1729,
    pontoMar: { latitude: -23.10, longitude: -43.12, referencia: "Atlântico ao sul da costa do Rio de Janeiro" },
    codigoIbge: "3304557",
    climaSaudeUrl: "https://clima.saude.gov.br/rj/rio-de-janeiro?modo=ehf",
    integracaoCorRio: true,
    links: {
      inmet: "https://previsao.inmet.gov.br/3304557",
      alertaRio:
        "https://websempre.rio.rj.gov.br/procedimentos/previsao/mural/boletim",
      corRio: "https://cor.rio/category/estagios/",
      defesaCivilTelefone: "199",
    },
  },

  macae: {
    chave: "macae",
    costeira: true,
    nome: "Macaé",
    uf: "RJ",
    latitude: -22.2828305,
    longitude: -41.9649091,
    pontoMar: { latitude: -22.40, longitude: -41.70, referencia: "Atlântico a leste da costa de Macaé" },
    codigoIbge: "3302403",
    climaSaudeUrl: "https://clima.saude.gov.br/rj/macae?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3302403",
      defesaCivilTelefone: "199",
    },
  },

  brasilia: {
    chave: "brasilia",
    nome: "Brasília",
    uf: "DF",
    latitude: -15.7939869,
    longitude: -47.8828,
    codigoIbge: "5300108",
    climaSaudeUrl: "https://clima.saude.gov.br/df/brasilia?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/5300108",
      defesaCivilTelefone: "199",
    },
  },

  manaus: {
    chave: "manaus",
    nome: "Manaus",
    uf: "AM",
    // Fuso IANA da localidade (padrão: America/Sao_Paulo). Define o dia civil
    // local da seção "Previsão para os próximos 3 dias".
    fusoHorario: "America/Manaus",
    latitude: -3.1316333,
    longitude: -59.9825041,
    codigoIbge: "1302603",
    climaSaudeUrl: "https://clima.saude.gov.br/am/manaus?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/1302603",
      defesaCivilTelefone: "199",
    },
  },

  santos: {
    chave: "santos",
    costeira: true,
    nome: "Santos",
    uf: "SP",
    latitude: -23.9609448,
    longitude: -46.3166316,
    pontoMar: { latitude: -24.10, longitude: -46.25, referencia: "Atlântico ao largo de Santos" },
    codigoIbge: "3548500",
    climaSaudeUrl: "https://clima.saude.gov.br/sp/santos?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3548500",
      defesaCivilTelefone: "199",
    },
  },

  aracaju: {
    chave: "aracaju",
    costeira: true,
    nome: "Aracaju",
    uf: "SE",
    fusoHorario: "America/Maceio",
    latitude: -10.9162061,
    longitude: -37.0774655,
    pontoMar: { latitude: -11.05, longitude: -36.98, referencia: "Atlântico ao largo de Aracaju" },
    codigoIbge: "2800308",
    climaSaudeUrl: "https://clima.saude.gov.br/se/aracaju?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/2800308",
      defesaCivilTelefone: "199",
    },
  },

  natal: {
    chave: "natal",
    costeira: true,
    nome: "Natal",
    uf: "RN",
    fusoHorario: "America/Fortaleza",
    latitude: -5.8115,
    longitude: -35.2415,
    pontoMar: { latitude: -5.82, longitude: -35.10, referencia: "Atlântico a leste de Natal" },
    codigoIbge: "2408102",
    climaSaudeUrl: "https://clima.saude.gov.br/rn/natal?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/2408102",
      defesaCivilTelefone: "199",
    },
  },

  oiapoque: {
    chave: "oiapoque",
    costeira: true,
    nome: "Oiapoque",
    uf: "AP",
    fusoHorario: "America/Belem",
    latitude: 3.861224,
    longitude: -51.796699,
    pontoMar: { latitude: 4.10, longitude: -51.20, referencia: "Atlântico na costa do Amapá, referência para Oiapoque" },
    codigoIbge: "1600501",
    climaSaudeUrl: "https://clima.saude.gov.br/ap/oiapoque?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/1600501",
      defesaCivilTelefone: "199",
    },
  },

  vitoria: {
    chave: "vitoria",
    costeira: true,
    nome: "Vitória",
    uf: "ES",
    latitude: -20.3200917,
    longitude: -40.3376682,
    pontoMar: { latitude: -20.38, longitude: -40.20, referencia: "Atlântico ao largo de Vitória" },
    codigoIbge: "3205309",
    climaSaudeUrl: "https://clima.saude.gov.br/es/vitoria?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3205309",
      defesaCivilTelefone: "199",
    },
  },

  araucaria: {
    chave: "araucaria",
    nome: "Araucária",
    uf: "PR",
    // Coordenadas vigentes da instalação, em linha com a operação da base
    // e com a cobertura da localidade. A chave "araucaria" é mantida para
    // compatibilidade com destinatários, .env e histórico.
    latitude: -25.565696643661106,
    longitude: -49.36908945649937,
    codigoIbge: "4101804",
    climaSaudeUrl: "https://clima.saude.gov.br/pr/araucaria?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/4101804",
      defesaCivilTelefone: "199",
    },
  },

  utg_sul: {
    chave: "utg_sul",
    nome: "Anchieta",
    uf: "ES",
    municipio: "Anchieta",
    latitude: -20.79490211144529,
    longitude: -40.62122053457425,
    codigoIbge: "3200409",
    climaSaudeUrl: "https://clima.saude.gov.br/es/anchieta?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3200409",
      defesaCivilTelefone: "199",
    },
  },

  utg_c: {
    chave: "utg_c",
    nome: "Linhares",
    uf: "ES",
    municipio: "Linhares",
    latitude: -19.463066781816277,
    longitude: -39.761312334054885,
    status: "PENDENTE_VALIDACAO_GEOGRAFICA",
    observacao: "Coordenadas divergentes da UTG-CA em Caraguatatuba; validar a correspondência município/instalação antes de ativar consultas.",
    codigoIbge: "3203205",
    climaSaudeUrl: "https://clima.saude.gov.br/es/linhares?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3203205",
      defesaCivilTelefone: "199",
    },
  },

  topo_da_serra_etel: {
    chave: "topo_da_serra_etel",
    nome: "São Bernardo do Campo",
    uf: "SP",
    municipio: "São Bernardo do Campo",
    latitude: -23.872212501750322,
    longitude: -46.471028653928194,
    codigoIbge: "3548708",
    climaSaudeUrl: "https://clima.saude.gov.br/sp/sao-bernardo-do-campo?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3548708",
      defesaCivilTelefone: "199",
    },
  },

  doutor_ulysses: {
    chave: "doutor_ulysses",
    nome: "Doutor Ulysses",
    uf: "PR",
    municipio: "Doutor Ulysses",
    latitude: -24.691388889,
    longitude: -49.402388889,
    codigoIbge: "4128633",
    climaSaudeUrl: "https://clima.saude.gov.br/pr/doutor-ulysses?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/4128633",
      defesaCivilTelefone: "199",
    },
  },

  boaventura: {
    chave: "boaventura",
    nome: "Itaboraí",
    uf: "RJ",
    municipio: "Itaboraí",
    latitude: -22.6596237759285,
    longitude: -42.85177810970536,
    codigoIbge: "3301900",
    climaSaudeUrl: "https://clima.saude.gov.br/rj/itaborai?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3301900",
      defesaCivilTelefone: "199",
    },
  },

  utg_ca: {
    chave: "utg_ca",
    nome: "Caraguatatuba",
    uf: "SP",
    municipio: "Caraguatatuba",
    latitude: -23.653242663926168,
    longitude: -45.50125009135754,
    codigoIbge: "3510500",
    climaSaudeUrl: "https://clima.saude.gov.br/sp/caraguatatuba?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3510500",
      defesaCivilTelefone: "199",
    },
  },

  barra_do_furado: {
    chave: "barra_do_furado",
    nome: "Barra do Furado",
    uf: "RJ",
    municipio: "Quissamã",
    latitude: -22.11304416834751,
    longitude: -41.175836244055,
    codigoIbge: "3304151",
    climaSaudeUrl: "https://clima.saude.gov.br/rj/quissama?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3304151",
      defesaCivilTelefone: "199",
    },
  },

  betim: {
    chave: "betim",
    nome: "Betim",
    uf: "MG",
    latitude: -19.963620120580366,
    longitude: -44.09501451886685,
    codigoIbge: "3106705",
    climaSaudeUrl: "https://clima.saude.gov.br/mg/betim?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3106705",
      defesaCivilTelefone: "199",
    },
  },

  ipojuca: {
    chave: "ipojuca",
    nome: "Ipojuca",
    uf: "PE",
    latitude: -8.379278305689569,
    longitude: -35.00976989433653,
    codigoIbge: "2607208",
    climaSaudeUrl: "https://clima.saude.gov.br/pe/ipojuca?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/2607208",
      defesaCivilTelefone: "199",
    },
  },

  criciuma: {
    chave: "criciuma",
    nome: "Criciúma",
    uf: "SC",
    latitude: -28.738353,
    longitude: -49.413122,
    codigoIbge: "4204608",
    climaSaudeUrl: "https://clima.saude.gov.br/sc/criciuma?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/4204608",
      defesaCivilTelefone: "199",
    },
  },

  imbituba: {
    chave: "imbituba",
    nome: "Imbituba",
    uf: "SC",
    latitude: -28.236617,
    longitude: -48.661178,
    codigoIbge: "4207304",
    climaSaudeUrl: "https://clima.saude.gov.br/sc/imbituba?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/4207304",
      defesaCivilTelefone: "199",
    },
  },

  refap: {
    chave: "refap",
    nome: "Canoas",
    uf: "RS",
    municipio: "Canoas",
    latitude: -29.86944,
    longitude: -51.17778,
    codigoIbge: "4304606",
    climaSaudeUrl: "https://clima.saude.gov.br/rs/canoas?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/4304606",
      defesaCivilTelefone: "199",
    },
  },

  barra_dos_coqueiros: {
    chave: "barra_dos_coqueiros",
    nome: "Barra dos Coqueiros",
    uf: "SE",
    latitude: -10.907569,
    longitude: -37.038624,
    codigoIbge: "2800605",
    climaSaudeUrl: "https://clima.saude.gov.br/se/barra-dos-coqueiros?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/2800605",
      defesaCivilTelefone: "199",
    },
  },

  ute_termorio: {
    chave: "ute_termorio",
    nome: "Duque de Caxias",
    uf: "RJ",
    municipio: "Duque de Caxias",
    latitude: -22.714467,
    longitude: -43.253914,
    codigoIbge: "3301702",
    climaSaudeUrl: "https://clima.saude.gov.br/rj/duque-de-caxias?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3301702",
      defesaCivilTelefone: "199",
    },
  },

  aeroporto_de_marica: {
    chave: "aeroporto_de_marica",
    nome: "Aeroporto de Maricá",
    uf: "RJ",
    municipio: "Maricá",
    latitude: -22.973691,
    longitude: -42.928429,
    codigoIbge: "3302700",
    climaSaudeUrl: "https://clima.saude.gov.br/rj/marica?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/3302700",
      defesaCivilTelefone: "199",
    },
  },

  salvador: {
    chave: "salvador",
    costeira: true,
    nome: "Salvador",
    uf: "BA",
    fusoHorario: "America/Bahia",
    latitude: -12.9777,
    longitude: -38.5016,
    pontoMar: { latitude: -13.05, longitude: -38.30, referencia: "Atlântico a leste de Salvador" },
    codigoIbge: "2927408",
    climaSaudeUrl: "https://clima.saude.gov.br/ba/salvador?modo=ehf",
    links: {
      inmet: "https://previsao.inmet.gov.br/2927408",
      codesal: "https://codesal.salvador.ba.gov.br/",
      defesaCivilTelefone: "199",
    },
  },
};

// Cidade usada por padrão quando a env CIDADE não é definida.
const CIDADE_PADRAO = "rio_de_janeiro";

// Chaves de base válidas: só letras minúsculas e "_", 2 a 40 caracteres, e
// que existam como propriedade PRÓPRIA de CIDADES (V-10). Object.hasOwn
// impede que "constructor", "__proto__", "toString" etc. passem pela
// validação por serem herdadas do protótipo.
const CHAVE_BASE_REGEX = /^[a-z_]{2,40}$/;

function baseExiste(chave) {
  return typeof chave === "string" && CHAVE_BASE_REGEX.test(chave) && Object.hasOwn(CIDADES, chave);
}

/** Erro com mensagem genérica, seguro para devolver ao cliente (HTTP 400). */
function erroBaseInvalida() {
  return Object.assign(new Error("Base inválida."), { status: 400, publico: true, code: "BASE_INVALIDA" });
}

function getCidade(chave) {
  const efetiva = chave === undefined || chave === null || chave === "" ? CIDADE_PADRAO : chave;
  if (!baseExiste(efetiva)) throw erroBaseInvalida();
  return CIDADES[efetiva];
}

module.exports = { CIDADES, CIDADE_PADRAO, getCidade, baseExiste, erroBaseInvalida };
