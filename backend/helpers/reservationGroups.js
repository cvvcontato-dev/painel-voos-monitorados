// Agrupa os trechos de um voucher em blocos de reserva para render (seções + QRs).
// Fonte de verdade testada. O gêmeo em frontend/_shared.jsx#buildReservationGroups
// deve espelhar esta lógica linha-a-linha.

function normCarrier(c) { return (c || '').toLowerCase(); }

// Resolve carrier+locator de um role a partir de reservations[] (preferencial)
// ou do esquema legado (locator / secondaryLocator / primary/secondaryCarrier).
function resolveReservationFor(role, data, tripLocator) {
  const list = data.reservation && data.reservation.reservations;
  if (Array.isArray(list) && list.length) {
    const match = list.find(r => r.appliesTo === role && (!tripLocator || r.code === tripLocator))
              || list.find(r => r.appliesTo === role);
    if (match) return { carrierKey: normCarrier(match.carrier), locator: match.code };
  }
  // Fallback legado
  const r = data.reservation || {};
  if (role === 'ida') {
    return { carrierKey: normCarrier(r.primaryCarrier) || normCarrier(data.carrier) || 'azul', locator: r.locator || tripLocator || '' };
  }
  if (role === 'volta') {
    return { carrierKey: normCarrier(r.secondaryCarrier) || normCarrier(r.primaryCarrier) || normCarrier(data.carrier) || 'azul', locator: r.secondaryLocator || tripLocator || r.locator || '' };
  }
  // interno legado (raro): usa locator do trip
  return { carrierKey: normCarrier(data.carrier) || 'azul', locator: tripLocator || r.locator || '' };
}

function labelForInternoGroups(count) {
  return count > 1;
}

function buildReservationGroups(data) {
  const trips = Array.isArray(data && data.trips) ? data.trips : [];
  if (!trips.length) return [];

  const order = ['ida', 'interno', 'volta'];
  const byRole = { ida: [], interno: [], volta: [] };
  trips.forEach(t => {
    const d = (t.direction || '').toLowerCase();
    if (byRole[d]) byRole[d].push(t);
    else byRole.ida.push(t); // 'multi' ou desconhecido cai em ida
  });

  const groups = [];
  order.forEach(role => {
    const roleTrips = byRole[role];
    if (!roleTrips.length) return;

    if (role === 'interno') {
      // Subdivide por (carrierKey, locator)
      const buckets = [];
      roleTrips.forEach(t => {
        const { carrierKey, locator } = resolveReservationFor('interno', data, t.locator);
        const key = `${carrierKey}|${locator}`;
        let b = buckets.find(x => x.key === key);
        if (!b) { b = { key, carrierKey, locator, trips: [] }; buckets.push(b); }
        b.trips.push(t);
      });
      const multi = labelForInternoGroups(buckets.length);
      buckets.forEach(b => {
        const dest = b.trips[b.trips.length - 1].arrival && b.trips[b.trips.length - 1].arrival.airport;
        groups.push({
          role: 'interno',
          label: multi ? `INTERNO — ${(dest || '').toUpperCase()}` : 'DESTINOS INTERNOS',
          trips: b.trips, carrierKey: b.carrierKey, locator: b.locator
        });
      });
    } else {
      const { carrierKey, locator } = resolveReservationFor(role, data, roleTrips[0].locator);
      groups.push({
        role,
        label: role === 'ida' ? 'IDA' : 'VOLTA',
        trips: roleTrips, carrierKey, locator
      });
    }
  });

  return groups;
}

module.exports = { buildReservationGroups };
