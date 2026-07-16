delete process.env.GEMINI_API_KEY;
const { extractPackageItem } = require('../services/packageExtractor');

describe('extractPackageItem (STUB)', () => {
  test('hotel retorna item normalizado válido', async () => {
    const item = await extractPackageItem(Buffer.from('x'), 'application/pdf', 'hotel');
    expect(item.kind).toBe('hotel');
    expect(item.sortDate).toBeTruthy();
  });
  test('flight reusa extractVoucher (tem trips)', async () => {
    const item = await extractPackageItem(Buffer.from('x'), 'application/pdf', 'flight');
    expect(Array.isArray(item.trips)).toBe(true);
    expect(item.trips.length).toBeGreaterThan(0);
  });
  test('kind inválido lança', async () => {
    await expect(extractPackageItem(Buffer.from('x'), 'application/pdf', 'foo')).rejects.toThrow();
  });
});

describe('extractPackageItem addons (STUB)', () => {
  test.each(['car','tour','transfer'])('%s retorna item normalizado válido', async (kind) => {
    const item = await extractPackageItem(Buffer.from('x'), 'application/pdf', kind);
    expect(item.kind).toBe(kind);
    expect(item.sortDate).toBeTruthy();
  });
});
