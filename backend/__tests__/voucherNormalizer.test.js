const { normalize } = require('../services/voucherNormalizer');

describe('voucherNormalizer.normalize', () => {
  test('força layoutVersion conhecido (string solta vira azul.confirmacao.v1)', () => {
    const out = normalize({ carrier: 'azul', layoutVersion: 'v1', trips: [], passengers: [] });
    expect(out.layoutVersion).toBe('azul.confirmacao.v1');
  });

  test('converte datetime BR para ISO (assume -03:00)', () => {
    const raw = {
      carrier: 'azul', layoutVersion: 'azul.confirmacao.v1',
      reservation: { locator: 'X' }, route: { origin: 'GRU', destination: 'REC' },
      passengers: [{ order: 1, name: 'a', type: 'adulto' }],
      trips: [{
        direction: 'ida', dateLabel: '12 SET 2026',
        departure: { airport: 'GRU', datetime: '12/09/2026 08:30' },
        arrival:   { airport: 'REC', datetime: '12/09/2026 11:45' },
        flightNumber: 'AD 4001', durationText: '3h15'
      }],
      baggage: [], branding: { airlineName: 'Azul' }, meta: {}
    };
    const out = normalize(raw);
    expect(out.trips[0].departure.datetime).toBe('2026-09-12T08:30:00-03:00');
    expect(out.trips[0].arrival.datetime).toBe('2026-09-12T11:45:00-03:00');
  });

  test('preenche meta.parsedAt e parserVersion default', () => {
    const out = normalize({ carrier: 'azul', layoutVersion: 'azul.confirmacao.v1', trips: [], passengers: [] });
    expect(out.meta.parsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(out.meta.parserVersion).toBeTruthy();
  });

  test('descarta carrier desconhecido (defaulta azul) e loga', () => {
    const out = normalize({ carrier: 'TAM', layoutVersion: 'azul.confirmacao.v1' });
    expect(out.carrier).toBe('azul');
  });
});
