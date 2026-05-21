process.env.EXTRACTION_MODE = 'stub';
const request = require('supertest');
const { makePromoApp, waitForDb, getCsrfFromResponse } = require('./testApp');

let app;
beforeAll(async () => { app = makePromoApp(); await waitForDb(); await new Promise(r => setTimeout(r, 600)); });

async function authed() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
  const meRes = await agent.get('/api/auth/me');
  const csrf = getCsrfFromResponse(meRes);
  return { agent, csrf };
}

test('extract requires auth', async () => {
  // CSRF middleware is mounted at /api BEFORE requireAuth (mirrors real server.js),
  // so an unauthenticated mutating POST is rejected by CSRF (403) before reaching
  // the auth guard (401). Either way the request is rejected without a valid session.
  const res = await request(app).post('/api/promotions/extract');
  expect([401, 403]).toContain(res.status);
});

test('extract returns promotion + safe workspace urls (no internal paths)', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/promotions/extract').set('X-CSRF-Token', csrf)
    .attach('print', Buffer.from('fake'), 'p.jpg');
  expect(res.status).toBe(200);
  expect(res.body.promotion).toBeDefined();
  expect(res.body.promotion.promo_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(res.body.workspace.print_url).toMatch(/^\/api\/promotions\/[0-9a-f-]+\/file\//);
  expect(JSON.stringify(res.body)).not.toContain('output');           // no internal/abs path
  // Customer-facing payload must be clean; the commission lives only in _meta as an
  // operator-only alert (this response never reaches the customer).
  expect(JSON.stringify(res.body.promotion)).not.toContain('227');
  expect(res.body._meta.agency_commission_detected).toBe(227);
});

test('render-message returns commission-free text', async () => {
  const { agent, csrf } = await authed();
  const promotion = {
    origin_city: 'Salvador', destination_city: 'Maceió', nights: 6, passengers: 2,
    display_availability: 'Agosto', flight_type: 'Direto', airlines: ['GOL'], baggage: ['carry_on'],
    hotel_name: 'Hotel X', hotel_stars: 3, hotel_rating_value: 8.3, meal_plan: 'Café da Manhã',
    installments: 10, installment_amount: 374.70, total_price: 3747, cta_text: 'Reserve agora',
    _meta: { agency_commission_detected: 227 }
  };
  const res = await agent.post('/api/promotions/render-message').set('X-CSRF-Token', csrf).send({ promotion });
  expect(res.status).toBe(200);
  expect(res.body.message_text).toContain('Maceió');
  expect(res.body.message_text).not.toContain('227');
});

test('validate returns structured result', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/promotions/validate').set('X-CSRF-Token', csrf)
    .send({ promotion: { origin_code: 'SSA', destination_code: 'BPS', total_price: 2411, installments: 10, installment_amount: 241.10, hotel_name: 'H', airlines: ['GOL'] } });
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('valid');
  expect(res.body).toHaveProperty('warnings');
});
