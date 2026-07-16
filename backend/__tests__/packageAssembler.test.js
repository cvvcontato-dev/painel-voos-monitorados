const { assemblePackage } = require('../services/packageAssembler');
const { STUBS } = require('../services/packagePrompts');
const { normalizeItem } = require('../services/packageNormalizer');
const { STUB: FLIGHT_STUB } = require('../services/voucherExtractor');

const flight = () => JSON.parse(JSON.stringify(FLIGHT_STUB));
const hotel = () => normalizeItem(STUBS.hotel, 'hotel');
const car = () => normalizeItem(STUBS.car, 'car');

describe('assemblePackage', () => {
  test('voo + hotel monta pacote', () => {
    const p = assemblePackage([{ item: flight(), kind: 'flight' }, { item: hotel(), kind: 'hotel' }]);
    expect(p.flights).toBeTruthy();
    expect(p.hotels).toHaveLength(1);
    expect(p.addons).toHaveLength(0);
    expect(p.meta.combined).toBe(true);
    expect(typeof p.title).toBe('string');
  });
  test('voo + hotel + car → addon', () => {
    const p = assemblePackage([{ item: flight(), kind: 'flight' }, { item: hotel(), kind: 'hotel' }, { item: car(), kind: 'car' }]);
    expect(p.addons.map(a => a.kind)).toEqual(['car']);
  });
  test('2 voos → combineVouchers', () => {
    const p = assemblePackage([{ item: flight(), kind: 'flight' }, { item: flight(), kind: 'flight' }, { item: hotel(), kind: 'hotel' }]);
    expect(p.flights.trips.length).toBeGreaterThanOrEqual(2);
  });
  test('sem voo lança', () => {
    expect(() => assemblePackage([{ item: hotel(), kind: 'hotel' }])).toThrow(/voo/i);
  });
  test('sem hotel lança', () => {
    expect(() => assemblePackage([{ item: flight(), kind: 'flight' }])).toThrow(/hotel/i);
  });
});
