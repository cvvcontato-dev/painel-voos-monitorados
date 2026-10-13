// Comparação pura entre dois vouchers unificados (schema de services/voucherSchema.js).
// Sem I/O.
//
// Pareamento dos trechos, dentro de cada direção, em 2 passes:
//  (a) chave forte = número do voo (sem espaços/caixa) + data local de partida (10 primeiros
//      caracteres do datetime escrito); trechos antigo/novo com a mesma chave são pareados;
//  (b) os sobrantes são pareados por ordem (índice entre os sobrantes).
// Saída: trechos antigos na ordem original (cada um com seu par/estado), depois os `novo`.
//
// Limitação conhecida: passageiros homônimos são tratados como um só.

const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** "12/09/2026 08:30" a partir do horário escrito no ISO (hora local do aeroporto). */
function formatLocal(iso) {
  const m = ISO_LOCAL.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '—';
}

// Sem offset (nem Z nem ±HH:MM) assume -03:00 (Brasil), para não depender do fuso do servidor.
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;
const instant = (iso) => {
  let str = String(iso == null ? '' : iso).trim();
  if (ISO_LOCAL.test(str) && !HAS_OFFSET.test(str)) str += '-03:00';
  const t = Date.parse(str);
  return Number.isFinite(t) ? t : null;
};
const compact = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();
const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
// Data/hora comparável: instante; se inválido, o texto cru normalizado (nulo vira '').
const whenKey = (iso) => { const t = instant(iso); return t != null ? t : 'raw:' + squash(iso); };
const whenShow = (iso) => { const f = formatLocal(iso); return f !== '—' ? f : (squash(iso) || '—'); };
const nameKey = (s) => squash(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// [campo, valor para comparar, valor para exibir, exige os dois lados?]
const FIELDS = [
  ['partida', t => whenKey(t.departure?.datetime), t => whenShow(t.departure?.datetime), false],
  ['chegada', t => whenKey(t.arrival?.datetime),   t => whenShow(t.arrival?.datetime),   false],
  ['voo',     t => compact(t.flightNumber),        t => squash(t.flightNumber) || '—',      false],
  ['origem',  t => compact(t.departure?.airport),  t => squash(t.departure?.airport) || '—', false],
  ['destino', t => compact(t.arrival?.airport),    t => squash(t.arrival?.airport) || '—',   false],
  ['classe',  t => nameKey(t.cabinClass),          t => squash(t.cabinClass) || '—',         true]
];

const strongKey = (t) => compact(t.flightNumber) + '|' + String(t.departure?.datetime || '').slice(0, 10);

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
  return (list || []).filter(Boolean).map(b => `${b.direction}|${String(b.quantity)}|${compact(b.weightText)}`).sort().join(';');
}

function diffVouchers(oldV, newV) {
  const o = oldV || {}, n = newV || {};
  const oldG = groupByDirection(o.trips), newG = groupByDirection(n.trips);
  const trips = [];

  for (const [direction, olds] of oldG) {
    const news = (newG.get(direction) || []).slice();
    const pair = new Array(olds.length).fill(null);
    const used = new Set();
    // passe (a): chave forte
    olds.forEach((old, i) => {
      const k = strongKey(old);
      const j = news.findIndex((nw, idx) => !used.has(idx) && strongKey(nw) === k);
      if (j >= 0) { pair[i] = news[j]; used.add(j); }
    });
    // passe (b): sobrantes por ordem
    const restNew = news.filter((_, idx) => !used.has(idx));
    let r = 0;
    olds.forEach((old, i) => { if (!pair[i] && r < restNew.length) pair[i] = restNew[r++]; });
    const pairedNew = new Set(pair.filter(Boolean));
    olds.forEach((old, i) => {
      const nw = pair[i];
      if (!nw) return trips.push({ status: 'removido', direction, changes: [], old, new: null });
      const changes = compareTrip(old, nw);
      trips.push({ status: changes.length ? 'alterado' : 'igual', direction, changes, old, new: nw });
    });
    news.filter(nw => !pairedNew.has(nw)).forEach(nw => trips.push({ status: 'novo', direction, changes: [], old: null, new: nw }));
  }
  for (const [direction, news] of newG) {
    if (oldG.has(direction)) continue;
    news.forEach(nw => trips.push({ status: 'novo', direction, changes: [], old: null, new: nw }));
  }

  const la = squash(o.reservation?.locator), lb = squash(n.reservation?.locator);
  const locatorChanged = la && lb && la.toUpperCase() !== lb.toUpperCase() ? { antes: la, depois: lb } : null;

  const oldNames = new Map((o.passengers || []).filter(Boolean).map(p => [nameKey(p.name), squash(p.name)]).filter(([k]) => k));
  const newNames = new Map((n.passengers || []).filter(Boolean).map(p => [nameKey(p.name), squash(p.name)]).filter(([k]) => k));
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
