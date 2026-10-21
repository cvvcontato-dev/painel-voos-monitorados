// Mescla pura (sem I/O) dos voos extraídos de um print com o voucher ANTIGO do caso, gerando o voucher
// unificado COMPLETO do "voucher novo". Sempre parte do voucher antigo (determinístico, mesmo em reenvio):
// passageiros, bagagem, status e demais campos vêm dele; da extração entram só os trechos (por direção),
// o localizador (se válido) e, via prefixo do voo, a companhia. Avisos para o operador ficam em
// meta.mergeWarnings.
//
// Direções: só as presentes na extração são substituídas (por ordem; sobra acrescenta, falta remove);
// ausentes permanecem. Trechos sem rótulo ('multi'/ausente) nunca são misturados: voucher antigo
// 'multi'/'interno' é substituído POR POSIÇÃO; com ida/volta, só se a quantidade de trechos for igual
// ao do antigo (por posição) — senão 422 pedindo os rótulos.
const { validate, DIRECTIONS } = require('../services/voucherSchema');
const { carrierDisplayName, carrierShortName, tripCarrier } = require('./voucherCarrier');
const { locatorOf, reservationCount } = require('./flightChangeReservations');
const { journeysOf, chainPrintTrips, expandAffected, journeyTitle } = require('./flightJourneys');

const PREFIX_CARRIER = { AD: 'azul', G3: 'gol', GLO: 'gol', LA: 'latam', JJ: 'latam', LATAM: 'latam', AZU: 'azul', TAM: 'latam', LAN: 'latam' };
const KNOWN = ['azul', 'gol', 'latam'];
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)$/;
const AIRPORT_RE = /^[A-Z]{3}$/;
const FLIGHT_RE = /^[A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?$/;
const LOCATOR_RE = /^[A-Z0-9]{5,8}$/;
const MAX_TRIPS = 12;
const MAX_STR = 80;

const EMPTY_MSG = 'Não encontrei voos nessa imagem. Envie um print ou PDF que mostre os voos (partida, chegada e número do voo).';
const UNREADABLE_MSG = 'Não consegui ler os voos nessa imagem. Tente outro print ou um PDF mais nítido que mostre partida, chegada e número do voo.';
const AMBIGUOUS_MSG = 'Não consegui identificar quais trechos são da ida e da volta. Envie um print com os rótulos "Voo da ida"/"Voo da volta".';

// Node >= 17 (Dockerfile usa node:20).
const clone = (o) => (o == null ? null : structuredClone(o));
const unprocessable = (error, details) => ({ status: 422, body: details ? { error, details } : { error } });

/** Cia a partir do prefixo do número do voo ("G3 1922" -> gol); null se desconhecido. */
function carrierFromFlight(flightNumber) {
  const m = /^\s*([A-Za-z0-9]{2,5}?)\s*\d/.exec(String(flightNumber || ''));
  return m ? (PREFIX_CARRIER[m[1].toUpperCase()] || null) : null;
}

/** "2026-11-17T14:45:00-03:00" -> "17 NOV 2026" (data escrita no ISO, sem converter fuso). */
function isoToDateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  const mes = m && MESES[Number(m[2]) - 1];
  return mes ? `${m[3]} ${mes} ${m[1]}` : '';
}

/** Data/hora realmente existente (round-trip por Date.UTC) e instante em ms; null se inválida. */
function parseIso(s) {
  const m = ISO_RE.exec(typeof s === 'string' ? s : '');
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  const u = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  if (u.getUTCFullYear() !== y || u.getUTCMonth() !== mo - 1 || u.getUTCDate() !== d
      || u.getUTCHours() !== h || u.getUTCMinutes() !== mi || u.getUTCSeconds() !== se) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

const cut = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_STR) : null);

/** Reconstrói o trecho SÓ com campos conhecidos; 422 apontando o trecho se algo essencial estiver ilegível. */
function sanitizeTrip(t, i) {
  const nome = `Trecho ${i + 1}${typeof t.flightNumber === 'string' && t.flightNumber.trim() ? ` (${t.flightNumber.trim().slice(0, 12)})` : ''}`;
  const dep = t.departure && typeof t.departure === 'object' ? t.departure : {};
  const arr = t.arrival && typeof t.arrival === 'object' ? t.arrival : {};

  const fnRaw = typeof t.flightNumber === 'string' ? t.flightNumber.toUpperCase().replace(/\s+/g, ' ').trim() : '';
  if (!FLIGHT_RE.test(fnRaw)) throw unprocessable(`${nome}: não consegui ler o número do voo.`);
  const fm = /^([A-Z0-9]{2,3}?)\s?(\d{1,4}[A-Z]?)$/.exec(fnRaw);
  const flightNumber = fm ? `${fm[1]} ${fm[2]}` : fnRaw;

  const apDep = typeof dep.airport === 'string' ? dep.airport.trim().toUpperCase() : '';
  const apArr = typeof arr.airport === 'string' ? arr.airport.trim().toUpperCase() : '';
  if (!AIRPORT_RE.test(apDep)) throw unprocessable(`${nome}: aeroporto de partida inválido (precisa de 3 letras, ex.: SSA).`);
  if (!AIRPORT_RE.test(apArr)) throw unprocessable(`${nome}: aeroporto de chegada inválido (precisa de 3 letras, ex.: REC).`);

  const tDep = parseIso(dep.datetime), tArr = parseIso(arr.datetime);
  if (tDep == null) throw unprocessable(`${nome}: não consegui ler a data/hora de partida. Envie um print em que apareçam partida e chegada.`);
  if (tArr == null) throw unprocessable(`${nome}: não consegui ler a data/hora de chegada. Envie um print em que apareçam partida e chegada.`);
  if (tArr < tDep) throw unprocessable(`${nome}: a chegada é anterior à partida. Confira o print.`);

  return {
    direction: DIRECTIONS.includes(t.direction) && t.direction !== 'multi' ? t.direction : null,   // null = sem rótulo
    dateLabel: isoToDateLabel(dep.datetime),
    departure: { airport: apDep, airportName: cut(dep.airportName), datetime: dep.datetime },
    arrival: { airport: apArr, airportName: cut(arr.airportName), datetime: arr.datetime },
    flightNumber,
    durationText: cut(t.durationText),
    cabinClass: cut(t.cabinClass),
    airlineDisplayName: null,   // definido depois, pela cia do prefixo
    status: cut(t.status)
  };
}

/** Atribui direção a todos os trechos extraídos (ou 422). Devolve { trips, positional }. */
function assignDirections(ext, oldTrips) {
  const oldDirs = oldTrips.map(t => t && t.direction);
  const oldFree = oldDirs.length > 0 && oldDirs.every(d => d === 'multi' || d === 'interno');
  if (oldFree) {   // substitui por posição; os que sobram herdam a direção do último trecho antigo
    ext.forEach((t, i) => { t.direction = oldDirs[Math.min(i, oldDirs.length - 1)]; });
    return true;
  }
  const unlabeled = ext.filter(t => !t.direction);
  if (unlabeled.length) {
    if (unlabeled.length === ext.length && ext.length === oldTrips.length) {
      ext.forEach((t, i) => { t.direction = oldDirs[i]; });
      return false;
    }
    throw unprocessable(AMBIGUOUS_MSG);
  }
  if (!ext.some(t => oldDirs.includes(t.direction))) throw unprocessable(AMBIGUOUS_MSG);
  return false;
}

const ambiguousAffectedMsg = (n, m) => `O print mostra ${n} viagem(ns) e você marcou ${m}. Marque exatamente as viagens que aparecem no print, ou envie um print só da viagem alterada.`;
const DIR_NAME = { ida: 'ida', volta: 'volta', interno: 'trecho interno', multi: 'trecho' };
const dirName = (d) => DIR_NAME[d] || 'trecho';
const odKey = (j) => `${j.origin}>${j.destination}`;
const startMs = (j) => { const v = Date.parse(j.trips[0].departure.datetime); return Number.isFinite(v) ? v : 0; };
const odText = (j) => `${j.origin} → ${j.destination}`;

/**
 * Reconcilia a DIREÇÃO das viagens do print pela ORIGEM/DESTINO da viagem inteira (juntando as conexões),
 * ignorando o rótulo do modelo: se a rota coincide com viagens de UMA única direção do voucher antigo, todos os
 * voos da viagem do print passam a ter essa direção (com aviso se o rótulo era outro). Rotas que casam com mais
 * de uma direção, ou com nenhuma, ficam como estão. `soRotulados`: não mexe nas viagens sem rótulo.
 */
function reconcileByRoute(viagensAntigas, viagensPrint, warn, soRotulados) {
  for (const pj of viagensPrint) {
    if (soRotulados && !pj.direction) continue;
    const dirs = new Set(viagensAntigas.filter(c => odKey(c) === odKey(pj)).map(c => c.direction || 'multi'));
    if (dirs.size !== 1) continue;
    const d = [...dirs][0];
    if (pj.direction === d) continue;
    if (pj.direction) warn(`O print identificava ${dirName(pj.direction)} mas, pela rota (${odText(pj)}), usei como ${dirName(d)}.`);
    pj.direction = d;
    pj.trips.forEach(t => { t.direction = d; });
  }
}

/** 422 de ambiguidade (com log de diagnóstico, sem dados pessoais). */
function ambiguousAffected(marcados, print, nViagens, mViagens, nenhumaCorresponde) {
  const fmt = (t) => `${t.direction || '-'}:${t.flightNumber}:${t.departure && t.departure.airport}-${t.arrival && t.arrival.airport}`;
  console.warn(`[FLIGHT-CHANGES] merge ambíguo: marcados=${marcados.map(fmt).join(',')} print=${print.map(fmt).join(',')}`);
  if (nenhumaCorresponde) return unprocessable('Nenhuma viagem do print corresponde à viagem marcada (origem e destino diferentes). Confira a marcação ou envie um print só da viagem alterada.');
  return unprocessable(ambiguousAffectedMsg(nViagens, mViagens));
}
const up = (s) => String(s == null ? '' : s).trim().toUpperCase();
const flightKey = (t) => String(t.flightNumber || '').replace(/\s+/g, '').toUpperCase() + '|' + String(t.departure && t.departure.datetime || '').slice(0, 10);
const describeTrip = (t) => `${t.flightNumber} (${t.departure.airport} → ${t.arrival.airport})`;

/**
 * Merge restrito às VIAGENS marcadas (A = índices de voos em oldTrips, já normalizados para viagens inteiras;
 * subconjunto estrito, ou todos em voucher de ≥2 reservas). Só elas são trocadas, o bloco inteiro de voos por vez
 * (qualquer quantidade de voos/conexões); as demais permanecem INTACTAS. Localizador e companhia valem só para a(s)
 * reserva(s) dos afetados.
 */
function mergeAffected({ old, merged, oldTrips, extTrips, extracted, A, warnings, warn }) {
  const isAff = new Set(A);
  const affTrips = A.map(i => oldTrips[i]);
  const todasAntigas = journeysOf(merged);
  const marcadas = todasAntigas.filter(j => isAff.has(j.indexes[0]));
  const naoMarcadas = todasAntigas.filter(j => !isAff.has(j.indexes[0]));

  // ---- 1. Viagens do print (voos encadeados por horário; o rótulo do modelo só desempata) ----
  const jaVistos = new Set();
  const semRepetidos = extTrips.filter(t => { const k = flightKey(t); if (jaVistos.has(k)) return false; jaVistos.add(k); return true; });
  const viagensPrint = chainPrintTrips(semRepetidos);
  // descarte silencioso: viagem do print idêntica (voo + data de TODOS os voos) a uma viagem NÃO marcada
  const chavesDe = (j) => new Set(j.trips.map(flightKey));
  const P = viagensPrint.filter(pj => !naoMarcadas.some(u => u.trips.length === pj.trips.length && pj.trips.every(t => chavesDe(u).has(flightKey(t)))));

  // ---- 2. Pareamento viagem do print <-> viagem marcada: (a) mesma origem+destino; (b) senão, por ordem ----
  const pairs = [];
  let livresP = P.slice(), livresM = marcadas.slice();
  const parear = (mj, pj, porOrdem) => {
    if (pj.direction && pj.direction !== mj.direction) {
      warn(porOrdem
        ? `O print identificava ${dirName(pj.direction)} mas, pela sua marcação e pela rota (${odText(pj)}), usei como ${dirName(mj.direction)}.`
        : `O print identificava ${dirName(pj.direction)} mas, pela rota (${odText(pj)}), usei como ${dirName(mj.direction)}.`);
    }
    pairs.push([mj, pj]);
    livresP = livresP.filter(x => x !== pj); livresM = livresM.filter(x => x !== mj);
  };
  for (const mj of marcadas) {
    let cands = livresP.filter(pj => odKey(pj) === odKey(mj));
    if (cands.length > 1) {
      const mesmaDir = cands.filter(pj => pj.direction === mj.direction);
      if (mesmaDir.length !== 1) throw ambiguousAffected(affTrips, extTrips, P.length, marcadas.length);
      cands = mesmaDir;
    }
    if (cands.length === 1) parear(mj, cands[0], false);
  }
  // viagem do print com a rota de uma viagem NÃO marcada (voos/horários diferentes) é dela: não é candidata
  const ignoradas = livresP.filter(pj => naoMarcadas.some(u => odKey(u) === odKey(pj)));
  livresP = livresP.filter(pj => !ignoradas.includes(pj));
  if (livresM.length && livresP.length === livresM.length) {
    const ordenadas = [...livresP].sort((x, y) => startMs(x) - startMs(y));
    [...livresM].forEach((mj, k) => parear(mj, ordenadas[k], true));
  } else if (!pairs.length) {
    throw ambiguousAffected(affTrips, extTrips, P.length, marcadas.length, P.length === marcadas.length);
  }
  ignoradas.push(...livresP);        // sobras do print: realmente diferentes e não marcadas
  const ignored = ignoradas.flatMap(pj => pj.trips);

  // ---- 3. Substituição: o bloco de voos da viagem marcada vira os voos da viagem do print ----
  const replaced = new Map();        // voo novo -> voo antigo que ele substitui (herança de classe/status/localizador/cia)
  const emitAt = new Map(), skip = new Set();
  pairs.forEach(([mj, pj]) => {
    pj.trips.forEach((t, k) => {
      t.direction = mj.direction;    // direção e reserva vêm da viagem substituída
      replaced.set(t, mj.trips[Math.min(k, mj.trips.length - 1)]);
      // classe/status herdados por posição; voo extra (sem par) herda o do ÚLTIMO voo da viagem antiga
      const par = mj.trips[k] || mj.trips[mj.trips.length - 1];
      if (par) { if (t.cabinClass == null) t.cabinClass = par.cabinClass == null ? null : par.cabinClass; if (t.status == null) t.status = par.status == null ? null : par.status; }
    });
    mj.indexes.forEach(i => skip.add(i));
    emitAt.set(mj.indexes[0], pj.trips);
  });
  const trips = [];
  oldTrips.forEach((t, i) => {
    if (emitAt.has(i)) trips.push(...emitAt.get(i));
    else if (!skip.has(i)) trips.push(t);
  });

  // ---- 3. Companhia por trecho (prefixo do voo), só para os trechos novos ----
  const oldCarrier = KNOWN.includes(old.carrier) ? old.carrier : null;
  const hint = KNOWN.includes(extracted.carrier) ? extracted.carrier : null;
  const fallbackTop = oldCarrier || 'azul';
  const oldTripCarrier = (o) => tripCarrier(o, fallbackTop);
  const carrierOfNew = (t) => {
    const c = carrierFromFlight(t.flightNumber);
    if (c) return c;
    warn(`O voo ${t.flightNumber} tem prefixo desconhecido: mantive a companhia do trecho substituído. Confira.`);
    const o = replaced.get(t);
    const doAntigo = tripCarrier(o, '-');   // '-' = a cia do trecho antigo não é identificável
    return KNOWN.includes(doAntigo) ? doAntigo : (hint || oldTripCarrier(o));
  };
  const tripCarriers = trips.map(t => (replaced.has(t) ? carrierOfNew(t) : oldTripCarrier(t)));
  trips.forEach((t, i) => { if (replaced.has(t)) t.airlineDisplayName = carrierDisplayName(tripCarriers[i]); });

  const res = merged.reservation = merged.reservation && typeof merged.reservation === 'object' ? merged.reservation : {};
  const nameOf = (c) => carrierShortName(c);
  const distinct = [...new Set(tripCarriers)];
  const dirCarrier = (dir) => { const i = trips.findIndex(t => t.direction === dir); return i >= 0 ? tripCarriers[i] : null; };
  const wasMulti = old.carrier === 'multi';
  let carrierChanged = false;
  if (distinct.length === 1) {
    const c = distinct[0];
    if (merged.carrier !== c) {
      carrierChanged = true;
      warn(`Companhia alterada de ${wasMulti ? 'várias companhias' : nameOf(oldCarrier || merged.carrier)} para ${nameOf(c)}: confira o localizador e a bagagem`);
      merged.carrier = c;
      merged.branding = { ...(merged.branding || {}), airlineName: nameOf(c), logoUrl: null, primaryColor: null };
    }
    delete res.primaryCarrier; delete res.secondaryCarrier;   // não é mais 'multi'
  } else {
    const primary = dirCarrier('ida') || tripCarriers[0];
    const voltaC = dirCarrier('volta');
    const secondary = voltaC && voltaC !== primary ? voltaC : distinct.find(c => c !== primary);   // padrão do voucherCombiner
    if (!wasMulti || res.primaryCarrier !== primary || res.secondaryCarrier !== secondary) {
      carrierChanged = !wasMulti;
      warn('Ida e volta agora são de companhias diferentes: confira o localizador de cada reserva');
    }
    if (!wasMulti) merged.branding = { ...(merged.branding || {}), logoUrl: null, primaryColor: null };
    merged.carrier = 'multi';
    res.primaryCarrier = primary;
    res.secondaryCarrier = secondary;
  }
  const dirChanged = trips.some((t, i) => replaced.has(t) && tripCarriers[i] !== oldTripCarrier(replaced.get(t)));
  if ((carrierChanged || dirChanged) && Array.isArray(old.baggage) && old.baggage.length) {
    warn('Bagagem mantida do voucher antigo, mas a companhia mudou: confira a franquia');
  }

  // ---- 4. Localizador: vale só para a reserva dos trechos afetados ----
  const oldKeyOf = (o) => locatorOf(old, o);
  const S = [...new Set(affTrips.map(oldKeyOf).filter(Boolean))];
  const rawLoc = up(extracted.locator);
  let applied = null;
  if (rawLoc) {
    if (!LOCATOR_RE.test(rawLoc)) warn('Localizador lido da imagem ignorado (formato inválido)');
    else if (S.length > 1) warn(`Localizador ${rawLoc} lido da imagem não foi aplicado (os trechos marcados são de reservas diferentes): confira`);
    else if (S.length === 0) warn(`Localizador ${rawLoc} lido da imagem não foi aplicado (a reserva afetada não tem localizador): confira`);
    else if (S.length === 1 && rawLoc !== S[0]) { applied = { from: S[0], to: rawLoc }; warn(`Localizador alterado de ${S[0]} para ${rawLoc}: confira`); }
  }
  const swap = (v) => (applied && up(v) === applied.from ? applied.to : v);
  trips.forEach(t => {
    if (replaced.has(t)) {
      const o = replaced.get(t);
      const ol = o.locator || (reservationCount(old) >= 2 ? oldKeyOf(o) : '');   // voucher combinado: sempre carimba a reserva
      if (ol) t.locator = swap(ol);
    }
    else if (t.locator) t.locator = swap(t.locator);
  });
  if (applied) {
    if (res.locator) res.locator = swap(res.locator);
    if (res.secondaryLocator) res.secondaryLocator = swap(res.secondaryLocator);
  }
  // reservation.reservations[]: renomeia o código e troca a cia só das reservas afetadas
  if (Array.isArray(res.reservations)) {
    S.forEach(k => {
      const novo = trips.findIndex(t => replaced.has(t) && oldKeyOf(replaced.get(t)) === k);
      const antigo = affTrips.find(a => oldKeyOf(a) === k);
      const cNovo = novo >= 0 ? tripCarriers[novo] : null;
      res.reservations.forEach(e => {
        if (!e || up(e.code) !== k) return;
        if (cNovo && antigo && cNovo !== oldTripCarrier(antigo)) e.carrier = cNovo;
        if (applied) e.code = applied.to;
      });
    });
  }

  // Viagem marcada que não ganhou substituto no print.
  livresM.forEach(mj => warn(`Não encontrei no print o trecho marcado: ${journeyTitle(mj)}`));
  if (ignored.length) warn(`Ignorei trechos do print que não estavam marcados: ${ignored.map(describeTrip).join(', ')}. Eles diferem do voucher antigo: marque o trecho se ele mudou`);

  const idas = trips.filter(t => t.direction === 'ida');
  const lastDest = (idas.length ? idas : trips).slice(-1)[0];
  merged.trips = trips;
  merged.route = { origin: trips[0].departure.airport, destination: lastDest.arrival.airport };
  merged.meta = { parsedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), parserVersion: 'flights-merge@2026-10', mergeWarnings: warnings };

  const v = validate(merged);
  if (!v.ok) throw unprocessable('schema inválido após extração', v.errors);
  return merged;
}

/**
 * Mescla os voos extraídos com o voucher ANTIGO. `opts.affected` = índices (em oldVoucher.trips) dos trechos
 * alterados: com subconjunto, só eles são trocados (ver mergeAffected). Sem `affected`, ou cobrindo todos os
 * trechos, o comportamento é o de sempre.
 */
function mergeNewFlights(oldVoucher, extracted, opts) {
  const warnings = [];
  const warn = (m) => { if (!warnings.includes(m)) warnings.push(m); };

  if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted) || !Array.isArray(extracted.trips)) {
    throw unprocessable(UNREADABLE_MSG);
  }
  const rawTrips = extracted.trips.filter(t => t && typeof t === 'object' && !Array.isArray(t));
  if (!rawTrips.length) throw unprocessable(EMPTY_MSG);
  if (rawTrips.length > MAX_TRIPS) throw unprocessable(`Encontrei trechos demais nessa imagem (${rawTrips.length}). O máximo é ${MAX_TRIPS}; envie um print só dos voos alterados.`);
  const extTrips = rawTrips.map(sanitizeTrip);

  const old = oldVoucher && typeof oldVoucher === 'object' ? oldVoucher : {};
  const merged = clone(old) || {};
  const oldTrips = Array.isArray(merged.trips) ? merged.trips.filter(Boolean) : [];
  // Os índices de `affected` valem para a lista original; se ela tinha buracos, a marcação não é confiável.
  // Marcação explícita (affected passado) restringe o merge. Cobrindo TODOS os trechos só vale se o voucher tem
  // >=2 reservas (o localizador do print não pode ir para a reserva errada); com 1 reserva = comportamento antigo.
  const marcados = oldTrips.length === (Array.isArray(merged.trips) ? merged.trips.length : 0)
    ? expandAffected(merged, opts && opts.affected) : null;
  const A = marcados && (marcados.length < oldTrips.length || reservationCount(old) >= 2) ? marcados : null;
  if (A) return mergeAffected({ old, merged, oldTrips, extTrips, extracted, A, warnings, warn });
  // Caminho sem marcação: um print só da volta rotulado 'ida' não pode trocar a ida. (Voucher só multi/interno troca por posição.)
  if (!oldTrips.every(t => t.direction === 'multi' || t.direction === 'interno')) reconcileByRoute(journeysOf(merged), chainPrintTrips(extTrips), warn, true);
  const positional = assignDirections(extTrips, oldTrips);   // voucher antigo multi/interno: troca por posição

  // Trechos por direção -> substitui no lugar do 1º da direção; ausentes permanecem.
  const byDir = new Map();
  extTrips.forEach(t => { if (!byDir.has(t.direction)) byDir.set(t.direction, []); byDir.get(t.direction).push(t); });
  const oldByDir = new Map();
  oldTrips.forEach(t => { if (!oldByDir.has(t.direction)) oldByDir.set(t.direction, []); oldByDir.get(t.direction).push(t); });
  // Pareado por (direção, posição): herda classe/status do antigo quando o novo veio vazio.
  byDir.forEach((list, d) => list.forEach((t, i) => {
    const o = (oldByDir.get(d) || [])[i];
    if (o) { if (t.cabinClass == null) t.cabinClass = o.cabinClass == null ? null : o.cabinClass; if (t.status == null) t.status = o.status == null ? null : o.status; }
  }));

  const trips = [];
  const done = new Set();
  if (positional) {   // os N primeiros trechos são trocados; o que sobrar do antigo permanece
    trips.push(...extTrips, ...oldTrips.slice(extTrips.length));
  } else for (const t of oldTrips) {
    const d = t.direction;
    if (!byDir.has(d)) { trips.push(t); continue; }
    if (done.has(d)) continue;
    done.add(d);
    trips.push(...byDir.get(d));
  }
  if (!positional) for (const [d, list] of byDir) if (!done.has(d)) trips.push(...list);

  // ---- Companhia, por trecho, pelo prefixo do voo ----
  const oldCarrier = KNOWN.includes(old.carrier) ? old.carrier : null;       // 'multi' não serve de fallback
  const hint = KNOWN.includes(extracted.carrier) ? extracted.carrier : null;  // dica do modelo (sem prefixo)
  const newSet = new Set(extTrips);
  const carrierOf = (t) => {
    const c = carrierFromFlight(t.flightNumber);
    if (c) return c;
    if (newSet.has(t)) warn(`O voo ${t.flightNumber} tem prefixo desconhecido: mantive a companhia do voucher antigo. Confira.`);
    return hint || oldCarrier || 'azul';
  };
  const tripCarriers = trips.map(carrierOf);
  trips.forEach((t, i) => { t.airlineDisplayName = carrierDisplayName(tripCarriers[i]); });

  const distinct = [...new Set(tripCarriers)];
  const res = merged.reservation = merged.reservation && typeof merged.reservation === 'object' ? merged.reservation : {};
  const nameOf = (c) => carrierShortName(c);
  const dirCarrier = (dir) => { const i = trips.findIndex(t => t.direction === dir); return i >= 0 ? tripCarriers[i] : null; };
  const wasMulti = old.carrier === 'multi';
  let carrierChanged = false;

  if (distinct.length === 1) {
    const c = distinct[0];
    if (merged.carrier !== c) {
      carrierChanged = true;
      warn(`Companhia alterada de ${wasMulti ? 'várias companhias' : nameOf(oldCarrier || merged.carrier)} para ${nameOf(c)}: confira o localizador e a bagagem`);
      merged.carrier = c;
      merged.branding = { ...(merged.branding || {}), airlineName: nameOf(c), logoUrl: null, primaryColor: null };
      delete res.reservations; delete res.secondaryLocator; delete res.secondaryCarrier; delete res.primaryCarrier;
    }
  } else {
    const primary = dirCarrier('ida') || tripCarriers[0];
    const secondary = dirCarrier('volta') || distinct.find(c => c !== primary);
    if (!wasMulti || res.primaryCarrier !== primary || res.secondaryCarrier !== secondary) {
      carrierChanged = !wasMulti;
      warn('Ida e volta agora são de companhias diferentes: confira o localizador de cada reserva');
    }
    if (!wasMulti) merged.branding = { ...(merged.branding || {}), logoUrl: null, primaryColor: null };
    merged.carrier = 'multi';
    res.primaryCarrier = primary;
    res.secondaryCarrier = secondary;
  }

  // Bagagem permanece do antigo; avisa se a cia de alguma direção mudou.
  const oldDirCarrier = (dir) => {
    const o = oldTrips.find(t => t.direction === dir);
    return (o && carrierFromFlight(o.flightNumber)) || oldCarrier;
  };
  const dirChanged = [...byDir.keys()].some(d => { const was = oldDirCarrier(d); const now = dirCarrier(d); return was && now && was !== now; });
  if ((carrierChanged || dirChanged) && Array.isArray(old.baggage) && old.baggage.length) {
    warn('Bagagem mantida do voucher antigo, mas a companhia mudou: confira a franquia');
  }

  // ---- Localizador ----
  const rawLoc = typeof extracted.locator === 'string' ? extracted.locator.trim().toUpperCase() : '';
  if (rawLoc) {
    if (!LOCATOR_RE.test(rawLoc)) {
      warn('Localizador lido da imagem ignorado (formato inválido)');
    } else if (rawLoc !== String(res.locator || '').toUpperCase()) {
      if (merged.carrier === 'multi') {
        warn(`Localizador ${rawLoc} lido da imagem não foi aplicado (ida e volta de companhias diferentes): confira`);
      } else {
        warn(`Localizador alterado de ${res.locator || '—'} para ${rawLoc}: confira`);
        res.locator = rawLoc;
      }
    }
  }

  // ---- Rota: origem = partida do 1º trecho; destino = chegada do ÚLTIMO trecho da ida (senão do último) ----
  const idas = trips.filter(t => t.direction === 'ida');
  const lastDest = (idas.length ? idas : trips).slice(-1)[0];
  merged.trips = trips;
  merged.route = { origin: trips[0].departure.airport, destination: lastDest.arrival.airport };

  merged.meta = { parsedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), parserVersion: 'flights-merge@2026-10', mergeWarnings: warnings };

  const v = validate(merged);
  if (!v.ok) throw unprocessable('schema inválido após extração', v.errors);
  return merged;
}

module.exports = { mergeNewFlights, carrierFromFlight, isoToDateLabel, reconcileByRoute };
