// Mescla pura (sem I/O) dos voos extraídos de um print com o voucher ANTIGO do caso, gerando o voucher
// unificado COMPLETO do "voucher novo". Passageiros, bagagem, status da reserva e demais campos vêm SEMPRE
// do voucher antigo; da extração entram só os trechos (por direção), o localizador e a companhia.
const { validate, DIRECTIONS } = require('../services/voucherSchema');
const { normalize } = require('../services/voucherNormalizer');

const CARRIER_NAMES = { azul: 'Azul', gol: 'Gol', latam: 'Latam' };
const PREFIX_CARRIER = { AD: 'azul', G3: 'gol', GLO: 'gol', LA: 'latam', JJ: 'latam' };
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;

const clone = (o) => JSON.parse(JSON.stringify(o == null ? null : o));
const unprocessable = (error, details) => ({ status: 422, body: details ? { error, details } : { error } });

const EMPTY_MSG = 'Não encontrei voos nessa imagem. Envie um print ou PDF que mostre os voos (partida, chegada e número do voo).';

/** Cia a partir do prefixo do número do voo ("G3 1922" -> gol). */
function carrierFromFlight(flightNumber) {
  const m = /^\s*([A-Za-z0-9]{2,3}?)\s*\d/.exec(String(flightNumber || ''));
  return m ? (PREFIX_CARRIER[m[1].toUpperCase()] || null) : null;
}

function checkTrips(trips) {
  trips.forEach((t, i) => {
    const nome = `Trecho ${i + 1}${t && t.flightNumber ? ` (${t.flightNumber})` : ''}`;
    if (!t.departure || !ISO_RE.test(String(t.departure.datetime || ''))) {
      throw unprocessable(`${nome}: não consegui ler a data/hora de partida. Envie um print em que apareçam partida e chegada.`);
    }
    if (!t.arrival || !ISO_RE.test(String(t.arrival.datetime || ''))) {
      throw unprocessable(`${nome}: não consegui ler a data/hora de chegada. Envie um print em que apareçam partida e chegada.`);
    }
    if (!t.flightNumber || !String(t.flightNumber).trim()) {
      throw unprocessable(`${nome}: não consegui ler o número do voo.`);
    }
  });
}

function mergeNewFlights(oldVoucher, extracted) {
  const ext = extracted || {};
  const extTrips = (Array.isArray(ext.trips) ? ext.trips : []).filter(t => t && typeof t === 'object').map(clone);
  if (!extTrips.length) throw unprocessable(EMPTY_MSG);
  extTrips.forEach(t => { if (!DIRECTIONS.includes(t.direction)) t.direction = 'multi'; });
  checkTrips(extTrips);

  const merged = clone(oldVoucher) || {};
  const oldTrips = Array.isArray(merged.trips) ? merged.trips : [];

  // Direções presentes na extração (em ordem) -> seus trechos.
  const byDir = new Map();
  extTrips.forEach(t => { if (!byDir.has(t.direction)) byDir.set(t.direction, []); byDir.get(t.direction).push(t); });

  const trips = [];
  const done = new Set();
  for (const t of oldTrips) {
    const d = t && t.direction;
    if (!byDir.has(d)) { trips.push(t); continue; }       // direção ausente no print: permanece
    if (done.has(d)) continue;                            // restantes da direção substituída: removidos
    done.add(d);
    trips.push(...byDir.get(d));                          // substitui (ou acrescenta, se o print tem mais)
  }
  for (const [d, list] of byDir) if (!done.has(d)) trips.push(...list);   // direção nova
  merged.trips = trips;

  // Localizador: o do print, se houver.
  merged.reservation = merged.reservation || {};
  const loc = typeof ext.locator === 'string' ? ext.locator.trim() : '';
  if (loc) merged.reservation.locator = loc;

  // Companhia: a extraída; sem ela, deduzida pelo prefixo do voo do primeiro trecho. Voucher 'multi' não muda.
  const detected = CARRIER_NAMES[ext.carrier] ? ext.carrier : carrierFromFlight(trips[0] && trips[0].flightNumber);
  if (detected && merged.carrier !== 'multi' && detected !== merged.carrier) {
    merged.carrier = detected;
    merged.branding = { ...(merged.branding || {}), airlineName: CARRIER_NAMES[detected], primaryColor: null };
  }

  // Rota recalculada dos trechos finais.
  const first = trips[0];
  const ida = trips.find(t => t.direction === 'ida') || first;
  merged.route = { origin: first.departure.airport, destination: ida.arrival.airport };

  merged.meta = { ...normalize({}).meta, flightsOnly: true };

  const v = validate(merged);
  if (!v.ok) throw unprocessable('schema inválido após extração', v.errors);
  return merged;
}

module.exports = { mergeNewFlights, carrierFromFlight };
