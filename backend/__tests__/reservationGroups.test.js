const { buildReservationGroups } = require('../helpers/reservationGroups');

const trip = (direction, dep, arr, loc) => ({
  direction, dateLabel: 'x',
  departure: { airport: dep, datetime: '2026-09-12T08:00:00-03:00' },
  arrival: { airport: arr, datetime: '2026-09-12T11:00:00-03:00' },
  flightNumber: 'AD1', durationText: '3h', locator: loc
});

describe('buildReservationGroups', () => {
  test('ida + interno + volta → 3 grupos rotulados na ordem', () => {
    const data = {
      carrier: 'multi',
      reservation: {
        locator: 'IDA111',
        reservations: [
          { code: 'IDA111', carrier: 'azul',  appliesTo: 'ida' },
          { code: 'INT222', carrier: 'gol',   appliesTo: 'interno' },
          { code: 'VLT333', carrier: 'latam', appliesTo: 'volta' }
        ]
      },
      trips: [ trip('ida','GRU','LIS','IDA111'), trip('interno','LIS','FCO','INT222'), trip('volta','FCO','GRU','VLT333') ]
    };
    const g = buildReservationGroups(data);
    expect(g.map(x => x.role)).toEqual(['ida', 'interno', 'volta']);
    expect(g[0].label).toBe('IDA');
    expect(g[1].label).toBe('DESTINOS INTERNOS');
    expect(g[2].label).toBe('VOLTA');
    expect(g[0].carrierKey).toBe('azul');
    expect(g[1].carrierKey).toBe('gol');
    expect(g[2].locator).toBe('VLT333');
  });

  test('sem volta → 2 grupos', () => {
    const data = {
      carrier: 'multi',
      reservation: { locator: 'IDA111', reservations: [
        { code: 'IDA111', carrier: 'azul', appliesTo: 'ida' },
        { code: 'INT222', carrier: 'gol',  appliesTo: 'interno' }
      ] },
      trips: [ trip('ida','GRU','LIS','IDA111'), trip('interno','LIS','FCO','INT222') ]
    };
    const g = buildReservationGroups(data);
    expect(g.map(x => x.role)).toEqual(['ida', 'interno']);
  });

  test('2 internos com PNRs distintos → subdivide em 2 grupos interno', () => {
    const data = {
      carrier: 'multi',
      reservation: { locator: 'IDA111', reservations: [
        { code: 'IDA111', carrier: 'azul', appliesTo: 'ida' },
        { code: 'INTA',   carrier: 'gol',  appliesTo: 'interno' },
        { code: 'INTB',   carrier: 'gol',  appliesTo: 'interno' }
      ] },
      trips: [ trip('ida','GRU','LIS','IDA111'), trip('interno','LIS','FCO','INTA'), trip('interno','FCO','ATH','INTB') ]
    };
    const g = buildReservationGroups(data);
    const internos = g.filter(x => x.role === 'interno');
    expect(internos).toHaveLength(2);
    expect(internos[0].label).toContain('INTERNO');
    expect(internos[0].locator).toBe('INTA');
    expect(internos[1].locator).toBe('INTB');
  });

  test('fallback esquema antigo (sem reservations[]): ida+volta via secondaryLocator', () => {
    const data = {
      carrier: 'multi',
      reservation: { locator: 'IDA111', secondaryLocator: 'VLT333', primaryCarrier: 'azul', secondaryCarrier: 'gol' },
      trips: [ trip('ida','GRU','REC','IDA111'), trip('volta','REC','GRU','VLT333') ]
    };
    const g = buildReservationGroups(data);
    expect(g.map(x => x.role)).toEqual(['ida', 'volta']);
    expect(g[0].carrierKey).toBe('azul');
    expect(g[1].carrierKey).toBe('gol');
    expect(g[1].locator).toBe('VLT333');
  });

  test('trips vazio → []', () => {
    expect(buildReservationGroups({ trips: [] })).toEqual([]);
    expect(buildReservationGroups({})).toEqual([]);
  });
});
