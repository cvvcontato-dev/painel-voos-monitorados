const { buildQueries, fallbackQueries, parseModelOutput, buildPrompt, clearCache } = require('../services/backgroundQueries');
const { destinationKey } = require('../helpers/slug');

beforeEach(() => clearCache());

describe('destinationKey', () => {
  test.each([
    ['Porto Seguro', 'porto-seguro'],
    ['  porto   SEGURO ', 'porto-seguro'],
    ['Pórto Seguro', 'porto-seguro'],
    ['Porto de Galinhas (Ipojuca)', 'porto-de-galinhas'],
    ['Aruba, Aruba', 'aruba'],
    ['Maceió - AL', 'maceio'],
    ['Foz do Iguaçu', 'foz-do-iguacu'],
    ['', ''],
    [null, ''],
    [undefined, '']
  ])('%p -> %p', (input, esperado) => {
    expect(destinationKey(input)).toBe(esperado);
  });
});

describe('parseModelOutput', () => {
  test('aceita JSON válido, mesmo com texto em volta', () => {
    const out = parseModelOutput('Claro!\n{"tipo":"serra","queries":["Gramado Brazil pine trees town","Gramado travel"]}\nEspero ajudar');
    expect(out.tipo).toBe('serra');
    expect(out.queries).toEqual(['Gramado Brazil pine trees town', 'Gramado travel']);
  });

  test('tipo desconhecido vira null mas as queries continuam valendo', () => {
    const out = parseModelOutput('{"tipo":"marciano","queries":["Aruba beach"]}');
    expect(out.tipo).toBeNull();
    expect(out.queries).toEqual(['Aruba beach']);
  });

  test('higieniza: tira vazios, duplicados, não-strings, quebras de linha e limita tamanho e quantidade', () => {
    const longa = 'x'.repeat(200);
    const out = parseModelOutput(JSON.stringify({
      tipo: 'praia',
      queries: ['  Maceio   Brazil\nbeach ', 'maceio brazil beach', '', 'ab', 42, null, longa, 'q4', 'q5', 'q6', 'q7']
    }));
    expect(out.queries[0]).toBe('Maceio Brazil beach');
    expect(out.queries.filter(q => q.toLowerCase() === 'maceio brazil beach')).toHaveLength(1);
    expect(out.queries.every(q => typeof q === 'string' && q.length >= 3 && q.length <= 80)).toBe(true);
    expect(out.queries.length).toBeLessThanOrEqual(5);
  });

  test.each([
    ['sem json', 'não sei responder'],
    ['json quebrado', '{"queries": ["a", }'],
    ['sem queries', '{"tipo":"praia"}'],
    ['queries não é array', '{"queries":"Aruba beach"}'],
    ['queries só com lixo', '{"queries":["", "  ", 5]}'],
    ['vazio', ''],
    ['null', null]
  ])('rejeita: %s', (_nome, texto) => {
    expect(parseModelOutput(texto)).toBeNull();
  });
});

describe('fallbackQueries', () => {
  test('não força praia, mar nem outro tipo de paisagem', () => {
    const qs = fallbackQueries('Gramado', 'Brasil');
    expect(qs.length).toBeGreaterThan(1);
    expect(qs.join(' ')).not.toMatch(/beach|sea|ocean/i);
    expect(qs.every(q => q.startsWith('Gramado'))).toBe(true);
  });

  test('inclui o país quando é diferente do destino e omite quando é igual', () => {
    expect(fallbackQueries('Orlando', 'Estados Unidos')[0]).toContain('Estados Unidos');
    expect(fallbackQueries('Aruba', 'Aruba')[0]).toBe('Aruba landscape');
  });
});

describe('buildQueries', () => {
  test('usa a resposta do modelo e passa destino e país no prompt', async () => {
    const generate = jest.fn(async () => '{"tipo":"serra","queries":["Gramado Brazil pine trees town","Gramado travel"]}');
    const res = await buildQueries('Gramado', 'Brasil', { generate });
    expect(res.origin).toBe('gemini');
    expect(res.tipo).toBe('serra');
    expect(res.queries[0]).toBe('Gramado Brazil pine trees town');
    expect(generate.mock.calls[0][0]).toContain('"Gramado"');
    expect(generate.mock.calls[0][0]).toContain('"Brasil"');
  });

  test('segunda chamada do mesmo destino vem do cache, sem novo custo de modelo', async () => {
    const generate = jest.fn(async () => '{"tipo":"praia","queries":["Maceio Brazil aerial beach"]}');
    await buildQueries('Maceió', 'Brasil', { generate });
    const again = await buildQueries('maceio', 'brasil', { generate });   // grafia diferente, mesma chave
    expect(again.origin).toBe('cache');
    expect(again.queries).toEqual(['Maceio Brazil aerial beach']);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['modelo indisponível (null)', async () => null],
    ['modelo com erro', async () => { throw new Error('quota'); }],
    ['resposta inútil', async () => 'blá blá']
  ])('cai no fallback: %s', async (_nome, generate) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await buildQueries('Gramado', 'Brasil', { generate });
    expect(res.origin).toBe('fallback');
    expect(res.queries).toEqual(fallbackQueries('Gramado', 'Brasil'));
    warn.mockRestore();
  });

  test('fallback NÃO é cacheado: uma falha passageira não impede o modelo na próxima vez', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await buildQueries('Gramado', 'Brasil', { generate: async () => { throw new Error('rede'); } });
    const generate = jest.fn(async () => '{"tipo":"serra","queries":["Gramado Brazil town"]}');
    const res = await buildQueries('Gramado', 'Brasil', { generate });
    expect(res.origin).toBe('gemini');
    expect(generate).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test('destino vazio não chama o modelo', async () => {
    const generate = jest.fn();
    const res = await buildQueries('   ', 'Brasil', { generate });
    expect(res.queries).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });

  test('sem chave/modo stub o gerador padrão devolve null e usa o fallback (sem rede)', async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.EXTRACTION_MODE = 'stub';
    const res = await buildQueries('Fernando de Noronha', 'Brasil');
    expect(res.origin).toBe('fallback');
  });
});

test('o prompt proíbe forçar praia e pede termos em inglês', () => {
  const p = buildPrompt('Gramado', 'Brasil');
  expect(p).toMatch(/INGLÊS/);
  expect(p).toMatch(/NÃO force "beach"/);
});
