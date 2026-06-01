const { tripCarrier } = require('../helpers/voucherCarrier');

// Mescla dois unifiedVoucher (já normalizados pelo extractor + normalizer).
// outboundUnified vira a base (passageiros, branding, reservation.locator).
// returnUnified contribui APENAS os trechos + bagagens marcados como 'volta'
// e o secondaryLocator se diferir do principal.
function mergeVouchers(outbound, ret) {
  if (!outbound) throw new Error('voucher de ida obrigatório');
  if (!ret)      throw new Error('voucher de volta obrigatório');

  // Clone defensivo
  const out = JSON.parse(JSON.stringify(outbound));

  // 1) Tag trips: outbound = 'ida', return = 'volta' (sobrescreve)
  const outLoc = out.reservation?.locator || '';
  const retLoc = ret.reservation?.locator || '';

  const outTrips = (out.trips || []).map(t => ({
    ...t,
    direction: 'ida',
    locator: t.locator || outLoc || null
  }));
  const retTrips = (ret.trips || []).map(t => ({
    ...t,
    direction: 'volta',
    locator: t.locator || retLoc || null
  }));
  out.trips = [...outTrips, ...retTrips];

  // 2) Tag baggage: outbound's all become 'ida', return's all become 'volta'
  const outBags = (out.baggage || []).map(b => ({ ...b, direction: 'ida' }));
  const retBags = (ret.baggage || []).map(b => ({ ...b, direction: 'volta' }));
  out.baggage = [...outBags, ...retBags];

  // 3) Reservation: keep outbound's locator/status as principal; add secondary if differs
  if (retLoc && retLoc !== outLoc) {
    out.reservation = out.reservation || {};
    out.reservation.secondaryLocator = retLoc;
  }

  // 4) Carriers: se diferentes, marcar carrier='multi' e secondaryCarrier
  const outCarrier = (out.carrier || tripCarrier(outTrips[0] || {}, 'azul') || 'azul').toLowerCase();
  const retCarrier = (ret.carrier || tripCarrier(retTrips[0] || {}, 'azul') || 'azul').toLowerCase();
  if (outCarrier !== retCarrier) {
    out.carrier = 'multi';
    out.reservation = out.reservation || {};
    out.reservation.secondaryCarrier = retCarrier;
    // Mas mantemos info do "principal" pra detecção e cores
    out.reservation.primaryCarrier = outCarrier;
  }

  // 5) Route: origin do primeiro trip da ida, destination do último trip da ida.
  //    (A route reflete a "viagem de ida" — convenção mais comum.)
  if (outTrips.length) {
    out.route = out.route || {};
    out.route.origin      = outTrips[0].departure?.airport || out.route.origin;
    out.route.destination = outTrips[outTrips.length - 1].arrival?.airport || out.route.destination;
  }

  // 6) Passengers: keep outbound (decisão do usuário). Não mexer.

  // 7) Meta: anota que veio de merge
  out.meta = out.meta || {};
  out.meta.merged = true;
  out.meta.mergedAt = new Date().toISOString();
  out.meta.outboundSourceHash = outbound.meta?.sourceFileHash || null;
  out.meta.returnSourceHash   = ret.meta?.sourceFileHash || null;

  return out;
}

module.exports = { mergeVouchers };
