const request = require('supertest');
const { makeApp, waitForDb } = require('./testApp');

function futureDate(daysFromNow = 30) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
const FUTURE = futureDate(30);

let app;

beforeAll(async () => {
  app = makeApp();
  await waitForDb();
});

describe('POST /api/monitored-flights', () => {
  test('creates a valid monitored flight', async () => {
    const res = await request(app).post('/api/monitored-flights').send({
      cliente: 'João Silva',
      numero_voo: 'LA8084',
      data_voo: FUTURE,
      email_cliente: 'joao@example.com',
      cadencia_minutos: 60
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      cliente: 'João Silva',
      numero_voo: 'LA8084',
      data_voo: FUTURE,
      cadencia_minutos: 60,
      monitoramento_ativo: 1
    });
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.proxima_verificacao).toBeTruthy();
  });

  test('rejects invalid numero_voo', async () => {
    const res = await request(app).post('/api/monitored-flights').send({
      cliente: 'X', numero_voo: 'lol!', data_voo: FUTURE
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/numero_voo/i);
  });

  test('rejects invalid data_voo format', async () => {
    const res = await request(app).post('/api/monitored-flights').send({
      cliente: 'X', numero_voo: 'LA1234', data_voo: '22/05/2099'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/data_voo/i);
  });

  test('rejects data_voo too far in the past', async () => {
    const res = await request(app).post('/api/monitored-flights').send({
      cliente: 'X', numero_voo: 'LA1234', data_voo: '2000-01-01'
    });
    expect(res.status).toBe(400);
  });

  test('rejects data_voo too far in the future', async () => {
    const res = await request(app).post('/api/monitored-flights').send({
      cliente: 'X', numero_voo: 'LA1234', data_voo: '2099-05-22'
    });
    expect(res.status).toBe(400);
  });

  test('rejects invalid cadencia_minutos', async () => {
    const res = await request(app).post('/api/monitored-flights').send({
      cliente: 'X', numero_voo: 'LA1234', data_voo: FUTURE, cadencia_minutos: 7
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cadencia/i);
  });

  test('409 on duplicate (numero_voo, data_voo, cliente)', async () => {
    const body = { cliente: 'Maria', numero_voo: 'LA9999', data_voo: FUTURE };
    await request(app).post('/api/monitored-flights').send(body);
    const dup = await request(app).post('/api/monitored-flights').send(body);
    expect(dup.status).toBe(409);
  });
});

describe('GET /api/monitored-flights', () => {
  test('returns array', async () => {
    const res = await request(app).get('/api/monitored-flights');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/monitored-flights/:id', () => {
  test('returns detail with history (empty initially)', async () => {
    const created = await request(app).post('/api/monitored-flights').send({
      cliente: 'Detail Test', numero_voo: 'LA7777', data_voo: FUTURE
    });
    const res = await request(app).get(`/api/monitored-flights/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.flight.id).toBe(created.body.id);
    expect(Array.isArray(res.body.history)).toBe(true);
  });

  test('404 when not found', async () => {
    const res = await request(app).get('/api/monitored-flights/999999');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/monitored-flights/:id', () => {
  test('updates cadencia and recalculates proxima_verificacao', async () => {
    const created = await request(app).post('/api/monitored-flights').send({
      cliente: 'PUT Test', numero_voo: 'LA6666', data_voo: FUTURE, cadencia_minutos: 60
    });
    const original = created.body.proxima_verificacao;
    const res = await request(app).put(`/api/monitored-flights/${created.body.id}`).send({
      cadencia_minutos: 240
    });
    expect(res.status).toBe(200);
    expect(res.body.cadencia_minutos).toBe(240);
    expect(res.body.proxima_verificacao).not.toBe(original);
  });
});

describe('POST /api/monitored-flights/:id/toggle', () => {
  test('flips monitoramento_ativo', async () => {
    const created = await request(app).post('/api/monitored-flights').send({
      cliente: 'Toggle Test', numero_voo: 'LA5555', data_voo: FUTURE
    });
    expect(created.body.monitoramento_ativo).toBe(1);
    const t1 = await request(app).post(`/api/monitored-flights/${created.body.id}/toggle`);
    expect(t1.body.monitoramento_ativo).toBe(0);
    const t2 = await request(app).post(`/api/monitored-flights/${created.body.id}/toggle`);
    expect(t2.body.monitoramento_ativo).toBe(1);
  });
});

describe('DELETE /api/monitored-flights/:id', () => {
  test('deletes and cascades history', async () => {
    const created = await request(app).post('/api/monitored-flights').send({
      cliente: 'Del Test', numero_voo: 'LA4444', data_voo: FUTURE
    });
    const del = await request(app).delete(`/api/monitored-flights/${created.body.id}`);
    expect(del.status).toBe(200);
    const after = await request(app).get(`/api/monitored-flights/${created.body.id}`);
    expect(after.status).toBe(404);
  });
});
