// 'multi' = voucher resultante do merge de 2 vouchers de cias diferentes (ida + volta).
// Nesse caso, reservation.primaryCarrier e reservation.secondaryCarrier devem estar setados.
const CARRIERS = ['azul', 'gol', 'latam', 'multi'];

// Campos OPCIONAIS conhecidos (não rejeitados — schema é tolerante a extras):
//   reservation.secondaryLocator: string | null   — localizador da volta quando difere do principal
//   reservation.secondaryCarrier: string | null   — carrier da volta quando difere do principal
//   reservation.primaryCarrier:   string | null   — carrier da ida (set quando carrier === 'multi')
//   trips[].locator:              string | null   — localizador específico daquele trip (merge)
//   meta.merged:                  boolean         — true se veio de mergeVouchers
//   meta.outboundSourceHash:      string | null
//   meta.returnSourceHash:        string | null
const LAYOUT_VERSIONS = ['azul.confirmacao.v1'];
const PASSENGER_TYPES = ['adulto', 'crianca', 'bebe'];
const DIRECTIONS = ['ida', 'interno', 'volta', 'multi'];

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

  const APPLIES = ['ida', 'interno', 'volta'];
  if (v.reservation && v.reservation.reservations !== undefined) {
    const list = v.reservation.reservations;
    req(Array.isArray(list), 'reservation.reservations deve ser array');
    if (Array.isArray(list)) {
      list.forEach((r, i) => {
        req(r && typeof r.code === 'string' && r.code.length > 0, `reservations[${i}].code obrigatório`);
        req(CARRIERS.includes(r.carrier), `reservations[${i}].carrier inválido: ${r && r.carrier}`);
        req(APPLIES.includes(r.appliesTo), `reservations[${i}].appliesTo inválido: ${r && r.appliesTo}`);
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { validate, CARRIERS, LAYOUT_VERSIONS, PASSENGER_TYPES, DIRECTIONS };
