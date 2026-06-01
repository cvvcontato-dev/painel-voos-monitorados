const { mergeVouchers } = require('../services/voucherMerger');

const base = {
  carrier: 'azul', layoutVersion: 'azul.confirmacao.v1',
  reservation: { locator: 'ABC123', status: 'Confirmada' },
  route: { origin: 'GRU', destination: 'REC' },
  passengers: [{ order: 1, name: 'JOAO', type: 'adulto' }],
  trips: [{
    direction: 'ida', dateLabel: '12 SET 2026',
    departure: { airport: 'GRU', datetime: '2026-09-12T08:30:00-03:00' },
    arrival:   { airport: 'REC', datetime: '2026-09-12T11:45:00-03:00' },
    flightNumber: 'AD 4001', durationText: '3h15',
    airlineDisplayName: 'Azul Linhas Aéreas'
  }],
  baggage: [{ direction: 'ida', label: 'Bagagem de mão', weightText: '10kg', quantity: 1 }],
  branding: { airlineName: 'Azul' },
  meta: { parsedAt: '2026-05-01T00:00:00Z', parserVersion: 'x', confidence: 0.9 }
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

describe('mergeVouchers', () => {
  test('mescla 2 vouchers da mesma cia: ida + volta, mantém locator único quando igual', () => {
    const outbound = clone(base);
    const ret = clone(base);
    ret.trips[0].direction = 'ida'; // simula extrator marcando tudo como ida
    ret.trips[0].departure = { airport: 'REC', datetime: '2026-09-19T13:00:00-03:00' };
    ret.trips[0].arrival   = { airport: 'GRU', datetime: '2026-09-19T16:30:00-03:00' };
    ret.trips[0].flightNumber = 'AD 4002';
    ret.baggage[0].direction = 'ida';

    const merged = mergeVouchers(outbound, ret);
    expect(merged.trips).toHaveLength(2);
    expect(merged.trips[0].direction).toBe('ida');
    expect(merged.trips[1].direction).toBe('volta');
    expect(merged.baggage[0].direction).toBe('ida');
    expect(merged.baggage[1].direction).toBe('volta');
    expect(merged.reservation.secondaryLocator).toBeUndefined(); // locators iguais
    expect(merged.carrier).toBe('azul');
    expect(merged.meta.merged).toBe(true);
  });

  test('locators diferentes → secondaryLocator preenchido', () => {
    const outbound = clone(base);
    const ret = clone(base);
    ret.reservation.locator = 'XYZ789';

    const merged = mergeVouchers(outbound, ret);
    expect(merged.reservation.locator).toBe('ABC123');
    expect(merged.reservation.secondaryLocator).toBe('XYZ789');
    // Cada trip tem o seu próprio locator
    expect(merged.trips[0].locator).toBe('ABC123');
    expect(merged.trips[1].locator).toBe('XYZ789');
  });

  test('cias diferentes → carrier=multi + secondaryCarrier preenchido', () => {
    const outbound = clone(base);
    const ret = clone(base);
    ret.carrier = 'gol';
    ret.trips[0].airlineDisplayName = 'Gol Linhas Aéreas';
    ret.trips[0].flightNumber = 'G3 1234';

    const merged = mergeVouchers(outbound, ret);
    expect(merged.carrier).toBe('multi');
    expect(merged.reservation.primaryCarrier).toBe('azul');
    expect(merged.reservation.secondaryCarrier).toBe('gol');
  });

  test('lança erro se faltar input', () => {
    expect(() => mergeVouchers(null, {})).toThrow();
    expect(() => mergeVouchers({}, null)).toThrow();
  });
});
