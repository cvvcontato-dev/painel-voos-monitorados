const request = require('supertest');
const { makeDashboardApp, waitForDb, getCsrfFromResponse } = require('./testApp');
const db = require('../database');

let app;
beforeAll(async () => {
  app = makeDashboardApp();
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

describe('GET /api/dashboard/summary', () => {
  test('retorna 401 se nao autenticado', async () => {
    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(401);
  });

  test('retorna estrutura com contadores consolidados do painel', async () => {
    const { agent } = await authed();
    const res = await agent.get('/api/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('precos');
    expect(res.body).toHaveProperty('alteracoes');
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('vouchers');
    expect(typeof res.body.precos.alertas).toBe('number');
    expect(typeof res.body.precos.total).toBe('number');
    expect(typeof res.body.alteracoes.pendentes).toBe('number');
    expect(typeof res.body.status.atencao).toBe('number');
    expect(typeof res.body.status.ativos).toBe('number');
    expect(typeof res.body.vouchers.total).toBe('number');
  });
});
