process.env.EXTRACTION_MODE = 'stub';
delete process.env.GEMINI_API_KEY;
const request = require('supertest');
const { makeFlightChangeApp, waitForDb, getCsrfFromResponse } = require('./testApp');
const db = require('../database');
const { buildNoticeEmailHtml } = require('../services/flightChangeEmail');

let app;
beforeAll(async () => { app = makeFlightChangeApp(); await waitForDb(); await new Promise(r => setTimeout(r, 600)); });

async function authed() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
  const csrf = getCsrfFromResponse(await agent.get('/api/auth/me'));
  return { agent, csrf };
}
const pdf = (b = 'fake') => ({ buf: Buffer.from(b), opts: { filename: 'v.pdf', contentType: 'application/pdf' } });

async function criarCaso(agent, csrf) {
  const f = pdf('antigo');
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  expect(res.status).toBe(201);
  return res.body;
}

/** Caso já confirmado (com voucher novo editado). */
async function criarCasoConfirmado(agent, csrf) {
  const c = await criarCaso(agent, csrf);
  const f = pdf('novo-conf');
  const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  const novo = r.body.new;
  novo.trips[0].departure.datetime = '2026-09-12T10:15:00-03:00';
  await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo });
  const cf = await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf);
  expect(cf.status).toBe(200);
  return { c, novo };
}

test('exige autenticação', async () => {
  expect((await request(app).get('/api/flight-changes')).status).toBe(401);
});

test('POST sem arquivo nem voucher_id: 400', async () => {
  const { agent, csrf } = await authed();
  expect((await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf)).status).toBe(400);
});

test('cria caso por upload: status aviso_pendente, snapshot e mensagem de aviso', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  expect(c.status).toBe('aviso_pendente');
  expect(c.locator).toBe('STUB01');
  expect(c.messages.notice).toContain('*STUB01*');
  expect(c.old.reservation.locator).toBe('STUB01');
});

test('cria caso a partir de voucher salvo (voucher_id)', async () => {
  const { agent, csrf } = await authed();
  const f = pdf('salvo');
  const v = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).send({ voucher_id: v.body.id });
  expect(res.status).toBe(201);
  expect(res.body.old_voucher_id).toBe(v.body.id);
});

test('voucher_id inexistente: 404', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).send({ voucher_id: 999999 });
  expect(res.status).toBe(404);
});

test('lista: pendentes antes dos confirmados', async () => {
  const { agent, csrf } = await authed();
  await criarCasoConfirmado(agent, csrf);
  await criarCaso(agent, csrf);
  const res = await agent.get('/api/flight-changes');
  expect(res.status).toBe(200);
  const ordem = res.body.map(c => c.status === 'confirmado' ? 1 : 0);
  expect(ordem).toContain(1);
  expect([...ordem].sort()).toEqual(ordem);
});

test('notice-sent muda status e é idempotente', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const r1 = await agent.post(`/api/flight-changes/${c.id}/notice-sent`).set('X-CSRF-Token', csrf);
  expect(r1.body.status).toBe('aviso_enviado');
  const r2 = await agent.post(`/api/flight-changes/${c.id}/notice-sent`).set('X-CSRF-Token', csrf);
  expect(r2.status).toBe(200); expect(r2.body.status).toBe('aviso_enviado');
});

test('confirm sem voucher novo: 409', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  expect((await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf)).status).toBe(409);
});

test('voucher novo idêntico: diff sem mudanças e confirm bloqueado (nada_mudou)', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const f = pdf('novo');
  const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  expect(r.status).toBe(200);
  expect(r.body.diff.hasChanges).toBe(false);
  const cf = await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf);
  expect(cf.status).toBe(409); expect(cf.body.error).toBe('nada_mudou');
});

test('editar o voucher novo recalcula o diff; confirm então funciona', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const f = pdf('novo2');
  const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  const novo = r.body.new;
  novo.trips[0].departure.datetime = '2026-09-12T10:15:00-03:00';
  const put = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo });
  expect(put.status).toBe(200);
  expect(put.body.diff.hasChanges).toBe(true);
  expect(put.body.messages.confirmation).toContain('Seu voo foi reajustado');
  expect(put.body.messages.confirmation).toContain('Partida: 12/09/2026 08:30 → 12/09/2026 10:15');
  const cf = await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf);
  expect(cf.status).toBe(200); expect(cf.body.status).toBe('confirmado');
});

test('PUT /new com payload inválido: 422', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const f = pdf('n3');
  await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  const res = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: { x: 1 } });
  expect(res.status).toBe(422);
});

test('caso confirmado: novo voucher e edição do novo retornam 409', async () => {
  const { agent, csrf } = await authed();
  const { c, novo } = await criarCasoConfirmado(agent, csrf);
  const f = pdf('outro');
  const nv = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  expect(nv.status).toBe(409);
  const put = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo });
  expect(put.status).toBe(409);
});

test('upload com mimetype não suportado: 400 (não 500)', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.from('texto'), { filename: 'a.txt', contentType: 'text/plain' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/Formato não suportado/);
});

test('arquivo acima de 15MB: 413 (não 500 genérico)', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.alloc(15 * 1024 * 1024 + 10), { filename: 'g.pdf', contentType: 'application/pdf' });
  expect(res.status).toBe(413);
});

test('send-email valida destinatários, tipo e pré-requisitos', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const post = (body) => agent.post(`/api/flight-changes/${c.id}/send-email`).set('X-CSRF-Token', csrf).send(body);
  expect((await post({ kind: 'aviso' })).status).toBe(400);
  expect((await post({ kind: 'aviso', emails: 'nao-e-email' })).status).toBe(400);
  expect((await post({ kind: 'x', emails: 'a@b.com' })).status).toBe(400);
  expect((await post({ kind: 'confirmacao', emails: 'a@b.com' })).status).toBe(409);
});

test('send-email do aviso sem credenciais de e-mail: 500 com mensagem clara', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const old = { u: process.env.EMAIL_USER, p: process.env.EMAIL_PASS };
  delete process.env.EMAIL_USER; delete process.env.EMAIL_PASS;
  try {
    const res = await agent.post(`/api/flight-changes/${c.id}/send-email`).set('X-CSRF-Token', csrf)
      .send({ kind: 'aviso', emails: 'a@b.com' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('falha ao enviar e-mail');
    expect(res.body.details).toMatch(/Credenciais de e-mail/);
  } finally {
    if (old.u !== undefined) process.env.EMAIL_USER = old.u;
    if (old.p !== undefined) process.env.EMAIL_PASS = old.p;
  }
});

test('GET e DELETE de caso inexistente: 404; delete remove', async () => {
  const { agent, csrf } = await authed();
  expect((await agent.get('/api/flight-changes/999999')).status).toBe(404);
  expect((await agent.delete('/api/flight-changes/999999').set('X-CSRF-Token', csrf)).status).toBe(404);
  const c = await criarCaso(agent, csrf);
  expect((await agent.delete(`/api/flight-changes/${c.id}`).set('X-CSRF-Token', csrf)).status).toBe(204);
  expect((await agent.get(`/api/flight-changes/${c.id}`)).status).toBe(404);
});

test('caso de outro usuário não é acessível (isolamento por user_id)', async () => {
  const { agent, csrf } = await authed();
  const outro = await new Promise((res, rej) =>
    db.run(`INSERT INTO users (email, nome, password_hash, role, criado_em) VALUES ('outro@test.com', 'Outro', 'x', 'user', datetime('now'))`, function (e) { e ? rej(e) : res(this.lastID); }));
  const id = await new Promise((res, rej) =>
    db.run(`INSERT INTO flight_changes (user_id, old_json) VALUES (?, '{}')`, [outro], function (e) { e ? rej(e) : res(this.lastID); }));
  expect((await agent.get(`/api/flight-changes/${id}`)).status).toBe(404);
  expect((await agent.delete(`/api/flight-changes/${id}`).set('X-CSRF-Token', csrf)).status).toBe(404);
  expect((await agent.post(`/api/flight-changes/${id}/notice-sent`).set('X-CSRF-Token', csrf)).status).toBe(404);
  const f = pdf('x');
  expect((await agent.post(`/api/flight-changes/${id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts)).status).toBe(404);
  expect((await agent.put(`/api/flight-changes/${id}/new`).set('X-CSRF-Token', csrf).send({ unified: {} })).status).toBe(404);
  expect((await agent.post(`/api/flight-changes/${id}/confirm`).set('X-CSRF-Token', csrf)).status).toBe(404);
  expect((await agent.post(`/api/flight-changes/${id}/send-email`).set('X-CSRF-Token', csrf).send({ kind: 'aviso', emails: 'a@b.com' })).status).toBe(404);
});

describe('e-mail do aviso', () => {
  const v = { reservation: { locator: 'ABC123' }, route: { origin: 'GRU', destination: 'REC' },
    passengers: [{ name: '<script>x</script> MARIA' }], trips: [{ dateLabel: '12 SET 2026' }] };
  test('inclui o botão de WhatsApp só quando há telefone de suporte', () => {
    expect(buildNoticeEmailHtml(v, { supportPhone: '48999991234' })).toContain('https://wa.me/5548999991234?text=');
    expect(buildNoticeEmailHtml(v, {})).not.toContain('wa.me');
  });
  test('escapa HTML vindo do voucher', () => {
    expect(buildNoticeEmailHtml(v, {})).not.toContain('<script>');
  });
  test('ida e volta citam as duas datas', () => {
    const iv = { ...v, trips: [{ dateLabel: '12 SET 2026' }, { dateLabel: '19 SET 2026' }] };
    expect(buildNoticeEmailHtml(iv, {})).toContain('GRU → REC, 12 SET 2026 e 19 SET 2026');
  });
});
