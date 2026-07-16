const KINDS = ['flight', 'hotel', 'car', 'tour', 'transfer'];
const ADDON_KINDS = ['car', 'tour', 'transfer'];

function validateItem(item) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };
  req(item && typeof item === 'object', 'item inválido');
  if (!item || typeof item !== 'object') return { ok: false, errors };
  req(KINDS.includes(item.kind), `kind inválido: ${item.kind}`);
  req(typeof item.sortDate === 'string' && item.sortDate.length > 0, 'sortDate obrigatório');
  if (item.kind === 'hotel') {
    req(item.name, 'hotel.name obrigatório');
    req(item.checkIn && item.checkIn.date, 'hotel.checkIn.date obrigatório');
  } else if (item.kind === 'car') {
    req(item.pickup && item.pickup.datetime, 'car.pickup.datetime obrigatório');
  } else if (item.kind === 'tour') {
    req(item.activity, 'tour.activity obrigatório');
    req(item.datetime, 'tour.datetime obrigatório');
  } else if (item.kind === 'transfer') {
    req(Array.isArray(item.legs) && item.legs.length > 0, 'transfer.legs obrigatório');
  }
  return { ok: errors.length === 0, errors };
}

function validatePackage(pkg) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };
  req(pkg && typeof pkg === 'object', 'pacote inválido');
  if (!pkg || typeof pkg !== 'object') return { ok: false, errors };
  req(pkg.flights && typeof pkg.flights === 'object', 'pacote exige voos (flights)');
  req(Array.isArray(pkg.hotels) && pkg.hotels.length >= 1, 'pacote exige ao menos 1 hotel');
  (pkg.hotels || []).forEach((h, i) => { const r = validateItem(h); if (!r.ok) errors.push(`hotels[${i}]: ${r.errors.join('; ')}`); });
  (pkg.addons || []).forEach((a, i) => { const r = validateItem(a); if (!r.ok) errors.push(`addons[${i}]: ${r.errors.join('; ')}`); });
  return { ok: errors.length === 0, errors };
}

module.exports = { validateItem, validatePackage, KINDS, ADDON_KINDS };
