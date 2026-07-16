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
