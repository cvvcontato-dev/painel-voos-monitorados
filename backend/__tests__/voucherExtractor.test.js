const { extractVoucher } = require('../services/voucherExtractor');

describe('voucherExtractor', () => {
  const prev = process.env.GEMINI_API_KEY;
  beforeAll(() => { delete process.env.GEMINI_API_KEY; });
  afterAll(() => { if (prev) process.env.GEMINI_API_KEY = prev; });

  test('sem GEMINI_API_KEY usa STUB e retorna payload válido', async () => {
    const buf = Buffer.from('fake');
    const out = await extractVoucher(buf, 'application/pdf');
    expect(out.carrier).toBe('azul');
    expect(out.layoutVersion).toBe('azul.confirmacao.v1');
    expect(out.passengers.length).toBeGreaterThan(0);
    expect(out.trips.length).toBeGreaterThan(0);
  });

  test('rejeita mimetype não suportado', async () => {
    await expect(extractVoucher(Buffer.from(''), 'text/csv')).rejects.toThrow(/mimetype/i);
  });
});
