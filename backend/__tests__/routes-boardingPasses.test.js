process.env.EXTRACTION_MODE = 'stub';
delete process.env.GEMINI_API_KEY;
process.env.PUBLIC_BASE_URL = 'https://painel.test';

jest.mock('../services/boardingPassEmail', () => ({
  sendBoardingPassEmail: jest.fn(async () => ({ sucesso: true, messageId: 'm1', subject: 's' }))
}));

const request = require('supertest');
// testApp ANTES de database: ele define ADMIN_*/DB_PATH e recria o banco de teste.
const { makeBoardingPassApp, waitForDb, getCsrfFromResponse } = require('./testApp');
const db = require('../database');
const { sendBoardingPassEmail } = require('../services/boardingPassEmail');
const { AZUL_RAW, AZUL_CLEAN, LATAM_RAW, LATAM_CLEAN } = require('./fixtures/boardingPassLinks');

let app;
beforeAll(async () => {
  app = makeBoardingPassApp();
  await waitForDb();
  await new Promise(r => setTimeout(r, 600));
});
beforeEach(() => sendBoardingPassEmail.mockClear());

async function authed() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
  const meRes = await agent.get('/api/auth/me');
  return { agent, csrf: getCsrfFromResponse(meRes) };
}

function validBody(extra = {}) {
  return {
    passengers: [
      { name: 'Maria Silva', email: 'maria@x.com', phone: '75992020012', segments: [{ url: AZUL_RAW }] },
      { name: 'João Souza', segments: [{ url: LATAM_RAW }] }
    ],
    emailMode: 'individual', whatsappMode: 'individual',
    ...extra
  };
}

async function createSend(agent, csrf, body = validBody()) {
  const res = await agent.post('/api/boarding-passes').set('X-CSRF-Token', csrf).send(body);
  expect(res.status).toBe(201);
  return res.body;
}

test('sem login → 401', async () => {
  const res = await request(app).get('/api/boarding-passes');
  expect(res.status).toBe(401);
});

test('POST /parse-link devolve o link limpo', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/boarding-passes/parse-link').set('X-CSRF-Token', csrf).send({ url: AZUL_RAW });
  expect(res.status).toBe(200);
  expect(res.body.cleanUrl).toBe(AZUL_CLEAN);
  expect(res.body.data.flightNumber).toBe('AD2730');
});

test('POST inválido → 422 com lista de erros', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/boarding-passes').set('X-CSRF-Token', csrf)
    .send({ passengers: [{ name: 'Maria', segments: [{ url: AZUL_RAW }] }] });
  expect(res.status).toBe(422);
  expect(res.body.errors.join()).toMatch(/nome e sobrenome/);
});

test('POST válido cria envio com códigos curtos e data do voo', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  expect(send.id).toEqual(expect.any(Number));
  expect(send.flightDate).toBe('2026-09-24');
  expect(send.links).toHaveLength(2);
  expect(send.links[0].cleanUrl).toBe(AZUL_CLEAN);
  expect(send.links[1].cleanUrl).toBe(LATAM_CLEAN);
  send.links.forEach(l => expect(l.shortCode).toMatch(/^[A-Za-z0-9]{8}$/));
});

test('link não reconhecido não ganha código curto', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf, validBody({
    passengers: [{ name: 'Maria Silva', segments: [{ url: 'https://exemplo.com/cartao' }] }]
  }));
  expect(send.links[0].shortCode).toBeNull();
});

test('GET /:id/messages usa link curto; useOriginal=1 usa link limpo', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const short = await agent.get(`/api/boarding-passes/${send.id}/messages`);
  expect(short.status).toBe(200);
  expect(short.body).toHaveLength(2);
  expect(short.body[0].text).toContain(`https://painel.test/c/${send.links[0].shortCode}`);
  expect(short.body[0].waUrl.startsWith('https://wa.me/5575992020012?text=')).toBe(true);
  const orig = await agent.get(`/api/boarding-passes/${send.id}/messages?useOriginal=1`);
  expect(orig.body[0].text).toContain(AZUL_CLEAN);
});

test('PUT preserva código curto do link inalterado e troca o do link alterado', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const body = validBody();
  body.passengers[1].segments = [{ url: 'https://www.latamairlines.com/br/pt/boarding-pass?orderId=OUTRO&lastName=Souza&segmentIndex=0' }];
  const res = await agent.put(`/api/boarding-passes/${send.id}`).set('X-CSRF-Token', csrf).send(body);
  expect(res.status).toBe(200);
  expect(res.body.links[0].shortCode).toBe(send.links[0].shortCode);
  expect(res.body.links[1].shortCode).not.toBe(send.links[1].shortCode);
});

test('GET / lista com título e passageiros', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const res = await agent.get('/api/boarding-passes');
  expect(res.status).toBe(200);
  const item = res.body.find(i => i.id === send.id);
  expect(item.title).toBe('AD2730 · Salvador → Recife · 24/09');
  expect(item.passengers).toEqual([{ name: 'Maria Silva', opened: false }, { name: 'João Souza', opened: false }]);
});

test('send-email individual: envia só para quem tem e-mail e reporta os pulados', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const res = await agent.post(`/api/boarding-passes/${send.id}/send-email`).set('X-CSRF-Token', csrf);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ status: 'sent', sent: 1, failed: 0, skipped: ['João Souza'] });
  expect(sendBoardingPassEmail).toHaveBeenCalledTimes(1);
  const arg = sendBoardingPassEmail.mock.calls[0][0];
  expect(arg.to).toEqual(['maria@x.com']);
  expect(arg.group.passengers[0].segments[0].url).toBe(`https://painel.test/c/${send.links[0].shortCode}`);
  const after = await agent.get(`/api/boarding-passes/${send.id}`);
  expect(after.body.emailStatus).toBe('sent');
});

test('send-email modo single: um e-mail com todos os passageiros', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf, validBody({ emailMode: 'single', singleEmail: 'a@x.com, b@y.com' }));
  const res = await agent.post(`/api/boarding-passes/${send.id}/send-email`).set('X-CSRF-Token', csrf);
  expect(res.status).toBe(200);
  const arg = sendBoardingPassEmail.mock.calls[0][0];
  expect(arg.to).toEqual(['a@x.com', 'b@y.com']);
  expect(arg.group.passengers).toHaveLength(2);
});

test('send-email sem nenhum e-mail → 400', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf, validBody({
    passengers: [{ name: 'Maria Silva', segments: [{ url: AZUL_RAW }] }]
  }));
  const res = await agent.post(`/api/boarding-passes/${send.id}/send-email`).set('X-CSRF-Token', csrf);
  expect(res.status).toBe(400);
});

test('send-email com falha SMTP → 500 e status failed', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  sendBoardingPassEmail.mockResolvedValueOnce({ sucesso: false, erro: 'SMTP down' });
  const res = await agent.post(`/api/boarding-passes/${send.id}/send-email`).set('X-CSRF-Token', csrf);
  expect(res.status).toBe(500);
  expect(res.body.status).toBe('failed');
});

test('/c/:code redireciona e conta abertura; bot de preview não conta', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const code = send.links[0].shortCode;

  const bot = await request(app).get(`/c/${code}`).set('User-Agent', 'WhatsApp/2.23.20.0 A');
  expect(bot.status).toBe(302);

  const human = await request(app).get(`/c/${code}`).set('User-Agent', 'Mozilla/5.0 (iPhone)');
  expect(human.status).toBe(302);
  expect(human.headers.location).toBe(AZUL_CLEAN);

  const after = await agent.get(`/api/boarding-passes/${send.id}`);
  expect(after.body.links[0].openCount).toBe(1);
  const list = await agent.get('/api/boarding-passes');
  expect(list.body.find(i => i.id === send.id).passengers[0].opened).toBe(true);
});

test('/c/:code inexistente → 404 com página amigável', async () => {
  const res = await request(app).get('/c/ZZZZZZZZ');
  expect(res.status).toBe(404);
  expect(res.text).toMatch(/expirou/);
});

test('/c/:code com host fora da allowlist → 404 (sem open redirect)', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  await new Promise((resolve, reject) => db.run(
    `UPDATE boarding_pass_links SET clean_url = 'https://evil.com/x' WHERE id = ?`, [send.links[0].id],
    (err) => err ? reject(err) : resolve()));
  const res = await request(app).get(`/c/${send.links[0].shortCode}`);
  expect(res.status).toBe(404);
});

test('DELETE remove envio e links', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const del = await agent.delete(`/api/boarding-passes/${send.id}`).set('X-CSRF-Token', csrf);
  expect(del.status).toBe(204);
  expect((await agent.get(`/api/boarding-passes/${send.id}`)).status).toBe(404);
  expect((await request(app).get(`/c/${send.links[0].shortCode}`)).status).toBe(404);
});

test('voucher-options e voucher-prefill', async () => {
  const { agent, csrf } = await authed();
  const created = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.from('bp-prefill'), { filename: 'v.pdf', contentType: 'application/pdf' });
  expect(created.status).toBe(201);
  const vid = created.body.id;

  const opts = await agent.get('/api/boarding-passes/voucher-options');
  expect(opts.status).toBe(200);
  expect(opts.body.find(o => o.id === vid).label).toEqual(expect.any(String));

  const pre = await agent.get(`/api/boarding-passes/voucher-prefill/${vid}`);
  expect(pre.status).toBe(200);
  expect(pre.body.passengers.length).toBe(created.body.unified.passengers.length);
  const trips = created.body.unified.trips.length || 1;
  expect(pre.body.passengers[0].segments).toHaveLength(trips);
  expect(pre.body.lastEmails).toEqual([]);

  expect((await agent.get('/api/boarding-passes/voucher-prefill/999999')).status).toBe(404);
});
