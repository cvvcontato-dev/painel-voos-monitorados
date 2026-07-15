const { combineVouchers } = require('../services/voucherCombiner');

const base = {
  carrier: 'azul', layoutVersion: 'azul.confirmacao.v1',
  reservation: { locator: 'ABC123', status: 'Confirmada' },
  route: { origin: 'GRU', destination: 'REC' },
  passengers: [{ order: 1, name: 'JOAO', type: 'adulto' }],
  trips: [{
    direction: 'ida', dateLabel: '12 SET 2026',
    departure: { airport: 'GRU', datetime: '2026-09-12T08:30:00-03:00' },
    arrival:   { airport: 'REC', datetime: '2026-09-12T11:45:00-03:00' },
    flightNumber: 'AD 4001', durationText: '3h15', airlineDisplayName: 'Azul Linhas Aéreas'
  }],
  baggage: [{ direction: 'ida', label: 'Bagagem de mão', weightText: '10kg', quantity: 1 }],
  branding: { airlineName: 'Azul' },
  meta: { parsedAt: '2026-05-01T00:00:00Z', parserVersion: 'x', confidence: 0.9 }
};
const clone = o => JSON.parse(JSON.stringify(o));

function makeReturn() {
  const r = clone(base);
  r.reservation.locator = 'RET456';
  r.trips[0].departure = { airport: 'REC', datetime: '2026-09-19T13:00:00-03:00' };
  r.trips[0].arrival   = { airport: 'GRU', datetime: '2026-09-19T16:30:00-03:00' };
  r.trips[0].flightNumber = 'AD 4002';
  return r;
}
function makeInterno(dep, arr, loc, carrier = 'gol') {
  const i = clone(base);
  i.carrier = carrier;
  i.reservation.locator = loc;
  i.trips[0].departure = { airport: dep, datetime: '2026-09-14T09:00:00-03:00' };
  i.trips[0].arrival   = { airport: arr, datetime: '2026-09-14T11:00:00-03:00' };
  i.trips[0].flightNumber = 'G3 100';
  return i;
}

describe('combineVouchers', () => {
  test('caso ida+volta (ex-paridade): direction e locators corretos', () => {
    const combined = combineVouchers([
      { voucher: clone(base), role: 'ida' },
      { voucher: makeReturn(), role: 'volta' }
    ]);
    expect(combined.trips.map(t => t.direction)).toEqual(['ida', 'volta']);
    expect(combined.trips.map(t => t.flightNumber)).toEqual(['AD 4001', 'AD 4002']);
    expect(combined.baggage.map(b => b.direction)).toEqual(['ida', 'volta']);
    expect(combined.reservation.locator).toBe('ABC123');
    expect(combined.reservation.secondaryLocator).toBe('RET456');
    expect(combined.carrier).toBe('azul');
    expect(combined.route.origin).toBe('GRU');
  });

  test('ida + interno + volta → 3 blocos, direction correto', () => {
    const c = combineVouchers([
      { voucher: clone(base), role: 'ida' },
      { voucher: makeInterno('REC', 'FLN', 'INT777'), role: 'interno' },
      { voucher: makeReturn(), role: 'volta' }
    ]);
    expect(c.trips.map(t => t.direction)).toEqual(['ida', 'interno', 'volta']);
    expect(c.baggage.map(b => b.direction)).toEqual(['ida', 'interno', 'volta']);
    expect(c.reservation.reservations.map(r => r.appliesTo)).toEqual(['ida', 'interno', 'volta']);
    expect(c.carrier).toBe('multi');
  });

  test('ida + 2 internos + volta → 4 trips', () => {
    const c = combineVouchers([
      { voucher: clone(base), role: 'ida' },
      { voucher: makeInterno('REC', 'FLN', 'INTA'), role: 'interno' },
      { voucher: makeInterno('FLN', 'POA', 'INTB'), role: 'interno' },
      { voucher: makeReturn(), role: 'volta' }
    ]);
    expect(c.trips).toHaveLength(4);
    expect(c.trips.map(t => t.direction)).toEqual(['ida', 'interno', 'interno', 'volta']);
  });

  test('ida + interno sem volta → route.destination = arrival do interno', () => {
    const c = combineVouchers([
      { voucher: clone(base), role: 'ida' },
      { voucher: makeInterno('REC', 'FLN', 'INT777'), role: 'interno' }
    ]);
    expect(c.trips.map(t => t.direction)).toEqual(['ida', 'interno']);
    expect(c.route.origin).toBe('GRU');
    expect(c.route.destination).toBe('FLN');
  });

  test('3 carriers distintos → carrier multi + reservations com 3 entradas', () => {
    const c = combineVouchers([
      { voucher: clone(base), role: 'ida' }, // azul
      { voucher: makeInterno('REC', 'FLN', 'INT777', 'gol'), role: 'interno' },
      { voucher: (() => { const v = makeReturn(); v.carrier = 'latam'; return v; })(), role: 'volta' }
    ]);
    expect(c.carrier).toBe('multi');
    expect(c.reservation.reservations).toHaveLength(3);
  });

  test('mesma cia + mesmo PNR em 2 itens → reservations dedupe', () => {
    const dupA = clone(base); // azul ABC123
    const dupB = makeInterno('REC', 'FLN', 'ABC123', 'azul'); // mesmo code+carrier
    const c = combineVouchers([
      { voucher: dupA, role: 'ida' },
      { voucher: dupB, role: 'interno' }
    ]);
    expect(c.reservation.reservations).toHaveLength(1);
    expect(c.carrier).toBe('azul');
  });

  test('carimba trip.locator == reservation.code para cada trecho (garantia p/ buildReservationGroups)', () => {
    const c = combineVouchers([
      { voucher: clone(base), role: 'ida' },
      { voucher: makeInterno('REC', 'FLN', 'INT777', 'gol'), role: 'interno' },
      { voucher: makeReturn(), role: 'volta' }
    ]);
    expect(c.trips[0].locator).toBe('ABC123');
    expect(c.trips[1].locator).toBe('INT777');
    expect(c.trips[2].locator).toBe('RET456');
  });

  test('validações: 0 idas, 2 idas, 2 voltas, N=1, N=9 lançam', () => {
    expect(() => combineVouchers([{ voucher: clone(base), role: 'interno' }, { voucher: clone(base), role: 'volta' }])).toThrow(/ida/i);
    expect(() => combineVouchers([{ voucher: clone(base), role: 'ida' }, { voucher: clone(base), role: 'ida' }])).toThrow(/ida/i);
    expect(() => combineVouchers([{ voucher: clone(base), role: 'ida' }, { voucher: clone(base), role: 'volta' }, { voucher: clone(base), role: 'volta' }])).toThrow(/volta/i);
    expect(() => combineVouchers([{ voucher: clone(base), role: 'ida' }])).toThrow(/2/);
    const nine = [{ voucher: clone(base), role: 'ida' }, ...Array.from({ length: 8 }, () => ({ voucher: clone(base), role: 'interno' }))];
    expect(() => combineVouchers(nine)).toThrow(/8/);
  });
});
