// "Viagem" (journey) = sequência de voos encadeados do MESMO `direction` e da MESMA reserva (localizador):
// a chegada de um voo é a partida do seguinte e o intervalo é menor que 24h. Para a usuária o "trecho" é a
// viagem inteira (ida / volta, com 0..n conexões); origem = partida do 1º voo, destino = chegada do último.
// Puro, sem I/O.
const { locatorOf, validIndexes, DIRECTION_LABEL } = require('./flightChangeReservations');

const DAY = 24 * 3600 * 1000;
const ms = (iso) => { const t = Date.parse(String(iso == null ? '' : iso)); return Number.isFinite(t) ? t : null; };

/** O voo `next` continua o voo `prev`? (mesmo aeroporto; sem datas legíveis vale só o aeroporto.) */
function chained(prev, next) {
  const arr = prev && prev.arrival && prev.arrival.airport;
  if (!arr || arr !== (next && next.departure && next.departure.airport)) return false;
  const a = ms(prev.arrival.datetime), d = ms(next.departure && next.departure.datetime);
  if (a == null || d == null) return true;
  return d - a >= 0 && d - a < DAY;
}

const routeText = (trips) => [trips[0].departure?.airport, ...trips.map(t => t.arrival?.airport)].filter(Boolean).join(' → ');
/** "REC → BSB → GRU (G3 1920 + G3 1930)" ou "REC → GRU (G3 1925, direto)". */
const flightText = (t) => String((t && t.flightNumber) || '').replace(/\s+/g, ' ').trim() || '—';
const itineraryText = (trips) => `${routeText(trips)} (${trips.map(flightText).join(' + ')}${trips.length === 1 ? ', direto' : ''})`;

function finish(j) {
  j.origin = j.trips[0].departure?.airport;
  j.destination = j.trips[j.trips.length - 1].arrival?.airport;
  return j;
}

/** Viagens do voucher (na ordem do array de trechos). indexes = posições em voucher.trips. */
function journeysOf(voucher) {
  const trips = Array.isArray(voucher && voucher.trips) ? voucher.trips : [];
  const out = [];
  let cur = null;
  trips.forEach((t, i) => {
    if (!t) { cur = null; return; }
    const direction = t.direction || 'multi', locator = locatorOf(voucher, t);
    if (cur && cur.direction === direction && cur.locator === locator && chained(cur.trips[cur.trips.length - 1], t)) {
      cur.indexes.push(i); cur.trips.push(t);
    } else {
      cur = { direction, locator, indexes: [i], trips: [t] };
      out.push(cur);
    }
  });
  out.forEach(j => { finish(j); j.key = `j${j.indexes[0]}`; });
  return out;
}

/**
 * Viagens de um print: voos ordenados por partida e encadeados, independentemente dos rótulos do modelo
 * (o rótulo só desempata: dois voos com rótulos diferentes nunca se juntam). `direction` = 1º rótulo não nulo.
 */
function chainPrintTrips(extTrips) {
  const sorted = extTrips.map((t, i) => ({ t, i })).sort((a, b) => {
    const x = ms(a.t.departure.datetime), y = ms(b.t.departure.datetime);
    return (x == null || y == null) ? a.i - b.i : (x - y || a.i - b.i);
  }).map(x => x.t);
  const out = [];
  let cur = null;
  for (const t of sorted) {
    const last = cur && cur.trips[cur.trips.length - 1];
    const conflito = last && last.direction && t.direction && last.direction !== t.direction;
    if (cur && !conflito && chained(last, t)) cur.trips.push(t);
    else { cur = { trips: [t] }; out.push(cur); }
  }
  out.forEach(j => { finish(j); j.direction = (j.trips.find(t => t.direction) || {}).direction || null; });
  return out;
}

/** Título da viagem: "Volta · REC → BSB → GRU · 19 SET 2026". */
function journeyTitle(j) {
  return [DIRECTION_LABEL[j.direction] || 'Trecho', routeText(j.trips), j.trips[0].dateLabel || ''].filter(Boolean).join(' · ');
}

/** Rótulo para a UI: o título, mais "direto" quando é um voo só. */
const journeyLabel = (j) => journeyTitle(j) + (j.trips.length === 1 ? ' · direto' : '');

/**
 * Normaliza a marcação para VIAGENS inteiras: se qualquer voo de uma viagem está marcado, todos ficam.
 * Devolve índices ordenados e únicos; null se nada válido.
 */
function expandAffected(voucher, list) {
  const trips = Array.isArray(voucher && voucher.trips) ? voucher.trips : [];
  const valid = validIndexes(list, trips.length);
  if (!valid) return null;
  const set = new Set(valid);
  journeysOf(voucher).forEach(j => { if (j.indexes.some(i => set.has(i))) j.indexes.forEach(i => set.add(i)); });
  return [...set].sort((a, b) => a - b);
}

module.exports = { flightText, journeysOf, chainPrintTrips, expandAffected, journeyTitle, journeyLabel, itineraryText, routeText, chained };
