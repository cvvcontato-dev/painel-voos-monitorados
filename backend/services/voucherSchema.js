const CARRIERS = ['azul', 'gol', 'latam'];
const LAYOUT_VERSIONS = ['azul.confirmacao.v1'];
const PASSENGER_TYPES = ['adulto', 'crianca', 'bebe'];
const DIRECTIONS = ['ida', 'volta', 'multi'];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;

function validate(v) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };

  req(v && typeof v === 'object', 'payload deve ser objeto');
  if (!v) return { ok: false, errors };

  req(CARRIERS.includes(v.carrier), `carrier inválido: ${v.carrier}`);
  req(LAYOUT_VERSIONS.includes(v.layoutVersion), `layoutVersion inválido: ${v.layoutVersion}`);
  req(v.reservation && typeof v.reservation.locator === 'string' && v.reservation.locator.length, 'reservation.locator obrigatório');
  req(v.route && typeof v.route.origin === 'string' && typeof v.route.destination === 'string', 'route.origin/destination obrigatórios');

  req(Array.isArray(v.passengers) && v.passengers.length >= 1, 'passengers deve ter ao menos 1');
  (v.passengers || []).forEach((p, i) => {
    if (!p || typeof p !== 'object') { errors.push(`passengers[${i}] deve ser objeto`); return; }
    req(typeof p.name === 'string' && p.name.length, `passengers[${i}].name obrigatório`);
    req(PASSENGER_TYPES.includes(p.type), `passengers[${i}].type inválido`);
  });

  req(Array.isArray(v.trips) && v.trips.length >= 1, 'trips deve ter ao menos 1');
  (v.trips || []).forEach((t, i) => {
    if (!t || typeof t !== 'object') { errors.push(`trips[${i}] deve ser objeto`); return; }
    req(DIRECTIONS.includes(t.direction), `trips[${i}].direction inválido`);
    req(t.departure && ISO_RE.test(t.departure.datetime || ''), `trips[${i}].departure.datetime deve ser ISO`);
    req(t.arrival   && ISO_RE.test(t.arrival.datetime   || ''), `trips[${i}].arrival.datetime deve ser ISO`);
    req(typeof t.flightNumber === 'string' && t.flightNumber.length, `trips[${i}].flightNumber obrigatório`);
  });

  req(v.meta && typeof v.meta.parsedAt === 'string', 'meta.parsedAt obrigatório');
  return { ok: errors.length === 0, errors };
}

module.exports = { validate, CARRIERS, LAYOUT_VERSIONS, PASSENGER_TYPES, DIRECTIONS };
