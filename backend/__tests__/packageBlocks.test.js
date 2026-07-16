const { buildTimeline } = require('../helpers/packageBlocks');

function pkg() {
  return {
    flights: {
      carrier: 'azul',
      reservation: { locator: 'F1', reservations: [
        { code: 'F1', carrier: 'azul', appliesTo: 'ida' },
        { code: 'F1', carrier: 'azul', appliesTo: 'volta' }
      ] },
      trips: [
        { direction: 'ida', departure: { airport: 'GRU', datetime: '2026-10-20T08:00:00-03:00' }, arrival: { airport: 'POA', datetime: '2026-10-20T10:00:00-03:00' }, locator: 'F1', flightNumber: 'AD1' },
        { direction: 'volta', departure: { airport: 'POA', datetime: '2026-10-25T18:00:00-03:00' }, arrival: { airport: 'GRU', datetime: '2026-10-25T20:00:00-03:00' }, locator: 'F1', flightNumber: 'AD2' }
      ]
    },
    hotels: [ { kind: 'hotel', name: 'H', sortDate: '2026-10-20T14:00:00-03:00' } ],
    addons: [
      { kind: 'transfer', sortDate: '2026-10-20T11:00:00-03:00' },
      { kind: 'tour', sortDate: '2026-10-22T09:00:00-03:00' }
    ]
  };
}

describe('buildTimeline', () => {
  test('ordena cronologicamente: ida → transfer → hotel → tour → volta', () => {
    const t = buildTimeline(pkg());
    expect(t.map(b => b.kind)).toEqual(['flight', 'transfer', 'hotel', 'tour', 'flight']);
  });
  test('item sem sortDate vai pro fim', () => {
    const p = pkg(); p.addons.push({ kind: 'car', sortDate: null });
    const t = buildTimeline(p);
    expect(t[t.length - 1].kind).toBe('car');
  });
  test('pacote vazio → []', () => {
    expect(buildTimeline({})).toEqual([]);
    expect(buildTimeline(null)).toEqual([]);
  });
});
