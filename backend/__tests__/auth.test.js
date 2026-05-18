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

  afterAll((done) => {
    db.close(done);
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
