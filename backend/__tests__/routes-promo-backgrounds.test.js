// Banco e pasta de fotos isolados: o teste grava arquivos de verdade em DB_PATH.
const path = require('path');
const fs = require('fs');
const os = require('os');
process.env.DB_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-bg-'));
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'AdminPass123!';
process.env.NODE_ENV = 'test';
delete process.env.PEXELS_API_KEY;

const express = require('express');
const request = require('supertest');
const db = require('../database');
const promoBgRouter = require('../routes/promoBackgrounds');
const promotionsRouter = require('../routes/promotions');
const library = require('../services/backgroundLibrary');
const { backgroundCss } = require('../services/promoRenderer');

const app = express();
app.use(express.json());
app.use('/api/promo-backgrounds', promoBgRouter);
app.use('/api/promotions', promotionsRouter);

// PNG 1x1 válido, JPEG e WebP mínimos (só os bytes de assinatura importam para a validação)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(32, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(16, 2)]);

const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const upload = (dest, buf = PNG, extra = {}) => {
  const r = request(app).post('/api/promo-backgrounds').field('destination', dest);
  Object.entries(extra).forEach(([k, v]) => r.field(k, v));
  return r.attach('image', buf, { filename: 'foto.png' });
};
const libFile = (name) => path.join(process.env.DB_PATH, 'promo-backgrounds', name);

beforeAll(() => new Promise(r => setTimeout(r, 1800)));   // migrações do SQLite

describe('upload', () => {
  test('a primeira foto de um destino vira a padrão automaticamente', async () => {
    const res = await upload('Porto Seguro');
    expect(res.status).toBe(201);
    expect(res.body.image.is_default).toBe(true);
    expect(res.body.image.url).toMatch(/^\/api\/promo-backgrounds\/file\/porto-seguro-[0-9a-f]{10}\.png$/);
    expect(fs.existsSync(libFile(res.body.image.url.split('/').pop()))).toBe(true);
  });

  test('a segunda foto não toma o lugar da padrão, a menos que seja pedido', async () => {
    const a = await upload('Maragogi');
    const b = await upload('Maragogi', JPG);
    expect(a.body.image.is_default).toBe(true);
    expect(b.body.image.is_default).toBe(false);

    const c = await upload('Maragogi', WEBP, { make_default: 'true' });
    expect(c.body.image.is_default).toBe(true);
    const rows = await all("SELECT is_default FROM promo_backgrounds WHERE destination_slug = 'maragogi'");
    expect(rows.filter(r => r.is_default === 1)).toHaveLength(1);   // nunca duas padrão
  });

  test('grafias diferentes do mesmo destino caem no mesmo grupo', async () => {
    await upload('Porto de Galinhas (Ipojuca)');
    await upload('porto de galinhas');
    await upload('Pórto de Galinhas, Brasil');
    const rows = await all("SELECT DISTINCT destination_slug FROM promo_backgrounds WHERE destination_slug LIKE 'porto-de-galinhas%'");
    expect(rows).toEqual([{ destination_slug: 'porto-de-galinhas' }]);
  });

  test('aceita JPG, PNG e WebP e grava a extensão pelo conteúdo, não pelo nome enviado', async () => {
    const res = await request(app).post('/api/promo-backgrounds').field('destination', 'Jericoacoara')
      .attach('image', JPG, { filename: 'enganoso.png' });
    expect(res.status).toBe(201);
    expect(res.body.image.url.endsWith('.jpg')).toBe(true);
  });

  test('rejeita arquivo que não é imagem mesmo com extensão de imagem', async () => {
    const res = await upload('Recife', Buffer.from('isto é um texto, não uma imagem de verdade'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JPG, PNG ou WebP/);
    expect(await all("SELECT * FROM promo_backgrounds WHERE destination_slug = 'recife'")).toHaveLength(0);
  });

  test('rejeita HTML/SVG disfarçado', async () => {
    const res = await upload('Recife', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    expect(res.status).toBe(400);
  });

  test('rejeita imagem acima de 8 MB com 413', async () => {
    const grande = Buffer.concat([JPG, Buffer.alloc(8 * 1024 * 1024 + 10, 3)]);
    const res = await upload('Salvador', grande);
    expect(res.status).toBe(413);
  });

  test('exige destino e arquivo', async () => {
    expect((await upload('   ')).status).toBe(400);
    expect((await request(app).post('/api/promo-backgrounds').field('destination', 'Natal')).status).toBe(400);
  });

  test('limita 12 fotos por destino', async () => {
    for (let i = 0; i < library.MAX_PER_DESTINATION; i++) {
      expect((await upload('Limite Teste')).status).toBe(201);
    }
    const extra = await upload('Limite Teste');
    expect(extra.status).toBe(409);
    expect(extra.body.error).toMatch(/Limite/);
  }, 30000);
});

describe('servir arquivos', () => {
  test('devolve os bytes com cache longo', async () => {
    const up = await upload('Arraial do Cabo');
    const res = await request(app).get(up.body.image.url).buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/immutable/);
    expect(Buffer.compare(res.body, PNG)).toBe(0);
  });

  test('premissa dos testes de traversal: o alvo do ataque existe de verdade', () => {
    // Sem isso os testes abaixo passariam mesmo com a proteção removida.
    expect(fs.existsSync(path.join(process.env.DB_PATH, 'database.sqlite'))).toBe(true);
  });

  test.each([
    ['inexistente', 'nao-existe-aaaaaaaaaa.png'],
    ['sem extensão válida', 'arquivo.txt'],
    ['traversal codificado (database.sqlite existe nesse caminho)', '..%2Fdatabase.sqlite'],
    ['traversal com barra invertida', '..%5Cdatabase.sqlite'],
    ['traversal duplo', '..%2F..%2Fdatabase.sqlite'],
    ['maiúsculas fora do padrão', 'Porto-Seguro.PNG']
  ])('404 para nome inválido: %s', async (_n, nome) => {
    const res = await request(app).get(`/api/promo-backgrounds/file/${nome}`);
    expect(res.status).toBe(404);
  });
});

describe('padrão e exclusão', () => {
  test('definir outra foto como padrão troca a padrão', async () => {
    const a = await upload('Morro de Sao Paulo');
    const b = await upload('Morro de Sao Paulo', JPG);
    const res = await request(app).put(`/api/promo-backgrounds/${b.body.image.id}/default`);
    expect(res.status).toBe(200);
    const rows = await all("SELECT id, is_default FROM promo_backgrounds WHERE destination_slug = 'morro-de-sao-paulo'");
    expect(rows.find(r => r.id === b.body.image.id).is_default).toBe(1);
    expect(rows.find(r => r.id === a.body.image.id).is_default).toBe(0);
  });

  test('excluir a padrão promove a mais antiga e apaga o arquivo do disco', async () => {
    const a = await upload('Itacare');
    const b = await upload('Itacare', JPG);
    const c = await upload('Itacare', WEBP, { make_default: '1' });
    const arquivoC = c.body.image.url.split('/').pop();
    expect(fs.existsSync(libFile(arquivoC))).toBe(true);

    expect((await request(app).delete(`/api/promo-backgrounds/${c.body.image.id}`)).status).toBe(200);
    expect(fs.existsSync(libFile(arquivoC))).toBe(false);
    const rows = await all("SELECT id, is_default FROM promo_backgrounds WHERE destination_slug = 'itacare'");
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.is_default === 1).id).toBe(a.body.image.id);   // a mais antiga assumiu
    expect(rows.filter(r => r.is_default === 1)).toHaveLength(1);
    expect(rows.some(r => r.id === b.body.image.id)).toBe(true);
  });

  test('excluir a única foto zera o destino sem erro', async () => {
    const a = await upload('Destino Unico');
    expect((await request(app).delete(`/api/promo-backgrounds/${a.body.image.id}`)).status).toBe(200);
    expect(await all("SELECT * FROM promo_backgrounds WHERE destination_slug = 'destino-unico'")).toHaveLength(0);
  });

  test.each([['abc'], ['0'], ['-3'], ['1.5']])('id inválido (%s) -> 400', async (id) => {
    expect((await request(app).put(`/api/promo-backgrounds/${id}/default`)).status).toBe(400);
    expect((await request(app).delete(`/api/promo-backgrounds/${id}`)).status).toBe(400);
  });

  test('id inexistente -> 404', async () => {
    expect((await request(app).put('/api/promo-backgrounds/999999/default')).status).toBe(404);
    expect((await request(app).delete('/api/promo-backgrounds/999999')).status).toBe(404);
  });
});

describe('listagem do banco', () => {
  test('agrupa por destino e ignora registros cujo arquivo sumiu do disco', async () => {
    const a = await upload('Listagem Teste');
    const b = await upload('Listagem Teste', JPG);
    fs.unlinkSync(libFile(b.body.image.url.split('/').pop()));   // ex.: volume restaurado sem as imagens

    const res = await request(app).get('/api/promo-backgrounds');
    expect(res.status).toBe(200);
    const grupo = res.body.destinations.find(d => d.slug === 'listagem-teste');
    expect(grupo.label).toBe('Listagem Teste');
    expect(grupo.images).toHaveLength(1);
    expect(grupo.images[0].id).toBe(a.body.image.id);
    expect(res.body.max_per_destination).toBe(12);
  });

  test('destinos vêm em ordem alfabética (pt-BR)', async () => {
    const res = await request(app).get('/api/promo-backgrounds');
    const labels = res.body.destinations.map(d => d.label);
    expect(labels).toEqual([...labels].sort((x, y) => x.localeCompare(y, 'pt-BR')));
  });
});

describe('importar do Pexels (from-url)', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  test.each([
    ['host de terceiros', 'https://evil.example.com/foto.png'],
    ['http sem TLS', 'http://images.pexels.com/photos/1/x.jpeg'],
    ['localhost', 'https://localhost/foto.png'],
    ['IP interno', 'https://127.0.0.1/foto.png'],
    ['metadata de nuvem', 'https://169.254.169.254/latest/meta-data/'],
    ['subdomínio enganoso', 'https://images.pexels.com.evil.com/x.jpeg'],
    ['host com credenciais', 'https://images.pexels.com@evil.com/x.jpeg'],
    ['não é URL', 'isto-nao-e-url'],
    ['vazio', '']
  ])('bloqueia: %s (e nunca chega a buscar)', async (_n, url) => {
    global.fetch = jest.fn();
    const res = await request(app).post('/api/promo-backgrounds/from-url').send({ destination: 'Noronha', url });
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('baixa do Pexels, valida o conteúdo e salva com origem pexels', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true, status: 200, headers: { get: () => String(PNG.length) },
      arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length)
    }));
    const res = await request(app).post('/api/promo-backgrounds/from-url')
      .send({ destination: 'Fernando de Noronha', url: 'https://images.pexels.com/photos/123/pexels-photo-123.jpeg?auto=compress&w=940' });
    expect(res.status).toBe(201);
    expect(res.body.image.is_default).toBe(true);
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.redirect).toBe('error');              // não segue redirecionamento para outro host
    expect(opts.signal).toBeDefined();                // com timeout
    const rows = await all("SELECT source, source_url FROM promo_backgrounds WHERE destination_slug = 'fernando-de-noronha'");
    expect(rows[0].source).toBe('pexels');
    expect(rows[0].source_url).toBe('https://images.pexels.com/photos/123/pexels-photo-123.jpeg?auto=compress&w=940');
    expect(res.body.image.source_url).toBe(rows[0].source_url);
  });

  test('upload manual não guarda source_url', async () => {
    const up = await upload('Sem Origem');
    const rows = await all("SELECT source, source_url FROM promo_backgrounds WHERE destination_slug = 'sem-origem'");
    expect(rows[0]).toEqual({ source: 'upload', source_url: null });
    expect(up.body.image.source_url).toBeNull();
  });

  test('rejeita quando o "Pexels" devolve algo que não é imagem', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true, status: 200, headers: { get: () => '30' },
      arrayBuffer: async () => Buffer.from('<html>captcha</html> padding padding').buffer
    }));
    const res = await request(app).post('/api/promo-backgrounds/from-url')
      .send({ destination: 'Pexels Lixo', url: 'https://images.pexels.com/photos/9/x.jpeg' });
    expect(res.status).toBe(400);
  });

  test('rejeita pelo Content-Length antes de baixar tudo', async () => {
    const arrayBuffer = jest.fn();
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: { get: () => String(50 * 1024 * 1024) }, arrayBuffer }));
    const res = await request(app).post('/api/promo-backgrounds/from-url')
      .send({ destination: 'Pexels Grande', url: 'https://images.pexels.com/photos/9/x.jpeg' });
    expect(res.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  test.each([[404], [500]])('Pexels respondendo %i -> 502', async (status) => {
    global.fetch = jest.fn(async () => ({ ok: false, status, headers: { get: () => null } }));
    const res = await request(app).post('/api/promo-backgrounds/from-url')
      .send({ destination: 'Pexels Fora', url: 'https://images.pexels.com/photos/9/x.jpeg' });
    expect(res.status).toBe(502);
  });

  test('falha de rede -> 502', async () => {
    global.fetch = jest.fn(async () => { throw new Error('ECONNRESET'); });
    const res = await request(app).post('/api/promo-backgrounds/from-url')
      .send({ destination: 'Pexels Rede', url: 'https://images.pexels.com/photos/9/x.jpeg' });
    expect(res.status).toBe(502);
  });
});

describe('seleção automática na tela de promoções', () => {
  test('GET /backgrounds devolve a padrão do destino como default_url', async () => {
    const a = await upload('Gramado');
    const b = await upload('Gramado', JPG, { make_default: 'true' });
    const res = await request(app).get('/api/promotions/backgrounds').query({ destination: 'Gramado', country: 'Brasil' });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('curated');
    expect(res.body.default_url).toBe(b.body.image.url);
    expect(res.body.options[0].url).toBe(b.body.image.url);           // padrão primeiro
    expect(res.body.options.map(o => o.url)).toContain(a.body.image.url);
  });

  test('encontra a foto mesmo se o print trouxer o nome com outra grafia', async () => {
    const up = await upload('Foz do Iguaçu');
    const res = await request(app).get('/api/promotions/backgrounds').query({ destination: 'foz do iguacu (PR)' });
    expect(res.body.default_url).toBe(up.body.image.url);
  });

  test('destino sem foto no banco: sem default_url e sem erro', async () => {
    const res = await request(app).get('/api/promotions/backgrounds').query({ destination: 'Lugar Que Nao Existe' });
    expect(res.status).toBe(200);
    expect(res.body.default_url).toBeNull();
    expect(res.body.has_curated).toBe(false);
  });

  test('exige destination ou q', async () => {
    expect((await request(app).get('/api/promotions/backgrounds')).status).toBe(400);
    expect((await request(app).get('/api/promotions/backgrounds').query({ q: 'dunas' })).status).toBe(200);
  });
});

describe('renderizador', () => {
  test('embute a foto do banco como data URL (a arte sai com a imagem escolhida)', async () => {
    const up = await upload('Render Teste');
    const css = backgroundCss(up.body.image.url);
    expect(css).toMatch(/^url\('data:image\/png;base64,/);
    expect(css).toContain(PNG.toString('base64'));
  });

  test('URL do banco com traversal ou inexistente vira "none", sem vazar arquivos', () => {
    expect(fs.existsSync(path.join(process.env.DB_PATH, 'database.sqlite'))).toBe(true);
    expect(backgroundCss('/api/promo-backgrounds/file/../database.sqlite')).toBe('none');
    expect(backgroundCss('/api/promo-backgrounds/file/../../database.sqlite')).toBe('none');
    expect(backgroundCss('/api/promo-backgrounds/file/nao-existe-aaaaaaaaaa.png')).toBe('none');
  });
});

describe('resolveFile (direto, sem o roteamento do Express)', () => {
  test('só resolve nomes válidos que existem na pasta do banco', async () => {
    const up = await upload('Resolve Teste');
    const nome = up.body.image.url.split('/').pop();
    expect(library.resolveFile(nome)).toBe(libFile(nome));
  });

  test.each([
    ['../database.sqlite'],
    ['..\database.sqlite'],
    ['../promo-backgrounds/x.png'],
    ['sub/dir.png'],
    ['/etc/passwd'],
    ['C:\Windows\win.ini'],
    ['nome.png .txt'],
    [''],
    [undefined]
  ])('recusa %p', (nome) => {
    expect(library.resolveFile(nome)).toBeNull();
  });

  test('pathFromUrl recusa URLs fora do prefixo do banco', () => {
    expect(library.pathFromUrl('/static/promo-backgrounds/x.jpg')).toBeNull();
    expect(library.pathFromUrl('https://images.pexels.com/x.jpg')).toBeNull();
    expect(library.pathFromUrl(null)).toBeNull();
  });
});
