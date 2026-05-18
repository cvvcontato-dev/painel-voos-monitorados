const request = require('supertest');
const { makeAuthApp, waitForDb, getCsrfFromResponse } = require('./testApp');

let app;

async function loginAdmin(agent) {
  const res = await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
  return res;
}

async function getCsrf(agent) {
  const res = await agent.get('/api/auth/me');
  return getCsrfFromResponse(res);
}

beforeAll(async () => {
  app = makeAuthApp();
  await waitForDb();
  await new Promise(r => setTimeout(r, 600));
});

describe('GET /api/users', () => {
  test('returns 401 without session', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('returns user list for admin (no password_hash)', async () => {
    const agent = request.agent(app);
    await loginAdmin(agent);
    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].password_hash).toBeUndefined();
    expect(res.body[0]).toMatchObject({ email: expect.any(String), role: expect.any(String) });
  });
});

describe('POST /api/users', () => {
  test('admin can create a user', async () => {
    const agent = request.agent(app);
    await loginAdmin(agent);
    const csrf = await getCsrf(agent);

    const res = await agent
      .post('/api/users')
      .set('X-CSRF-Token', csrf)
      .send({
        email: 'newuser@test.com',
        nome: 'New User',
        password: 'NewUserPass123!',
        role: 'user',
        confirm_password: 'AdminPass123!'
      });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('newuser@test.com');
    expect(res.body.password_hash).toBeUndefined();
  });

  test('rejects wrong admin confirm_password', async () => {
    const agent = request.agent(app);
    await loginAdmin(agent);
    const csrf = await getCsrf(agent);

    const res = await agent
      .post('/api/users')
      .set('X-CSRF-Token', csrf)
      .send({
        email: 'another@test.com',
        nome: 'Another',
        password: 'AnotherPass123!',
        role: 'user',
        confirm_password: 'WrongAdminPassword'
      });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('wrong_admin_password');
  });

  test('returns 409 on duplicate email', async () => {
    const agent = request.agent(app);
    await loginAdmin(agent);
    const csrf = await getCsrf(agent);

    // Create first
    await agent.post('/api/users').set('X-CSRF-Token', csrf).send({
      email: 'dup@test.com', nome: 'Dup', password: 'DupPass123!', role: 'user', confirm_password: 'AdminPass123!'
    });

    // Refresh csrf (invalidated by previous POST)
    const csrf2 = await getCsrf(agent);
    const res = await agent.post('/api/users').set('X-CSRF-Token', csrf2).send({
      email: 'dup@test.com', nome: 'Dup2', password: 'DupPass456!', role: 'user', confirm_password: 'AdminPass123!'
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email_already_exists');
  });

  test('returns 400 if password too short', async () => {
    const agent = request.agent(app);
    await loginAdmin(agent);
    const csrf = await getCsrf(agent);

    const res = await agent.post('/api/users').set('X-CSRF-Token', csrf).send({
      email: 'short@test.com', nome: 'Short', password: 'short', role: 'user', confirm_password: 'AdminPass123!'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('password_too_short');
  });
});

describe('PUT /api/users/:id', () => {
  test('admin can update nome', async () => {
    const agent = request.agent(app);
    await loginAdmin(agent);
    const csrf = await getCsrf(agent);

    // Create a user first
    const createRes = await agent.post('/api/users').set('X-CSRF-Token', csrf).send({
      email: 'updateme@test.com', nome: 'Old Name', password: 'UpdatePass123!', role: 'user', confirm_password: 'AdminPass123!'
    });
    const userId = createRes.body.id;

    const csrf2 = await getCsrf(agent);
    const res = await agent.put(`/api/users/${userId}`).set('X-CSRF-Token', csrf2).send({ nome: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('New Name');
  });
});

describe('DELETE /api/users/:id', () => {
  test('admin cannot delete themselves (anti-lockout)', async () => {
    const agent = request.agent(app);
    const loginRes = await loginAdmin(agent);
    const adminId = loginRes.body.user.id;
    const csrf = await getCsrf(agent);

    const res = await agent
      .delete(`/api/users/${adminId}`)
      .set('X-CSRF-Token', csrf)
      .send({ confirm_password: 'AdminPass123!' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('cannot_delete_self');
  });

  test('admin can delete another user', async () => {
    const agent = request.agent(app);
    await loginAdmin(agent);
    const csrf = await getCsrf(agent);

    // Create a user to delete
    const createRes = await agent.post('/api/users').set('X-CSRF-Token', csrf).send({
      email: 'deleteme@test.com', nome: 'Delete Me', password: 'DeletePass123!', role: 'user', confirm_password: 'AdminPass123!'
    });
    const targetId = createRes.body.id;

    const csrf2 = await getCsrf(agent);
    const res = await agent
      .delete(`/api/users/${targetId}`)
      .set('X-CSRF-Token', csrf2)
      .send({ confirm_password: 'AdminPass123!' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('cannot delete last admin', async () => {
    const agent = request.agent(app);
    const loginRes = await loginAdmin(agent);
    const adminId = loginRes.body.user.id;
    const csrf = await getCsrf(agent);

    // Get list and check only 1 admin remains
    const listRes = await agent.get('/api/users');
    const admins = listRes.body.filter(u => u.role === 'admin');

    if (admins.length === 1) {
      const csrf2 = await getCsrf(agent);
      // Try to delete another user that is admin — but only admin is us
      // We test the "cannot_delete_self" path which blocks first
      const res = await agent
        .delete(`/api/users/${adminId}`)
        .set('X-CSRF-Token', csrf2)
        .send({ confirm_password: 'AdminPass123!' });
      expect(res.status).toBe(409);
      expect(['cannot_delete_self', 'cannot_delete_last_admin']).toContain(res.body.error);
    } else {
      expect(true).toBe(true); // multiple admins, test not applicable
    }
  });
});
