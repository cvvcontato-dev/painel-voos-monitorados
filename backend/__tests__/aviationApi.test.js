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
