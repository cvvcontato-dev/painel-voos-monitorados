// Set env vars before any require('../database') runs
const path = require('path');
const fs = require('fs');
process.env.DB_PATH = path.join(__dirname, '.tmp');
if (!fs.existsSync(process.env.DB_PATH)) fs.mkdirSync(process.env.DB_PATH);
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'AdminPass123!';

const { hash, compare } = require('../helpers/password');

describe('password helpers', () => {
  test('hash returns a bcrypt string', async () => {
    const h = await hash('secret123');
    expect(h).toMatch(/^\$2[ab]\$/);
  });

  test('compare returns true for correct password', async () => {
    const h = await hash('hello');
    expect(await compare('hello', h)).toBe(true);
  });

  test('compare returns false for wrong password', async () => {
    const h = await hash('hello');
    expect(await compare('world', h)).toBe(false);
  });
});

describe('database migrations', () => {
  const db = require('../database');

  beforeAll(async () => {
    // Wait for tables to exist
    await new Promise(resolve => setTimeout(resolve, 300));
  });

  test('users table exists', (done) => {
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", [], (err, row) => {
      expect(err).toBeNull();
      expect(row).toBeTruthy();
      done();
    });
  });

  test('auth_audit_log table exists', (done) => {
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_audit_log'", [], (err, row) => {
      expect(err).toBeNull();
      expect(row).toBeTruthy();
      done();
    });
  });
});

describe('requireAuth middleware', () => {
  const requireAuth = require('../middleware/requireAuth');

  function makeReqRes(session = {}) {
    const req = { session };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    return { req, res, next };
  }

  test('calls next when session has userId', () => {
    const { req, res, next } = makeReqRes({ userId: 1 });
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 401 when session is empty', () => {
    const { req, res, next } = makeReqRes({});
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'auth_required' });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAdmin middleware', () => {
  const requireAdmin = require('../middleware/requireAdmin');

  function makeReqRes(session = {}) {
    const req = { session };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    return { req, res, next };
  }

  test('calls next when role is admin', () => {
    const { req, res, next } = makeReqRes({ userId: 1, role: 'admin' });
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 403 when role is user', () => {
    const { req, res, next } = makeReqRes({ userId: 1, role: 'user' });
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

const request = require('supertest');
const { makeAuthApp, getCsrfFromResponse, waitForDb } = require('./testApp');

describe('auth routes', () => {
  let app;

  beforeAll(async () => {
    app = makeAuthApp();
    await waitForDb();
    // Give admin seed a moment to complete
    await new Promise(r => setTimeout(r, 600));
  });

  describe('GET /api/auth/me — unauthenticated', () => {
    test('returns 401 when no session', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('auth_required');
    });
  });

  describe('POST /api/auth/login', () => {
    test('returns 401 for wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'wrongpassword' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid_credentials');
    });

    test('returns 401 for unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid_credentials');
    });

    test('returns 200 and user data on valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'AdminPass123!' });
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        email: 'admin@test.com',
        role: 'admin'
      });
      expect(res.body.user.password_hash).toBeUndefined();
    });

    test('sets cvv.sid session cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'AdminPass123!' });
      expect(res.headers['set-cookie']).toBeDefined();
      const cookies = res.headers['set-cookie'].join('');
      expect(cookies).toContain('cvv.sid');
    });
  });

  describe('GET /api/auth/me — authenticated', () => {
    test('returns user when session is valid', async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
      const res = await agent.get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ email: 'admin@test.com', role: 'admin' });
      expect(res.body.password_hash).toBeUndefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    test('destroys session; subsequent /me returns 401', async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });

      // Get csrf token
      const meRes = await agent.get('/api/auth/me');
      const csrf = getCsrfFromResponse(meRes);

      const logoutRes = await agent
        .post('/api/auth/logout')
        .set('X-CSRF-Token', csrf);
      expect(logoutRes.status).toBe(200);

      const afterRes = await agent.get('/api/auth/me');
      expect(afterRes.status).toBe(401);
    });

    test('returns 200 even without a session (idempotent)', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/auth/change-password', () => {
    test('returns 401 if current password is wrong', async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
      const meRes = await agent.get('/api/auth/me');
      const csrf = getCsrfFromResponse(meRes);

      const res = await agent
        .post('/api/auth/change-password')
        .set('X-CSRF-Token', csrf)
        .send({ current_password: 'wrong', new_password: 'NewPass456!' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('wrong_current_password');
    });

    test('returns 400 if new password is too short', async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
      const meRes = await agent.get('/api/auth/me');
      const csrf = getCsrfFromResponse(meRes);

      const res = await agent
        .post('/api/auth/change-password')
        .set('X-CSRF-Token', csrf)
        .send({ current_password: 'AdminPass123!', new_password: 'short' });
      expect(res.status).toBe(400);
    });
  });
});

describe('protected routes require auth', () => {
  let app;
  beforeAll(async () => {
    app = makeAuthApp();
    await waitForDb();
    await new Promise(r => setTimeout(r, 600));
  });

  test('GET /api/ping returns 401 without session', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(401);
  });

  test('GET /api/ping returns 200 with valid session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
    const res = await agent.get('/api/ping');
    expect(res.status).toBe(200);
  });
});

describe('sessions table json_extract compatibility', () => {
  let app;
  beforeAll(async () => {
    app = makeAuthApp();
    await waitForDb();
    await new Promise(r => setTimeout(r, 600));
  });

  test('json_extract can read userId from sessions after login', async () => {
    const db = require('../database');
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
    const userId = loginRes.body.user?.id;

    await new Promise(r => setTimeout(r, 200)); // let session write settle

    const row = await new Promise((resolve, reject) => {
      db.get(
        "SELECT sess, json_extract(sess, '$.userId') as extracted_uid FROM sessions LIMIT 1",
        [],
        (err, row) => { if (err) reject(err); else resolve(row); }
      );
    });

    // If this test fails, the connect-sqlite3 version uses a different field name.
    // See spec §4.3 fallback: create user_sessions auxiliary table instead.
    expect(row).toBeTruthy();
    expect(Number(row.extracted_uid)).toBe(userId);
  });
});
