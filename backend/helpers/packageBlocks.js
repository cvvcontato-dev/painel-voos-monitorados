const { buildReservationGroups } = require('./reservationGroups');

function toInstant(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}

// Monta a timeline cronológica única da viagem: voos (1 bloco por grupo de reserva),
// hotéis e adicionais, ordenados por instante do sortDate. Itens sem data vão pro fim.
function buildTimeline(pkg) {
  if (!pkg || typeof pkg !== 'object') return [];
  const blocks = [];

  if (pkg.flights) {
    const groups = buildReservationGroups(pkg.flights);
    groups.forEach(g => {
      const sortDate = (g.trips && g.trips[0] && g.trips[0].departure && g.trips[0].departure.datetime) || null;
      blocks.push({ kind: 'flight', sortDate, item: g });
    });
  }
  (pkg.hotels || []).forEach(h => blocks.push({ kind: 'hotel', sortDate: h.sortDate || null, item: h }));
  (pkg.addons || []).forEach(a => blocks.push({ kind: a.kind, sortDate: a.sortDate || null, item: a }));

  return blocks
    .map((b, i) => ({ b, i }))
    .sort((x, y) => {
      const dx = toInstant(x.b.sortDate);
      const dy = toInstant(y.b.sortDate);
      if (dx !== null && dy !== null) return (dx - dy) || (x.i - y.i);
      if (dx !== null) return -1;
      if (dy !== null) return 1;
      return x.i - y.i;
    })
    .map(x => x.b);
}

module.exports = { buildTimeline };
