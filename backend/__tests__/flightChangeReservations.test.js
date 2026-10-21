const R = require('../helpers/flightChangeReservations');
const { combinado, combinadoMulti, ida } = require('./fixtures/flightChangeCombined');

describe('locatorOf', () => {
  test('usa trips[].locator; sem ele, reservations[] da direção, secondaryLocator e reservation.locator', () => {
    const c = combinado();
    expect(R.locatorOf(c, c.trips[0])).toBe('ABC123');
    expect(R.locatorOf(c, c.trips[1])).toBe('XYZ789');
    const legado = JSON.parse(JSON.stringify(c));
    legado.trips.forEach(t => { delete t.locator; });
    expect(R.locatorOf(legado, legado.trips[1])).toBe('XYZ789');   // via reservations[]
    delete legado.reservation.reservations;
    expect(R.locatorOf(legado, legado.trips[1])).toBe('XYZ789');   // via secondaryLocator
    delete legado.reservation.secondaryLocator;
    expect(R.locatorOf(legado, legado.trips[1])).toBe('ABC123');   // reservation.locator
    expect(R.locatorOf({ trips: [{}] }, {})).toBe('');
  });
  test('maiúsculas e sem espaços nas pontas', () => {
    expect(R.locatorOf({ reservation: { locator: 'x' } }, { locator: ' ab12cd ' })).toBe('AB12CD');
  });
});

describe('reservationGroups', () => {
  test('voucher combinado: uma reserva por localizador, com cia, appliesTo e índices dos trechos', () => {
    const g = R.reservationGroups(combinadoMulti());
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ locator: 'ABC123', carrier: 'azul', appliesTo: 'ida' });
    expect(g[1]).toMatchObject({ locator: 'XYZ789', carrier: 'gol', appliesTo: 'volta' });
    expect(g[1].trips).toEqual([{ index: 1, direction: 'volta', label: 'Volta · REC → GRU · 19 SET 2026' }]);
  });
  test('ida e volta na mesma reserva = 1 grupo; sem reservations[], appliesTo é null', () => {
    const v = ida();
    v.trips.push({ ...JSON.parse(JSON.stringify(v.trips[0])), direction: 'volta' });
    const g = R.reservationGroups(v);
    expect(g).toHaveLength(1);
    expect(g[0].appliesTo).toBeNull();
    expect(g[0].carrier).toBe('azul');
    expect(g[0].trips.map(t => t.index)).toEqual([0, 1]);
  });
  test('voucher sem trechos: lista vazia', () => {
    expect(R.reservationGroups({})).toEqual([]);
    expect(R.reservationGroups(null)).toEqual([]);
  });
});

describe('restrictTo / storedAffected / effectiveAffected', () => {
  test('restrictTo: subconjunto vira lista ordenada; todos/vazio/inválido = null', () => {
    expect(R.restrictTo([2, 0], 3)).toEqual([0, 2]);
    expect(R.restrictTo([0, 1, 2], 3)).toBeNull();
    expect(R.restrictTo([], 3)).toBeNull();
    expect(R.restrictTo(undefined, 3)).toBeNull();
    expect(R.restrictTo([9, -1, 'a', 1.5], 3)).toBeNull();
    expect(R.restrictTo([1, 1, 9], 3)).toEqual([1]);
  });
  test('gravado válido é usado; inválido/ausente = todos', () => {
    const old = combinado();
    expect(R.effectiveAffected({ affected_json: '[1]' }, old)).toEqual([1]);
    expect(R.effectiveAffected({ affected_json: null }, old)).toEqual([0, 1]);
    expect(R.effectiveAffected({ affected_json: '{lixo' }, old)).toEqual([0, 1]);
    expect(R.effectiveAffected({ affected_json: '[7]' }, old)).toEqual([0, 1]);
    expect(R.restrictionOf({ affected_json: '[1]' }, old)).toEqual([1]);
    expect(R.restrictionOf({ affected_json: '[0,1]' }, old)).toBeNull();
  });
});

describe('needsAffected', () => {
  const row = (o = {}) => ({ status: 'aviso_pendente', new_json: null, affected_json: null, ...o });
  test('só quando: ≥2 reservas, aviso_pendente, sem voucher novo e sem marcação', () => {
    expect(R.needsAffected(row(), combinado())).toBe(true);
    expect(R.needsAffected(row({ affected_json: '[1]' }), combinado())).toBe(false);
    expect(R.needsAffected(row({ status: 'aviso_enviado' }), combinado())).toBe(false);
    expect(R.needsAffected(row({ status: 'confirmado' }), combinado())).toBe(false);
    expect(R.needsAffected(row({ new_json: '{}' }), combinado())).toBe(false);
  });
  test('voucher de uma reserva só (ou sem localizadores distintos) nunca precisa', () => {
    expect(R.needsAffected(row(), ida())).toBe(false);
    const dois = ida();
    dois.trips.push({ ...dois.trips[0], direction: 'volta' });
    expect(R.needsAffected(row(), dois)).toBe(false);
    expect(R.needsAffected(row(), null)).toBe(false);
  });
});
