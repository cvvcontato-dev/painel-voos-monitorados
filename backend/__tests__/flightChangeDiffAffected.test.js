const { diffVouchers } = require('../helpers/flightChangeDiff');
const { mergeNewFlights } = require('../helpers/flightChangeMerge');
const F = require('./fixtures/flightChangeCombined');

const clone = (o) => JSON.parse(JSON.stringify(o));
const status = (d) => d.trips.map(t => `${t.direction}:${t.status}`);

describe('diffVouchers restrito aos trechos afetados', () => {
  test('só a volta marcada e alterada: ida igual; volta alterada; sem mudança de reserva', () => {
    const old = F.combinado();
    const novo = mergeNewFlights(old, { trips: [F.printTrip('volta')] }, { affected: [1] });
    const d = diffVouchers(old, novo, { affected: [1] });
    expect(status(d)).toEqual(['ida:igual', 'volta:alterado']);
    expect(d.reservationChanges).toEqual([]);
    expect(d.locatorChanged).toBeNull();
    expect(d.affectedReservations).toEqual([{ locator: 'XYZ789', directions: ['volta'] }]);
    expect(d.hasChanges).toBe(true);
  });

  test('trecho NÃO marcado que difere é sempre "igual" (sem mudanças); sem restrição seria "alterado"', () => {
    const old = F.combinado();
    const novo = clone(old);
    novo.trips[0].departure.datetime = '2026-09-12T10:15:00-03:00';      // mexeram na ida (não marcada)
    const restrito = diffVouchers(old, novo, { affected: [1] });
    expect(status(restrito)).toEqual(['ida:igual', 'volta:igual']);
    expect(restrito.trips[0].changes).toEqual([]);
    expect(restrito.hasChanges).toBe(false);
    expect(status(diffVouchers(old, novo))).toEqual(['ida:alterado', 'volta:igual']);
    expect(diffVouchers(old, novo).affectedReservations).toBeNull();
  });

  test('reservationChanges: um item por reserva afetada cujo localizador mudou (ida e volta não marcada ficam fora)', () => {
    const old = F.combinado();
    const novo = mergeNewFlights(old, { locator: 'NEW456', trips: [F.printTrip('volta')] }, { affected: [1] });
    const d = diffVouchers(old, novo, { affected: [1] });
    expect(d.reservationChanges).toEqual([{ direction: 'volta', antes: 'XYZ789', depois: 'NEW456' }]);
    expect(d.locatorChanged).toBeNull();                    // reservation.locator (da ida) não mudou
    expect(d.affectedReservations).toEqual([{ locator: 'NEW456', directions: ['volta'] }]);
  });

  test('só o localizador mudou (trechos idênticos): hasChanges é true por causa de reservationChanges', () => {
    const old = F.combinado();
    const novo = clone(old);
    novo.trips[1].locator = 'NEW456'; novo.reservation.secondaryLocator = 'NEW456'; novo.reservation.reservations[1].code = 'NEW456';
    const d = diffVouchers(old, novo, { affected: [1] });
    expect(status(d)).toEqual(['ida:igual', 'volta:igual']);
    expect(d.reservationChanges).toHaveLength(1);
    expect(d.hasChanges).toBe(true);
  });

  test('duas reservas afetadas com localizadores novos: um item para cada', () => {
    const old = F.combinado();
    const novo = mergeNewFlights(old, { trips: [F.printIda({ flightNumber: 'AD 4003' }), F.printTrip('volta')] }, { affected: [0, 1] });
    novo.trips[0].locator = 'NEWIDA'; novo.trips[1].locator = 'NEWVOL';
    const d = diffVouchers(old, novo);                       // sem restrição também calcula
    expect(d.reservationChanges.map(r => [r.direction, r.antes, r.depois])).toEqual([['ida', 'ABC123', 'NEWIDA'], ['volta', 'XYZ789', 'NEWVOL']]);
  });

  test('trecho novo só conta na direção de um afetado; remoção de não marcado vira "igual"', () => {
    const old = F.combinado();
    const novo = clone(old);
    novo.trips.push({ ...clone(novo.trips[0]), direction: 'interno', flightNumber: 'AD 7000' });   // direção sem afetado
    novo.trips.push({ ...clone(novo.trips[1]), flightNumber: 'AD 7001', departure: { airport: 'GRU', datetime: '2026-09-19T20:00:00-03:00' } });   // outra perna da volta
    const d = diffVouchers(old, novo, { affected: [1] });
    expect(status(d)).toEqual(['ida:igual', 'volta:igual', 'volta:novo']);
    const semIda = clone(old); semIda.trips.shift();
    expect(status(diffVouchers(old, semIda, { affected: [1] }))).toEqual(['ida:igual', 'volta:igual']);
  });

  test('passageiros e bagagem continuam sendo comparados normalmente', () => {
    const old = F.combinado();
    const novo = clone(old);
    novo.passengers.push({ order: 3, name: 'PEDRO LIMA', type: 'adulto' });
    const d = diffVouchers(old, novo, { affected: [1] });
    expect(d.passengers.adicionados).toEqual(['PEDRO LIMA']);
    expect(d.hasChanges).toBe(true);
  });

  test('sem restrição (ou todos marcados): voucher simples mantém locatorChanged e ganha reservationChanges', () => {
    const old = F.ida();
    const novo = clone(old); novo.reservation.locator = 'XYZ999';
    for (const opts of [undefined, { affected: [0] }, { affected: [] }]) {
      const d = diffVouchers(old, novo, opts);
      expect(d.locatorChanged).toEqual({ antes: 'ABC123', depois: 'XYZ999' });
      expect(d.reservationChanges).toEqual([{ direction: 'ida', antes: 'ABC123', depois: 'XYZ999' }]);
      expect(d.affectedReservations).toBeNull();
      expect(d.hasChanges).toBe(true);
    }
  });
});
