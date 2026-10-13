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

  test('com chave: normaliza dd/mm/aaaa hh:mm para ISO -03:00 e manda o prompt de voos', async () => {
    process.env.GEMINI_API_KEY = 'fake';
    mockGenerate.mockResolvedValue(respostaModelo({
      carrier: 'GOL', locator: null,
      trips: [
        { direction: 'ida', dateLabel: '17 NOV 2026',
          departure: { airport: 'SSA', airportName: 'Salvador', datetime: '17/11/2026 14:45' },
          arrival: { airport: 'REC', airportName: 'Recife', datetime: '17/11/2026 16:05' },
          flightNumber: 'G3 1922', durationText: '1h20', cabinClass: null, airlineDisplayName: 'Gol Linhas Aéreas', status: null },
        { direction: 'volta', dateLabel: '22 NOV 2026',
          departure: { airport: 'REC', airportName: null, datetime: '2026-11-22T07:10:00-03:00' },
          arrival: { airport: 'SSA', airportName: null, datetime: '22/11/2026 08:30' },
          flightNumber: 'G3 1925', durationText: '1h20', cabinClass: null, airlineDisplayName: 'Gol Linhas Aéreas', status: null }
      ]
    }));
    const out = await extractFlights(Buffer.from('png'), 'image/png');
    expect(out.carrier).toBe('gol');
    expect(out.locator).toBeNull();
    expect(out.trips[0].departure.datetime).toBe('2026-11-17T14:45:00-03:00');
    expect(out.trips[0].arrival.datetime).toBe('2026-11-17T16:05:00-03:00');
    expect(out.trips[1].departure.datetime).toBe('2026-11-22T07:10:00-03:00');
    expect(out.trips[1].arrival.datetime).toBe('2026-11-22T08:30:00-03:00');
    expect(mockGenerate.mock.calls[0][0][0]).toMatch(/APENAS OS VOOS/);
  });

  test('resposta sem trips vira trips vazio (o merge dá o erro ao operador)', async () => {
    process.env.GEMINI_API_KEY = 'fake';
    mockGenerate.mockResolvedValue(respostaModelo({ carrier: null, locator: null, trips: [] }));
    expect((await extractFlights(Buffer.from('p'), 'image/png')).trips).toEqual([]);
  });
});
