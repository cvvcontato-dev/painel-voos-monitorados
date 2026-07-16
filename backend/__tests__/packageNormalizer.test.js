const { normalizeItem } = require('../services/packageNormalizer');

describe('normalizeItem', () => {
  test('hotel: sortDate = checkIn (date+time)', () => {
    const n = normalizeItem({ name: 'H', checkIn: { date: '2026-10-20', time: '14:00' } }, 'hotel');
    expect(n.kind).toBe('hotel');
    expect(n.sortDate).toMatch(/^2026-10-20T14:00/);
    expect(Array.isArray(n.guests)).toBe(true);
  });
  test('car: sortDate = pickup.datetime', () => {
    const n = normalizeItem({ pickup: { datetime: '2026-10-20T16:30:00-03:00' } }, 'car');
    expect(n.sortDate).toBe('2026-10-20T16:30:00-03:00');
  });
  test('tour: sortDate = datetime', () => {
    const n = normalizeItem({ activity: 'X', datetime: '2026-02-04T08:00:00-03:00' }, 'tour');
    expect(n.sortDate).toBe('2026-02-04T08:00:00-03:00');
  });
  test('transfer: sortDate = legs[0].datetime', () => {
    const n = normalizeItem({ legs: [{ from:'A', to:'B', datetime:'2026-03-30T20:15:00+01:00' }] }, 'transfer');
    expect(n.sortDate).toBe('2026-03-30T20:15:00+01:00');
  });
  test('sem data → sortDate null', () => {
    expect(normalizeItem({ name: 'H' }, 'hotel').sortDate).toBeNull();
  });
});

const { STUBS } = require('../services/packagePrompts');

describe('normalizeItem addons', () => {
  test('car normaliza (sortDate = pickup, sem arrays extra)', () => {
    const n = normalizeItem(STUBS.car, 'car');
    expect(n.kind).toBe('car');
    expect(n.sortDate).toBe(STUBS.car.pickup.datetime);
  });
  test('tour normaliza (sortDate = datetime, includes/excludes array)', () => {
    const n = normalizeItem(STUBS.tour, 'tour');
    expect(n.sortDate).toBe(STUBS.tour.datetime);
    expect(Array.isArray(n.includes)).toBe(true);
    expect(Array.isArray(n.excludes)).toBe(true);
  });
  test('transfer normaliza (sortDate = legs[0].datetime, legs array)', () => {
    const n = normalizeItem(STUBS.transfer, 'transfer');
    expect(n.sortDate).toBe(STUBS.transfer.legs[0].datetime);
    expect(Array.isArray(n.legs)).toBe(true);
    expect(n.legs.length).toBeGreaterThanOrEqual(1);
  });
});
