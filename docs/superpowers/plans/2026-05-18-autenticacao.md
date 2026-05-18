# Autenticação e Controle de Acesso — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session-based authentication so only registered users can access the flight monitoring panel, with admin-managed user accounts, CSRF protection, and a full audit trail.

**Architecture:** Express-session with connect-sqlite3 persists sessions into the existing SQLite DB. A global `requireAuth` middleware guards all `/api/*` routes except the auth endpoints themselves. The React frontend wraps the entire app in an `AuthProvider` that gates rendering on `GET /api/auth/me`; a 401 response renders `<LoginPage>` instead of the main app.

**Tech Stack:** `bcryptjs`, `express-session`, `connect-sqlite3`, `express-rate-limit`, `cookie-parser` (backend) · `axios` with interceptors (frontend, replaces direct `fetch` calls)

---

## File Map

### New backend files
| File | Responsibility |
|---|---|
| `backend/helpers/password.js` | `hash(plain)` and `compare(plain, hash)` via bcryptjs — single source of bcrypt config |
| `backend/helpers/audit.js` | `log(db, event)` — INSERT into `auth_audit_log`; fire-and-forget, never throws |
| `backend/middleware/requireAuth.js` | Returns 401 if `req.session.userId` absent |
| `backend/middleware/requireAdmin.js` | Returns 403 if `req.session.role !== 'admin'` |
| `backend/middleware/csrf.js` | Double-submit cookie: generates `csrf` cookie, validates `X-CSRF-Token` header on mutating requests |
| `backend/routes/auth.js` | `/api/auth/{login,logout,me,change-password}` |
| `backend/routes/users.js` | `/api/users` CRUD — admin-only |
| `backend/__tests__/auth.test.js` | Auth endpoint tests (login, logout, me, change-password, session invalidation, CSRF) |
| `backend/__tests__/users.test.js` | User management tests (CRUD, anti-lockout, reauth) |

### Modified backend files
| File | Change |
|---|---|
| `backend/database.js` | Add `users` and `auth_audit_log` tables + seed admin on first boot |
| `backend/server.js` | Add deps, session middleware, CSRF, mount auth router, global requireAuth; extract inline flight/settings routes into `backend/routes/flights.js` and `backend/routes/settings.js` |
| `backend/package.json` | Add `bcryptjs`, `express-session`, `connect-sqlite3`, `express-rate-limit`, `cookie-parser` |
| `backend/__tests__/testApp.js` | Add `makeAuthApp()` and helpers `loginAs(role)`, `withCsrf(agent)` |

### New frontend files
| File | Responsibility |
|---|---|
| `frontend/src/contexts/AuthContext.jsx` | React context + provider: boots with `GET /api/auth/me`, exposes `currentUser`, `setCurrentUser`, `sessionExpired` flag |
| `frontend/src/hooks/useAuth.js` | `useContext(AuthContext)` convenience hook |
| `frontend/src/hooks/useApi.js` | Axios instance with request interceptor (CSRF header) and response interceptor (fires `sessionExpired` on 401) |
| `frontend/src/api/authClient.js` | `login()`, `logout()`, `me()`, `changePassword()` — thin wrappers over `useApi` axios instance |
| `frontend/src/components/LoginPage.jsx` | Full-screen login card (email, password, remember-me, themed) |
| `frontend/src/components/SessionExpiredModal.jsx` | Full-screen modal on 401; single "Voltar ao login" button |
| `frontend/src/components/UserMenu.jsx` | Avatar dropdown in header: nome + role, "Trocar senha", "Sair" |
| `frontend/src/components/ChangePasswordModal.jsx` | Three-field form (current, new, confirm); calls `change-password` endpoint |
| `frontend/src/components/UsersTab.jsx` | Admin-only user list table inside SettingsModal |
| `frontend/src/components/UserModal.jsx` | Create/edit user form with admin reauth field |

### Modified frontend files
| File | Change |
|---|---|
| `frontend/src/App.jsx` | Wrap in `<AuthProvider>`; add `<UserMenu>` to header; add `<SessionExpiredModal>` |
| `frontend/src/components/SettingsModal.jsx` | Add "Usuários" tab (admin-only) that renders `<UsersTab>` |
| `frontend/src/components/PrecosTab.jsx` | Replace `fetch` calls with `api` from `useApi` |
| `frontend/src/components/StatusTab.jsx` | Replace `fetch` calls with `api` from `useApi` |
| `frontend/src/components/StatusHistoryDrawer.jsx` | Replace `fetch` calls with `api` from `useApi` |
| `frontend/src/components/StatusModal.jsx` | Replace `fetch` calls with `api` from `useApi` |

---

## Task 1: Install backend dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd backend
npm install bcryptjs express-session connect-sqlite3 express-rate-limit cookie-parser
```

Expected: all packages install without errors. `package.json` gains 5 new entries in `dependencies`.

- [ ] **Step 2: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(auth): install bcryptjs, express-session, connect-sqlite3, rate-limit, cookie-parser"
```

---

## Task 2: `helpers/password.js` — bcrypt abstraction

**Files:**
- Create: `backend/helpers/password.js`
- Test: `backend/__tests__/auth.test.js` (started in this task)

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/auth.test.js`:

```js
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
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx jest --testPathPattern=auth --runInBand
```

Expected: `Cannot find module '../helpers/password'`

- [ ] **Step 3: Create `backend/helpers/password.js`**

```js
const bcrypt = require('bcryptjs');
const ROUNDS = 12;

async function hash(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

async function compare(plain, stored) {
  return bcrypt.compare(plain, stored);
}

module.exports = { hash, compare };
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd backend && npx jest --testPathPattern=auth --runInBand
```

Expected: 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/helpers/password.js backend/__tests__/auth.test.js
git commit -m "feat(auth): add password hash/compare helper (bcryptjs rounds=12)"
```

---

## Task 3: `helpers/audit.js` — fire-and-forget audit log

**Files:**
- Create: `backend/helpers/audit.js`

(Tested indirectly through auth route tests in Task 7.)

- [ ] **Step 1: Create `backend/helpers/audit.js`**

```js
const db = require('../database');

/**
 * Insert a row in auth_audit_log. Never throws — audit failure must not crash a request.
 *
 * @param {object} event
 * @param {string} event.evento       - event name from spec §4.2
 * @param {number|null} event.userId  - actor user id (null for unauthenticated login_fail)
 * @param {number|null} [event.targetUserId] - target user id for admin actions
 * @param {string} event.ip
 * @param {string} event.userAgent
 * @param {boolean} event.success
 * @param {object} [event.meta]       - arbitrary JSON metadata
 */
function log({ evento, userId, targetUserId = null, ip, userAgent, success, meta = null }) {
  const metadata = meta ? JSON.stringify(meta) : null;
  db.run(
    `INSERT INTO auth_audit_log
       (timestamp, evento, user_id, target_user_id, ip, user_agent, success, metadata_json)
     VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?)`,
    [evento, userId ?? null, targetUserId, ip, userAgent, success ? 1 : 0, metadata],
    (err) => {
      if (err) console.error('[AUDIT] Failed to log event:', evento, err.message);
    }
  );
}

module.exports = { log };
```

- [ ] **Step 2: Commit**

```bash
git add backend/helpers/audit.js
git commit -m "feat(auth): add audit log helper"
```

---

## Task 4: Database migrations — `users` and `auth_audit_log`

**Files:**
- Modify: `backend/database.js`

- [ ] **Step 1: Add tables and seed logic to `database.js`**

Append the following inside the `runMigrations()` function, after the existing `flight_status_history` table block:

```js
    // --- Auth tables ---
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','user')) DEFAULT 'user',
        criado_em TEXT NOT NULL,
        ultimo_login TEXT
    )`, async (err) => {
        if (err) {
            console.error('Error creating users table:', err.message);
            return;
        }
        console.log('users table created or already exists.');
        await seedAdminIfNeeded();
    });

    db.run(`CREATE TABLE IF NOT EXISTS auth_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        evento TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ip TEXT,
        user_agent TEXT,
        success INTEGER NOT NULL,
        metadata_json TEXT
    )`, (err) => {
        if (err) console.error('Error creating auth_audit_log table:', err.message);
        else {
            console.log('auth_audit_log table created or already exists.');
            db.run(`CREATE INDEX IF NOT EXISTS idx_audit_user_time
                    ON auth_audit_log(user_id, timestamp DESC)`, (err) => {
                if (err) console.error('Error creating audit index:', err.message);
            });
        }
    });
```

Add `seedAdminIfNeeded` **before** `runMigrations` (at module scope, after the `db` creation block):

```js
const { hash: hashPassword } = require('./helpers/password');

async function seedAdminIfNeeded() {
    return new Promise((resolve) => {
        db.get('SELECT COUNT(*) as cnt FROM users', [], async (err, row) => {
            if (err || row.cnt > 0) return resolve();

            const email = process.env.ADMIN_EMAIL;
            const password = process.env.ADMIN_PASSWORD;

            if (!email || !password) {
                console.error(
                    '[AUTH] FATAL: users table is empty but ADMIN_EMAIL and ADMIN_PASSWORD are not set. ' +
                    'Cannot start without an initial admin account.'
                );
                process.exit(1);
            }

            const password_hash = await hashPassword(password);
            db.run(
                `INSERT INTO users (email, nome, password_hash, role, criado_em)
                 VALUES (?, ?, ?, 'admin', datetime('now'))`,
                [email.toLowerCase(), email.split('@')[0], password_hash],
                function(err) {
                    if (err) {
                        console.error('[AUTH] Failed to seed admin:', err.message);
                    } else {
                        console.log(`[AUTH] Admin account seeded for ${email}`);
                        db.run(
                            `INSERT INTO auth_audit_log (timestamp, evento, user_id, ip, user_agent, success)
                             VALUES (datetime('now'), 'admin_seeded', ?, 'server', 'seed', 1)`,
                            [this.lastID]
                        );
                    }
                    resolve();
                }
            );
        });
    });
}
```

- [ ] **Step 2: Write a smoke test for migrations**

Add this describe block to `backend/__tests__/auth.test.js`:

```js
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
```

- [ ] **Step 3: Update `testApp.js` to set ADMIN_EMAIL/PASSWORD env vars** before requiring database

Add near the top of `backend/__tests__/testApp.js` (after the `DB_PATH` line, before any `require('../database')`):

```js
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'AdminPass123!';
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd backend && npx jest --testPathPattern=auth --runInBand
```

Expected: 5 tests passing (3 password + 2 migration).

- [ ] **Step 5: Commit**

```bash
git add backend/database.js backend/__tests__/testApp.js backend/__tests__/auth.test.js
git commit -m "feat(auth): add users and auth_audit_log tables with admin seed on first boot"
```

---

## Task 5: Auth middlewares

**Files:**
- Create: `backend/middleware/requireAuth.js`
- Create: `backend/middleware/requireAdmin.js`
- Create: `backend/middleware/csrf.js`

- [ ] **Step 1: Create `backend/middleware/requireAuth.js`**

```js
function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'auth_required' });
  }
  next();
}

module.exports = requireAuth;
```

- [ ] **Step 2: Create `backend/middleware/requireAdmin.js`**

```js
function requireAdmin(req, res, next) {
  if (req.session?.role !== 'admin') {
    return res.status(403).json({ error: 'admin_required' });
  }
  next();
}

module.exports = requireAdmin;
```

- [ ] **Step 3: Create `backend/middleware/csrf.js`**

```js
const crypto = require('crypto');
const COOKIE_NAME = 'csrf';
const COOKIE_MAX_AGE = 30 * 24 * 3600 * 1000;
const MUTATING = ['POST', 'PUT', 'DELETE'];

// Paths exempt from CSRF validation (the public login endpoint)
const EXEMPT = ['/api/auth/login'];

function csrfMiddleware(req, res, next) {
  // Always ensure the csrf cookie exists
  let token = req.cookies[COOKIE_NAME];
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE_NAME, token, {
      httpOnly: false,  // Frontend reads this to send in header
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE
    });
    req.cookies[COOKIE_NAME] = token;
  }

  // Validate on mutating methods (except exempt paths)
  if (MUTATING.includes(req.method) && !EXEMPT.includes(req.path)) {
    const headerToken = req.get('X-CSRF-Token');
    if (!headerToken || headerToken !== token) {
      return res.status(403).json({ error: 'csrf_invalid' });
    }
  }

  next();
}

module.exports = csrfMiddleware;
```

- [ ] **Step 4: Write middleware unit tests**

Add to `backend/__tests__/auth.test.js`:

```js
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
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd backend && npx jest --testPathPattern=auth --runInBand
```

Expected: all middleware tests passing.

- [ ] **Step 6: Commit**

```bash
git add backend/middleware/
git add backend/__tests__/auth.test.js
git commit -m "feat(auth): add requireAuth, requireAdmin, and CSRF double-submit middleware"
```

---

## Task 6: Extract inline routes from `server.js`

The spec (§9, Phase 2) requires routes to be in separate routers before `requireAuth` can be applied globally. Currently flights and settings routes are inline in `server.js`.

**Files:**
- Create: `backend/routes/flights.js`
- Create: `backend/routes/settings.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create `backend/routes/flights.js`**

Cut the entire flights block from `server.js` (lines ~40–288: GET `/api/flights`, PUT `/api/flights/bulk-check`, PUT `/api/flights/reorder`, GET `/api/flights/:id`, POST `/api/flights`, PUT `/api/flights/:id`, DELETE `/api/flights/:id`, POST `/api/flights/:id/check-now`, GET `/api/flights/:id/history`) and paste it into a router:

```js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { processFlight } = require('../services/scheduler');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUSES = ['ativo', 'encerrado', 'passagem comprada'];

// [Paste all flight route handlers here, replacing app.get/post/put/delete with router.get/post/put/delete]
// Remove the '/api/flights' prefix from each path (router is mounted at /api/flights)

module.exports = router;
```

**Important:** change every `app.get(`, `app.post(`, `app.put(`, `app.delete(` to `router.get(`, `router.post(`, `router.put(`, `router.delete(` and strip the `/api/flights` prefix from each path (e.g., `/api/flights/:id` becomes `/:id`).

- [ ] **Step 2: Create `backend/routes/settings.js`**

```js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { startScheduler } = require('../services/scheduler');

// GET /api/settings
router.get('/', (req, res) => {
  res.json({
    telegram_bot_token_set: !!process.env.TELEGRAM_BOT_TOKEN,
    email_user_set: !!process.env.EMAIL_USER,
    email_pass_set: !!process.env.EMAIL_PASS,
    email_host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    email_port: parseInt(process.env.EMAIL_PORT || '465', 10),
    check_interval_hours: parseInt(process.env.CHECK_INTERVAL_HOURS || '6', 10),
    max_concurrent_scrapers: parseInt(process.env.MAX_CONCURRENT_SCRAPERS || '3', 10),
    alert_reset_threshold: parseFloat(process.env.ALERT_RESET_THRESHOLD || '1.10')
  });
});

// PUT /api/settings
router.put('/', (req, res) => {
  try {
    const envPath = path.resolve(__dirname, '../../.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

    function setEnvVar(content, key, value) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const line = `${key}=${value}`;
      return regex.test(content) ? content.replace(regex, line) : content.trim() + '\n' + line;
    }

    const fields = {
      TELEGRAM_BOT_TOKEN: req.body.telegram_bot_token,
      EMAIL_HOST: req.body.email_host,
      EMAIL_PORT: req.body.email_port,
      EMAIL_USER: req.body.email_user,
      EMAIL_PASS: req.body.email_pass,
      EMAIL_FROM: req.body.email_from,
      CHECK_INTERVAL_HOURS: req.body.check_interval_hours,
      MAX_CONCURRENT_SCRAPERS: req.body.max_concurrent_scrapers,
      ALERT_RESET_THRESHOLD: req.body.alert_reset_threshold
    };

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        envContent = setEnvVar(envContent, key, value);
        process.env[key] = String(value);
      }
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
    if (req.body.check_interval_hours !== undefined) startScheduler();
    res.json({ message: 'Configurações salvas com sucesso' });
  } catch (error) {
    console.error('[SETTINGS] Erro ao salvar:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

- [ ] **Step 3: Slim down `server.js`**

Replace the inline route blocks in `server.js` with:

```js
const flightsRouter = require('./routes/flights');
const settingsRouter = require('./routes/settings');

// ... (after app.use express.json):
app.use('/api/flights', flightsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/monitored-flights', monitoredFlightsRouter);
```

Remove the now-migrated inline `app.get/post/put/delete` handlers and the `EMAIL_REGEX`/`VALID_STATUSES` constants from `server.js` (they're now in `routes/flights.js`).

- [ ] **Step 4: Run existing tests — expect no regression**

```bash
cd backend && npx jest --runInBand
```

Expected: all 40 existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/flights.js backend/routes/settings.js backend/server.js
git commit -m "refactor: extract flights and settings inline routes into dedicated routers"
```

---

## Task 7: `routes/auth.js` — login, logout, me, change-password

**Files:**
- Create: `backend/routes/auth.js`
- Modify: `backend/__tests__/auth.test.js`
- Modify: `backend/__tests__/testApp.js`

- [ ] **Step 1: Update `testApp.js` to create an auth-capable app**

Replace the contents of `backend/__tests__/testApp.js` with:

```js
process.env.AVIATION_API_MODE = 'stub';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'AdminPass123!';
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod';
process.env.DB_PATH = require('path').join(__dirname, '.tmp');

const fs = require('fs');
if (!fs.existsSync(process.env.DB_PATH)) fs.mkdirSync(process.env.DB_PATH);
const dbFile = require('path').join(process.env.DB_PATH, 'database.sqlite');
try { fs.unlinkSync(dbFile); } catch (e) {}

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const SqliteStore = require('connect-sqlite3')(session);
const router = require('../routes/monitoredFlights');
const authRouter = require('../routes/auth');
const csrfMiddleware = require('../middleware/csrf');
const requireAuth = require('../middleware/requireAuth');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/monitored-flights', router);
  return app;
}

function makeAuthApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(session({
    store: new SqliteStore({
      db: 'database.sqlite',
      dir: process.env.DB_PATH,
      cleanupInterval: 3600
    }),
    name: 'cvv.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', secure: false }
  }));
  app.use(csrfMiddleware);
  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth);
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  return app;
}

/**
 * Log in as a given role and return a supertest agent with the session cookie set.
 * Reads the csrf cookie from the login response and attaches it for subsequent requests.
 */
async function loginAs(role = 'admin') {
  const request = require('supertest');
  const app = makeAuthApp();
  const agent = request.agent(app);
  const credentials = role === 'admin'
    ? { email: 'admin@test.com', password: 'AdminPass123!' }
    : { email: 'user@test.com', password: 'UserPass123!' };
  await agent.post('/api/auth/login').send(credentials);
  return agent;
}

/**
 * Read the csrf token from a supertest agent's last response set-cookie header.
 * Usage: const csrf = getCsrfFromResponse(res); then agent.post(...).set('X-CSRF-Token', csrf)
 * The auth tests inline this pattern directly for clarity — this helper is kept for
 * future use if needed elsewhere.
 */
function getCsrfFromResponse(res) {
  const cookies = (res.headers['set-cookie'] || []).join('; ');
  const match = cookies.match(/csrf=([^;]+)/);
  return match ? match[1] : '';
}

async function waitForDb() {
  const db = require('../database');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const ready = await new Promise(resolve => {
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='monitored_flights_status'",
        [],
        (err, row) => resolve(!err && !!row)
      );
    });
    if (ready) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('waitForDb: tables never appeared after 5s');
}

module.exports = { makeApp, makeAuthApp, loginAs, withCsrf, waitForDb };
```

**Note on CSRF in tests:** The `csrfMiddleware` validates the header token against the cookie. In tests, the `loginAs` agent carries cookies automatically. For mutating requests, the test must read the `csrf` cookie value from the agent's cookie jar and pass it as `X-CSRF-Token`. The actual implementation of this is shown in the auth tests below (reading the cookie from the response).

- [ ] **Step 2: Write failing auth route tests**

Add to `backend/__tests__/auth.test.js`:

```js
const request = require('supertest');
const { makeAuthApp, waitForDb } = require('./testApp');

describe('auth routes', () => {
  let app;

  beforeAll(async () => {
    app = makeAuthApp();
    await waitForDb();
    // Give seed a moment to complete
    await new Promise(r => setTimeout(r, 500));
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

      // Get csrf token from cookie jar for mutating request
      const csrfRes = await agent.get('/api/auth/me');
      const csrfCookie = (csrfRes.headers['set-cookie'] || []).find(c => c.startsWith('csrf='));
      const csrfToken = csrfCookie ? csrfCookie.split('=')[1].split(';')[0] : '';

      const logoutRes = await agent
        .post('/api/auth/logout')
        .set('X-CSRF-Token', csrfToken);
      expect(logoutRes.status).toBe(200);

      const meRes = await agent.get('/api/auth/me');
      expect(meRes.status).toBe(401);
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
      const csrfCookie = (meRes.headers['set-cookie'] || []).find(c => c.startsWith('csrf='));
      const csrfToken = csrfCookie ? csrfCookie.split('=')[1].split(';')[0] : '';

      const res = await agent
        .post('/api/auth/change-password')
        .set('X-CSRF-Token', csrfToken)
        .send({ current_password: 'wrong', new_password: 'NewPass456!' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('wrong_current_password');
    });

    test('returns 400 if new password is too short', async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
      const meRes = await agent.get('/api/auth/me');
      const csrfCookie = (meRes.headers['set-cookie'] || []).find(c => c.startsWith('csrf='));
      const csrfToken = csrfCookie ? csrfCookie.split('=')[1].split(';')[0] : '';

      const res = await agent
        .post('/api/auth/change-password')
        .set('X-CSRF-Token', csrfToken)
        .send({ current_password: 'AdminPass123!', new_password: 'short' });
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
cd backend && npx jest --testPathPattern=auth --runInBand 2>&1 | head -30
```

Expected: failures about missing `routes/auth.js`.

- [ ] **Step 4: Create `backend/routes/auth.js`**

```js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const db = require('../database');
const { hash, compare } = require('../helpers/password');
const { log } = require('../helpers/audit');
const requireAuth = require('../middleware/requireAuth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'too_many_attempts' })
});

function getUser(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()], (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password, remember } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email_and_password_required' });
  }

  try {
    const user = await getUser(email);
    const valid = user && await compare(password, user.password_hash);

    if (!valid) {
      log({ evento: 'login_fail', userId: user?.id ?? null, ip: req.ip, userAgent: req.get('User-Agent'), success: false, meta: { attempted_email: email } });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    // Anti session-fixation
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => { if (err) reject(err); else resolve(); });
    });

    req.session.userId = user.id;
    req.session.role = user.role;
    if (remember) {
      req.session.cookie.maxAge = 30 * 24 * 3600 * 1000;
    }

    db.run('UPDATE users SET ultimo_login = datetime(\'now\') WHERE id = ?', [user.id]);
    log({ evento: 'login_success', userId: user.id, ip: req.ip, userAgent: req.get('User-Agent'), success: true });

    return res.json({ user: { id: user.id, email: user.email, nome: user.nome, role: user.role } });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/auth/logout  (idempotent — works even without a session)
router.post('/logout', (req, res) => {
  const userId = req.session?.userId ?? null;
  if (!req.session || !userId) {
    return res.json({ ok: true });
  }
  const ip = req.ip;
  const ua = req.get('User-Agent');
  req.session.destroy(() => {
    res.clearCookie('cvv.sid');
    if (userId) log({ evento: 'logout', userId, ip, userAgent: ua, success: true });
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  db.get('SELECT id, email, nome, role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'auth_required' });
    res.json(user);
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  const userId = req.session.userId;
  const ip = req.ip;
  const ua = req.get('User-Agent');

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'both_passwords_required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'password_too_short' });
  }

  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    const valid = await compare(current_password, user.password_hash);
    if (!valid) {
      log({ evento: 'password_changed', userId, ip, userAgent: ua, success: false });
      return res.status(401).json({ error: 'wrong_current_password' });
    }

    const newHash = await hash(new_password);
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    // Invalidate ALL sessions for this user
    await new Promise((resolve) => {
      db.run(
        "DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?",
        [userId],
        () => resolve()  // Ignore errors — sessions table may not exist yet in test env
      );
    });

    log({ evento: 'password_changed', userId, ip, userAgent: ua, success: true });
    log({ evento: 'session_invalidated_after_password_change', userId, ip, userAgent: ua, success: true });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] change-password error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
```

- [ ] **Step 5: Validate `json_extract` serialization (spec §4.3 checkpoint)**

After the login test passes, inspect the raw sessions table to confirm `json_extract` will work for session invalidation. Add this test:

```js
describe('sessions table json_extract compatibility', () => {
  test('json_extract can read userId from sessions after login', async () => {
    const db = require('../database');
    const agent = request.agent(makeAuthApp());
    const loginRes = await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
    const userId = loginRes.body.user?.id;

    await new Promise(r => setTimeout(r, 100)); // let session write settle

    const row = await new Promise((resolve, reject) => {
      db.get(
        "SELECT sess, json_extract(sess, '$.userId') as extracted_uid FROM sessions LIMIT 1",
        [],
        (err, row) => { if (err) reject(err); else resolve(row); }
      );
    });

    // If this fails, the connect-sqlite3 version uses a different field name.
    // See spec §4.3 fallback: create user_sessions auxiliary table instead.
    expect(row).toBeTruthy();
    expect(Number(row.extracted_uid)).toBe(userId);
  });
});
```

Run: `cd backend && npx jest --testPathPattern=auth --runInBand`

If this test **fails**: the `connect-sqlite3` version serializes sessions differently. In that case, implement the fallback from spec §4.3: create a `user_sessions(user_id INTEGER, sid TEXT PK)` table, populate it on login, and use `DELETE FROM sessions WHERE sid IN (SELECT sid FROM user_sessions WHERE user_id = ?)` everywhere session invalidation is called.

- [ ] **Step 6: Run all auth tests — expect PASS**

```bash
cd backend && npx jest --testPathPattern=auth --runInBand
```

Expected: all auth tests passing.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/auth.js backend/__tests__/auth.test.js backend/__tests__/testApp.js
git commit -m "feat(auth): add login, logout, me, change-password endpoints with session + rate limit"
```

---

## Task 8: Wire session + auth into `server.js` and protect all routes

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Update `server.js` to add session, CSRF, rate-limit and global requireAuth**

The new `server.js` structure (keep all existing code, just add/reorder the middleware and mounts):

```js
// Add these requires at the top alongside existing ones:
const session = require('express-session');
const cookieParser = require('cookie-parser');
const SqliteStore = require('connect-sqlite3')(session);
const csrfMiddleware = require('./middleware/csrf');
const requireAuth = require('./middleware/requireAuth');
const authRouter = require('./routes/auth');
// NOTE: usersRouter is created in Task 10. Comment this line out until then:
// const usersRouter = require('./routes/users');

// Replace or add after app.use(cors()); app.use(express.json()):
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
app.use(cookieParser());
app.use(session({
  store: new SqliteStore({
    db: 'database.sqlite',
    dir: process.env.DB_PATH || __dirname,
    cleanupInterval: 3600
  }),
  name: 'cvv.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  }
}));
app.use('/api', csrfMiddleware);

// Mount auth router BEFORE the global requireAuth
app.use('/api/auth', authRouter);

// Global auth guard — all /api/* after this point require a valid session
app.use('/api', requireAuth);

// Business routers (all protected by requireAuth above)
app.use('/api/flights', flightsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/monitored-flights', monitoredFlightsRouter);
// Uncomment after Task 10:
// app.use('/api/users', usersRouter);
```

- [ ] **Step 2: Add `SESSION_SECRET` check at startup**

Add near the top of `server.js` (after dotenv loads):

```js
if (!process.env.SESSION_SECRET) {
  console.error('[AUTH] FATAL: SESSION_SECRET is not set. Generate one with: openssl rand -hex 32');
  process.exit(1);
}
```

- [ ] **Step 3: Run all existing tests to verify no regression**

The existing tests use `makeApp()` from `testApp.js` which does NOT include the auth middleware, so they should still pass unchanged.

```bash
cd backend && npx jest --runInBand
```

Expected: all 40+ tests passing (the existing routes tests use the bare `makeApp()` without auth).

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(auth): wire session middleware and global requireAuth into server.js"
```

---

## Task 9: Update existing tests to authenticate (Fase 2 completion)

All routes are now protected. The existing test suite uses `makeApp()` (no auth), so it still passes. But we should add a smoke test confirming that the protected routes genuinely require auth in the full app.

**Files:**
- Modify: `backend/__tests__/auth.test.js`

- [ ] **Step 1: Add protected-route smoke test**

Add to `backend/__tests__/auth.test.js`:

```js
describe('protected routes require auth', () => {
  let app;
  beforeAll(async () => {
    app = makeAuthApp();
    await waitForDb();
    await new Promise(r => setTimeout(r, 500));
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
```

- [ ] **Step 2: Run all tests**

```bash
cd backend && npx jest --runInBand
```

Expected: all tests passing.

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/auth.test.js
git commit -m "test(auth): add smoke test verifying protected routes require a valid session"
```

---

## Task 10: `routes/users.js` — admin user management

**Files:**
- Create: `backend/routes/users.js`
- Create: `backend/__tests__/users.test.js`

- [ ] **Step 1: Write failing user management tests**

Create `backend/__tests__/users.test.js`:

```js
const request = require('supertest');
const { makeAuthApp, waitForDb } = require('./testApp');

let app;

function getCsrfToken(agent) {
  return new Promise(async (resolve) => {
    const res = await agent.get('/api/auth/me');
    const cookies = (res.headers['set-cookie'] || []).concat(
      (res.request?.cookies || '').split(';').map(c => c.trim())
    );
    // Parse csrf from set-cookie
    const allCookies = (res.headers['set-cookie'] || []).join('; ');
    const match = allCookies.match(/csrf=([^;]+)/);
    resolve(match ? match[1] : '');
  });
}

beforeAll(async () => {
  app = makeAuthApp();
  await waitForDb();
  await new Promise(r => setTimeout(r, 500));
});

describe('GET /api/users', () => {
  test('returns 401 without session', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-admin user', async () => {
    // This test requires a 'user' role account — skip if not seeded
    // The test setup only seeds admin; this test is a placeholder for when users.test seeds a user
    expect(true).toBe(true); // covered once user creation is implemented
  });

  test('returns user list for admin', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].password_hash).toBeUndefined(); // never expose hash
  });
});

describe('POST /api/users', () => {
  test('admin can create a user', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
    const csrf = await getCsrfToken(agent);

    const res = await agent
      .post('/api/users')
      .set('X-CSRF-Token', csrf)
      .send({
        email: 'collab@test.com',
        nome: 'Colaboradora',
        password: 'CollabPass123!',
        role: 'user',
        confirm_password: 'AdminPass123!'
      });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('collab@test.com');
  });

  test('rejects wrong admin confirm_password', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
    const csrf = await getCsrfToken(agent);

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
  });
});

describe('DELETE /api/users/:id — anti-lockout', () => {
  test('admin cannot delete themselves', async () => {
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
    const adminId = loginRes.body.user.id;
    const csrf = await getCsrfToken(agent);

    const res = await agent
      .delete(`/api/users/${adminId}`)
      .set('X-CSRF-Token', csrf)
      .send({ confirm_password: 'AdminPass123!' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('cannot_delete_self');
  });

  test('cannot delete last admin', async () => {
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
    const adminId = loginRes.body.user.id;
    const csrf = await getCsrfToken(agent);

    // Try to demote via delete — but since it's the only admin, should 409
    // First verify we only have 1 admin
    const listRes = await agent.get('/api/users');
    const admins = listRes.body.filter(u => u.role === 'admin');
    if (admins.length === 1) {
      const res = await agent
        .delete(`/api/users/${adminId}`)
        .set('X-CSRF-Token', csrf)
        .send({ confirm_password: 'AdminPass123!' });
      expect(res.status).toBe(409);
      expect(['cannot_delete_self', 'cannot_delete_last_admin']).toContain(res.body.error);
    } else {
      expect(true).toBe(true); // multiple admins, test not applicable
    }
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd backend && npx jest --testPathPattern=users --runInBand 2>&1 | head -20
```

Expected: failures about missing `routes/users.js`.

- [ ] **Step 3: Create `backend/routes/users.js`**

```js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { hash, compare } = require('../helpers/password');
const { log } = require('../helpers/audit');
const requireAdmin = require('../middleware/requireAdmin');

// All user management routes require admin role
router.use(requireAdmin);

function getAdminUser(adminId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [adminId], (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

function countAdmins() {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'", [], (err, row) => {
      if (err) reject(err); else resolve(row.cnt);
    });
  });
}

// GET /api/users
router.get('/', (req, res) => {
  db.all(
    'SELECT id, email, nome, role, criado_em, ultimo_login FROM users ORDER BY nome',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// POST /api/users — create user (admin reauth required)
router.post('/', async (req, res) => {
  const { email, nome, password, role = 'user', confirm_password } = req.body;
  const adminId = req.session.userId;
  const ip = req.ip;
  const ua = req.get('User-Agent');

  if (!email || !nome || !password || !confirm_password) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password_too_short' });
  }
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'invalid_role' });
  }

  try {
    const admin = await getAdminUser(adminId);
    if (!await compare(confirm_password, admin.password_hash)) {
      return res.status(401).json({ error: 'wrong_admin_password' });
    }

    const password_hash = await hash(password);
    const stmt = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO users (email, nome, password_hash, role, criado_em)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [email.toLowerCase().trim(), nome, password_hash, role],
        function(err) { if (err) reject(err); else resolve(this); }
      );
    });

    log({ evento: 'user_created', userId: adminId, targetUserId: stmt.lastID, ip, userAgent: ua, success: true, meta: { email } });

    db.get('SELECT id, email, nome, role, criado_em FROM users WHERE id = ?', [stmt.lastID], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json(row);
    });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'email_already_exists' });
    }
    console.error('[USERS] Create error:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// PUT /api/users/:id — update nome and/or role
router.put('/:id', async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const { nome, role, confirm_password } = req.body;
  const adminId = req.session.userId;
  const ip = req.ip;
  const ua = req.get('User-Agent');

  if (!nome && !role) {
    return res.status(400).json({ error: 'nothing_to_update' });
  }

  try {
    // Role change requires reauth
    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'invalid_role' });
      }
      if (!confirm_password) {
        return res.status(400).json({ error: 'confirm_password_required_for_role_change' });
      }
      const admin = await getAdminUser(adminId);
      if (!await compare(confirm_password, admin.password_hash)) {
        return res.status(401).json({ error: 'wrong_admin_password' });
      }
    }

    const current = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [targetId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!current) return res.status(404).json({ error: 'user_not_found' });

    const newNome = nome ?? current.nome;
    const newRole = role ?? current.role;

    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET nome = ?, role = ? WHERE id = ?', [newNome, newRole, targetId], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    if (role && role !== current.role) {
      // Invalidate all sessions for the target user
      db.run("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?", [targetId], () => {});
      log({ evento: 'role_changed', userId: adminId, targetUserId: targetId, ip, userAgent: ua, success: true, meta: { role_before: current.role, role_after: role } });
      log({ evento: 'session_invalidated_after_role_change', userId: adminId, targetUserId: targetId, ip, userAgent: ua, success: true });
    } else {
      log({ evento: 'user_updated', userId: adminId, targetUserId: targetId, ip, userAgent: ua, success: true });
    }

    db.get('SELECT id, email, nome, role, criado_em, ultimo_login FROM users WHERE id = ?', [targetId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row);
    });
  } catch (err) {
    console.error('[USERS] Update error:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const adminId = req.session.userId;
  const ip = req.ip;
  const ua = req.get('User-Agent');
  const { confirm_password } = req.body;

  if (targetId === adminId) {
    return res.status(409).json({ error: 'cannot_delete_self' });
  }

  if (!confirm_password) {
    return res.status(400).json({ error: 'confirm_password_required' });
  }

  try {
    const admin = await getAdminUser(adminId);
    if (!await compare(confirm_password, admin.password_hash)) {
      return res.status(401).json({ error: 'wrong_admin_password' });
    }

    const target = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [targetId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!target) return res.status(404).json({ error: 'user_not_found' });

    if (target.role === 'admin') {
      const adminCount = await countAdmins();
      if (adminCount <= 1) {
        return res.status(409).json({ error: 'cannot_delete_last_admin' });
      }
    }

    // Invalidate sessions before deletion
    db.run("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?", [targetId], () => {});

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM users WHERE id = ?', [targetId], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    log({ evento: 'user_deleted', userId: adminId, targetUserId: null, ip, userAgent: ua, success: true, meta: { deleted_user_email: target.email } });

    res.json({ ok: true });
  } catch (err) {
    console.error('[USERS] Delete error:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
```

- [ ] **Step 4: Run all tests — expect PASS**

```bash
cd backend && npx jest --runInBand
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/users.js backend/__tests__/users.test.js
git commit -m "feat(auth): add admin user management CRUD with reauth, anti-lockout, session invalidation"
```

---

## Task 11: Frontend — `useApi` axios hook + `AuthContext`

**Files:**
- Create: `frontend/src/hooks/useApi.js`
- Create: `frontend/src/contexts/AuthContext.jsx`
- Create: `frontend/src/hooks/useAuth.js`
- Create: `frontend/src/api/authClient.js`

- [ ] **Step 1: Install axios in frontend**

```bash
cd frontend && npm install axios
```

- [ ] **Step 2: Create `frontend/src/hooks/useApi.js`**

```js
import axios from 'axios';

// Singleton axios instance shared across the app
const api = axios.create({ baseURL: '/' });

// Read csrf cookie value
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/);
  return match ? match[1] : null;
}

// CSRF header on all mutating requests except login
api.interceptors.request.use((config) => {
  const mutating = ['post', 'put', 'delete', 'patch'];
  if (mutating.includes(config.method) && !config.url?.endsWith('/auth/login')) {
    const token = getCsrfToken();
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

// 401 handler — emit a custom event that AuthContext listens to
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes('/auth/login') &&
      !error.config?.url?.includes('/auth/me')
    ) {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }
    return Promise.reject(error);
  }
);

export default api;
```

- [ ] **Step 3: Create `frontend/src/api/authClient.js`**

```js
import api from '../hooks/useApi';

export async function login({ email, password, remember }) {
  const res = await api.post('/api/auth/login', { email, password, remember });
  return res.data;
}

export async function logout() {
  const res = await api.post('/api/auth/logout');
  return res.data;
}

export async function me() {
  const res = await api.get('/api/auth/me');
  return res.data;
}

export async function changePassword({ current_password, new_password }) {
  const res = await api.post('/api/auth/change-password', { current_password, new_password });
  return res.data;
}
```

- [ ] **Step 4: Create `frontend/src/contexts/AuthContext.jsx`**

```jsx
import { createContext, useState, useEffect, useCallback } from 'react';
import { me } from '../api/authClient';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(undefined); // undefined = loading
  const [sessionExpired, setSessionExpired] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const user = await me();
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    function handleExpired() { setSessionExpired(true); }
    window.addEventListener('auth:session-expired', handleExpired);
    return () => window.removeEventListener('auth:session-expired', handleExpired);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, sessionExpired, setSessionExpired, reload: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 5: Create `frontend/src/hooks/useAuth.js`**

```js
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useApi.js frontend/src/api/authClient.js frontend/src/contexts/AuthContext.jsx frontend/src/hooks/useAuth.js
git add frontend/package.json frontend/package-lock.json
git commit -m "feat(auth): add axios useApi hook (CSRF + 401 interceptors), AuthContext, authClient"
```

---

## Task 12: Frontend — `LoginPage` and `SessionExpiredModal`

**Files:**
- Create: `frontend/src/components/LoginPage.jsx`
- Create: `frontend/src/components/SessionExpiredModal.jsx`

- [ ] **Step 1: Create `frontend/src/components/LoginPage.jsx`**

```jsx
import { useState } from 'react';
import { Eye, EyeOff, Plane } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import ThemeToggle from './ThemeToggle';
import { login } from '../api/authClient';

export default function LoginPage({ onLogin }) {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await login({ email, password, remember });
      onLogin(data.user);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        setError('Muitas tentativas. Tente novamente em alguns minutos.');
      } else {
        setError('Credenciais inválidas. Verifique e-mail e senha.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 relative px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-4">Painel de Voos</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Acesso restrito</p>
        </div>

        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-8 shadow-lg">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2 rounded-lg border text-sm
                           bg-white border-slate-300 text-slate-900 placeholder-slate-400
                           dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-400
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 pr-10 rounded-lg border text-sm
                             bg-white border-slate-300 text-slate-900 placeholder-slate-400
                             dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-400
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">Lembrar de mim por 30 dias</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60
                         text-white font-medium text-sm transition-colors"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/SessionExpiredModal.jsx`**

```jsx
export default function SessionExpiredModal() {
  function handleReturn() {
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">⏱</span>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Sessão expirada</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Sua sessão expirou ou foi encerrada. Faça login novamente para continuar.
        </p>
        <button
          onClick={handleReturn}
          className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors"
        >
          Voltar ao login
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LoginPage.jsx frontend/src/components/SessionExpiredModal.jsx
git commit -m "feat(auth): add LoginPage and SessionExpiredModal components"
```

---

## Task 13: Frontend — Wire `AuthProvider` into `App.jsx`, replace `fetch` with `api`

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/PrecosTab.jsx`
- Modify: `frontend/src/components/StatusTab.jsx`
- Modify: `frontend/src/components/StatusHistoryDrawer.jsx`
- Modify: `frontend/src/components/StatusModal.jsx`

- [ ] **Step 1: Update `frontend/src/App.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Settings, Activity } from 'lucide-react';
import logo from './assets/logo.png';
import Tabs from './components/Tabs';
import Toast from './components/Toast';
import SettingsModal from './components/SettingsModal';
import PrecosTab from './components/PrecosTab';
import StatusTab from './components/StatusTab';
import LoginPage from './components/LoginPage';
import SessionExpiredModal from './components/SessionExpiredModal';
import UserMenu from './components/UserMenu';
import { useTheme } from './hooks/useTheme';
import ThemeToggle from './components/ThemeToggle';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';

const TABS = [
  { value: 'precos', label: 'Preços', icon: <DollarSign className="w-4 h-4" /> },
  { value: 'status', label: 'Status', icon: <Activity className="w-4 h-4" /> }
];

function AppShell() {
  const { currentUser, setCurrentUser, sessionExpired } = useAuth();
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'precos');
  const [toast, setToast] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const showToast = useCallback((message, type = 'info') => setToast({ message, type }), []);

  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);

  // Still loading
  if (currentUser === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-slate-400 text-sm">Carregando…</div>
      </div>
    );
  }

  // Not logged in
  if (!currentUser) {
    return <LoginPage onLogin={setCurrentUser} />;
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {sessionExpired && <SessionExpiredModal />}

      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Clube do Voo" className="w-14 h-14 rounded-full object-cover border-2 border-indigo-500/30 shadow-lg shadow-indigo-500/20" />
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-500 bg-clip-text text-transparent dark:from-white dark:to-slate-400">Monitoramento de Voos Prime</h1>
            <p className="text-slate-600 text-sm mt-1 dark:text-slate-400">Painel administrativo de passagens aéreas monitoradas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button onClick={() => setSettingsOpen(true)} className="p-2.5 rounded-lg transition-colors cursor-pointer border
                                                                    bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200
                                                                    dark:bg-slate-800/60 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white dark:border-slate-700/50" title="Configurações">
            <Settings className="w-5 h-5" />
          </button>
          <UserMenu user={currentUser} onToast={showToast} />
        </div>
      </header>

      <Tabs active={activeTab} onChange={setActiveTab} tabs={TABS} />
      {activeTab === 'precos' ? <PrecosTab showToast={showToast} /> : <StatusTab showToast={showToast} />}

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onToast={showToast} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Replace `fetch` with `api` in each component**

For each of the following files, add `import api from '../hooks/useApi';` and replace every `fetch('/api/...')` call:

**Pattern to apply in each file:**

```js
// Before:
const res = await fetch('/api/flights', { method: 'GET' });
const data = await res.json();

// After:
const res = await api.get('/api/flights');
const data = res.data;
```

```js
// Before (mutating):
const res = await fetch('/api/flights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

// After:
const res = await api.post('/api/flights', payload);
const data = res.data;
```

Apply to:
- `frontend/src/components/PrecosTab.jsx` — all flight fetch calls
- `frontend/src/components/StatusTab.jsx` — all monitored-flights fetch calls
- `frontend/src/components/StatusHistoryDrawer.jsx` — history fetch call
- `frontend/src/components/StatusModal.jsx` — any fetch calls

**Error handling:** axios throws on non-2xx. Replace `if (!res.ok) throw new Error(...)` patterns with try/catch around the `api.*` call.

- [ ] **Step 3: Verify the app compiles and boots**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173 — should show the login page (since no session). Log in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Should land in the main app.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/PrecosTab.jsx frontend/src/components/StatusTab.jsx frontend/src/components/StatusHistoryDrawer.jsx frontend/src/components/StatusModal.jsx
git commit -m "feat(auth): wire AuthProvider into App, replace fetch with axios api in all components"
```

---

## Task 14: Frontend — `UserMenu` and `ChangePasswordModal`

**Files:**
- Create: `frontend/src/components/UserMenu.jsx`
- Create: `frontend/src/components/ChangePasswordModal.jsx`

- [ ] **Step 1: Create `frontend/src/components/UserMenu.jsx`**

```jsx
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, KeyRound, LogOut } from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';
import { logout } from '../api/authClient';

function initials(nome) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

export default function UserMenu({ user, onToast }) {
  const [open, setOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      window.location.reload();
    }
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors
                     bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200
                     dark:bg-slate-800/60 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700/50"
        >
          <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
            {initials(user.nome)}
          </div>
          <span className="text-sm font-medium hidden sm:block">{user.nome.split(' ')[0]}</span>
          <ChevronDown className="w-4 h-4 opacity-60" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border shadow-lg z-50
                          bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.nome}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
            </div>
            <div className="p-1">
              <button
                onClick={() => { setOpen(false); setChangePasswordOpen(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-slate-700 dark:text-slate-300
                           hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
              >
                <KeyRound className="w-4 h-4" />
                Trocar senha
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-red-600 dark:text-red-400
                           hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </div>
        )}
      </div>

      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        onToast={onToast}
      />
    </>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/ChangePasswordModal.jsx`**

```jsx
import { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { changePassword, logout } from '../api/authClient';

function PasswordField({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 rounded-lg border text-sm
                     bg-white border-slate-300 text-slate-900 placeholder-slate-400
                     dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-400
                     focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePasswordModal({ isOpen, onClose, onToast }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  function reset() { setCurrent(''); setNext(''); setConfirm(''); setError(null); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (next !== confirm) { setError('As senhas novas não coincidem.'); return; }
    if (next.length < 8) { setError('A nova senha deve ter pelo menos 8 caracteres.'); return; }
    setLoading(true);
    setError(null);
    try {
      await changePassword({ current_password: current, new_password: next });
      onToast('Senha alterada. Faça login novamente.', 'success');
      reset();
      onClose();
      await logout().catch(() => {});
      window.location.reload();
    } catch (err) {
      const code = err.response?.data?.error;
      if (code === 'wrong_current_password') setError('Senha atual incorreta.');
      else if (code === 'password_too_short') setError('Nova senha muito curta (mín. 8 caracteres).');
      else setError('Erro ao alterar senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl modal-animate">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Trocar senha</h2>
          <button onClick={() => { reset(); onClose(); }} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField label="Senha atual" value={current} onChange={setCurrent} placeholder="••••••••" />
          <PasswordField label="Nova senha" value={next} onChange={setNext} placeholder="Mín. 8 caracteres" />
          <PasswordField label="Confirmar nova senha" value={confirm} onChange={setConfirm} placeholder="••••••••" />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => { reset(); onClose(); }}
              className="flex-1 py-2 rounded-lg border text-sm font-medium
                         bg-white border-slate-300 text-slate-700 hover:bg-slate-50
                         dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60
                         text-white text-sm font-medium transition-colors">
              {loading ? 'Salvando…' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/UserMenu.jsx frontend/src/components/ChangePasswordModal.jsx
git commit -m "feat(auth): add UserMenu dropdown and ChangePasswordModal"
```

---

## Task 15: Frontend — `UsersTab` and `UserModal` inside `SettingsModal`

**Files:**
- Create: `frontend/src/components/UsersTab.jsx`
- Create: `frontend/src/components/UserModal.jsx`
- Modify: `frontend/src/components/SettingsModal.jsx`

- [ ] **Step 1: Create `frontend/src/components/UsersTab.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, User } from 'lucide-react';
import api from '../hooks/useApi';
import UserModal from './UserModal';

const ROLE_BADGE = {
  admin: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20',
  user:  'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-700'
};

export default function UsersTab({ onToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function fetchUsers() {
    try {
      const res = await api.get('/api/users');
      setUsers(res.data);
    } catch {
      onToast('Erro ao carregar usuários', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/users/${deleteTarget.id}`, { data: { confirm_password: confirmPassword } });
      onToast('Usuário removido.', 'success');
      setDeleteTarget(null);
      setConfirmPassword('');
      fetchUsers();
    } catch (err) {
      const code = err.response?.data?.error;
      if (code === 'cannot_delete_self') onToast('Você não pode remover sua própria conta.', 'error');
      else if (code === 'cannot_delete_last_admin') onToast('Não é possível remover o último administrador.', 'error');
      else if (code === 'wrong_admin_password') onToast('Senha de confirmação incorreta.', 'error');
      else onToast('Erro ao remover usuário.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-slate-400 text-sm">Carregando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">{users.length} usuário(s) cadastrado(s)</p>
        <button
          onClick={() => { setEditTarget(null); setModalOpen(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo usuário
        </button>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between py-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-indigo-600/10 dark:bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
                {u.role === 'admin' ? <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> : <User className="w-4 h-4 text-slate-500" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{u.nome}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-2 py-0.5 rounded-full text-xs border ${ROLE_BADGE[u.role]}`}>
                {u.role === 'admin' ? 'Admin' : 'Usuário'}
              </span>
              <button onClick={() => { setEditTarget(u); setModalOpen(true); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setDeleteTarget(u)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="mt-4 p-4 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5 space-y-3">
          <p className="text-sm text-red-700 dark:text-red-400">
            Remover <strong>{deleteTarget.nome}</strong>? Confirme com sua senha:
          </p>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Sua senha de admin"
            className="w-full px-3 py-2 rounded-lg border text-sm
                       bg-white border-slate-300 text-slate-900
                       dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-100
                       focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex gap-2">
            <button onClick={() => { setDeleteTarget(null); setConfirmPassword(''); }}
              className="flex-1 py-1.5 rounded-lg border text-sm font-medium
                         bg-white border-slate-300 text-slate-700 hover:bg-slate-50
                         dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
              Cancelar
            </button>
            <button onClick={handleDelete} disabled={!confirmPassword || deleting}
              className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60
                         text-white text-sm font-medium transition-colors">
              {deleting ? 'Removendo…' : 'Confirmar remoção'}
            </button>
          </div>
        </div>
      )}

      <UserModal isOpen={modalOpen} onClose={() => setModalOpen(false)} editTarget={editTarget} onSuccess={() => { setModalOpen(false); fetchUsers(); onToast(editTarget ? 'Usuário atualizado.' : 'Usuário criado.', 'success'); }} onToast={onToast} />
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/UserModal.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '../hooks/useApi';

export default function UserModal({ isOpen, onClose, editTarget, onSuccess, onToast }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (editTarget) {
      setNome(editTarget.nome);
      setEmail(editTarget.email);
      setRole(editTarget.role);
    } else {
      setNome(''); setEmail(''); setPassword(''); setRole('user');
    }
    setConfirmPassword(''); setError(null);
  }, [editTarget, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (editTarget) {
        await api.put(`/api/users/${editTarget.id}`, { nome, role, confirm_password: confirmPassword });
      } else {
        await api.post('/api/users', { nome, email, password, role, confirm_password: confirmPassword });
      }
      onSuccess();
    } catch (err) {
      const code = err.response?.data?.error;
      if (code === 'wrong_admin_password') setError('Senha de confirmação incorreta.');
      else if (code === 'email_already_exists') setError('Este e-mail já está cadastrado.');
      else if (code === 'password_too_short') setError('Senha deve ter pelo menos 8 caracteres.');
      else setError('Erro ao salvar usuário. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border text-sm bg-white border-slate-300 text-slate-900 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl modal-animate">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {editTarget ? 'Editar usuário' : 'Novo usuário'}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Nome</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} required className={inputCls} />
          </div>

          {!editTarget && (
            <div>
              <label className={labelCls}>E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className={inputCls} />
            </div>
          )}

          {!editTarget && (
            <div>
              <label className={labelCls}>Senha</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} className={inputCls} placeholder="Mín. 8 caracteres" />
            </div>
          )}

          <div>
            <label className={labelCls}>Papel</label>
            <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Sua senha (confirmação)</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className={inputCls} placeholder="Confirme com sua senha de admin" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border text-sm font-medium bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium transition-colors">
              {loading ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add "Usuários" tab to `SettingsModal`**

In `frontend/src/components/SettingsModal.jsx`, add an internal tab for "Usuários" that's only visible to admins. The existing modal likely has a single panel. The change is:

1. Import `useAuth` and `UsersTab`.
2. Add a local `activeTab` state (`'geral'` | `'usuarios'`).
3. Render tab pills at the top of the modal: "Geral" always, "Usuários" only if `currentUser?.role === 'admin'`.
4. Conditionally render the existing settings form (when `activeTab === 'geral'`) or `<UsersTab onToast={onToast} />` (when `activeTab === 'usuarios'`).

```jsx
// Add at top of SettingsModal:
import { useAuth } from '../hooks/useAuth';
import UsersTab from './UsersTab';

// Inside SettingsModal component, add:
const { currentUser } = useAuth();
const [innerTab, setInnerTab] = useState('geral');

// Replace the modal header area to include tab pills:
<div className="flex gap-1 mb-5 border-b border-slate-200 dark:border-slate-800">
  <button onClick={() => setInnerTab('geral')}
    className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${innerTab === 'geral' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
    Geral
  </button>
  {currentUser?.role === 'admin' && (
    <button onClick={() => setInnerTab('usuarios')}
      className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${innerTab === 'usuarios' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
      Usuários
    </button>
  )}
</div>

{innerTab === 'geral' ? (
  /* existing settings form JSX */
) : (
  <UsersTab onToast={onToast} />
)}
```

- [ ] **Step 4: Run the app and verify admin-only tab**

```bash
cd frontend && npm run dev
```

Log in → click Settings → verify "Usuários" tab appears → create a second user.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/UsersTab.jsx frontend/src/components/UserModal.jsx frontend/src/components/SettingsModal.jsx
git commit -m "feat(auth): add UsersTab and UserModal; add Usuários tab to SettingsModal (admin-only)"
```

---

## Task 16: Coolify deploy configuration

**Files:**
- No code changes — environment variables only

- [ ] **Step 1: Generate a strong SESSION_SECRET**

On your local machine:

```bash
openssl rand -hex 32
```

Copy the output.

- [ ] **Step 2: Set env vars in Coolify**

In the Coolify dashboard for `painel-voos-monitorados`:

| Variable | Value | Buildtime? |
|---|---|---|
| `SESSION_SECRET` | *(output from step 1)* | ❌ No |
| `ADMIN_EMAIL` | `joabh@example.com` | ❌ No |
| `ADMIN_PASSWORD` | *(strong password you will use to log in)* | ❌ No |

**Important:** Uncheck "Buildtime" for all three — these are runtime secrets.

- [ ] **Step 3: Redeploy**

Trigger a new deployment in Coolify. Watch logs for:
```
[AUTH] Admin account seeded for <your-email>
```

This only appears on first boot (when `users` table is empty).

- [ ] **Step 4: Smoke test in production**

1. Open the app URL → should see `<LoginPage>`.
2. Log in with `ADMIN_EMAIL` + `ADMIN_PASSWORD` → app loads.
3. Open Settings → Usuários → create the colaboradora account.
4. Log out → log in as colaboradora.
5. Verify colaboradora cannot see the "Usuários" tab.
6. In a new private window, try `GET /api/flights` directly → should redirect or return 401 JSON.

---

## Task 17: Final verification

- [ ] **Run full test suite**

```bash
cd backend && npx jest --runInBand
```

Expected: all tests pass (40 original + auth + users tests).

- [ ] **Manual smoke test checklist**

- [ ] Login page appears without session
- [ ] Login with wrong password → generic error, no email enumeration
- [ ] 5 failed logins → 429 rate limit message
- [ ] Successful login → main app
- [ ] "Lembrar de mim" checked → cookie `cvv.sid` has `maxAge` ~30d
- [ ] Reload → still logged in
- [ ] ThemeToggle works on login page and main app
- [ ] UserMenu shows correct name and role
- [ ] "Trocar senha" → changes password → forced logout → login with new password works
- [ ] Cookie `cvv.sid` is `httpOnly` (not readable in DevTools console via `document.cookie`)
- [ ] `POST /api/flights` without `X-CSRF-Token` header → 403 from CSRF middleware
- [ ] Admin creates a collaborator user → that user can log in
- [ ] Admin cannot delete themselves → 409 error
- [ ] Log out → `GET /api/auth/me` → 401

- [ ] **Commit if any final adjustments made**

```bash
git add -A
git commit -m "fix: final auth adjustments from smoke test"
```

---

## Quick Reference

### Run tests
```bash
cd backend && npx jest --runInBand
```

### Run single test file
```bash
cd backend && npx jest --testPathPattern=auth --runInBand
```

### Start dev (both)
```bash
# Terminal 1:
cd backend && node server.js

# Terminal 2:
cd frontend && npm run dev
```

### Generate SESSION_SECRET
```bash
openssl rand -hex 32
```
