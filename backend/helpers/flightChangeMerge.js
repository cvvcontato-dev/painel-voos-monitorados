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
const { carrierDisplayName, carrierShortName } = require('./voucherCarrier');

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

function mergeNewFlights(oldVoucher, extracted) {
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

module.exports = { mergeNewFlights, carrierFromFlight, isoToDateLabel };
