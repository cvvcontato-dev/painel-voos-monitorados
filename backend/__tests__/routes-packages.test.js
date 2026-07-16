process.env.EXTRACTION_MODE = 'stub';
delete process.env.GEMINI_API_KEY;
const request = require('supertest');
const { makePackageApp, waitForDb, getCsrfFromResponse } = require('./testApp');

let app;
beforeAll(async () => { app = makePackageApp(); await waitForDb(); await new Promise(r=>setTimeout(r,600)); });
async function authed() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
  const me = await agent.get('/api/auth/me');
  return { agent, csrf: getCsrfFromResponse(me) };
}
const pdf = () => Buffer.from('%PDF-1.4 fake');

test('POST /api/packages com voo+hotel cria pacote', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/packages').set('X-CSRF-Token', csrf)
    .attach('files', pdf(), { filename:'voo.pdf', contentType:'application/pdf' }).field('kinds','flight')
    .attach('files', pdf(), { filename:'hotel.pdf', contentType:'application/pdf' }).field('kinds','hotel');
  expect(res.status).toBe(201);
  expect(res.body.id).toEqual(expect.any(Number));
  expect(res.body.package.hotels).toHaveLength(1);
});

test('POST sem hotel → 400', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/packages').set('X-CSRF-Token', csrf)
    .attach('files', pdf(), { filename:'a.pdf', contentType:'application/pdf' }).field('kinds','flight')
    .attach('files', pdf(), { filename:'b.pdf', contentType:'application/pdf' }).field('kinds','flight');
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/hotel/i);
});

test('POST sem voo → 400', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/packages').set('X-CSRF-Token', csrf)
    .attach('files', pdf(), { filename:'a.pdf', contentType:'application/pdf' }).field('kinds','hotel')
    .attach('files', pdf(), { filename:'b.pdf', contentType:'application/pdf' }).field('kinds','hotel');
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/voo/i);
});

test('GET /api/packages lista', async () => {
  const { agent, csrf } = await authed();
  await agent.post('/api/packages').set('X-CSRF-Token', csrf)
    .attach('files', pdf(), { filename:'v.pdf', contentType:'application/pdf' }).field('kinds','flight')
    .attach('files', pdf(), { filename:'h.pdf', contentType:'application/pdf' }).field('kinds','hotel');
  const res = await agent.get('/api/packages');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('POST /api/packages com voo+hotel+car+tour+transfer (5 serviços) → addons na ordem', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/packages').set('X-CSRF-Token', csrf)
    .attach('files', pdf(), { filename:'voo.pdf', contentType:'application/pdf' }).field('kinds','flight')
    .attach('files', pdf(), { filename:'hotel.pdf', contentType:'application/pdf' }).field('kinds','hotel')
    .attach('files', pdf(), { filename:'carro.pdf', contentType:'application/pdf' }).field('kinds','car')
    .attach('files', pdf(), { filename:'passeio.pdf', contentType:'application/pdf' }).field('kinds','tour')
    .attach('files', pdf(), { filename:'transfer.pdf', contentType:'application/pdf' }).field('kinds','transfer');
  expect(res.status).toBe(201);
  expect(res.body.package.addons.map(a => a.kind)).toEqual(['car','tour','transfer']);
  expect(res.body.package.hotels).toHaveLength(1);
});
