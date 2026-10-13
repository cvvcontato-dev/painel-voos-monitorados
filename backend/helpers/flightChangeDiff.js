// Comparação pura entre dois vouchers unificados (schema de services/voucherSchema.js).
// Sem I/O. Casa os trechos por direção + ordem dentro da direção.

const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** "12/09/2026 08:30" a partir do horário escrito no ISO (hora local do aeroporto). */
function formatLocal(iso) {
  const m = ISO_LOCAL.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '—';
}

const instant = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };
const compact = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();
const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const nameKey = (s) => squash(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// [campo, valor para comparar, valor para exibir, exige os dois lados?]
const FIELDS = [
  ['partida', t => instant(t.departure?.datetime), t => formatLocal(t.departure?.datetime), false],
  ['chegada', t => instant(t.arrival?.datetime),   t => formatLocal(t.arrival?.datetime),   false],
  ['voo',     t => compact(t.flightNumber),        t => squash(t.flightNumber) || '—',      false],
  ['origem',  t => compact(t.departure?.airport),  t => squash(t.departure?.airport) || '—', false],
  ['destino', t => compact(t.arrival?.airport),    t => squash(t.arrival?.airport) || '—',   false],
  ['classe',  t => nameKey(t.cabinClass),          t => squash(t.cabinClass) || '—',         true]
];

function compareTrip(a, b) {
  const changes = [];
  for (const [campo, key, show, needsBoth] of FIELDS) {
    const ka = key(a), kb = key(b);
    if (needsBoth && (!ka || !kb)) continue;
    if (ka !== kb) changes.push({ campo, antes: show(a), depois: show(b) });
  }
  return changes;
}

function groupByDirection(trips) {
  const map = new Map();
  (trips || []).filter(Boolean).forEach(t => {
    const d = t.direction || 'multi';
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(t);
  });
  return map;
}

function baggageSignature(list) {
  return (list || []).filter(Boolean).map(b => `${b.direction}|${b.quantity}|${compact(b.weightText)}`).sort().join(';');
}

function diffVouchers(oldV, newV) {
  const o = oldV || {}, n = newV || {};
  const oldG = groupByDirection(o.trips), newG = groupByDirection(n.trips);
  const trips = [];

  for (const [direction, olds] of oldG) {
    const news = newG.get(direction) || [];
    olds.forEach((old, i) => {
      const nw = news[i];
      if (!nw) return trips.push({ status: 'removido', direction, changes: [], old, new: null });
      const changes = compareTrip(old, nw);
      trips.push({ status: changes.length ? 'alterado' : 'igual', direction, changes, old, new: nw });
    });
  }
  for (const [direction, news] of newG) {
    const qtdOld = (oldG.get(direction) || []).length;
    news.slice(qtdOld).forEach(nw => trips.push({ status: 'novo', direction, changes: [], old: null, new: nw }));
  }

  const la = squash(o.reservation?.locator), lb = squash(n.reservation?.locator);
  const locatorChanged = la && lb && la.toUpperCase() !== lb.toUpperCase() ? { antes: la, depois: lb } : null;

  const oldNames = new Map((o.passengers || []).filter(Boolean).map(p => [nameKey(p.name), squash(p.name)]));
  const newNames = new Map((n.passengers || []).filter(Boolean).map(p => [nameKey(p.name), squash(p.name)]));
  const passengers = {
    adicionados: [...newNames].filter(([k]) => !oldNames.has(k)).map(([, v]) => v),
    removidos: [...oldNames].filter(([k]) => !newNames.has(k)).map(([, v]) => v)
  };

  const baggageChanged = baggageSignature(o.baggage) !== baggageSignature(n.baggage);
  const hasChanges = trips.some(t => t.status !== 'igual') || !!locatorChanged
    || passengers.adicionados.length > 0 || passengers.removidos.length > 0 || baggageChanged;

  return { trips, locatorChanged, passengers, baggageChanged, hasChanges };
}

module.exports = { diffVouchers, formatLocal };
