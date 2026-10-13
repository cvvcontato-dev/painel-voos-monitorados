// extractFlights: stub (sem GEMINI_API_KEY) e leitura "real" com o SDK @google/generative-ai mockado
// (jest.mock do módulo: generateContent devolve o JSON que o modelo produziria para o print da Gol).
const mockGenerate = jest.fn();
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel: () => ({ generateContent: mockGenerate }) }))
}));
const { extractFlights, STUB } = require('../services/voucherExtractor');

const respostaModelo = (obj) => ({ response: { text: () => '```json\n' + JSON.stringify(obj) + '\n```' } });

describe('extractFlights', () => {
  const prev = process.env.GEMINI_API_KEY;
  afterEach(() => { if (prev) process.env.GEMINI_API_KEY = prev; else delete process.env.GEMINI_API_KEY; mockGenerate.mockReset(); });

  test('stub (sem GEMINI_API_KEY): devolve os trips do STUB clonados', async () => {
    delete process.env.GEMINI_API_KEY;
    const out = await extractFlights(Buffer.from('x'), 'image/png');
    expect(out.trips).toEqual(STUB.trips);
    out.trips[0].flightNumber = 'MUDOU';
    expect(STUB.trips[0].flightNumber).toBe('AD 4001');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('mimetype inválido lança', async () => {
    await expect(extractFlights(Buffer.from(''), 'text/csv')).rejects.toThrow(/mimetype/i);
  });

  const T = (dep, arr, extra = {}) => ({
    direction: 'ida', dateLabel: 'x',
    departure: { airport: 'SSA', airportName: null, datetime: dep },
    arrival: { airport: 'REC', airportName: null, datetime: arr },
    flightNumber: 'G3 1922', durationText: '1h20', cabinClass: null, airlineDisplayName: 'Gol Linhas Aéreas', status: null, ...extra
  });

  test('com chave: formatos de data variados viram ISO -03:00 (e ISO completo passa intacto)', async () => {
    process.env.GEMINI_API_KEY = 'fake';
    mockGenerate.mockResolvedValue(respostaModelo({
      carrier: 'GOL', locator: ' ',
      trips: [
        T('17/11/2026 14:45', '17/11/2026 16:05:30'),
        T('2026-11-22 07:10', '2026-11-22T08:30'),
        T('2026-11-23T07:10:00-03:00', '2026-11-23T08:30:00Z'),
        T(12345, null),
        T('lixo', { x: 1 })
      ]
    }));
    const out = await extractFlights(Buffer.from('png'), 'image/png');
    expect(out.carrier).toBe('gol');
    expect(out.locator).toBeNull();
    const dts = out.trips.map(t => [t.departure.datetime, t.arrival.datetime]);
    expect(dts[0]).toEqual(['2026-11-17T14:45:00-03:00', '2026-11-17T16:05:30-03:00']);
    expect(dts[1]).toEqual(['2026-11-22T07:10:00-03:00', '2026-11-22T08:30:00-03:00']);
    expect(dts[2]).toEqual(['2026-11-23T07:10:00-03:00', '2026-11-23T08:30:00Z']);
    expect(out.trips[3].departure.datetime).toBe(12345);   // não-string não explode: quem valida (merge) devolve 422
    expect(mockGenerate.mock.calls[0][0][0]).toMatch(/APENAS OS VOOS/);
  });

  test('o prompt leva o ano de referência do voucher antigo', async () => {
    process.env.GEMINI_API_KEY = 'fake';
    mockGenerate.mockResolvedValue(respostaModelo({ carrier: null, locator: null, trips: [] }));
    await extractFlights(Buffer.from('p'), 'image/png', { referenceYear: 2026, referenceDate: '18/11/2026' });
    expect(mockGenerate.mock.calls[0][0][0]).toMatch(/Ano de referência: 2026 \(data de partida original: 18\/11\/2026\)/);
    mockGenerate.mockClear();
    await extractFlights(Buffer.from('p'), 'image/png');
    expect(mockGenerate.mock.calls[0][0][0]).not.toMatch(/Ano de referência: \d/);
  });

  test('resposta sem trips (lista vazia) segue vazia para o merge dar a mensagem', async () => {
    process.env.GEMINI_API_KEY = 'fake';
    mockGenerate.mockResolvedValue(respostaModelo({ carrier: null, locator: null, trips: [] }));
    expect((await extractFlights(Buffer.from('p'), 'image/png')).trips).toEqual([]);
  });

  test.each([['null', null], ['string', 'oi'], ['lista', []], ['trips não-array', { trips: 'x' }], ['sem trips', { carrier: 'gol' }]])(
    'resposta %s do modelo => erro flights_unreadable', async (_n, payload) => {
      process.env.GEMINI_API_KEY = 'fake';
      mockGenerate.mockResolvedValue(respostaModelo(payload));
      await expect(extractFlights(Buffer.from('p'), 'image/png')).rejects.toMatchObject({ code: 'flights_unreadable' });
    });

  test('JSON malformado do modelo => flights_unreadable (nunca SyntaxError cru)', async () => {
    process.env.GEMINI_API_KEY = 'fake';
    mockGenerate.mockResolvedValue({ response: { text: () => '{ isto nao e json' } });
    await expect(extractFlights(Buffer.from('p'), 'image/png')).rejects.toMatchObject({ code: 'flights_unreadable' });
  });

  test('stub em produção (sem chave) é recusado', async () => {
    delete process.env.GEMINI_API_KEY;
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(extractFlights(Buffer.from('x'), 'image/png')).rejects.toMatchObject({ code: 'gemini_not_configured' });
    } finally { process.env.NODE_ENV = prevEnv; }
  });
});
