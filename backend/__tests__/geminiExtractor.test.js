process.env.EXTRACTION_MODE = 'stub';
const { extract } = require('../services/geminiExtractor');

test('stub mode returns a structured promotion without calling the API', async () => {
  const { promotion, _meta } = await extract(Buffer.from('fake'), 'image/jpeg');
  expect(promotion.destination_city || promotion.destination_code).toBeTruthy();
  expect(Array.isArray(_meta.low_confidence_fields)).toBe(true);
});

describe('modo real (Gemini simulado)', () => {
  let generate;
  let extractReal;
  beforeEach(() => {
    jest.resetModules();
    generate = jest.fn();
    jest.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel: () => ({ generateContent: generate }) }))
    }));
    process.env.EXTRACTION_MODE = 'real';
    process.env.GEMINI_API_KEY = 'chave-de-teste';
    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => { fn(); return 0; });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    extractReal = require('../services/geminiExtractor').extract;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('@google/generative-ai');
    process.env.EXTRACTION_MODE = 'stub';
    delete process.env.GEMINI_API_KEY;
  });

  const ok = { response: { text: () => '{"destination_city":"Aruba"}' } };

  test('tenta de novo quando o Gemini está com alta demanda (503) e então funciona', async () => {
    generate.mockRejectedValueOnce(new Error('[503 Service Unavailable] This model is currently experiencing high demand'))
            .mockResolvedValueOnce(ok);
    const { promotion } = await extractReal(Buffer.from('x'), 'image/png');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(promotion).toBeTruthy();
  });

  test('desiste após 3 tentativas e avisa que é alta demanda', async () => {
    generate.mockRejectedValue(new Error('[503 Service Unavailable] high demand'));
    await expect(extractReal(Buffer.from('x'), 'image/png')).rejects.toMatchObject({
      code: 'unavailable', publicMessage: expect.stringMatching(/alta demanda/i)
    });
    expect(generate).toHaveBeenCalledTimes(3);
  });

  test('erro de chave/permissão não é repetido e orienta a avisar o suporte', async () => {
    generate.mockRejectedValue(new Error('[403 Forbidden] API key not valid'));
    await expect(extractReal(Buffer.from('x'), 'image/png')).rejects.toMatchObject({
      code: 'unavailable', publicMessage: expect.stringMatching(/chave|permiss/i)
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
