// Reservas de um voucher e escolha dos trechos alterados (aba Alterações). Puro, sem I/O.
//
// "Reserva" = conjunto de trechos com o mesmo localizador. O localizador de um trecho é, em ordem:
// trips[].locator; a entrada de reservation.reservations[] da mesma direção (appliesTo); o
// secondaryLocator (trecho de volta); reservation.locator. Em vouchers combinados (combineVouchers) todo
// trecho já traz o próprio locator; o resto é só fallback para vouchers legados.
//
// `affected` = índices (em old_json.trips) dos trechos alterados. NULL/ausente = "todos" (legado ou voucher
// de uma reserva só). Quando cobre todos os trechos, é tratado como "todos" (comportamento antigo).
const { tripCarrier } = require('./voucherCarrier');

const DIRECTION_LABEL = { ida: 'Ida', volta: 'Volta', interno: 'Trecho interno', multi: 'Trecho' };
const up = (s) => String(s == null ? '' : s).trim().toUpperCase();

const entriesOf = (v) => (Array.isArray(v?.reservation?.reservations) ? v.reservation.reservations.filter(r => r && typeof r === 'object') : []);

/** Localizador (MAIÚSCULO, sem espaços) da reserva do trecho; '' se o voucher não tiver nenhum. */
function locatorOf(voucher, trip) {
  const direto = up(trip && trip.locator);
  if (direto) return direto;
  const dir = trip && trip.direction;
  const doRole = entriesOf(voucher).find(r => r.appliesTo === dir && up(r.code));
  if (doRole) return up(doRole.code);
  if (dir === 'volta' && up(voucher?.reservation?.secondaryLocator)) return up(voucher.reservation.secondaryLocator);
  return up(voucher?.reservation?.locator);
}

const tripsOf = (v) => (Array.isArray(v?.trips) ? v.trips : []);

/** Quantidade de reservas distintas (localizadores distintos entre os trechos). */
function reservationCount(voucher) {
  return new Set(tripsOf(voucher).filter(Boolean).map(t => locatorOf(voucher, t)).filter(Boolean)).size;
}

const tripLabel = (t) => {
  const base = DIRECTION_LABEL[t && t.direction] || 'Trecho';
  const o = t?.departure?.airport, d = t?.arrival?.airport;
  return [base, o && d ? `${o} → ${d}` : '', t?.dateLabel || ''].filter(Boolean).join(' · ');
};

/**
 * Trechos agrupados por reserva, para a UI: [{ locator, carrier, appliesTo|null, trips:[{ index, direction, label }] }].
 * `index` é a posição em voucher.trips (a mesma usada em `affected`).
 */
function reservationGroups(voucher) {
  const out = [];
  const byKey = new Map();
  const fallbackCarrier = voucher && voucher.carrier && voucher.carrier !== 'multi' ? voucher.carrier : 'azul';
  tripsOf(voucher).forEach((t, index) => {
    if (!t) return;
    const key = locatorOf(voucher, t);
    let g = byKey.get(key);
    if (!g) {
      const entry = entriesOf(voucher).find(r => up(r.code) === key);
      g = {
        locator: key || null,
        carrier: (entry && entry.carrier) || tripCarrier(t, fallbackCarrier),
        appliesTo: (entry && entry.appliesTo) || null,
        trips: []
      };
      byKey.set(key, g); out.push(g);
    }
    g.trips.push({ index, direction: t.direction || 'multi', label: tripLabel(t) });
  });
  return out;
}

/** Índices válidos (inteiros únicos em [0, count)), ordenados; null se nada válido. */
function validIndexes(list, count) {
  if (!Array.isArray(list)) return null;
  const set = new Set(list.filter(i => Number.isInteger(i) && i >= 0 && i < count));
  return set.size ? [...set].sort((a, b) => a - b) : null;
}

/** Restrição efetiva: índices válidos, ou null quando ausente/vazia/cobrindo TODOS os trechos (= comportamento antigo). */
function restrictTo(affected, count) {
  const list = validIndexes(affected, count);
  return list && list.length < count ? list : null;
}

function parseJson(json) { try { return json ? JSON.parse(json) : null; } catch { return null; } }

/** Índices gravados no caso (affected_json) já validados contra o voucher antigo; null se não há marcação. */
function storedAffected(row, oldVoucher) {
  return validIndexes(parseJson(row && row.affected_json), tripsOf(oldVoucher).length);
}

/** Índices efetivos: o gravado, ou todos os trechos. */
function effectiveAffected(row, oldVoucher) {
  return storedAffected(row, oldVoucher) || tripsOf(oldVoucher).map((_, i) => i);
}

/** Restrição a aplicar no merge/diff/mensagens (null = todos). */
function restrictionOf(row, oldVoucher) {
  return restrictTo(storedAffected(row, oldVoucher), tripsOf(oldVoucher).length);
}

/**
 * O operador precisa marcar os trechos alterados antes de seguir? Só em caso novo (aviso pendente, sem
 * voucher novo), sem marcação gravada e com o voucher antigo de ≥2 reservas. Legados já avançados = "todos".
 */
function needsAffected(row, oldVoucher) {
  if (!row || !oldVoucher) return false;
  if (row.affected_json != null && row.affected_json !== '') return false;
  if (row.status !== 'aviso_pendente' || row.new_json) return false;
  return reservationCount(oldVoucher) >= 2;
}

module.exports = {
  locatorOf, reservationCount, reservationGroups, tripLabel, restrictTo, validIndexes,
  storedAffected, effectiveAffected, restrictionOf, needsAffected, DIRECTION_LABEL
};
