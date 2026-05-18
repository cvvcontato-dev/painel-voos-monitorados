const aviationApi = require('../services/aviationApi');

describe('aviationApi (stub mode)', () => {
  beforeAll(() => { process.env.AVIATION_API_MODE = 'stub'; });

  test('returns ok=true with normalized shape', async () => {
    const r = await aviationApi.fetchFlightStatus('LA8084', '2026-05-22');
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({
      numero_voo: 'LA8084',
      status: expect.stringMatching(/^(scheduled|active|landed|cancelled|diverted|delayed)$/),
      partida_programada: expect.any(String),
      partida_estimada: expect.any(String),
      chegada_programada: expect.any(String),
      chegada_estimada: expect.any(String)
    });
  });

  test('stub responds deterministically for the same input within one ms', async () => {
    const a = await aviationApi.fetchFlightStatus('LA8084', '2026-05-22');
    const b = await aviationApi.fetchFlightStatus('LA8084', '2026-05-22');
    expect(a.data.numero_voo).toBe(b.data.numero_voo);
    expect(a.data.partida_programada).toBe(b.data.partida_programada);
  });

  test('stub returns not_found for numero starting with "X"', async () => {
    const r = await aviationApi.fetchFlightStatus('XX0000', '2026-05-22');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_found');
  });

  test('normalizeStatus maps known AeroDataBox values', () => {
    expect(aviationApi.normalizeStatus('Expected')).toBe('scheduled');
    expect(aviationApi.normalizeStatus('EnRoute')).toBe('active');
    expect(aviationApi.normalizeStatus('Arrived')).toBe('landed');
    expect(aviationApi.normalizeStatus('Canceled')).toBe('cancelled');
    expect(aviationApi.normalizeStatus('Diverted')).toBe('diverted');
    expect(aviationApi.normalizeStatus('Delayed')).toBe('delayed');
    expect(aviationApi.normalizeStatus('SomethingUnknown')).toBe('scheduled');
  });
});

describe('aviationApi (real mode, mocked HTTP)', () => {
  beforeEach(() => {
    process.env.AVIATION_API_MODE = 'real';
    process.env.RAPIDAPI_KEY = 'test-key';
    process.env.AERODATABOX_HOST = 'aerodatabox.p.rapidapi.com';
  });
  afterAll(() => { process.env.AVIATION_API_MODE = 'stub'; });

  test('successful response is normalized', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([{
        number: 'LA 8084',
        airline: { name: 'LATAM' },
        status: 'EnRoute',
        departure: {
          airport: { iata: 'GRU' },
          scheduledTime: { utc: '2026-05-22 14:00Z' },
          revisedTime: { utc: '2026-05-22 14:30Z' },
          terminal: '3', gate: 'A12'
        },
        arrival: {
          airport: { iata: 'MIA' },
          scheduledTime: { utc: '2026-05-22 23:00Z' },
          revisedTime: { utc: '2026-05-22 23:30Z' }
        }
      }])
    });

    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(r.ok).toBe(true);
    expect(r.data.numero_voo).toBe('LA8084');
    expect(r.data.companhia).toBe('LATAM');
    expect(r.data.status).toBe('active');
    expect(r.data.origem).toBe('GRU');
    expect(r.data.destino).toBe('MIA');
    expect(r.data.partida_programada).toBe('2026-05-22T14:00:00.000Z');
    expect(r.data.partida_estimada).toBe('2026-05-22T14:30:00.000Z');
    expect(r.data.portao).toBe('A12');
    expect(r.data.terminal).toBe('3');
  });

  test('404 returns not_found', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  test('429 returns rate_limited with retryAfter', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 429,
      headers: { get: (k) => k === 'Retry-After' ? '30' : null },
      json: async () => ({})
    });
    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('rate_limited');
    expect(r.retryAfter).toBe(30);
  });

  test('5xx returns server_error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(r).toEqual({ ok: false, error: 'server_error' });
  });

  test('network error returns error string', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('ECONNREFUSED');
  });

  test('missing RAPIDAPI_KEY returns config_error without calling fetch', async () => {
    delete process.env.RAPIDAPI_KEY;
    global.fetch = jest.fn();
    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, error: 'config_error' });
  });
});
