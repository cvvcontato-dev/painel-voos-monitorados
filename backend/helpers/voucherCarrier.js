// Backend-side helpers para envio de e-mail de voucher:
//   - mapa IATA → cidade (pra exibir "Ilhéus" em vez de só "IOS")
//   - deep-link "minhas viagens" por companhia (mirror do frontend _shared.jsx)
//   - normalização de número de voo (ICAO → IATA-2)
//   - nome de exibição da companhia
//
// IMPORTANTE: mantenha em sincronia com frontend/src/components/voucher-templates/_shared.jsx.
// Esses utilitários são plain CommonJS — nada de JSX/React aqui.

// IATA → cidade (BR + principais internacionais). Fallback: string vazia.
const AIRPORT_CITIES = {
  GRU: 'São Paulo',
  CGH: 'São Paulo',
  VCP: 'Campinas',
  GIG: 'Rio de Janeiro',
  SDU: 'Rio de Janeiro',
  SSA: 'Salvador',
  BSB: 'Brasília',
  CNF: 'Belo Horizonte',
  PLU: 'Belo Horizonte',
  REC: 'Recife',
  FOR: 'Fortaleza',
  POA: 'Porto Alegre',
  CWB: 'Curitiba',
  FLN: 'Florianópolis',
  NAT: 'Natal',
  MCZ: 'Maceió',
  AJU: 'Aracaju',
  JPA: 'João Pessoa',
  THE: 'Teresina',
  SLZ: 'São Luís',
  BEL: 'Belém',
  MAO: 'Manaus',
  CGB: 'Cuiabá',
  CGR: 'Campo Grande',
  GYN: 'Goiânia',
  VIX: 'Vitória',
  PMW: 'Palmas',
  IOS: 'Ilhéus',
  IGU: 'Foz do Iguaçu',
  NVT: 'Navegantes',
  BPS: 'Porto Seguro',
  PNZ: 'Petrolina',
  UDI: 'Uberlândia',
  RAO: 'Ribeirão Preto',
  LDB: 'Londrina',
  PFB: 'Passo Fundo',
  MGF: 'Maringá',
  CXJ: 'Caxias do Sul',
  JOI: 'Joinville',
  XAP: 'Chapecó',
  PVH: 'Porto Velho',
  RBR: 'Rio Branco',
  BVB: 'Boa Vista',
  MCP: 'Macapá',
  MAB: 'Marabá',
  STM: 'Santarém',
  IMP: 'Imperatriz',
  PHB: 'Parnaíba',
  MII: 'Marília',
  BAU: 'Bauru',
  RAO_2: 'Ribeirão Preto',
  SJP: 'São José do Rio Preto',
  PPB: 'Presidente Prudente',
  // Internacionais comuns
  MIA: 'Miami',
  MCO: 'Orlando',
  JFK: 'Nova York',
  EWR: 'Newark',
  LIS: 'Lisboa',
  OPO: 'Porto',
  MAD: 'Madri',
  CDG: 'Paris',
  LHR: 'Londres',
  EZE: 'Buenos Aires',
  SCL: 'Santiago',
  BOG: 'Bogotá',
  PTY: 'Cidade do Panamá'
};

function airportCity(iata) {
  if (!iata) return '';
  return AIRPORT_CITIES[String(iata).toUpperCase()] || '';
}

// Mirror de _shared.jsx::manageBookingUrl
function manageBookingUrl(carrierKey, locator, lastName, origin) {
  const loc  = encodeURIComponent((locator  || '').trim());
  const last = encodeURIComponent((lastName || '').trim());
  const orig = encodeURIComponent((origin   || '').trim());
  switch ((carrierKey || '').toLowerCase()) {
    case 'gol':
      return (loc && orig && last)
        ? `https://b2c.voegol.com.br/minhas-viagens/encontrar-viagem?codigoReserva=${loc}&origem=${orig}&sobrenome=${last}`
        : 'https://b2c.voegol.com.br/minhas-viagens';
    case 'latam':
      return (loc && last)
        ? `https://www.latamairlines.com/br/pt/minhas-viagens/second-detail/?orderId=${loc}&lastname=${last}`
        : 'https://www.latamairlines.com/br/pt/minhas-viagens';
    case 'azul':
      return (loc && orig)
        ? `https://www.voeazul.com.br/br/pt/home/minhas-viagens/confirmacao?pnr=${loc}&origin=${orig}`
        : 'https://www.voeazul.com.br/br/pt/home/minhas-viagens';
    default:
      return 'https://www.voeazul.com.br/br/pt/home/minhas-viagens';
  }
}

// Mirror de _shared.jsx::tripCarrier
function tripCarrier(trip, fallbackCarrier) {
  const name = ((trip && trip.airlineDisplayName) || '').toLowerCase();
  if (name.includes('azul')) return 'azul';
  if (name.includes('gol')) return 'gol';
  if (name.includes('latam') || name.includes('tam ')) return 'latam';
  const fn = ((trip && trip.flightNumber) || '').toUpperCase();
  if (/^(G3|GLO)/.test(fn)) return 'gol';
  if (/^AD/.test(fn)) return 'azul';
  if (/^(LA|JJ|LATAM)/.test(fn)) return 'latam';
  return (fallbackCarrier || 'azul').toLowerCase();
}

// Mirror de _shared.jsx::normalizeFlightNumber
const FLIGHT_PREFIX_MAP = {
  GLO: 'G3', G3: 'G3',
  AZU: 'AD', AD: 'AD',
  TAM: 'LA', LAN: 'LA', LATAM: 'LA', LA: 'LA', JJ: 'LA'
};
function normalizeFlightNumber(flightNumber) {
  if (!flightNumber) return '';
  const fn = String(flightNumber).trim().toUpperCase();
  const m = fn.match(/^([A-Z]{2,5})\s*([0-9]+[A-Z]?)$/);
  if (!m) return flightNumber;
  const prefix = FLIGHT_PREFIX_MAP[m[1]] || m[1];
  return `${prefix} ${m[2]}`;
}

const CARRIER_DISPLAY = {
  azul: 'Azul Linhas Aéreas',
  gol: 'Gol Linhas Aéreas',
  latam: 'Latam Airlines'
};
function carrierDisplayName(carrierKey) {
  return CARRIER_DISPLAY[String(carrierKey || '').toLowerCase()] || 'Companhia aérea';
}

module.exports = {
  airportCity,
  manageBookingUrl,
  tripCarrier,
  normalizeFlightNumber,
  carrierDisplayName
};
