process.env.AVIATION_API_MODE = 'stub';
process.env.DB_PATH = require('path').join(__dirname, '.tmp-mon');
const fs = require('fs');
if (!fs.existsSync(process.env.DB_PATH)) fs.mkdirSync(process.env.DB_PATH);
try { fs.unlinkSync(require('path').join(process.env.DB_PATH, 'database.sqlite')); } catch(e) {}

const db = require('../database');
const { nowUtcIso, addMinutesUtc } = require('../helpers/time');

// Mock external dependencies
jest.mock('../services/aviationApi');
jest.mock('../services/statusNotifier');

const aviationApi = require('../services/aviationApi');
const statusNotifier = require('../services/statusNotifier');
const monitor = require('../services/statusMonitor');

function insertFlight(overrides = {}) {
  return new Promise((resolve, reject) => {
    const now = nowUtcIso();
    const proxima = addMinutesUtc(now, -1); // due
    const params = [
      overrides.cliente || 'Test',
      overrides.numero_voo || 'LA8084',
      overrides.data_voo || '2099-05-22',
      overrides.email_cliente || null,
      overrides.telegram_chat_id || null,
      overrides.cadencia_minutos || 60,
      overrides.status_atual || null,
      overrides.partida_programada || null,
      overrides.partida_estimada || null,
      overrides.chegada_estimada || null,
      proxima, now, now
    ];
    db.run(
      `INSERT INTO monitored_flights_status
         (cliente,numero_voo,data_voo,email_cliente,telegram_chat_id,cadencia_minutos,
          status_atual,partida_programada,partida_estimada,chegada_estimada,
          proxima_verificacao,criado_em,atualizado_em)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params,
      function (err) { if (err) reject(err); else resolve(this.lastID); }
    );
  });
}

function getFlight(id) {
  return new Promise((r, j) =>
    db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [id], (e, row) => e ? j(e) : r(row)));
}

function getHistory(id) {
  return new Promise((r, j) =>
    db.all('SELECT * FROM flight_status_history WHERE monitored_flight_id = ? ORDER BY id DESC', [id],
      (e, rows) => e ? j(e) : r(rows || [])));
}

beforeAll(async () => { await new Promise(r => setTimeout(r, 400)); });

beforeEach(async () => {
  // Clear tables so UNIQUE constraints don't collide across tests
  await new Promise((r, j) => db.run('DELETE FROM flight_status_history', [], e => e ? j(e) : r()));
  await new Promise((r, j) => db.run('DELETE FROM monitored_flights_status', [], e => e ? j(e) : r()));
  aviationApi.fetchFlightStatus.mockReset();
  statusNotifier.sendStatusEmail.mockReset().mockResolvedValue({ sucesso: true });
  statusNotifier.sendStatusTelegram.mockReset().mockResolvedValue({ sucesso: true });
});

describe('checkDueFlights', () => {
  test('first check populates snapshot and history check_ok', async () => {
    const id = await insertFlight();
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true,
      data: {
        numero_voo: 'LA8084', companhia: 'LATAM', origem: 'GRU', destino: 'MIA',
        status: 'scheduled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:00:00.000Z',
        chegada_programada: '2099-05-22T23:00:00.000Z',
        chegada_estimada: '2099-05-22T23:00:00.000Z',
        portao: 'A12', terminal: '3', raw: {}
      }
    });

    await monitor.checkDueFlights();
    const f = await getFlight(id);
    expect(f.status_atual).toBe('scheduled');
    expect(f.partida_programada).toBe('2099-05-22T14:00:00.000Z');
    expect(f.proxima_verificacao > f.ultima_verificacao).toBe(true);
    const h = await getHistory(id);
    expect(h[0].evento).toBe('check_ok');
    expect(statusNotifier.sendStatusEmail).not.toHaveBeenCalled();
  });

  test('detects cancellation and notifies', async () => {
    const id = await insertFlight({
      email_cliente: 'a@b.com', telegram_chat_id: '123',
      status_atual: 'scheduled',
      partida_programada: '2099-05-22T14:00:00.000Z',
      partida_estimada: '2099-05-22T14:00:00.000Z'
    });
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA8084', status: 'cancelled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:00:00.000Z',
        chegada_programada: null, chegada_estimada: null,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });

    await monitor.checkDueFlights();
    const h = await getHistory(id);
    expect(h[0].evento).toBe('cancelado');
    expect(h[0].notificado).toBe(1);
    expect(statusNotifier.sendStatusEmail).toHaveBeenCalledTimes(1);
    expect(statusNotifier.sendStatusTelegram).toHaveBeenCalledTimes(1);
    expect(statusNotifier.sendStatusEmail.mock.calls[0][2]).toBe('cancelado');
  });

  test('detects delay >= threshold and notifies', async () => {
    process.env.DELAY_THRESHOLD_MIN = '15';
    const id = await insertFlight({
      email_cliente: 'a@b.com',
      status_atual: 'scheduled',
      partida_programada: '2099-05-22T14:00:00.000Z',
      partida_estimada: '2099-05-22T14:00:00.000Z'
    });
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA8084', status: 'scheduled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:30:00.000Z',  // 30min delay
        chegada_programada: '2099-05-22T23:00:00.000Z',
        chegada_estimada: '2099-05-22T23:30:00.000Z',
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });

    await monitor.checkDueFlights();
    const h = await getHistory(id);
    expect(h[0].evento).toBe('atrasado');
    expect(statusNotifier.sendStatusEmail).toHaveBeenCalledTimes(1);
  });

  test('delay below threshold does NOT notify', async () => {
    process.env.DELAY_THRESHOLD_MIN = '15';
    const id = await insertFlight({
      email_cliente: 'a@b.com',
      status_atual: 'scheduled',
      partida_programada: '2099-05-22T14:00:00.000Z',
      partida_estimada: '2099-05-22T14:00:00.000Z'
    });
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA8084', status: 'scheduled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:10:00.000Z', // 10min only
        chegada_programada: null, chegada_estimada: null,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });
    await monitor.checkDueFlights();
    expect(statusNotifier.sendStatusEmail).not.toHaveBeenCalled();
  });

  test('anti-spam: same cancellation twice → notifies once', async () => {
    const id = await insertFlight({
      email_cliente: 'a@b.com', status_atual: 'scheduled',
      partida_programada: '2099-05-22T14:00:00.000Z',
      partida_estimada: '2099-05-22T14:00:00.000Z'
    });
    const cancelled = {
      ok: true, data: {
        numero_voo: 'LA8084', status: 'cancelled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:00:00.000Z',
        chegada_programada: null, chegada_estimada: null,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    };
    aviationApi.fetchFlightStatus.mockResolvedValue(cancelled);

    await monitor.checkDueFlights();
    // make it due again
    await new Promise((r,j) => db.run(
      `UPDATE monitored_flights_status SET proxima_verificacao = ? WHERE id = ?`,
      [addMinutesUtc(nowUtcIso(), -1), id], err => err ? j(err) : r()
    ));
    await monitor.checkDueFlights();

    expect(statusNotifier.sendStatusEmail).toHaveBeenCalledTimes(1);
    const h = await getHistory(id);
    // First call → cancelado; second → check_ok (suppressed)
    expect(h.filter(x => x.evento === 'cancelado').length).toBe(1);
    expect(h.filter(x => x.evento === 'check_ok').length).toBeGreaterThan(0);
  });

  test('auto-archives when landed + chegada_estimada older than 2h', async () => {
    const id = await insertFlight();
    const pastArrival = addMinutesUtc(nowUtcIso(), -200); // 3h20 ago
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA8084', status: 'landed',
        partida_programada: pastArrival, partida_estimada: pastArrival,
        chegada_programada: pastArrival, chegada_estimada: pastArrival,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });
    await monitor.checkDueFlights();
    const f = await getFlight(id);
    expect(f.monitoramento_ativo).toBe(0);
    const h = await getHistory(id);
    expect(h.some(x => x.evento === 'arquivado_auto')).toBe(true);
  });

  test('API error logs erro_api and reschedules', async () => {
    const id = await insertFlight();
    aviationApi.fetchFlightStatus.mockResolvedValue({ ok: false, error: 'server_error' });
    await monitor.checkDueFlights();
    const h = await getHistory(id);
    expect(h[0].evento).toBe('erro_api');
    expect(statusNotifier.sendStatusEmail).not.toHaveBeenCalled();
    const f = await getFlight(id);
    expect(f.proxima_verificacao > f.ultima_verificacao).toBe(true);
  });

  test('respects batch size', async () => {
    process.env.STATUS_MONITOR_BATCH_SIZE = '2';
    for (let i = 0; i < 5; i++) {
      await insertFlight({ numero_voo: `LA${1000+i}` });
    }
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA0000', status: 'scheduled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:00:00.000Z',
        chegada_programada: null, chegada_estimada: null,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });
    await monitor.checkDueFlights();
    expect(aviationApi.fetchFlightStatus.mock.calls.length).toBeLessThanOrEqual(2);
  });

  test('skips inactive flights', async () => {
    const id = await insertFlight();
    await new Promise((r,j) => db.run(
      `UPDATE monitored_flights_status SET monitoramento_ativo = 0 WHERE id = ?`,
      [id], err => err ? j(err) : r()
    ));
    aviationApi.fetchFlightStatus.mockResolvedValue({ ok: true, data: {} });
    await monitor.checkDueFlights();
    expect(aviationApi.fetchFlightStatus).not.toHaveBeenCalled();
  });
});

describe('checkOne (manual trigger)', () => {
  test('runs check for a single id and returns result', async () => {
    const id = await insertFlight();
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA8084', status: 'scheduled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:00:00.000Z',
        chegada_programada: null, chegada_estimada: null,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });
    const r = await monitor.checkOne(id);
    expect(r.ok).toBe(true);
    expect(r.status_atual).toBe('scheduled');
  });
});
