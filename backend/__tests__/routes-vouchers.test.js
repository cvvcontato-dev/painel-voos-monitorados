process.env.EXTRACTION_MODE = 'stub';
delete process.env.GEMINI_API_KEY;
const request = require('supertest');
const { makeVoucherApp, waitForDb, getCsrfFromResponse } = require('./testApp');

let app;
beforeAll(async () => {
  app = makeVoucherApp();
  await waitForDb();
  await new Promise(r => setTimeout(r, 600));
});

async function authed() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
  const meRes = await agent.get('/api/auth/me');
  const csrf = getCsrfFromResponse(meRes);
  return { agent, csrf };
}

test('POST without file returns 400', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf);
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/arquivo/);
});

test('POST with file creates voucher (201) and returns unified payload', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.from('fake-pdf-bytes'), { filename: 'voucher.pdf', contentType: 'application/pdf' });
  expect(res.status).toBe(201);
  expect(res.body.id).toEqual(expect.any(Number));
  expect(res.body.unified).toBeDefined();
  expect(res.body.unified.carrier).toBe('azul');
  expect(res.body.unified.layoutVersion).toBe('azul.confirmacao.v1');
  expect(res.body.unified.meta.sourceFileHash).toMatch(/^sha256:/);
});

test('GET list returns array including the created voucher', async () => {
  const { agent, csrf } = await authed();
  await agent.post('/api/vouchers').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.from('another-fake'), { filename: 'v2.pdf', contentType: 'application/pdf' });
  const res = await agent.get('/api/vouchers');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.length).toBeGreaterThanOrEqual(1);
  expect(res.body[0]).toHaveProperty('id');
  expect(res.body[0]).toHaveProperty('carrier');
  expect(res.body[0]).toHaveProperty('layout_version');
});

test('PUT updates voucher with normalized unified payload', async () => {
  const { agent, csrf } = await authed();
  const created = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.from('put-fake'), { filename: 'p.pdf', contentType: 'application/pdf' });
  const id = created.body.id;
  const updated = { ...created.body.unified };
  updated.reservation = { ...updated.reservation, locator: 'NEWLOC' };
  const res = await agent.put(`/api/vouchers/${id}`).set('X-CSRF-Token', csrf).send({ unified: updated });
  expect(res.status).toBe(200);
  expect(res.body.id).toBe(id);
  expect(res.body.unified.reservation.locator).toBe('NEWLOC');
});

test('GET /:id/export with invalid format returns 400', async () => {
  const { agent } = await authed();
  const res = await agent.get('/api/vouchers/1/export?format=xls');
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/format/);
});

test('GET /:id/export for missing voucher returns 404', async () => {
  const { agent } = await authed();
  const res = await agent.get('/api/vouchers/999999/export?format=pdf');
  expect(res.status).toBe(404);
});

test('POST /:id/send-email com body vazio retorna 400', async () => {
  const { agent, csrf } = await authed();
  const created = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.from('%PDF-1.4'), { filename: 'a.pdf', contentType: 'application/pdf' });
  const r = await agent.post(`/api/vouchers/${created.body.id}/send-email`).set('X-CSRF-Token', csrf).send({});
  expect(r.status).toBe(400);
});

test('POST /:id/send-email com email invalido retorna 400', async () => {
  const { agent, csrf } = await authed();
  const created = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.from('%PDF-1.4'), { filename: 'a.pdf', contentType: 'application/pdf' });
  const r = await agent.post(`/api/vouchers/${created.body.id}/send-email`).set('X-CSRF-Token', csrf).send({ emails: 'naoehemail' });
  expect(r.status).toBe(400);
});

test('PUT with invalid unified returns 422', async () => {
  const { agent, csrf } = await authed();
  const created = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.from('invalid-test'), { filename: 'i.pdf', contentType: 'application/pdf' });
  const id = created.body.id;
  const bad = { ...created.body.unified, reservation: { locator: '' }, passengers: [], trips: [] };
  const res = await agent.put(`/api/vouchers/${id}`).set('X-CSRF-Token', csrf).send({ unified: bad });
  expect(res.status).toBe(422);
  expect(res.body.error).toMatch(/schema/);
  expect(Array.isArray(res.body.details)).toBe(true);
});

// --- Multidestinos: POST /combine ---
const pdf = () => Buffer.from('%PDF-1.4 fake'); // extractor em STUB (EXTRACTION_MODE=stub) gera 2 trips por arquivo

test('POST /combine com 3 arquivos (ida+interno+volta) cria voucher', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/vouchers/combine')
    .set('X-CSRF-Token', csrf)
    .attach('files', pdf(), { filename: 'ida.pdf', contentType: 'application/pdf' }).field('roles', 'ida')
    .attach('files', pdf(), { filename: 'interno.pdf', contentType: 'application/pdf' }).field('roles', 'interno')
    .attach('files', pdf(), { filename: 'volta.pdf', contentType: 'application/pdf' }).field('roles', 'volta');
  expect(res.status).toBe(201);
  expect(res.body.id).toEqual(expect.any(Number));
  expect(res.body.unified.trips.length).toBeGreaterThanOrEqual(3);
  expect(res.body.unified.meta.combined).toBe(true);
});

test('POST /combine sem ida retorna 400', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/vouchers/combine')
    .set('X-CSRF-Token', csrf)
    .attach('files', pdf(), { filename: 'a.pdf', contentType: 'application/pdf' }).field('roles', 'interno')
    .attach('files', pdf(), { filename: 'b.pdf', contentType: 'application/pdf' }).field('roles', 'volta');
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/ida/i);
});

test('POST /combine com 2 voltas retorna 400', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/vouchers/combine')
    .set('X-CSRF-Token', csrf)
    .attach('files', pdf(), { filename: 'a.pdf', contentType: 'application/pdf' }).field('roles', 'ida')
    .attach('files', pdf(), { filename: 'b.pdf', contentType: 'application/pdf' }).field('roles', 'volta')
    .attach('files', pdf(), { filename: 'c.pdf', contentType: 'application/pdf' }).field('roles', 'volta');
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/volta/i);
});

test('POST /combine com 1 arquivo retorna 400', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/vouchers/combine')
    .set('X-CSRF-Token', csrf)
    .attach('files', pdf(), { filename: 'a.pdf', contentType: 'application/pdf' }).field('roles', 'ida');
  expect(res.status).toBe(400);
});
