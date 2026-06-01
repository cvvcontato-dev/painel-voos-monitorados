const db = require('../database');
const aviationApi = require('./aviationApi');
const statusNotifier = require('./statusNotifier');
const { nowUtcIso, addMinutesUtc, diffMinutes, isOlderThanHours } = require('../helpers/time');

const NOTIFIABLE_EVENTS = new Set(['cancelado', 'atrasado', 'reagendado']);
const SILENT_EVENTS = new Set(['portao_alterado', 'terminal_alterado']);

function delayThreshold() {
  return parseInt(process.env.DELAY_THRESHOLD_MIN || '15', 10);
}
function batchSize() {
  return parseInt(process.env.STATUS_MONITOR_BATCH_SIZE || '10', 10);
}

// ---------- DB helpers (promisified) ----------
function dbAll(sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r || [])));
}
function dbGet(sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
}
function dbRun(sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function (e) {
    if (e) rej(e); else res({ changes: this.changes, lastID: this.lastID });
  }));
}

// ---------- Event detection ----------
function detectEvents(prev, next) {
  const events = [];

  // Cancellation
  if (next.status === 'cancelled' && prev.status_atual !== 'cancelled') {
    events.push({
      evento: 'cancelado',
      payload: [{ campo: 'status', antes: prev.status_atual || '—', depois: 'cancelled' }]
    });
  }

  // Reschedule (scheduled time changed). Skip if also cancelled (already covered).
  if (prev.partida_programada && next.partida_programada
      && prev.partida_programada !== next.partida_programada
      && next.status !== 'cancelled') {
    events.push({
      evento: 'reagendado',
      payload: [{ campo: 'Partida programada', antes: prev.partida_programada, depois: next.partida_programada }]
    });
  }

  // Delay (estimated vs scheduled)
  const delay = diffMinutes(next.partida_programada, next.partida_estimada);
  if (delay !== null && delay >= delayThreshold() && next.status !== 'cancelled') {
    // Only emit if delay value changed from before (avoid duplicate when only other fields moved)
    const prevDelay = diffMinutes(prev.partida_programada, prev.partida_estimada);
    if (prevDelay !== delay) {
      events.push({
        evento: 'atrasado',
        payload: [{ campo: 'Partida estimada', antes: prev.partida_estimada || '—', depois: next.partida_estimada }]
      });
    }
  }

  // Gate / terminal — silent (no notification)
  if (prev.portao && next.portao && prev.portao !== next.portao) {
    events.push({
      evento: 'portao_alterado',
      payload: [{ campo: 'Portão', antes: prev.portao, depois: next.portao }]
    });
  }
  if (prev.terminal && next.terminal && prev.terminal !== next.terminal) {
    events.push({
      evento: 'terminal_alterado',
      payload: [{ campo: 'Terminal', antes: prev.terminal, depois: next.terminal }]
    });
  }

  return events;
}

// ---------- Anti-spam ----------
async function isDuplicateEvent(flightId, evento, payload) {
  const last = await dbGet(
    `SELECT payload_json FROM flight_status_history
     WHERE monitored_flight_id = ? AND evento = ?
     ORDER BY verificado_em DESC LIMIT 1`,
    [flightId, evento]
  );
  if (!last) return false;
  return last.payload_json === JSON.stringify(payload);
}

// ---------- Snapshot persistence ----------
async function updateSnapshot(flight, normalized, archive) {
  const now = nowUtcIso();
  const nextCheck = archive ? null : addMinutesUtc(now, flight.cadencia_minutos);
  await dbRun(
    `UPDATE monitored_flights_status SET
       companhia = COALESCE(?, companhia),
       origem = COALESCE(?, origem),
       destino = COALESCE(?, destino),
       status_atual = ?,
       partida_programada = ?,
       partida_estimada = ?,
       chegada_programada = ?,
       chegada_estimada = ?,
       portao = ?,
       terminal = ?,
       monitoramento_ativo = ?,
       ultima_verificacao = ?,
       proxima_verificacao = COALESCE(?, proxima_verificacao),
       atualizado_em = ?
     WHERE id = ?`,
    [
      normalized.companhia, normalized.origem, normalized.destino,
      normalized.status,
      normalized.partida_programada, normalized.partida_estimada,
      normalized.chegada_programada, normalized.chegada_estimada,
      normalized.portao, normalized.terminal,
      archive ? 0 : 1,
      now, nextCheck, now,
      flight.id
    ]
  );
}

async function insertHistory(flightId, evento, payload, notificado) {
  await dbRun(
    `INSERT INTO flight_status_history (monitored_flight_id, verificado_em, evento, payload_json, notificado)
     VALUES (?, ?, ?, ?, ?)`,
    [flightId, nowUtcIso(), evento, payload ? JSON.stringify(payload) : null, notificado ? 1 : 0]
  );
}

// ---------- Notification dispatch ----------
async function notify(flight, evento, payload) {
  const results = await Promise.all([
    flight.email_cliente
      ? statusNotifier.sendStatusEmail(flight.email_cliente, flight, evento, payload)
      : Promise.resolve(null),
    flight.telegram_chat_id
      ? statusNotifier.sendStatusTelegram(flight.telegram_chat_id, flight, evento, payload)
      : Promise.resolve(null)
  ]);
  return results.some(r => r && r.sucesso);
}

// ---------- Core process for one flight ----------
async function processOne(flight) {
  const apiResult = await aviationApi.fetchFlightStatus(flight.numero_voo, flight.data_voo);

  if (!apiResult.ok) {
    await insertHistory(flight.id, 'erro_api', { error: apiResult.error }, false);
    // Reschedule normally
    const now = nowUtcIso();
    await dbRun(
      `UPDATE monitored_flights_status SET ultima_verificacao = ?, proxima_verificacao = ?, atualizado_em = ? WHERE id = ?`,
      [now, addMinutesUtc(now, flight.cadencia_minutos), now, flight.id]
    );
    return { ok: false, error: apiResult.error };
  }

  const normalized = apiResult.data;
  const events = detectEvents(flight, normalized);

  // Auto-archive
  const shouldArchive =
    normalized.status === 'landed' &&
    isOlderThanHours(normalized.chegada_estimada, 2);

  await updateSnapshot(flight, normalized, shouldArchive);

  if (shouldArchive) {
    await insertHistory(flight.id, 'arquivado_auto', { reason: 'landed + 2h' }, false);
  }

  let anyNotified = false;
  for (const ev of events) {
    if (NOTIFIABLE_EVENTS.has(ev.evento)) {
      const duplicate = await isDuplicateEvent(flight.id, ev.evento, ev.payload);
      if (duplicate) {
        // Suppressed — snapshot already updated above
        continue;
      }
      // Merge updated flight identity fields with refreshed normalized data for the notifier
      const flightForNotify = { ...flight, ...normalized, data_voo: flight.data_voo, cliente: flight.cliente };
      const notified = await notify(flightForNotify, ev.evento, ev.payload);
      await insertHistory(flight.id, ev.evento, ev.payload, notified);
      anyNotified = anyNotified || notified;
    } else if (SILENT_EVENTS.has(ev.evento)) {
      await insertHistory(flight.id, ev.evento, ev.payload, false);
    }
  }

  if (events.length === 0) {
    await insertHistory(flight.id, 'check_ok', null, false);
  } else if (!anyNotified && events.every(e => !NOTIFIABLE_EVENTS.has(e.evento))) {
    // only silent events — still log a check_ok beacon
    await insertHistory(flight.id, 'check_ok', null, false);
  }

  return { ok: true, status_atual: normalized.status, events: events.map(e => e.evento) };
}

// ---------- Public entry points ----------
/**
 * Today's date in Brasília (America/Sao_Paulo, fixed UTC-3 since 2019)
 * formatted as YYYY-MM-DD — same format stored in data_voo.
 */
function todayBrasiliaYmd() {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

async function checkDueFlights() {
  // Step 1: auto-pause any flights whose date has already passed (Brasília tz).
  // Concluded flights stay in the table but stop consuming AviationStack quota.
  const today = todayBrasiliaYmd();
  const concluded = await dbRun(
    `UPDATE monitored_flights_status
     SET monitoramento_ativo = 0, atualizado_em = ?
     WHERE monitoramento_ativo = 1 AND data_voo < ?`,
    [nowUtcIso(), today]
  );
  if (concluded.changes > 0) {
    console.log(`[STATUS-MON] ${concluded.changes} voo(s) concluído(s) — monitoramento auto-pausado.`);
  }

  const due = await dbAll(
    `SELECT * FROM monitored_flights_status
     WHERE proxima_verificacao <= ? AND monitoramento_ativo = 1
     ORDER BY proxima_verificacao ASC LIMIT ?`,
    [nowUtcIso(), batchSize()]
  );
  const results = [];
  for (const flight of due) {
    try {
      results.push(await processOne(flight));
    } catch (err) {
      console.error(`[STATUS-MON] Erro no voo #${flight.id}:`, err.message);
      results.push({ ok: false, id: flight.id, error: err.message });
    }
  }
  return results;
}

async function checkOne(id) {
  const flight = await dbGet('SELECT * FROM monitored_flights_status WHERE id = ?', [id]);
  if (!flight) return { ok: false, error: 'not_found' };
  return processOne(flight);
}

module.exports = { checkDueFlights, checkOne, detectEvents };
