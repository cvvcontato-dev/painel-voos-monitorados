const { validate, LAYOUT_VERSIONS, CARRIERS } = require('../services/voucherSchema');

describe('voucherSchema.validate', () => {
  const valid = {
    carrier: 'azul', layoutVersion: 'azul.confirmacao.v1',
    reservation: { locator: 'ABC123', status: 'Confirmada' },
    route: { origin: 'GRU', destination: 'REC' },
    passengers: [{ order: 1, name: 'JOAO', type: 'adulto' }],
    trips: [{
      direction: 'ida', dateLabel: '12 SET 2026',
      departure: { airport: 'GRU', datetime: '2026-09-12T08:30:00-03:00' },
      arrival:   { airport: 'REC', datetime: '2026-09-12T11:45:00-03:00' },
      flightNumber: 'AD 4001', durationText: '3h15'
    }],
    baggage: [], branding: { airlineName: 'Azul' },
    meta: { parsedAt: '2026-05-28T14:00:00Z', parserVersion: 'x', confidence: 0.9 }
  };

  test('aceita payload válido mínimo', () => {
    expect(validate(valid)).toEqual({ ok: true, errors: [] });
  });

  test('rejeita carrier fora do enum', () => {
    const r = validate({ ...valid, carrier: 'tam' });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('carrier'))).toBe(true);
  });

  test('rejeita layoutVersion fora do enum', () => {
    const r = validate({ ...valid, layoutVersion: 'azul.qualquercoisa' });
    expect(r.ok).toBe(false);
  });

  test('rejeita datetime sem ISO', () => {
    const t = JSON.parse(JSON.stringify(valid));
    t.trips[0].departure.datetime = '12/09/2026 08:30';
    expect(validate(t).ok).toBe(false);
  });

  test('exige pelo menos 1 passenger e 1 trip', () => {
    expect(validate({ ...valid, passengers: [] }).ok).toBe(false);
    expect(validate({ ...valid, trips: [] }).ok).toBe(false);
  });

  test('expõe enums', () => {
    expect(CARRIERS).toContain('azul');
    expect(LAYOUT_VERSIONS).toContain('azul.confirmacao.v1');
  });
});
