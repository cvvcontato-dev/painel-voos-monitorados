// Comparação pura entre dois vouchers unificados (schema de services/voucherSchema.js).
// Sem I/O.
//
// Pareamento dos trechos, dentro de cada direção, em 2 passes:
//  (a) chave forte = número do voo (sem espaços/caixa) + data local de partida (10 primeiros
//      caracteres do datetime escrito); trechos antigo/novo com a mesma chave são pareados;
//  (b) os sobrantes são pareados por ordem (índice entre os sobrantes).
// Saída: trechos antigos na ordem original (cada um com seu par/estado), depois os `novo`.
//
// Passageiros: duas etapas. (1) chave EXATA = tokens do nome ordenados (sem acentos/pontuação; '/', ',', '.', '-'
// separam; preposições e títulos GDS MR MRS MS MSTR MISS CHD INF ignorados; iniciais de 1 letra CONTAM), então
// "BRITO, ALCIMARA" == "ALCIMARA BRITO" == "SILVA/JOSE MR" == "JOSE SILVA", mas "J SILVA" != "A SILVA". Sem
// tokens úteis, a chave é o nome normalizado inteiro (nunca some das listas). (2) Pareamento FLEXÍVEL dos
// sobrantes, ignorando iniciais: nome igual ou subconjunto estrito do outro (a cia às vezes omite nome do meio)
// com o menor tendo >= 2 tokens e os tokens extras do maior fora de {JUNIOR JR FILHO FILHA NETO NETA SOBRINHO
// SEGUNDO TERCEIRO II III}. Relatórios mostram o nome original.
// Limitações: homônimos são um só; pai/filho sem sufixo e "JOSE SILVA" vs "JOSE CARLOS SILVA" são tratados
// como a mesma pessoa.
//
// Bagagem: cada item vira {tipo, kg, qty}. tipo = 'mao' se label/weightText casa
// /m[aã]o|cabine|carry|hand|mochila|item pessoal/i, senão 'despachada'. kg EXIGE unidade (`N kg`, em weightText
// ou label); número solto só vale se o weightText inteiro for um número. 'N mala(s)/peça(s)/volume(s)' alimenta
// qty (nunca kg); senão qty = Number(quantity), padrão 1. Soma qty de itens iguais (tipo|kg) DENTRO da direção
// (sem direção = direção '*'), depois toma o MÁXIMO entre as direções (ida+volta 1×23kg == uma entrada 1×23kg;
// duas entradas 23kg na mesma direção == 2×). kg desconhecido ('?') num lado é curinga para o mesmo tipo quando
// há exatamente um item do tipo em cada lado. baggageChanged só é true quando AMBOS os lados trazem bagagem e
// os mapas diferem (lado sem bagagem = desconhecido). baggageDetail lista antes/depois.

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

// Títulos/tratamentos do formato GDS ("SILVA/JOSE MR") e preposições: nunca fazem parte da identidade.
const NAME_STOP = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E', 'MR', 'MRS', 'MS', 'MSTR', 'MISS', 'CHD', 'INF']);
// Sufixos de geração: se o token extra do nome maior é um destes, NÃO é "o mesmo passageiro abreviado".
const NAME_SUFFIX = new Set(['JUNIOR', 'JR', 'FILHO', 'FILHA', 'NETO', 'NETA', 'SOBRINHO', 'SEGUNDO', 'TERCEIRO', 'II', 'III']);
const normName = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
function nameTokens(s) {
  const toks = normName(s).replace(/[,.\-/]/g, ' ').split(/\s+/).filter(t => t && !NAME_STOP.has(t));
  return [...new Set(toks)].sort();
}
const isSubset = (small, big) => small.every(t => big.includes(t));

/** Lista de {tokens (chave exata, com iniciais), core (sem iniciais), key, show}, sem duplicatas pela chave. */
function namesOf(list) {
  const map = new Map();
  (list || []).filter(Boolean).forEach(p => {
    const show = squash(p.name);
    if (!show) return;
    const tokens = nameTokens(p.name);
    const key = tokens.length ? tokens.join(' ') : normName(show).replace(/\s+/g, ' ');
    if (!map.has(key)) map.set(key, { tokens, core: tokens.filter(t => t.length > 1), key, show });
  });
  return [...map.values()];
}

// Pareamento flexível (2º passe): ignora iniciais; igual ou subconjunto estrito (menor com >= 2 tokens)
// cujos tokens extras não sejam sufixos de geração.
function flexMatch(a, b) {
  const [small, big] = a.core.length <= b.core.length ? [a.core, b.core] : [b.core, a.core];
  if (small.length < 2 || !isSubset(small, big)) return false;
  return big.filter(t => !small.includes(t)).every(t => !NAME_SUFFIX.has(t));
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
    const j = news.findIndex((n, idx) => !usedNew.has(idx) && flexMatch(o, n));
    if (j >= 0) { usedOld.add(i); usedNew.add(j); }
  });
  return {
    adicionados: news.filter((_, j) => !usedNew.has(j)).map(n => n.show),
    removidos: olds.filter((_, i) => !usedOld.has(i)).map(o => o.show)
  };
}

const HAND_RE = /m[aã]o|cabine|carry|hand|mochila|item pessoal/i;
const KG_RE = /(\d+(?:[.,]\d+)?)\s*kg\b/i;
const BARE_NUM_RE = /^\s*(\d+(?:[.,]\d+)?)\s*$/;
const COUNT_RE = /(\d+)\s*(?:malas?|pe[cç]as?|volumes?)\b/i;
const toNum = (s) => String(Number(String(s).replace(',', '.')));

/** Mapa `tipo|kg` -> qty por direção (soma dentro da direção), depois MÁXIMO entre as direções. */
function baggageMap(list) {
  const items = (list || []).filter(Boolean);
  const byDir = new Map();
  for (const b of items) {
    const wt = String(b.weightText || ''), lb = String(b.label || '');
    const tipo = HAND_RE.test(`${lb} ${wt}`) ? 'mao' : 'despachada';
    const m = KG_RE.exec(wt) || BARE_NUM_RE.exec(wt) || KG_RE.exec(lb);
    const kg = m ? toNum(m[1]) : null;
    const c = COUNT_RE.exec(wt) || COUNT_RE.exec(lb);
    const q = Number(b.quantity);
    const qty = c ? Number(c[1]) : (b.quantity == null || b.quantity === '' || !Number.isFinite(q) ? 1 : q);
    const dir = b.direction || '*';
    if (!byDir.has(dir)) byDir.set(dir, new Map());
    const key = `${tipo}|${kg ?? '?'}`, m2 = byDir.get(dir);
    m2.set(key, (m2.get(key) || 0) + qty);
  }
  const map = new Map();
  for (const m2 of byDir.values()) for (const [k, q] of m2) map.set(k, Math.max(map.get(k) || 0, q));
  return { count: items.length, map };
}
const baggageLines = (map) => [...map].sort().map(([k, q]) => {
  const [tipo, kg] = k.split('|');
  return `${q}× ${tipo === 'mao' ? 'mão' : 'despachada'}${kg !== '?' ? ` ${kg}kg` : ''}`;
});
// kg desconhecido ('?') num lado é curinga para o mesmo tipo quando há exatamente um item desse tipo em cada lado.
function applyKgWildcard(a, b) {
  const out = new Map(b);
  for (const tipo of ['mao', 'despachada']) {
    const ka = [...a.keys()].filter(k => k.startsWith(tipo + '|'));
    const kb = [...b.keys()].filter(k => k.startsWith(tipo + '|'));
    if (ka.length === 1 && kb.length === 1 && ka[0] !== kb[0] && (ka[0].endsWith('|?') || kb[0].endsWith('|?'))) {
      out.set(ka[0], out.get(kb[0])); out.delete(kb[0]);
    }
  }
  return out;
}
function diffBaggage(oldList, newList) {
  const a = baggageMap(oldList), b = baggageMap(newList);
  if (!a.count || !b.count) return { changed: false, detail: null };
  const sig = (m) => [...m].sort().map(([k, q]) => `${k}=${q}`).join(';');
  if (sig(a.map) === sig(applyKgWildcard(a.map, b.map))) return { changed: false, detail: null };
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
