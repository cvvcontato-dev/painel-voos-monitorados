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
const { locatorOf, reservationCount, validIndexes, tripLabel } = require('./flightChangeReservations');

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

const ambiguousAffectedMsg = (n, m) => `O print mostra ${n} trecho(s) e você marcou ${m}. Marque exatamente os trechos que aparecem no print, ou envie um print só do trecho alterado.`;
const DIR_NAME = { ida: 'ida', volta: 'volta', interno: 'trecho interno', multi: 'trecho' };
const dirName = (d) => DIR_NAME[d] || 'trecho';
const routeKey = (t) => `${t.departure.airport}>${t.arrival.airport}`;
const startMs = (t) => { const v = Date.parse(t.departure.datetime); return Number.isFinite(v) ? v : 0; };

/**
 * Reconcilia a DIREÇÃO dos trechos do print pela ROTA (aeroportos), ignorando o rótulo do modelo: se a rota
 * (partida, chegada) coincide com trechos de UMA única direção entre os `candidatos` do voucher antigo, o trecho
 * do print passa a ter essa direção (com aviso se o rótulo do modelo era outro). Rotas que casam com mais de uma
 * direção, ou com nenhuma, ficam como estão. `soRotulados`: não mexe nos trechos sem rótulo.
 */
function reconcileByRoute(candidatos, extTrips, warn, soRotulados) {
  for (const t of extTrips) {
    if (soRotulados && !t.direction) continue;
    const dirs = new Set(candidatos.filter(c => routeKey(c) === routeKey(t)).map(c => c.direction || 'multi'));
    if (dirs.size !== 1) continue;
    const d = [...dirs][0];
    if (t.direction === d) continue;
    if (t.direction) warn(`O print identificava ${dirName(t.direction)} mas, pela rota (${t.departure.airport} → ${t.arrival.airport}), usei como ${dirName(d)}.`);
    t.direction = d;
  }
}

/** 422 de ambiguidade (com log de diagnóstico, sem dados pessoais). */
function ambiguousAffected(marcados, print, nPrint) {
  const fmt = (t) => `${t.direction || '-'}:${t.flightNumber}:${t.departure && t.departure.airport}-${t.arrival && t.arrival.airport}`;
  console.warn(`[FLIGHT-CHANGES] merge ambíguo: marcados=${marcados.map(fmt).join(',')} print=${print.map(fmt).join(',')}`);
  return unprocessable(ambiguousAffectedMsg(nPrint, marcados.length));
}
const up = (s) => String(s == null ? '' : s).trim().toUpperCase();
const flightKey = (t) => String(t.flightNumber || '').replace(/\s+/g, '').toUpperCase() + '|' + String(t.departure && t.departure.datetime || '').slice(0, 10);
const describeTrip = (t) => `${t.flightNumber} (${t.departure.airport} → ${t.arrival.airport})`;

/**
 * Merge restrito aos trechos marcados (A = índices em oldTrips; subconjunto estrito). Só eles são trocados;
 * os demais permanecem INTACTOS. Localizador e companhia valem só para a(s) reserva(s) dos afetados.
 */
function mergeAffected({ old, merged, oldTrips, extTrips, extracted, A, warnings, warn }) {
  const isAff = new Set(A);
  const affTrips = A.map(i => oldTrips[i]);
  const affOfDir = (d) => affTrips.filter(a => a.direction === d);
  const unmarkedKeys = (d) => new Set(oldTrips.filter((o, i) => !isAff.has(i) && (d === undefined || o.direction === d)).map(flightKey));

  // ---- 1. Reconciliação pela rota e pareamento dos trechos do print com os afetados ----
  reconcileByRoute(affTrips, extTrips, warn, false);
  const naoMarcados = unmarkedKeys();
  const jaVistos = new Set();
  // descarte silencioso: igual (voo + data) a um trecho NÃO marcado, ou repetido no próprio print
  const C = extTrips.filter(t => { const k = flightKey(t); if (naoMarcados.has(k) || jaVistos.has(k)) return false; jaVistos.add(k); return true; });
  const repl = new Map();            // direção -> trechos novos
  const ignored = [];
  for (const t of C) {
    if (t.direction && affOfDir(t.direction).length) {
      if (!repl.has(t.direction)) repl.set(t.direction, []);
      repl.get(t.direction).push(t);
    } else ignored.push(t);          // direção sem trecho marcado, ou sem rótulo e sem rota conhecida
  }
  if (!repl.size) {
    // Nenhuma direção do print cobre os marcados: com o mesmo número de trechos, pareia por ORDEM CRONOLÓGICA.
    // Trecho do print com a rota de um trecho NÃO marcado (horário/voo mudou) é desse trecho: não serve de candidato.
    const rotasNaoMarcadas = new Set(oldTrips.filter((o, i) => !isAff.has(i)).map(routeKey));
    const P = C.filter(t => !rotasNaoMarcadas.has(routeKey(t)));
    if (P.length !== A.length) throw ambiguousAffected(affTrips, extTrips, C.length);
    ignored.length = 0;
    C.filter(t => !P.includes(t)).forEach(t => ignored.push(t));
    [...P].sort((x, y) => startMs(x) - startMs(y)).forEach((t, k) => {
      const a = affTrips[k];
      if (t.direction && t.direction !== a.direction) {
        warn(`O print identificava ${dirName(t.direction)} mas, pela sua marcação e pela rota (${t.departure.airport} → ${t.arrival.airport}), usei como ${dirName(a.direction)}.`);
      }
      t.direction = a.direction;
      if (!repl.has(a.direction)) repl.set(a.direction, []);
      repl.get(a.direction).push(t);
    });
  }
  // dois trechos da mesma rota na mesma direção não são uma conexão: é ambíguo
  repl.forEach(list => { const rs = list.map(routeKey); if (new Set(rs).size !== rs.length) throw ambiguousAffected(affTrips, extTrips, C.length); });

  // ---- 2. Substituição: o bloco dos afetados de cada direção vira os trechos novos daquela direção ----
  const replaced = new Map();        // trecho novo -> trecho antigo que ele substitui (herança de classe/status/localizador/cia)
  repl.forEach((list, d) => list.forEach((t, k) => {
    const as = affOfDir(d), o = as[Math.min(k, as.length - 1)];
    replaced.set(t, o);
    if (as[k]) { if (t.cabinClass == null) t.cabinClass = as[k].cabinClass == null ? null : as[k].cabinClass; if (t.status == null) t.status = as[k].status == null ? null : as[k].status; }
  }));
  const trips = [];
  const done = new Set();
  oldTrips.forEach((t, i) => {
    const list = isAff.has(i) ? repl.get(t.direction) : null;
    if (!list || !list.length) { trips.push(t); return; }
    if (done.has(t.direction)) return;
    done.add(t.direction);
    trips.push(...list);
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

  // Trecho marcado que não ganhou substituto no print (a direção não veio, ou veio com menos trechos).
  const semSubstituto = [];
  const vistos = new Map();
  affTrips.forEach(a => {
    const k = vistos.get(a.direction) || 0;
    vistos.set(a.direction, k + 1);
    if (k >= (repl.get(a.direction) || []).length) semSubstituto.push(a);
  });
  semSubstituto.forEach(a => warn(`Não encontrei no print o trecho marcado: ${tripLabel(a)}`));
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
    ? validIndexes(opts && opts.affected, oldTrips.length) : null;
  const A = marcados && (marcados.length < oldTrips.length || reservationCount(old) >= 2) ? marcados : null;
  if (A) return mergeAffected({ old, merged, oldTrips, extTrips, extracted, A, warnings, warn });
  // Caminho sem marcação: um print só da volta rotulado 'ida' não pode trocar a ida. (Voucher só multi/interno troca por posição.)
  if (!oldTrips.every(t => t.direction === 'multi' || t.direction === 'interno')) reconcileByRoute(oldTrips, extTrips, warn, true);
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
