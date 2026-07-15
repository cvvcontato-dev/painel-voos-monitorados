const { tripCarrier } = require('../helpers/voucherCarrier');

// Combina N vouchers rotulados num único unified voucher.
// items = [{ voucher, role: 'ida'|'interno'|'volta' }]
function combineVouchers(items) {
  if (!Array.isArray(items) || items.length < 2) {
    throw new Error('É necessário combinar entre 2 e 8 vouchers');
  }
  if (items.length > 8) throw new Error('É necessário combinar entre 2 e 8 vouchers');

  const idas = items.filter(i => i.role === 'ida');
  const voltas = items.filter(i => i.role === 'volta');
  if (idas.length !== 1) throw new Error('Envie exatamente 1 voucher de ida');
  if (voltas.length > 1) throw new Error('No máximo 1 voucher de volta');

  // Ordena: ida → internos (ordem de entrada) → volta
  const idaItem = idas[0];
  const internoItems = items.filter(i => i.role === 'interno');
  const voltaItem = voltas[0] || null;
  const ordered = [idaItem, ...internoItems, ...(voltaItem ? [voltaItem] : [])];

  // Base = ida (passageiros, branding, locator principal)
  const out = JSON.parse(JSON.stringify(idaItem.voucher));

  const carrierOf = (v) => (v.carrier && v.carrier !== 'multi'
    ? v.carrier.toLowerCase()
    : (tripCarrier((v.trips || [])[0] || {}, 'azul') || 'azul').toLowerCase());

  // Monta trips, baggage, reservations
  const allTrips = [];
  const allBags = [];
  const reservations = [];
  const seen = new Set();

  ordered.forEach(({ voucher, role }) => {
    const loc = voucher.reservation && voucher.reservation.locator || '';
    const ck = carrierOf(voucher);
    (voucher.trips || []).forEach(t => allTrips.push({ ...t, direction: role, locator: t.locator || loc || null }));
    (voucher.baggage || []).forEach(b => allBags.push({ ...b, direction: role }));
    const dedupeKey = `${ck}|${loc}`;
    if (loc && !seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      reservations.push({ code: loc, carrier: ck, appliesTo: role });
    }
  });

  out.trips = allTrips;
  out.baggage = allBags;
  out.reservation = out.reservation || {};
  out.reservation.reservations = reservations;

  // Locator principal = da ida (já vem da base)
  const idaCk = carrierOf(idaItem.voucher);
  const idaLoc = idaItem.voucher.reservation && idaItem.voucher.reservation.locator || '';

  // Campos legados (fallback templates): secondaryLocator/Carrier no caso da volta
  if (voltaItem) {
    const vLoc = voltaItem.voucher.reservation && voltaItem.voucher.reservation.locator || '';
    const vCk = carrierOf(voltaItem.voucher);
    if (vLoc && vLoc !== idaLoc) out.reservation.secondaryLocator = vLoc;
    if (vCk !== idaCk) { out.reservation.secondaryCarrier = vCk; out.reservation.primaryCarrier = idaCk; }
  }

  // carrier top-level: multi se cias distintas > 1
  const distinctCarriers = new Set(ordered.map(i => carrierOf(i.voucher)));
  if (distinctCarriers.size > 1) {
    out.carrier = 'multi';
    out.reservation.primaryCarrier = out.reservation.primaryCarrier || idaCk;
  } else {
    out.carrier = idaCk;
  }

  // route: origin = 1ª partida da ida; destination = arrival do último trecho não-volta
  const nonVolta = allTrips.filter(t => t.direction !== 'volta');
  out.route = out.route || {};
  if (allTrips.length) out.route.origin = allTrips[0].departure && allTrips[0].departure.airport || out.route.origin;
  const lastNonVolta = nonVolta[nonVolta.length - 1] || allTrips[allTrips.length - 1];
  if (lastNonVolta) out.route.destination = lastNonVolta.arrival && lastNonVolta.arrival.airport || out.route.destination;

  // meta
  out.meta = out.meta || {};
  out.meta.combined = true;
  out.meta.merged = true; // espelho legado
  out.meta.combinedAt = new Date().toISOString();
  out.meta.sources = ordered.map(({ voucher, role }) => ({
    hash: (voucher.meta && voucher.meta.sourceFileHash) || null, role
  }));

  return out;
}

module.exports = { combineVouchers };
