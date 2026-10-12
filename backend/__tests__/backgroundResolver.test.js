const fs = require('fs'); const path = require('path');

// O banco de fundos usa SQLite; aqui só o resolvedor é testado, então ele é isolado.
const mockListForDestination = jest.fn(async () => []);
jest.mock('../services/backgroundLibrary', () => ({
  listForDestination: (...a) => mockListForDestination(...a)
}));

const dir = path.join(__dirname, '..', 'static', 'promo-backgrounds');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'maceio.jpg'), 'x');
const { listBackgrounds, slugify } = require('../services/backgroundResolver');

afterAll(() => { try { fs.unlinkSync(path.join(dir, 'maceio.jpg')); } catch (e) {} });

const fakePhoto = (id) => ({
  id, photographer: 'Fulano',
  src: { large2x: `https://images.pexels.com/photos/${id}/large2x.jpeg`, large: `https://images.pexels.com/photos/${id}/large.jpeg`, medium: `https://images.pexels.com/photos/${id}/medium.jpeg` }
});

beforeEach(() => {
  mockListForDestination.mockReset();
  mockListForDestination.mockImplementation(async () => []);
  delete process.env.PEXELS_API_KEY;
  delete global.fetch;
});

test('slugify normalizes accents and spaces', () => {
  expect(slugify('Maceió')).toBe('maceio');
  expect(slugify('Porto Seguro')).toBe('porto-seguro');
});

test('local images are returned first with source local', async () => {
  const { options } = await listBackgrounds('Maceió');
  expect(options[0].source).toBe('local');
});

describe('banco de fundos', () => {
  const entries = [
    { source: 'library', id: 1, url: '/api/promo-backgrounds/file/a.jpg', thumb: '/api/promo-backgrounds/file/a.jpg', is_default: false },
    { source: 'library', id: 2, url: '/api/promo-backgrounds/file/b.jpg', thumb: '/api/promo-backgrounds/file/b.jpg', is_default: true }
  ];

  test('com fotos no banco mostra só elas e indica a padrão para pré-seleção', async () => {
    mockListForDestination.mockImplementation(async () => entries);
    process.env.PEXELS_API_KEY = 'k';
    global.fetch = jest.fn();
    const res = await listBackgrounds('Porto Seguro', 'Brasil');
    expect(res.options).toHaveLength(2);
    expect(res.options.every(o => o.source === 'library')).toBe(true);
    expect(res.default_url).toBe('/api/promo-backgrounds/file/b.jpg');
    expect(res.mode).toBe('curated');
    expect(res.has_curated).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();   // não gasta a API do Pexels
  });

  test('banco tem prioridade sobre a foto legada de static/', async () => {
    mockListForDestination.mockImplementation(async () => entries);
    const res = await listBackgrounds('Maceió');
    expect(res.options.some(o => o.source === 'local')).toBe(false);
  });

  test('includePexels junta as sugestões, mantendo o banco primeiro', async () => {
    mockListForDestination.mockImplementation(async () => entries);
    process.env.PEXELS_API_KEY = 'k';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ photos: [fakePhoto(7)] }) }));
    const res = await listBackgrounds('Porto Seguro', 'Brasil', { includePexels: true });
    expect(res.options[0].source).toBe('library');
    expect(res.options.some(o => o.source === 'pexels')).toBe(true);
    expect(res.mode).toBe('curated+pexels');
    expect(res.default_url).toBe('/api/promo-backgrounds/file/b.jpg');
  });

  test('sugestão do Pexels já salva no banco não reaparece na grade', async () => {
    const salva = { ...entries[1], source_url: 'https://images.pexels.com/photos/7/large2x.jpeg?auto=compress&w=940' };
    mockListForDestination.mockImplementation(async () => [entries[0], salva]);
    process.env.PEXELS_API_KEY = 'k';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ photos: [fakePhoto(7), fakePhoto(8)] }) }));
    const res = await listBackgrounds('Porto Seguro', 'Brasil', { includePexels: true });
    const pexels = res.options.filter(o => o.source === 'pexels');
    expect(pexels.map(o => o.url)).toEqual(['https://images.pexels.com/photos/8/large2x.jpeg']);   // a 7 já está no banco
    expect(res.options.filter(o => o.source === 'library')).toHaveLength(2);
  });

  test('falha ao ler o banco não derruba a busca', async () => {
    mockListForDestination.mockImplementation(async () => { throw new Error('db fora'); });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await listBackgrounds('Destino Sem Foto');
    expect(res.options).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('busca livre (query)', () => {
  test('consulta o Pexels com o termo digitado, sem reescrever e sem tocar no banco', async () => {
    process.env.PEXELS_API_KEY = 'k';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ photos: [fakePhoto(1), fakePhoto(2), fakePhoto(1)] }) }));
    const res = await listBackgrounds(undefined, undefined, { query: '  dunas   Jericoacoara ' });
    const url = decodeURIComponent(global.fetch.mock.calls[0][0]);
    expect(url).toContain('query=dunas Jericoacoara&');
    expect(res.mode).toBe('search');
    expect(res.options).toHaveLength(2);              // id repetido foi deduplicado
    expect(res.default_url).toBeNull();
    expect(mockListForDestination).not.toHaveBeenCalled();
  });

  test('termo curto demais não chama a API', async () => {
    process.env.PEXELS_API_KEY = 'k';
    global.fetch = jest.fn();
    const res = await listBackgrounds(undefined, undefined, { query: 'a' });
    expect(res.options).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
