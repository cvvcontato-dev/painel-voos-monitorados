const { nowUtcIso, addMinutesUtc, diffMinutes, isOlderThanHours } = require('../helpers/time');

describe('time helpers', () => {
  test('nowUtcIso returns ISO 8601 with Z suffix', () => {
    const s = nowUtcIso();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('addMinutesUtc adds the given minutes', () => {
    const result = addMinutesUtc('2026-05-17T10:00:00.000Z', 15);
    expect(result).toBe('2026-05-17T10:15:00.000Z');
  });

  test('diffMinutes returns positive when b is after a', () => {
    const a = '2026-05-17T10:00:00.000Z';
    const b = '2026-05-17T10:45:00.000Z';
    expect(diffMinutes(a, b)).toBe(45);
  });

  test('diffMinutes returns null when either side is missing', () => {
    expect(diffMinutes(null, '2026-05-17T10:00:00.000Z')).toBeNull();
    expect(diffMinutes('2026-05-17T10:00:00.000Z', null)).toBeNull();
  });

  test('isOlderThanHours true when timestamp is older than threshold', () => {
    const past = addMinutesUtc(nowUtcIso(), -200); // 3h20 ago
    expect(isOlderThanHours(past, 2)).toBe(true);
    expect(isOlderThanHours(past, 4)).toBe(false);
  });
});
