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

const NAME_STOP = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
function nameTokens(s) {
  const toks = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[,.\-]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !NAME_STOP.has(t));
  return [...new Set(toks)].sort();
}
const isSubset = (small, big) => small.every(t => big.includes(t));

/** Lista de {tokens, key, show} (sem duplicatas pela chave canônica). */
function namesOf(list) {
  const map = new Map();
  (list || []).filter(Boolean).forEach(p => {
    const tokens = nameTokens(p.name);
    const key = tokens.join(' ');
    if (key && !map.has(key)) map.set(key, { tokens, key, show: squash(p.name) });
  });
  return [...map.values()];
}

function diffPassengers(oldList, newList) {
  const olds = namesOf(oldList), news = namesOf(newList);
  const usedNew = new Set(), usedOld = new Set();
  olds.forEach((o, i) => {
    const j = news.findIndex((n, idx) => !usedNew.has(idx) && n.key === o.key);
    if (j >= 0) { usedOld.add(i); usedNew.add(j); }
  });
  olds.forEach((o, i) => {
    if (usedOld.has(i)) return;
    const j = news.findIndex((n, idx) => {
      if (usedNew.has(idx)) return false;
      const [small, big] = o.tokens.length <= n.tokens.length ? [o.tokens, n.tokens] : [n.tokens, o.tokens];
      return small.length >= 2 && small.length < big.length && isSubset(small, big);
    });
    if (j >= 0) { usedOld.add(i); usedNew.add(j); }
  });
  return {
    adicionados: news.filter((_, j) => !usedNew.has(j)).map(n => n.show),
    removidos: olds.filter((_, i) => !usedOld.has(i)).map(o => o.show)
  };
}

const HAND_RE = /m[aã]o|cabine|carry|hand|mochila|item pessoal/i;
const KG_RE = /(\d+(?:[.,]\d+)?)/;
function baggageMap(list) {
  const items = (list || []).filter(Boolean);
  const map = new Map();
  for (const b of items) {
    const tipo = HAND_RE.test(`${b.label || ''} ${b.weightText || ''}`) ? 'mao' : 'despachada';
    const m = KG_RE.exec(String(b.weightText || '')) || KG_RE.exec(String(b.label || ''));
    const kg = m ? String(Number(m[1].replace(',', '.'))) : null;
    const q = Number(b.quantity);
    const qty = b.quantity == null || b.quantity === '' || !Number.isFinite(q) ? 1 : q;
    const key = `${tipo}|${kg ?? '?'}`;
    map.set(key, Math.max(map.get(key) || 0, qty));
  }
  return { count: items.length, map };
}
const baggageLines = (map) => [...map].sort().map(([k, q]) => {
  const [tipo, kg] = k.split('|');
  return `${q}× ${tipo === 'mao' ? 'mão' : 'despachada'}${kg !== '?' ? ` ${kg}kg` : ''}`;
});
function diffBaggage(oldList, newList) {
  const a = baggageMap(oldList), b = baggageMap(newList);
  if (!a.count || !b.count) return { changed: false, detail: null };
  const sig = (m) => [...m].sort().map(([k, q]) => `${k}=${q}`).join(';');
  if (sig(a.map) === sig(b.map)) return { changed: false, detail: null };
  return { changed: true, detail: { antes: baggageLines(a.map), depois: baggageLines(b.map) } };
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

  const passengers = diffPassengers(o.passengers, n.passengers);
  const bag = diffBaggage(o.baggage, n.baggage);
  const baggageChanged = bag.changed;
  const hasChanges = trips.some(t => t.status !== 'igual') || !!locatorChanged
    || passengers.adicionados.length > 0 || passengers.removidos.length > 0 || baggageChanged;

  return { trips, locatorChanged, passengers, baggageChanged, baggageDetail: bag.detail, hasChanges };
}

module.exports = { diffVouchers, formatLocal };
