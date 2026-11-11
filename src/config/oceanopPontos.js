const { CIDADES } = require("./cities");
const { unidadeVelocidadeSuportada } = require("../logic/windUnits");

// Unidade do vento/rajada do OCEANOP (a resposta não a declara): nós, confirmado
// ao comparar com a Open-Meteo (erro ~3–6 km/h em nós; ~20 km/h se fosse m/s).
// Ajustável por OCEANOP_UNIDADE_VENTO (nós, m/s ou km/h).
function unidadeVento(env = process.env) {
  const bruta = String(env.OCEANOP_UNIDADE_VENTO || "nós").trim();
  return unidadeVelocidadeSuportada(bruta) ? bruta : "nós";
}
// Fuso de DataInicial/DataFinal. A resposta não o declara; UTC é o que melhor
// reproduz a Open-Meteo hora a hora. Ajustável por OCEANOP_FUSO_DADOS (IANA).
function fusoDados(env = process.env) {
  return String(env.OCEANOP_FUSO_DADOS || "UTC").trim() || "UTC";
}

// Como cada base é consultada no OCEANOP. O ID enviado é livre (a API o devolve
// como PointID), mas a coordenada precisa ser exatamente uma cadastrada:
//  - coordenadas: POST por Lat/Lon (Rio, Santos, Aracaju, Oiapoque, Vitória, Salvador);
//  - area: GET por nome de área, com os locais aceitos na resposta;
//  - sem ponto: base ainda não cadastrada no OCEANOP — usa a Open-Meteo.
const ACESSO = Object.freeze({
  rio_de_janeiro: { modo: "coordenadas" },
  santos: { modo: "coordenadas" },
  aracaju: { modo: "coordenadas" },
  oiapoque: { modo: "coordenadas" },
  vitoria: { modo: "coordenadas" },
  salvador: { modo: "coordenadas" },
  macae: { modo: "area", localArea: "macaé", locaisAceitos: ["Macaé", "Macaé (SBME)"] },
  natal: { modo: "area", localArea: "Natal", locaisAceitos: ["Natal"] },
  brasilia: { modo: "area", localArea: "Brasília", locaisAceitos: ["Brasília"] },
  manaus: { modo: "ausente", motivo: "Manaus ainda não tem ponto cadastrado no OCEANOP (coordenada e nome de área não retornam dados)." },
  araucaria: { modo: "ausente", motivo: "Cobertura OCEANOP da base Araucária ainda precisa ser verificada para a instalação especificada; mantém fallback seguro para Open-Meteo e outros provedores." },
  utg_sul: { modo: "ausente", motivo: "Cobertura OCEANOP da UTG-SUL ainda não validada para a coordenada de Anchieta/ES." },
  utg_c: { modo: "ausente", motivo: "UTG-C em Linhares/ES permanece com status PENDENTE_VALIDACAO_GEOGRAFICA; consultas ao OCEANOP devem seguir bloqueadas até confirmação geográfica." },
  topo_da_serra_etel: { modo: "ausente", motivo: "Cobertura OCEANOP do Topo da Serra ETEL ainda precisa ser confirmada para São Bernardo do Campo/SP." },
  doutor_ulysses: { modo: "ausente", motivo: "Cobertura OCEANOP de Doutor Ulysses/PR ainda precisa ser confirmada na área de operação." },
  boaventura: { modo: "ausente", motivo: "Cobertura OCEANOP da BOAVENTURA/Itaboraí/RJ ainda não validada." },
  utg_ca: { modo: "ausente", motivo: "Cobertura OCEANOP da UTG-CA em Caraguatatuba/SP ainda precisa ser validada." },
  barra_do_furado: { modo: "ausente", motivo: "Cobertura OCEANOP da Barra do Furado/Quissamã/RJ ainda precisa ser validada." },
  betim: { modo: "ausente", motivo: "Cobertura OCEANOP de Betim/MG ainda precisa ser confirmada." },
  ipojuca: { modo: "ausente", motivo: "Cobertura OCEANOP do município de Ipojuca/PE ainda precisa ser confirmada." },
  criciuma: { modo: "ausente", motivo: "Cobertura OCEANOP de Criciúma/SC ainda precisa ser confirmada." },
  imbituba: { modo: "ausente", motivo: "Cobertura OCEANOP de Imbituba/SC ainda precisa ser confirmada." },
  refap: { modo: "ausente", motivo: "Cobertura OCEANOP da REFAP/Canoas/RS ainda precisa ser confirmada." },
  barra_dos_coqueiros: {
    modo: "coordenadas",
    // Ponto de Barra dos Coqueiros/SE informado em graus, minutos e segundos.
    latitude: -(10 + 59 / 60 + 7 / 3600),
    longitude: -(37 + 4 / 60 + 24 / 3600),
  },
  ute_termorio: { modo: "ausente", motivo: "Cobertura OCEANOP da UTE-Termorio/Duque de Caxias/RJ ainda precisa ser confirmada." },
  aeroporto_de_marica: {
    modo: "coordenadas",
    // Ponto Aéreo/Maricá (SMDC) informado em graus, minutos e segundos.
    latitude: -(22 + 55 / 60 + 7 / 3600),
    longitude: -(42 + 49 / 60 + 47 / 3600),
  },
});

module.exports = Object.freeze(Object.fromEntries(Object.entries(CIDADES).map(([chave, cidade]) => {
  const acesso = ACESSO[chave] || { modo: "ausente", motivo: "Base sem ponto OCEANOP cadastrado." };
  const unidade = unidadeVento();
  return [chave, Object.freeze({
    ...acesso,
    habilitado: acesso.modo !== "ausente",
    id: chave,
    latitude: acesso.latitude ?? cidade.latitude,
    longitude: acesso.longitude ?? cidade.longitude,
    referencia: `${cidade.nome} — ${cidade.uf}`,
    fusoHorario: cidade.fusoHorario || "America/Sao_Paulo",
    fusoDados: fusoDados(),
    usarVento: true,
    unidades: Object.freeze({ VelocidadeVento: unidade, VelocidadeVento_10M_Rajada: unidade, DirecaoVento: "graus" }),
  })];
})));
