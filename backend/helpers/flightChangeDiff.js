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

const { locatorOf, restrictTo } = require('./flightChangeReservations');
const { journeysOf, expandAffected, itineraryText, flightText } = require('./flightJourneys');

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

const journeyStrongKey = (j) => j.trips.map(strongKey).join('+');
// Mesma estrutura de escalas: mesma quantidade de voos e mesmas escalas intermediárias (origem/destino da viagem
// podem mudar: isso continua sendo comparado voo a voo).
const sameStructure = (a, b) => a.trips.length === b.trips.length
  && a.trips.slice(0, -1).every((t, k) => compact(t.arrival?.airport) === compact(b.trips[k].arrival?.airport));

/** Viagem como um "trecho sintético" (partida do 1º voo, chegada do último) para a mensagem/UI. */
function syntheticTrip(j, voucher) {
  const first = j.trips[0], last = j.trips[j.trips.length - 1];
  return {
    direction: j.direction, dateLabel: first.dateLabel, locator: locatorOf(voucher, first),
    flightNumber: j.trips.map(flightText).join(' + '),
    departure: first.departure, arrival: last.arrival,
    // classe da viagem: a do 1º voo, ou a lista "Econômica + Executiva" quando os voos divergem; null se nenhum tem
    cabinClass: [...new Set(j.trips.map(t => squash(t.cabinClass)).filter(Boolean))].join(' + ') || null,
    segments: j.trips.length, itinerary: itineraryText(j.trips)
  };
}

/** Mudanças de uma viagem cuja estrutura de escalas mudou: itinerário + partida do 1º voo + chegada do último. */
function compareJourney(oj, nj) {
  const a = syntheticTrip(oj, {}), b = syntheticTrip(nj, {});
  const changes = [{ campo: 'itinerario', antes: itineraryText(oj.trips), depois: itineraryText(nj.trips) }];
  for (const [campo, key, show] of FIELDS) {
    if (campo !== 'partida' && campo !== 'chegada' && campo !== 'classe') continue;
    if (campo === 'classe' && (!key(a) || !key(b))) continue;     // classe só conta quando as duas existem
    if (key(a) !== key(b)) changes.push({ campo, antes: show(a), depois: show(b) });
  }
  return changes;
}

/**
 * `opts.affected` = índices (em oldV.trips) dos voos das viagens alteradas (normalizados para viagens inteiras).
 * Com subconjunto, as demais viagens são SEMPRE 'igual' (não entram na mensagem) e voos novos só contam nas
 * direções dos afetados. Sem `affected` (ou cobrindo todos), compara tudo como sempre.
 *
 * Viagem = voos encadeados (helpers/flightJourneys.js). Se a estrutura de escalas mudou (nº de voos ou aeroportos
 * das pernas), sai UMA entrada 'alterado' por viagem (journey: true; old/new = trecho sintético com a origem e o
 * destino da viagem inteira) com `changes` itinerario/partida/chegada; senão, comparação voo a voo como antes.
 *
 * Extras do resultado: reservationChanges [{ direction, antes, depois }] = um por reserva (afetada) cujo
 * localizador mudou; affectedReservations = [{ locator, directions }] (localizadores NOVOS das reservas dos
 * trechos afetados) quando há restrição, senão null.
 */
function diffVouchers(oldV, newV, opts) {
  const o = oldV || {}, n = newV || {};
  const A = restrictTo(expandAffected(o, opts && opts.affected), Array.isArray(o.trips) ? o.trips.length : 0);
  const idxOf = new Map();
  (o.trips || []).forEach((t, i) => { if (t) idxOf.set(t, i); });
  const isAffectedFlight = (t) => !A || A.includes(idxOf.get(t));
  const oldJ = journeysOf(o), newJ = journeysOf(n);
  const groupJ = (list) => { const m = new Map(); list.forEach(j => { if (!m.has(j.direction)) m.set(j.direction, []); m.get(j.direction).push(j); }); return m; };
  const oldG = groupJ(oldJ), newG = groupJ(newJ);
  const affectedDirs = new Set(oldJ.filter(j => isAffectedFlight(j.trips[0])).map(j => j.direction));
  const trips = [];
  const affEntries = new Set();      // entradas que pertencem a viagens marcadas
  const push = (entry, affected) => { trips.push(entry); if (affected) affEntries.add(entry); return entry; };

  const pushNovo = (nj, direction) => {   // viagem nova: UMA entrada se tem conexão
    if (nj.trips.length > 1) push({ status: 'novo', direction, changes: [], old: null, new: syntheticTrip(nj, n), journey: true }, true);
    else push({ status: 'novo', direction, changes: [], old: null, new: nj.trips[0] }, true);
  };

  for (const [direction, olds] of oldG) {
    const news = (newG.get(direction) || []).slice();
    const pair = new Array(olds.length).fill(null);
    const used = new Set();
    // passe (a): chave forte da viagem (voo + data de partida de todos os voos)
    olds.forEach((old, i) => {
      const k = journeyStrongKey(old);
      const j = news.findIndex((nw, idx) => !used.has(idx) && journeyStrongKey(nw) === k);
      if (j >= 0) { pair[i] = news[j]; used.add(j); }
    });
    // passe (b): sobrantes por ordem
    const restNew = news.filter((_, idx) => !used.has(idx));
    let r = 0;
    olds.forEach((old, i) => { if (!pair[i] && r < restNew.length) pair[i] = restNew[r++]; });
    const pairedNew = new Set(pair.filter(Boolean));
    olds.forEach((oj, i) => {
      const nj = pair[i];
      const aff = isAffectedFlight(oj.trips[0]);
      if (!aff) {                                           // não marcada: nunca entra na mensagem
        oj.trips.forEach((old, k) => push({ status: 'igual', direction, changes: [], old, new: (nj && nj.trips[k]) || old }, false));
        return;
      }
      if (!nj) {   // viagem inteira removida: UMA entrada (conexão não vira "cancelado" duas vezes)
        if (oj.trips.length > 1) push({ status: 'removido', direction, changes: [], old: syntheticTrip(oj, o), new: null, journey: true }, true);
        else push({ status: 'removido', direction, changes: [], old: oj.trips[0], new: null }, true);
        return;
      }
      if (sameStructure(oj, nj)) {
        oj.trips.forEach((old, k) => {
          const changes = compareTrip(old, nj.trips[k]);
          push({ status: changes.length ? 'alterado' : 'igual', direction, changes, old, new: nj.trips[k] }, true);
        });
        return;
      }
      push({ status: 'alterado', direction, changes: compareJourney(oj, nj), old: syntheticTrip(oj, o), new: syntheticTrip(nj, n), journey: true }, true);
    });
    if (!A || affectedDirs.has(direction)) {
      news.filter(nw => !pairedNew.has(nw)).forEach(nj => pushNovo(nj, direction));
    }
  }
  if (!A) {
    for (const [direction, news] of newG) {
      if (oldG.has(direction)) continue;
      news.forEach(nj => pushNovo(nj, direction));
    }
  }

  const la = squash(o.reservation?.locator), lb = squash(n.reservation?.locator);
  const locatorChanged = la && lb && la.toUpperCase() !== lb.toUpperCase() ? { antes: la, depois: lb } : null;

  // Uma entrada por reserva afetada cujo localizador mudou (compara o localizador de cada trecho pareado).
  const reservationChanges = [];
  const seen = new Set();
  for (const t of trips) {
    if (!t.old || !t.new || t.old === t.new || !affEntries.has(t)) continue;
    const antes = locatorOf(o, t.old), depois = locatorOf(n, t.new);
    if (!antes || !depois || antes === depois || seen.has(`${antes}|${depois}`)) continue;
    seen.add(`${antes}|${depois}`);
    reservationChanges.push({ direction: t.direction, antes, depois });
  }

  let affectedReservations = null;
  if (A) {
    affectedReservations = [];
    for (const t of trips) {
      if (!affEntries.has(t)) continue;
      const loc = t.new ? locatorOf(n, t.new) : locatorOf(o, t.old);
      if (!loc) continue;
      let g = affectedReservations.find(x => x.locator === loc);
      if (!g) { g = { locator: loc, directions: [] }; affectedReservations.push(g); }
      if (!g.directions.includes(t.direction)) g.directions.push(t.direction);
    }
  }

  const passengers = diffPassengers(o.passengers, n.passengers);
  const bag = diffBaggage(o.baggage, n.baggage);
  const baggageChanged = bag.changed;
  const hasChanges = trips.some(t => t.status !== 'igual') || !!locatorChanged || reservationChanges.length > 0
    || passengers.adicionados.length > 0 || passengers.removidos.length > 0 || baggageChanged;

  return { trips, locatorChanged, reservationChanges, affectedReservations, passengers, baggageChanged, baggageDetail: bag.detail, hasChanges };
}

module.exports = { diffVouchers, formatLocal };
