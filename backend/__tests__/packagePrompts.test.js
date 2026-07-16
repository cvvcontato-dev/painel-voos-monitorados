const { PROMPTS, STUBS } = require('../services/packagePrompts');
const { normalizeItem } = require('../services/packageNormalizer');
const { validateItem } = require('../services/packageSchema');

describe('packagePrompts', () => {
  test('tem prompt e stub pros 4 tipos', () => {
    ['hotel','car','tour','transfer'].forEach(k => {
      expect(typeof PROMPTS[k]).toBe('string');
      expect(PROMPTS[k].length).toBeGreaterThan(50);
      expect(STUBS[k]).toBeTruthy();
    });
  });
  test('cada STUB normaliza + valida', () => {
    ['hotel','car','tour','transfer'].forEach(k => {
      const item = normalizeItem(STUBS[k], k);
      const r = validateItem(item);
      expect(r.ok).toBe(true);
    });
  });
});
