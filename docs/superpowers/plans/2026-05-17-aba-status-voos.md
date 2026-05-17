# Aba "Status de Voos" — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second tab to the existing flight-monitoring SPA that tracks real flight status (cancellations, significant delays, schedule changes) via AeroDataBox (RapidAPI), with separate tables, an independent scheduler cron, and email/Telegram notifications visually distinct from the existing price alerts.

**Architecture:** A parallel feature using the same Node/Express + SQLite + React stack. New tables `monitored_flights_status` and `flight_status_history` live in the same SQLite file. A new `aviationApi.js` service isolates the AeroDataBox client (single point to swap providers later). `statusMonitor.js` polls due flights via an indexed `proxima_verificacao` column and detects status changes with anti-spam guards. `notifier.js` is extended (not refactored) with status templates. Frontend gets a `Tabs` component and a new `StatusTab` that reuses the existing design system.

**Tech Stack:** Node.js 20, Express 5, SQLite (sqlite3), node-cron, nodemailer (existing), Jest + Supertest (new, dev only), React 18, Vite, Tailwind, axios, lucide-react.

**Reference spec:** [docs/superpowers/specs/2026-05-17-aba-status-voos-design.md](../specs/2026-05-17-aba-status-voos-design.md)

---

## File map

### Created
```
backend/
├── services/
│   ├── aviationApi.js          # AeroDataBox client (isolated)
│   ├── statusMonitor.js        # polling + change detection + anti-spam
│   └── statusNotifier.js       # status-specific email/Telegram templates
├── routes/
│   └── monitoredFlights.js     # /api/monitored-flights router
├── helpers/
│   └── time.js                 # UTC helpers + delay math (pure functions)
└── __tests__/
    ├── aviationApi.test.js
    ├── statusMonitor.test.js
    ├── helpers-time.test.js
    └── routes-monitoredFlights.test.js

frontend/src/components/
├── Tabs.jsx                    # tab switcher in header
├── PrecosTab.jsx               # extracted from App.jsx (no rewrite)
├── StatusTab.jsx               # new tab body
├── StatusModal.jsx             # create/edit monitored flight
└── StatusHistoryDrawer.jsx     # timeline of events

docs/superpowers/plans/
└── 2026-05-17-aba-status-voos.md   # this file
```

### Modified
- `backend/database.js` — add migrations for two new tables
- `backend/services/scheduler.js` — register new cron `*/5 * * * *` calling `statusMonitor.checkDueFlights()`
- `backend/server.js` — mount new router via `app.use('/api/monitored-flights', router)`
- `backend/package.json` — add `jest`, `supertest` to devDependencies; add `test` script
- `frontend/src/App.jsx` — replace single-page body with `<Tabs>` + conditional `<PrecosTab/>` or `<StatusTab/>`
- `README.md` (root, if exists; else create) — section "Aba Status" explaining `RAPIDAPI_KEY`

---

## Phase 1 — Schema, helpers, CRUD with API stub

End-state: backend can create/read/update/delete monitored flights, validate inputs, and trigger "check now" against a stubbed `aviationApi` that returns deterministic fake data. End-to-end testable with `curl` without spending real API calls.

### Task 1.1: Add Jest + Supertest infrastructure

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Add test deps and script**

Run:
```bash
cd backend && npm install --save-dev jest supertest
```

Then edit `backend/package.json` so the `scripts` block reads:

```json
"scripts": {
  "start": "node server.js",
  "dev": "node server.js",
  "test": "jest --runInBand"
}
```

And add a `jest` block at the root of `package.json`:

```json
"jest": {
  "testEnvironment": "node",
  "testMatch": ["**/__tests__/**/*.test.js"]
}
```

- [ ] **Step 2: Smoke-test Jest**

Create `backend/__tests__/smoke.test.js`:

```js
test('jest is wired up', () => {
  expect(1 + 1).toBe(2);
});
```

Run: `cd backend && npm test`
Expected: PASS, 1 test.

- [ ] **Step 3: Delete the smoke test and commit**

```bash
rm backend/__tests__/smoke.test.js
git add backend/package.json backend/package-lock.json
git commit -m "chore(backend): add jest + supertest for testing"
```

---

### Task 1.2: Time helpers (pure functions, TDD)

**Files:**
- Create: `backend/helpers/time.js`
- Test: `backend/__tests__/helpers-time.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/helpers-time.test.js`:

```js
const { nowUtcIso, addMinutesUtc, diffMinutes, isOlderThanHours } = require('../helpers/time');

describe('time helpers', () => {
  test('nowUtcIso returns ISO 8601 with Z suffix', () => {
    const s = nowUtcIso();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('addMinutesUtc adds the given minutes', () => {
    const result = addMinutesUtc('2026-05-17T10:00:00.000Z', 15);
    expect(result).toBe('2026-05-17T10:15:00.000Z');
  });

  test('diffMinutes returns positive when b is after a', () => {
    const a = '2026-05-17T10:00:00.000Z';
    const b = '2026-05-17T10:45:00.000Z';
    expect(diffMinutes(a, b)).toBe(45);
  });

  test('diffMinutes returns null when either side is missing', () => {
    expect(diffMinutes(null, '2026-05-17T10:00:00.000Z')).toBeNull();
    expect(diffMinutes('2026-05-17T10:00:00.000Z', null)).toBeNull();
  });

  test('isOlderThanHours true when timestamp is older than threshold', () => {
    const past = addMinutesUtc(nowUtcIso(), -200); // 3h20 ago
    expect(isOlderThanHours(past, 2)).toBe(true);
    expect(isOlderThanHours(past, 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- helpers-time`
Expected: FAIL — `Cannot find module '../helpers/time'`.

- [ ] **Step 3: Implement minimal helpers**

Create `backend/helpers/time.js`:

```js
function nowUtcIso() {
  return new Date().toISOString();
}

function addMinutesUtc(iso, minutes) {
  const d = new Date(iso);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
}

function diffMinutes(aIso, bIso) {
  if (!aIso || !bIso) return null;
  return Math.round((new Date(bIso) - new Date(aIso)) / 60000);
}

function isOlderThanHours(iso, hours) {
  if (!iso) return false;
  return (Date.now() - new Date(iso).getTime()) > hours * 3600 * 1000;
}

module.exports = { nowUtcIso, addMinutesUtc, diffMinutes, isOlderThanHours };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- helpers-time`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/helpers/time.js backend/__tests__/helpers-time.test.js
git commit -m "feat(backend): add UTC time helpers with tests"
```

---

### Task 1.3: Database migrations for status tables

**Files:**
- Modify: `backend/database.js`

- [ ] **Step 1: Add the new tables in `runMigrations()`**

Edit `backend/database.js`. At the end of the `runMigrations()` function (after the `flight_price_history` creation block), append:

```js
    // --- Status monitoring tables ---
    db.run(`CREATE TABLE IF NOT EXISTS monitored_flights_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente TEXT NOT NULL,
        numero_voo TEXT NOT NULL,
        data_voo TEXT NOT NULL,
        origem TEXT,
        destino TEXT,
        companhia TEXT,
        email_cliente TEXT,
        telegram_chat_id TEXT,
        cadencia_minutos INTEGER NOT NULL DEFAULT 60,
        status_atual TEXT,
        partida_programada TEXT,
        partida_estimada TEXT,
        chegada_programada TEXT,
        chegada_estimada TEXT,
        portao TEXT,
        terminal TEXT,
        monitoramento_ativo INTEGER NOT NULL DEFAULT 1,
        ultima_verificacao TEXT,
        proxima_verificacao TEXT,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        UNIQUE(numero_voo, data_voo, cliente)
    )`, (err) => {
        if (err) {
            console.error('Error creating monitored_flights_status table:', err.message);
        } else {
            console.log('monitored_flights_status table created or already exists.');
            db.run(`CREATE INDEX IF NOT EXISTS idx_msf_proxima
                    ON monitored_flights_status(proxima_verificacao)
                    WHERE monitoramento_ativo = 1`, (err) => {
                if (err) console.error('Error creating idx_msf_proxima:', err.message);
            });
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS flight_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitored_flight_id INTEGER NOT NULL,
        verificado_em TEXT NOT NULL,
        evento TEXT NOT NULL,
        payload_json TEXT,
        notificado INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (monitored_flight_id) REFERENCES monitored_flights_status(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating flight_status_history table:', err.message);
        } else {
            console.log('flight_status_history table created or already exists.');
            db.run(`CREATE INDEX IF NOT EXISTS idx_fsh_flight_evento
                    ON flight_status_history(monitored_flight_id, evento, verificado_em DESC)`, (err) => {
                if (err) console.error('Error creating idx_fsh_flight_evento:', err.message);
            });
        }
    });
```

- [ ] **Step 2: Verify migration runs without error**

Run from project root:
```bash
cd backend && rm -f database.sqlite && node -e "require('./database'); setTimeout(()=>process.exit(0),500)"
```

Expected output includes:
```
monitored_flights_status table created or already exists.
flight_status_history table created or already exists.
```

No error lines.

- [ ] **Step 3: Inspect schema**

Run:
```bash
cd backend && sqlite3 database.sqlite ".schema monitored_flights_status"
```

Expected: prints `CREATE TABLE monitored_flights_status (...)` with all columns and the `UNIQUE(numero_voo, data_voo, cliente)` constraint.

If `sqlite3` CLI is not available locally, skip this step (CI/prod will validate on next deploy).

- [ ] **Step 4: Commit**

```bash
git add backend/database.js
git commit -m "feat(backend): add status monitoring tables and indexes"
```

---

### Task 1.4: AeroDataBox client — stub mode (TDD)

**Files:**
- Create: `backend/services/aviationApi.js`
- Test: `backend/__tests__/aviationApi.test.js`

For Phase 1 we only ship the **stub** path. Real HTTP call lands in Phase 2.

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/aviationApi.test.js`:

```js
const aviationApi = require('../services/aviationApi');

describe('aviationApi (stub mode)', () => {
  beforeAll(() => { process.env.AVIATION_API_MODE = 'stub'; });

  test('returns ok=true with normalized shape', async () => {
    const r = await aviationApi.fetchFlightStatus('LA8084', '2026-05-22');
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({
      numero_voo: 'LA8084',
      status: expect.stringMatching(/^(scheduled|active|landed|cancelled|diverted|delayed)$/),
      partida_programada: expect.any(String),
      partida_estimada: expect.any(String),
      chegada_programada: expect.any(String),
      chegada_estimada: expect.any(String)
    });
  });

  test('stub responds deterministically for the same input within one ms', async () => {
    const a = await aviationApi.fetchFlightStatus('LA8084', '2026-05-22');
    const b = await aviationApi.fetchFlightStatus('LA8084', '2026-05-22');
    expect(a.data.numero_voo).toBe(b.data.numero_voo);
    expect(a.data.partida_programada).toBe(b.data.partida_programada);
  });

  test('stub returns not_found for numero starting with "X"', async () => {
    const r = await aviationApi.fetchFlightStatus('XX0000', '2026-05-22');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_found');
  });

  test('normalizeStatus maps known AeroDataBox values', () => {
    expect(aviationApi.normalizeStatus('Expected')).toBe('scheduled');
    expect(aviationApi.normalizeStatus('EnRoute')).toBe('active');
    expect(aviationApi.normalizeStatus('Arrived')).toBe('landed');
    expect(aviationApi.normalizeStatus('Canceled')).toBe('cancelled');
    expect(aviationApi.normalizeStatus('Diverted')).toBe('diverted');
    expect(aviationApi.normalizeStatus('Delayed')).toBe('delayed');
    expect(aviationApi.normalizeStatus('SomethingUnknown')).toBe('scheduled');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- aviationApi`
Expected: FAIL — `Cannot find module '../services/aviationApi'`.

- [ ] **Step 3: Implement stub + normalizer**

Create `backend/services/aviationApi.js`:

```js
const { nowUtcIso, addMinutesUtc } = require('../helpers/time');

const STATUS_MAP = {
  Expected: 'scheduled',
  CheckIn: 'scheduled',
  Boarding: 'scheduled',
  GateClosed: 'scheduled',
  Departed: 'active',
  EnRoute: 'active',
  Approaching: 'active',
  Arrived: 'landed',
  Landed: 'landed',
  Canceled: 'cancelled',
  Cancelled: 'cancelled',
  Diverted: 'diverted',
  Delayed: 'delayed'
};

function normalizeStatus(raw) {
  if (!raw) return 'scheduled';
  return STATUS_MAP[raw] || 'scheduled';
}

function stubResponse(numeroVoo, dataVoo) {
  if (numeroVoo.toUpperCase().startsWith('X')) {
    return { ok: false, error: 'not_found' };
  }
  // Deterministic stub: same input → same output
  const base = `${dataVoo}T14:00:00.000Z`;
  return {
    ok: true,
    data: {
      numero_voo: numeroVoo.toUpperCase(),
      companhia: 'STUB AIRLINES',
      origem: 'GRU',
      destino: 'MIA',
      status: 'scheduled',
      partida_programada: base,
      partida_estimada: base,
      chegada_programada: addMinutesUtc(base, 540),
      chegada_estimada: addMinutesUtc(base, 540),
      portao: 'A12',
      terminal: '3',
      raw: { stub: true, fetched_at: nowUtcIso() }
    }
  };
}

async function fetchFlightStatus(numeroVoo, dataVoo) {
  if ((process.env.AVIATION_API_MODE || 'stub') === 'stub') {
    return stubResponse(numeroVoo, dataVoo);
  }
  // Real implementation in Phase 2
  throw new Error('Real AeroDataBox client not yet implemented');
}

module.exports = { fetchFlightStatus, normalizeStatus };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- aviationApi`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/services/aviationApi.js backend/__tests__/aviationApi.test.js
git commit -m "feat(backend): aviationApi with stub mode and status normalizer"
```

---

### Task 1.5: CRUD router with validation (TDD via Supertest)

**Files:**
- Create: `backend/routes/monitoredFlights.js`
- Modify: `backend/server.js`
- Test: `backend/__tests__/routes-monitoredFlights.test.js`

- [ ] **Step 1: Set up a test app factory**

Test will need to mount the router against a fresh in-memory DB. Add a tiny test util.

Create `backend/__tests__/testApp.js`:

```js
process.env.AVIATION_API_MODE = 'stub';
process.env.DB_PATH = require('path').join(__dirname, '.tmp');
const fs = require('fs');
if (!fs.existsSync(process.env.DB_PATH)) fs.mkdirSync(process.env.DB_PATH);

// Clear test DB on each load
const dbFile = require('path').join(process.env.DB_PATH, 'database.sqlite');
try { fs.unlinkSync(dbFile); } catch (e) {}

const express = require('express');
const router = require('../routes/monitoredFlights');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/monitored-flights', router);
  return app;
}

async function waitForDb() {
  // Give database.js migrations time to finish (callbacks)
  await new Promise(r => setTimeout(r, 400));
}

module.exports = { makeApp, waitForDb };
```

- [ ] **Step 2: Write the failing tests**

Create `backend/__tests__/routes-monitoredFlights.test.js`:

```js
const request = require('supertest');
const { makeApp, waitForDb } = require('./testApp');

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
      data_voo: '2099-05-22',
      email_cliente: 'joao@example.com',
      cadencia_minutos: 60
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      cliente: 'João Silva',
      numero_voo: 'LA8084',
      data_voo: '2099-05-22',
      cadencia_minutos: 60,
      monitoramento_ativo: 1
    });
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.proxima_verificacao).toBeTruthy();
  });

  test('rejects invalid numero_voo', async () => {
    const res = await request(app).post('/api/monitored-flights').send({
      cliente: 'X', numero_voo: 'lol!', data_voo: '2099-05-22'
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

  test('rejects invalid cadencia_minutos', async () => {
    const res = await request(app).post('/api/monitored-flights').send({
      cliente: 'X', numero_voo: 'LA1234', data_voo: '2099-05-22', cadencia_minutos: 7
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cadencia/i);
  });

  test('409 on duplicate (numero_voo, data_voo, cliente)', async () => {
    const body = { cliente: 'Maria', numero_voo: 'LA9999', data_voo: '2099-05-22' };
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
      cliente: 'Detail Test', numero_voo: 'LA7777', data_voo: '2099-05-22'
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
      cliente: 'PUT Test', numero_voo: 'LA6666', data_voo: '2099-05-22', cadencia_minutos: 60
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
      cliente: 'Toggle Test', numero_voo: 'LA5555', data_voo: '2099-05-22'
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
      cliente: 'Del Test', numero_voo: 'LA4444', data_voo: '2099-05-22'
    });
    const del = await request(app).delete(`/api/monitored-flights/${created.body.id}`);
    expect(del.status).toBe(200);
    const after = await request(app).get(`/api/monitored-flights/${created.body.id}`);
    expect(after.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npm test -- routes-monitoredFlights`
Expected: FAIL — `Cannot find module '../routes/monitoredFlights'`.

- [ ] **Step 4: Implement router**

Create `backend/routes/monitoredFlights.js`:

```js
const express = require('express');
const db = require('../database');
const { nowUtcIso, addMinutesUtc } = require('../helpers/time');

const router = express.Router();

const NUMERO_VOO_REGEX = /^[A-Z0-9]{2}\d{1,4}$/i;
const DATA_VOO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_CADENCIAS = [15, 30, 60, 120, 240, 360, 720, 1440];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCreatePayload(body) {
  const { cliente, numero_voo, data_voo, email_cliente, cadencia_minutos } = body;
  if (!cliente || typeof cliente !== 'string') return 'cliente é obrigatório';
  if (!numero_voo || !NUMERO_VOO_REGEX.test(numero_voo))
    return 'numero_voo inválido (ex.: LA8084, G31234)';
  if (!data_voo || !DATA_VOO_REGEX.test(data_voo)) return 'data_voo inválido (use YYYY-MM-DD)';

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const flightDate = new Date(`${data_voo}T00:00:00.000Z`);
  const daysDiff = (flightDate - today) / (24 * 3600 * 1000);
  if (daysDiff < -30) return 'data_voo está muito no passado (>30 dias)';
  if (daysDiff > 365) return 'data_voo está muito no futuro (>365 dias)';

  if (email_cliente && !EMAIL_REGEX.test(email_cliente)) return 'email_cliente inválido';
  if (cadencia_minutos !== undefined && !ALLOWED_CADENCIAS.includes(Number(cadencia_minutos)))
    return `cadencia_minutos deve ser um de: ${ALLOWED_CADENCIAS.join(', ')}`;

  return null;
}

// GET all
router.get('/', (req, res) => {
  db.all(
    `SELECT * FROM monitored_flights_status ORDER BY proxima_verificacao ASC NULLS LAST, id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// GET one + history
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [req.params.id], (err, flight) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!flight) return res.status(404).json({ error: 'Flight not found' });
    db.all(
      `SELECT * FROM flight_status_history WHERE monitored_flight_id = ?
       ORDER BY verificado_em DESC LIMIT 100`,
      [req.params.id],
      (err, history) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ flight, history: history || [] });
      }
    );
  });
});

// POST create
router.post('/', (req, res) => {
  const err = validateCreatePayload(req.body);
  if (err) return res.status(400).json({ error: err });

  const now = nowUtcIso();
  const cadencia = Number(req.body.cadencia_minutos || 60);
  const proxima = addMinutesUtc(now, 0); // due immediately on first cycle
  const params = [
    req.body.cliente,
    req.body.numero_voo.toUpperCase(),
    req.body.data_voo,
    req.body.email_cliente || null,
    req.body.telegram_chat_id || null,
    cadencia,
    proxima,
    now, now
  ];

  db.run(
    `INSERT INTO monitored_flights_status
       (cliente, numero_voo, data_voo, email_cliente, telegram_chat_id,
        cadencia_minutos, proxima_verificacao, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params,
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed'))
          return res.status(409).json({ error: 'Voo já cadastrado (cliente + número + data)' });
        return res.status(500).json({ error: err.message });
      }
      db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [this.lastID], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json(row);
      });
    }
  );
});

// PUT update
router.put('/:id', (req, res) => {
  const { cliente, email_cliente, telegram_chat_id, cadencia_minutos, monitoramento_ativo } = req.body;

  if (email_cliente !== undefined && email_cliente !== '' && email_cliente !== null
      && !EMAIL_REGEX.test(email_cliente))
    return res.status(400).json({ error: 'email_cliente inválido' });
  if (cadencia_minutos !== undefined && !ALLOWED_CADENCIAS.includes(Number(cadencia_minutos)))
    return res.status(400).json({ error: `cadencia_minutos deve ser um de: ${ALLOWED_CADENCIAS.join(', ')}` });

  db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [req.params.id], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!existing) return res.status(404).json({ error: 'Flight not found' });

    const now = nowUtcIso();
    const newCadencia = cadencia_minutos !== undefined ? Number(cadencia_minutos) : existing.cadencia_minutos;
    const newProxima = cadencia_minutos !== undefined
      ? addMinutesUtc(now, newCadencia)
      : existing.proxima_verificacao;

    db.run(
      `UPDATE monitored_flights_status SET
         cliente = COALESCE(?, cliente),
         email_cliente = ?,
         telegram_chat_id = ?,
         cadencia_minutos = ?,
         monitoramento_ativo = COALESCE(?, monitoramento_ativo),
         proxima_verificacao = ?,
         atualizado_em = ?
       WHERE id = ?`,
      [
        cliente !== undefined ? cliente : null,
        email_cliente !== undefined ? (email_cliente || null) : existing.email_cliente,
        telegram_chat_id !== undefined ? (telegram_chat_id || null) : existing.telegram_chat_id,
        newCadencia,
        monitoramento_ativo !== undefined ? (monitoramento_ativo ? 1 : 0) : null,
        newProxima,
        now,
        req.params.id
      ],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [req.params.id], (err, row) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json(row);
        });
      }
    );
  });
});

// POST toggle
router.post('/:id/toggle', (req, res) => {
  db.get('SELECT monitoramento_ativo FROM monitored_flights_status WHERE id = ?',
    [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Flight not found' });
      const next = row.monitoramento_ativo ? 0 : 1;
      db.run(`UPDATE monitored_flights_status SET monitoramento_ativo = ?, atualizado_em = ? WHERE id = ?`,
        [next, nowUtcIso(), req.params.id], function (err) {
          if (err) return res.status(500).json({ error: err.message });
          db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(row);
          });
        });
    });
});

// DELETE
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM monitored_flights_status WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Flight not found' });
    res.json({ message: 'Deleted' });
  });
});

// POST check-now — placeholder; full implementation in Task 3.2
router.post('/:id/check-now', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet (Phase 3)' });
});

module.exports = router;
```

> SQLite does not support `NULLS LAST` natively in older versions. If the `GET /` test throws a syntax error, replace the ORDER BY with:
> ```sql
> ORDER BY (proxima_verificacao IS NULL), proxima_verificacao ASC, id DESC
> ```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npm test -- routes-monitoredFlights`
Expected: PASS, all tests.

If failures appear, fix and re-run. Do not move on until green.

- [ ] **Step 6: Mount router in server.js**

Edit `backend/server.js`. After the existing `const db = require('./database');` line (~line 21), add:

```js
const monitoredFlightsRouter = require('./routes/monitoredFlights');
```

And after the `app.use(express.json());` line, before the existing routes block, add:

```js
app.use('/api/monitored-flights', monitoredFlightsRouter);
```

- [ ] **Step 7: Manual smoke test**

Run the server locally:
```bash
cd backend && node server.js
```

In another terminal:
```bash
curl -X POST http://localhost:3000/api/monitored-flights \
  -H "Content-Type: application/json" \
  -d '{"cliente":"Teste","numero_voo":"LA8084","data_voo":"2099-05-22"}'
curl http://localhost:3000/api/monitored-flights
```

Expected: 201 with created flight; GET returns array of 1.

Stop the server (Ctrl+C).

- [ ] **Step 8: Commit**

```bash
git add backend/routes/monitoredFlights.js backend/server.js \
        backend/__tests__/routes-monitoredFlights.test.js \
        backend/__tests__/testApp.js
git commit -m "feat(backend): CRUD endpoints for monitored flights with validation"
```

---

## Phase 2 — Real AeroDataBox integration

End-state: `aviationApi.js` calls the real RapidAPI endpoint when `AVIATION_API_MODE !== 'stub'`, normalizes the response, and handles 404/429/5xx without throwing.

### Task 2.1: Implement real fetch (TDD with mocked global.fetch)

**Files:**
- Modify: `backend/services/aviationApi.js`
- Modify: `backend/__tests__/aviationApi.test.js`

- [ ] **Step 1: Add failing tests for real mode**

Append to `backend/__tests__/aviationApi.test.js`:

```js
describe('aviationApi (real mode, mocked HTTP)', () => {
  beforeEach(() => {
    process.env.AVIATION_API_MODE = 'real';
    process.env.RAPIDAPI_KEY = 'test-key';
    process.env.AERODATABOX_HOST = 'aerodatabox.p.rapidapi.com';
  });
  afterAll(() => { process.env.AVIATION_API_MODE = 'stub'; });

  test('successful response is normalized', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([{
        number: 'LA 8084',
        airline: { name: 'LATAM' },
        status: 'EnRoute',
        departure: {
          airport: { iata: 'GRU' },
          scheduledTime: { utc: '2026-05-22 14:00Z' },
          revisedTime: { utc: '2026-05-22 14:30Z' },
          terminal: '3', gate: 'A12'
        },
        arrival: {
          airport: { iata: 'MIA' },
          scheduledTime: { utc: '2026-05-22 23:00Z' },
          revisedTime: { utc: '2026-05-22 23:30Z' }
        }
      }])
    });

    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(r.ok).toBe(true);
    expect(r.data.numero_voo).toBe('LA8084');
    expect(r.data.companhia).toBe('LATAM');
    expect(r.data.status).toBe('active');
    expect(r.data.origem).toBe('GRU');
    expect(r.data.destino).toBe('MIA');
    expect(r.data.partida_programada).toBe('2026-05-22T14:00:00.000Z');
    expect(r.data.partida_estimada).toBe('2026-05-22T14:30:00.000Z');
    expect(r.data.portao).toBe('A12');
    expect(r.data.terminal).toBe('3');
  });

  test('404 returns not_found', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  test('429 returns rate_limited with retryAfter', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 429,
      headers: { get: (k) => k === 'Retry-After' ? '30' : null },
      json: async () => ({})
    });
    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('rate_limited');
    expect(r.retryAfter).toBe(30);
  });

  test('5xx returns server_error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(r).toEqual({ ok: false, error: 'server_error' });
  });

  test('network error returns error string', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('ECONNREFUSED');
  });

  test('missing RAPIDAPI_KEY returns config_error without calling fetch', async () => {
    delete process.env.RAPIDAPI_KEY;
    global.fetch = jest.fn();
    const r = await require('../services/aviationApi').fetchFlightStatus('LA8084', '2026-05-22');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, error: 'config_error' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- aviationApi`
Expected: most "real mode" tests FAIL (throw "not yet implemented").

- [ ] **Step 3: Implement real fetch**

Replace the `fetchFlightStatus` function in `backend/services/aviationApi.js`:

```js
function toIsoUtc(rawTime) {
  // AeroDataBox returns "2026-05-22 14:00Z" → coerce to "2026-05-22T14:00:00.000Z"
  if (!rawTime) return null;
  const cleaned = rawTime.replace(' ', 'T').replace(/Z$/, ':00Z');
  // Handle case where seconds already present
  const d = new Date(cleaned);
  if (isNaN(d)) return null;
  return d.toISOString();
}

function normalizeAeroDataBox(rawArr) {
  if (!Array.isArray(rawArr) || rawArr.length === 0) return null;
  const r = rawArr[0];
  return {
    numero_voo: (r.number || '').replace(/\s+/g, ''),
    companhia: r.airline?.name || null,
    origem: r.departure?.airport?.iata || null,
    destino: r.arrival?.airport?.iata || null,
    status: normalizeStatus(r.status),
    partida_programada: toIsoUtc(r.departure?.scheduledTime?.utc),
    partida_estimada: toIsoUtc(r.departure?.revisedTime?.utc) || toIsoUtc(r.departure?.scheduledTime?.utc),
    chegada_programada: toIsoUtc(r.arrival?.scheduledTime?.utc),
    chegada_estimada: toIsoUtc(r.arrival?.revisedTime?.utc) || toIsoUtc(r.arrival?.scheduledTime?.utc),
    portao: r.departure?.gate || null,
    terminal: r.departure?.terminal || null,
    raw: r
  };
}

async function fetchFlightStatus(numeroVoo, dataVoo) {
  if ((process.env.AVIATION_API_MODE || 'stub') === 'stub') {
    return stubResponse(numeroVoo, dataVoo);
  }

  const key = process.env.RAPIDAPI_KEY;
  const host = process.env.AERODATABOX_HOST || 'aerodatabox.p.rapidapi.com';
  if (!key) return { ok: false, error: 'config_error' };

  const url = `https://${host}/flights/number/${encodeURIComponent(numeroVoo)}/${encodeURIComponent(dataVoo)}`;

  try {
    const res = await fetch(url, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host }
    });
    if (res.status === 404) return { ok: false, error: 'not_found' };
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers?.get?.('Retry-After') || '60', 10);
      return { ok: false, error: 'rate_limited', retryAfter };
    }
    if (res.status >= 500) return { ok: false, error: 'server_error' };
    if (!res.ok) return { ok: false, error: `http_${res.status}` };

    const body = await res.json();
    const normalized = normalizeAeroDataBox(body);
    if (!normalized) return { ok: false, error: 'not_found' };
    return { ok: true, data: normalized };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- aviationApi`
Expected: PASS, all aviationApi tests (10 total).

- [ ] **Step 5: Commit**

```bash
git add backend/services/aviationApi.js backend/__tests__/aviationApi.test.js
git commit -m "feat(backend): real AeroDataBox client with error handling"
```

---

### Task 2.2: Manual validation against real API

Skip if a `RAPIDAPI_KEY` is not yet available — defer to deployment. Otherwise:

- [ ] **Step 1: Set key locally**

Create `backend/.env` (gitignored already) and add:

```
AVIATION_API_MODE=real
RAPIDAPI_KEY=<your-key>
AERODATABOX_HOST=aerodatabox.p.rapidapi.com
```

- [ ] **Step 2: Smoke test with a known upcoming flight**

```bash
cd backend && node -e "
require('dotenv').config();
require('./services/aviationApi').fetchFlightStatus('LA8084','2026-05-22').then(r=>console.log(JSON.stringify(r,null,2)));
"
```

Expected: `{ ok: true, data: { ... } }` for a real flight number you choose; `{ ok: false, error: 'not_found' }` for a fake one.

- [ ] **Step 3: Reset to stub for local dev**

In `backend/.env`, change `AVIATION_API_MODE=stub` (or remove the var).

No commit needed — `.env` is gitignored.

---

## Phase 3 — Scheduler, detection, anti-spam, notifications

End-state: `statusMonitor.checkDueFlights()` runs every 5min, processes due flights in batches, detects events, suppresses duplicate alerts, auto-archives landed flights, and sends notifications. `POST /:id/check-now` triggers a one-off check.

### Task 3.1: Status notifier templates (TDD)

**Files:**
- Create: `backend/services/statusNotifier.js`
- Test: extended in Task 3.2 alongside statusMonitor — for now, just write the module.

- [ ] **Step 1: Create the module**

Create `backend/services/statusNotifier.js`:

```js
const { sendTelegram: _sendTelegramPriceLegacy } = require('./notifier'); // unused, but documents reuse path

const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '465', 10),
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  return transporter;
}

const EVENT_TITLES = {
  cancelado: { emoji: '🚨', label: 'VOO CANCELADO', color: '#dc2626' },          // red
  atrasado: { emoji: '⚠️', label: 'ATRASO CONFIRMADO', color: '#f59e0b' },       // amber
  reagendado: { emoji: '⚠️', label: 'VOO REAGENDADO', color: '#f59e0b' }         // amber
};

function formatDiff(diff) {
  if (!diff || !Array.isArray(diff)) return '';
  return diff.map(d => `<li><b>${d.campo}:</b> ${d.antes || '—'} → ${d.depois || '—'}</li>`).join('');
}

function formatDiffPlain(diff) {
  if (!diff || !Array.isArray(diff)) return '';
  return diff.map(d => `• <b>${d.campo}:</b> ${d.antes || '—'} → ${d.depois || '—'}`).join('\n');
}

function buildStatusEmailHtml(flight, evento, diff) {
  const meta = EVENT_TITLES[evento] || { emoji: 'ℹ️', label: evento.toUpperCase(), color: '#475569' };
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden;">
    <div style="background:${meta.color};padding:20px;text-align:center;">
      <div style="font-size:32px;">${meta.emoji}</div>
      <div style="color:#fff;font-size:18px;font-weight:700;margin-top:4px;">${meta.label}</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#f1f5f9;"><b>Cliente:</b> ${flight.cliente}</p>
      <p style="margin:0 0 12px;color:#f1f5f9;"><b>Voo:</b> ${flight.numero_voo} (${flight.companhia || '—'})</p>
      <p style="margin:0 0 12px;color:#f1f5f9;"><b>Trecho:</b> ${flight.origem || '?'} → ${flight.destino || '?'}</p>
      <p style="margin:0 0 12px;color:#f1f5f9;"><b>Data:</b> ${flight.data_voo}</p>
      <div style="background:#0f172a;border-radius:8px;padding:16px;margin-top:16px;">
        <ul style="margin:0;padding-left:18px;color:#e2e8f0;font-size:14px;">${formatDiff(diff)}</ul>
      </div>
      <p style="margin-top:20px;font-size:11px;color:#475569;text-align:center;">
        Monitor de Status — Clube do Voo Viagens
      </p>
    </div>
  </div>
</body></html>`.trim();
}

function buildStatusTelegramMessage(flight, evento, diff) {
  const meta = EVENT_TITLES[evento] || { emoji: 'ℹ️', label: evento.toUpperCase() };
  return `
${meta.emoji} <b>${meta.label}</b>

👤 <b>Cliente:</b> ${flight.cliente}
✈️ <b>Voo:</b> ${flight.numero_voo} ${flight.companhia ? '(' + flight.companhia + ')' : ''}
🛫 <b>Trecho:</b> ${flight.origem || '?'} → ${flight.destino || '?'}
📅 <b>Data:</b> ${flight.data_voo}

<b>Alterações:</b>
${formatDiffPlain(diff)}
  `.trim();
}

async function sendStatusEmail(to, flight, evento, diff) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)
    return { sucesso: false, erro: 'Credenciais de email não configuradas' };
  try {
    const meta = EVENT_TITLES[evento] || { label: evento.toUpperCase() };
    const info = await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject: `${meta.label} | ${flight.numero_voo} ${flight.data_voo} — ${flight.cliente}`,
      html: buildStatusEmailHtml(flight, evento, diff)
    });
    return { sucesso: true, messageId: info.messageId };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

async function sendStatusTelegram(chatId, flight, evento, diff) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { sucesso: false, erro: 'TELEGRAM_BOT_TOKEN não configurado' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildStatusTelegramMessage(flight, evento, diff),
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const data = await res.json();
    return data.ok ? { sucesso: true } : { sucesso: false, erro: data.description };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

module.exports = {
  sendStatusEmail,
  sendStatusTelegram,
  buildStatusEmailHtml,    // exported for snapshot/visual testing
  buildStatusTelegramMessage
};
```

- [ ] **Step 2: Visual sanity check (HTML)**

Run:
```bash
cd backend && node -e "
const { buildStatusEmailHtml } = require('./services/statusNotifier');
const fs = require('fs');
fs.writeFileSync('/tmp/status-preview.html', buildStatusEmailHtml(
  { cliente:'João', numero_voo:'LA8084', companhia:'LATAM', origem:'GRU', destino:'MIA', data_voo:'2026-05-22' },
  'atrasado',
  [{ campo:'Partida estimada', antes:'14:00', depois:'16:30' }]
));
console.log('Wrote /tmp/status-preview.html');
"
```

Open the file in a browser. Confirm: amber header banner, distinct from the existing purple price-alert template. (On Windows, write to `./status-preview.html` instead.)

- [ ] **Step 3: Commit**

```bash
git add backend/services/statusNotifier.js
git commit -m "feat(backend): status notifier with amber/red templates"
```

---

### Task 3.2: `statusMonitor.checkDueFlights()` (TDD)

This is the most complex piece. Test with stubbed `aviationApi` and an in-memory DB.

**Files:**
- Create: `backend/services/statusMonitor.js`
- Test: `backend/__tests__/statusMonitor.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/statusMonitor.test.js`:

```js
process.env.AVIATION_API_MODE = 'stub';
process.env.DB_PATH = require('path').join(__dirname, '.tmp-mon');
const fs = require('fs');
if (!fs.existsSync(process.env.DB_PATH)) fs.mkdirSync(process.env.DB_PATH);
try { fs.unlinkSync(require('path').join(process.env.DB_PATH, 'database.sqlite')); } catch(e) {}

const db = require('../database');
const { nowUtcIso, addMinutesUtc } = require('../helpers/time');

// Mock external dependencies
jest.mock('../services/aviationApi');
jest.mock('../services/statusNotifier');

const aviationApi = require('../services/aviationApi');
const statusNotifier = require('../services/statusNotifier');
const monitor = require('../services/statusMonitor');

function insertFlight(overrides = {}) {
  return new Promise((resolve, reject) => {
    const now = nowUtcIso();
    const proxima = addMinutesUtc(now, -1); // due
    const params = [
      overrides.cliente || 'Test',
      overrides.numero_voo || 'LA8084',
      overrides.data_voo || '2099-05-22',
      overrides.email_cliente || null,
      overrides.telegram_chat_id || null,
      overrides.cadencia_minutos || 60,
      overrides.status_atual || null,
      overrides.partida_programada || null,
      overrides.partida_estimada || null,
      overrides.chegada_estimada || null,
      proxima, now, now
    ];
    db.run(
      `INSERT INTO monitored_flights_status
         (cliente,numero_voo,data_voo,email_cliente,telegram_chat_id,cadencia_minutos,
          status_atual,partida_programada,partida_estimada,chegada_estimada,
          proxima_verificacao,criado_em,atualizado_em)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params,
      function (err) { if (err) reject(err); else resolve(this.lastID); }
    );
  });
}

function getFlight(id) {
  return new Promise((r, j) =>
    db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [id], (e, row) => e ? j(e) : r(row)));
}

function getHistory(id) {
  return new Promise((r, j) =>
    db.all('SELECT * FROM flight_status_history WHERE monitored_flight_id = ? ORDER BY id DESC', [id],
      (e, rows) => e ? j(e) : r(rows || [])));
}

beforeAll(async () => { await new Promise(r => setTimeout(r, 400)); });

beforeEach(() => {
  aviationApi.fetchFlightStatus.mockReset();
  statusNotifier.sendStatusEmail.mockReset().mockResolvedValue({ sucesso: true });
  statusNotifier.sendStatusTelegram.mockReset().mockResolvedValue({ sucesso: true });
});

describe('checkDueFlights', () => {
  test('first check populates snapshot and history check_ok', async () => {
    const id = await insertFlight();
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true,
      data: {
        numero_voo: 'LA8084', companhia: 'LATAM', origem: 'GRU', destino: 'MIA',
        status: 'scheduled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:00:00.000Z',
        chegada_programada: '2099-05-22T23:00:00.000Z',
        chegada_estimada: '2099-05-22T23:00:00.000Z',
        portao: 'A12', terminal: '3', raw: {}
      }
    });

    await monitor.checkDueFlights();
    const f = await getFlight(id);
    expect(f.status_atual).toBe('scheduled');
    expect(f.partida_programada).toBe('2099-05-22T14:00:00.000Z');
    expect(f.proxima_verificacao > f.ultima_verificacao).toBe(true);
    const h = await getHistory(id);
    expect(h[0].evento).toBe('check_ok');
    expect(statusNotifier.sendStatusEmail).not.toHaveBeenCalled();
  });

  test('detects cancellation and notifies', async () => {
    const id = await insertFlight({
      email_cliente: 'a@b.com', telegram_chat_id: '123',
      status_atual: 'scheduled',
      partida_programada: '2099-05-22T14:00:00.000Z',
      partida_estimada: '2099-05-22T14:00:00.000Z'
    });
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA8084', status: 'cancelled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:00:00.000Z',
        chegada_programada: null, chegada_estimada: null,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });

    await monitor.checkDueFlights();
    const h = await getHistory(id);
    expect(h[0].evento).toBe('cancelado');
    expect(h[0].notificado).toBe(1);
    expect(statusNotifier.sendStatusEmail).toHaveBeenCalledTimes(1);
    expect(statusNotifier.sendStatusTelegram).toHaveBeenCalledTimes(1);
    expect(statusNotifier.sendStatusEmail.mock.calls[0][2]).toBe('cancelado');
  });

  test('detects delay >= threshold and notifies', async () => {
    process.env.DELAY_THRESHOLD_MIN = '15';
    const id = await insertFlight({
      email_cliente: 'a@b.com',
      status_atual: 'scheduled',
      partida_programada: '2099-05-22T14:00:00.000Z',
      partida_estimada: '2099-05-22T14:00:00.000Z'
    });
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA8084', status: 'scheduled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:30:00.000Z',  // 30min delay
        chegada_programada: '2099-05-22T23:00:00.000Z',
        chegada_estimada: '2099-05-22T23:30:00.000Z',
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });

    await monitor.checkDueFlights();
    const h = await getHistory(id);
    expect(h[0].evento).toBe('atrasado');
    expect(statusNotifier.sendStatusEmail).toHaveBeenCalledTimes(1);
  });

  test('delay below threshold does NOT notify', async () => {
    process.env.DELAY_THRESHOLD_MIN = '15';
    const id = await insertFlight({
      email_cliente: 'a@b.com',
      status_atual: 'scheduled',
      partida_programada: '2099-05-22T14:00:00.000Z',
      partida_estimada: '2099-05-22T14:00:00.000Z'
    });
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA8084', status: 'scheduled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:10:00.000Z', // 10min only
        chegada_programada: null, chegada_estimada: null,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });
    await monitor.checkDueFlights();
    expect(statusNotifier.sendStatusEmail).not.toHaveBeenCalled();
  });

  test('anti-spam: same cancellation twice → notifies once', async () => {
    const id = await insertFlight({
      email_cliente: 'a@b.com', status_atual: 'scheduled',
      partida_programada: '2099-05-22T14:00:00.000Z',
      partida_estimada: '2099-05-22T14:00:00.000Z'
    });
    const cancelled = {
      ok: true, data: {
        numero_voo: 'LA8084', status: 'cancelled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:00:00.000Z',
        chegada_programada: null, chegada_estimada: null,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    };
    aviationApi.fetchFlightStatus.mockResolvedValue(cancelled);

    await monitor.checkDueFlights();
    // make it due again
    await new Promise((r,j) => db.run(
      `UPDATE monitored_flights_status SET proxima_verificacao = ? WHERE id = ?`,
      [addMinutesUtc(nowUtcIso(), -1), id], err => err ? j(err) : r()
    ));
    await monitor.checkDueFlights();

    expect(statusNotifier.sendStatusEmail).toHaveBeenCalledTimes(1);
    const h = await getHistory(id);
    // First call → cancelado; second → check_ok (suppressed)
    expect(h.filter(x => x.evento === 'cancelado').length).toBe(1);
    expect(h.filter(x => x.evento === 'check_ok').length).toBeGreaterThan(0);
  });

  test('auto-archives when landed + chegada_estimada older than 2h', async () => {
    const id = await insertFlight();
    const pastArrival = addMinutesUtc(nowUtcIso(), -200); // 3h20 ago
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA8084', status: 'landed',
        partida_programada: pastArrival, partida_estimada: pastArrival,
        chegada_programada: pastArrival, chegada_estimada: pastArrival,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });
    await monitor.checkDueFlights();
    const f = await getFlight(id);
    expect(f.monitoramento_ativo).toBe(0);
    const h = await getHistory(id);
    expect(h.some(x => x.evento === 'arquivado_auto')).toBe(true);
  });

  test('API error logs erro_api and reschedules', async () => {
    const id = await insertFlight();
    aviationApi.fetchFlightStatus.mockResolvedValue({ ok: false, error: 'server_error' });
    await monitor.checkDueFlights();
    const h = await getHistory(id);
    expect(h[0].evento).toBe('erro_api');
    expect(statusNotifier.sendStatusEmail).not.toHaveBeenCalled();
    const f = await getFlight(id);
    expect(f.proxima_verificacao > f.ultima_verificacao).toBe(true);
  });

  test('respects batch size', async () => {
    process.env.STATUS_MONITOR_BATCH_SIZE = '2';
    for (let i = 0; i < 5; i++) {
      await insertFlight({ numero_voo: `LA${1000+i}` });
    }
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA0000', status: 'scheduled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:00:00.000Z',
        chegada_programada: null, chegada_estimada: null,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });
    await monitor.checkDueFlights();
    expect(aviationApi.fetchFlightStatus.mock.calls.length).toBeLessThanOrEqual(2);
  });

  test('skips inactive flights', async () => {
    const id = await insertFlight();
    await new Promise((r,j) => db.run(
      `UPDATE monitored_flights_status SET monitoramento_ativo = 0 WHERE id = ?`,
      [id], err => err ? j(err) : r()
    ));
    aviationApi.fetchFlightStatus.mockResolvedValue({ ok: true, data: {} });
    await monitor.checkDueFlights();
    expect(aviationApi.fetchFlightStatus).not.toHaveBeenCalled();
  });
});

describe('checkOne (manual trigger)', () => {
  test('runs check for a single id and returns result', async () => {
    const id = await insertFlight();
    aviationApi.fetchFlightStatus.mockResolvedValue({
      ok: true, data: {
        numero_voo: 'LA8084', status: 'scheduled',
        partida_programada: '2099-05-22T14:00:00.000Z',
        partida_estimada: '2099-05-22T14:00:00.000Z',
        chegada_programada: null, chegada_estimada: null,
        origem: 'GRU', destino: 'MIA', raw: {}
      }
    });
    const r = await monitor.checkOne(id);
    expect(r.ok).toBe(true);
    expect(r.status_atual).toBe('scheduled');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- statusMonitor`
Expected: FAIL — `Cannot find module '../services/statusMonitor'`.

- [ ] **Step 3: Implement `statusMonitor.js`**

Create `backend/services/statusMonitor.js`:

```js
const db = require('../database');
const aviationApi = require('./aviationApi');
const statusNotifier = require('./statusNotifier');
const { nowUtcIso, addMinutesUtc, diffMinutes, isOlderThanHours } = require('../helpers/time');

const NOTIFIABLE_EVENTS = new Set(['cancelado', 'atrasado', 'reagendado']);
const SILENT_EVENTS = new Set(['portao_alterado', 'terminal_alterado']);

function delayThreshold() {
  return parseInt(process.env.DELAY_THRESHOLD_MIN || '15', 10);
}
function batchSize() {
  return parseInt(process.env.STATUS_MONITOR_BATCH_SIZE || '10', 10);
}

// ---------- DB helpers (promisified) ----------
function dbAll(sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r || [])));
}
function dbGet(sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
}
function dbRun(sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function (e) {
    if (e) rej(e); else res({ changes: this.changes, lastID: this.lastID });
  }));
}

// ---------- Event detection ----------
function detectEvents(prev, next) {
  const events = [];

  // Cancellation
  if (next.status === 'cancelled' && prev.status_atual !== 'cancelled') {
    events.push({
      evento: 'cancelado',
      payload: [{ campo: 'status', antes: prev.status_atual || '—', depois: 'cancelled' }]
    });
  }

  // Reschedule (scheduled time changed). Skip if also cancelled (already covered).
  if (prev.partida_programada && next.partida_programada
      && prev.partida_programada !== next.partida_programada
      && next.status !== 'cancelled') {
    events.push({
      evento: 'reagendado',
      payload: [{ campo: 'Partida programada', antes: prev.partida_programada, depois: next.partida_programada }]
    });
  }

  // Delay (estimated vs scheduled)
  const delay = diffMinutes(next.partida_programada, next.partida_estimada);
  if (delay !== null && delay >= delayThreshold() && next.status !== 'cancelled') {
    // Only emit if delay value changed from before (avoid duplicate when only other fields moved)
    const prevDelay = diffMinutes(prev.partida_programada, prev.partida_estimada);
    if (prevDelay !== delay) {
      events.push({
        evento: 'atrasado',
        payload: [{ campo: 'Partida estimada', antes: prev.partida_estimada || '—', depois: next.partida_estimada }]
      });
    }
  }

  // Gate / terminal — silent (no notification)
  if (prev.portao && next.portao && prev.portao !== next.portao) {
    events.push({
      evento: 'portao_alterado',
      payload: [{ campo: 'Portão', antes: prev.portao, depois: next.portao }]
    });
  }
  if (prev.terminal && next.terminal && prev.terminal !== next.terminal) {
    events.push({
      evento: 'terminal_alterado',
      payload: [{ campo: 'Terminal', antes: prev.terminal, depois: next.terminal }]
    });
  }

  return events;
}

// ---------- Anti-spam ----------
async function isDuplicateEvent(flightId, evento, payload) {
  const last = await dbGet(
    `SELECT payload_json FROM flight_status_history
     WHERE monitored_flight_id = ? AND evento = ?
     ORDER BY verificado_em DESC LIMIT 1`,
    [flightId, evento]
  );
  if (!last) return false;
  return last.payload_json === JSON.stringify(payload);
}

// ---------- Snapshot persistence ----------
async function updateSnapshot(flight, normalized, archive) {
  const now = nowUtcIso();
  const nextCheck = archive ? null : addMinutesUtc(now, flight.cadencia_minutos);
  await dbRun(
    `UPDATE monitored_flights_status SET
       companhia = COALESCE(?, companhia),
       origem = COALESCE(?, origem),
       destino = COALESCE(?, destino),
       status_atual = ?,
       partida_programada = ?,
       partida_estimada = ?,
       chegada_programada = ?,
       chegada_estimada = ?,
       portao = ?,
       terminal = ?,
       monitoramento_ativo = ?,
       ultima_verificacao = ?,
       proxima_verificacao = COALESCE(?, proxima_verificacao),
       atualizado_em = ?
     WHERE id = ?`,
    [
      normalized.companhia, normalized.origem, normalized.destino,
      normalized.status,
      normalized.partida_programada, normalized.partida_estimada,
      normalized.chegada_programada, normalized.chegada_estimada,
      normalized.portao, normalized.terminal,
      archive ? 0 : 1,
      now, nextCheck, now,
      flight.id
    ]
  );
}

async function insertHistory(flightId, evento, payload, notificado) {
  await dbRun(
    `INSERT INTO flight_status_history (monitored_flight_id, verificado_em, evento, payload_json, notificado)
     VALUES (?, ?, ?, ?, ?)`,
    [flightId, nowUtcIso(), evento, payload ? JSON.stringify(payload) : null, notificado ? 1 : 0]
  );
}

// ---------- Notification dispatch ----------
async function notify(flight, evento, payload) {
  const results = await Promise.all([
    flight.email_cliente
      ? statusNotifier.sendStatusEmail(flight.email_cliente, flight, evento, payload)
      : Promise.resolve(null),
    flight.telegram_chat_id
      ? statusNotifier.sendStatusTelegram(flight.telegram_chat_id, flight, evento, payload)
      : Promise.resolve(null)
  ]);
  return results.some(r => r && r.sucesso);
}

// ---------- Core process for one flight ----------
async function processOne(flight) {
  const apiResult = await aviationApi.fetchFlightStatus(flight.numero_voo, flight.data_voo);

  if (!apiResult.ok) {
    await insertHistory(flight.id, 'erro_api', { error: apiResult.error }, false);
    // Reschedule normally
    const now = nowUtcIso();
    await dbRun(
      `UPDATE monitored_flights_status SET ultima_verificacao = ?, proxima_verificacao = ?, atualizado_em = ? WHERE id = ?`,
      [now, addMinutesUtc(now, flight.cadencia_minutos), now, flight.id]
    );
    return { ok: false, error: apiResult.error };
  }

  const normalized = apiResult.data;
  const events = detectEvents(flight, normalized);

  // Auto-archive
  const shouldArchive =
    normalized.status === 'landed' &&
    isOlderThanHours(normalized.chegada_estimada, 2);

  await updateSnapshot(flight, normalized, shouldArchive);

  if (shouldArchive) {
    await insertHistory(flight.id, 'arquivado_auto', { reason: 'landed + 2h' }, false);
  }

  let anyNotified = false;
  for (const ev of events) {
    if (NOTIFIABLE_EVENTS.has(ev.evento)) {
      const duplicate = await isDuplicateEvent(flight.id, ev.evento, ev.payload);
      if (duplicate) {
        // Suppressed — snapshot already updated above
        continue;
      }
      // Merge updated flight identity fields with refreshed normalized data for the notifier
      const flightForNotify = { ...flight, ...normalized, data_voo: flight.data_voo, cliente: flight.cliente };
      const notified = await notify(flightForNotify, ev.evento, ev.payload);
      await insertHistory(flight.id, ev.evento, ev.payload, notified);
      anyNotified = anyNotified || notified;
    } else if (SILENT_EVENTS.has(ev.evento)) {
      await insertHistory(flight.id, ev.evento, ev.payload, false);
    }
  }

  if (events.length === 0) {
    await insertHistory(flight.id, 'check_ok', null, false);
  } else if (!anyNotified && events.every(e => !NOTIFIABLE_EVENTS.has(e.evento))) {
    // only silent events — still log a check_ok beacon
    await insertHistory(flight.id, 'check_ok', null, false);
  }

  return { ok: true, status_atual: normalized.status, events: events.map(e => e.evento) };
}

// ---------- Public entry points ----------
async function checkDueFlights() {
  const due = await dbAll(
    `SELECT * FROM monitored_flights_status
     WHERE proxima_verificacao <= ? AND monitoramento_ativo = 1
     ORDER BY proxima_verificacao ASC LIMIT ?`,
    [nowUtcIso(), batchSize()]
  );
  const results = [];
  for (const flight of due) {
    try {
      results.push(await processOne(flight));
    } catch (err) {
      console.error(`[STATUS-MON] Erro no voo #${flight.id}:`, err.message);
      results.push({ ok: false, id: flight.id, error: err.message });
    }
  }
  return results;
}

async function checkOne(id) {
  const flight = await dbGet('SELECT * FROM monitored_flights_status WHERE id = ?', [id]);
  if (!flight) return { ok: false, error: 'not_found' };
  return processOne(flight);
}

module.exports = { checkDueFlights, checkOne, detectEvents };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- statusMonitor`
Expected: PASS, all tests.

If any test fails, fix the implementation. Common issues:
- Field name typos
- `dbRun` not awaited
- Mock not reset between tests

- [ ] **Step 5: Commit**

```bash
git add backend/services/statusMonitor.js backend/__tests__/statusMonitor.test.js
git commit -m "feat(backend): statusMonitor with detection, anti-spam, auto-archive"
```

---

### Task 3.3: Wire `check-now` endpoint + scheduler cron

**Files:**
- Modify: `backend/routes/monitoredFlights.js`
- Modify: `backend/services/scheduler.js`

- [ ] **Step 1: Replace check-now stub**

In `backend/routes/monitoredFlights.js`, replace the existing `POST /:id/check-now` handler (which returns 501):

```js
const { checkOne } = require('../services/statusMonitor');

router.post('/:id/check-now', async (req, res) => {
  try {
    const result = await checkOne(req.params.id);
    if (!result.ok && result.error === 'not_found')
      return res.status(404).json({ error: 'Flight not found' });
    if (!result.ok)
      return res.status(502).json({ sucesso: false, erro: result.error });
    const flight = await new Promise((r, j) =>
      db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [req.params.id],
        (e, row) => e ? j(e) : r(row)));
    return res.json({ sucesso: true, status_atual: result.status_atual, events: result.events, flight });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

> Move the `require('../services/statusMonitor')` to the top of the file with the other requires.

- [ ] **Step 2: Add test for check-now endpoint**

Append to `backend/__tests__/routes-monitoredFlights.test.js`:

```js
describe('POST /api/monitored-flights/:id/check-now', () => {
  test('runs a check and returns updated flight', async () => {
    const created = await request(app).post('/api/monitored-flights').send({
      cliente: 'CN Test', numero_voo: 'LA3333', data_voo: '2099-05-22'
    });
    const res = await request(app).post(`/api/monitored-flights/${created.body.id}/check-now`);
    expect(res.status).toBe(200);
    expect(res.body.sucesso).toBe(true);
    expect(res.body.flight.status_atual).toBeTruthy();
  });

  test('404 when id does not exist', async () => {
    const res = await request(app).post('/api/monitored-flights/999999/check-now');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run all backend tests**

Run: `cd backend && npm test`
Expected: PASS — all suites.

- [ ] **Step 4: Add scheduler cron for status**

Edit `backend/services/scheduler.js`. At the top, add:

```js
const { checkDueFlights } = require('./statusMonitor');
```

At the bottom of the file (just before `module.exports`), add:

```js
let statusCronJob = null;
function startStatusScheduler() {
  if (statusCronJob) { statusCronJob.stop(); statusCronJob = null; }
  console.log('[STATUS-MON] Cron iniciado: */5 * * * *');
  statusCronJob = cron.schedule('*/5 * * * *', async () => {
    try {
      const results = await checkDueFlights();
      if (results.length > 0) {
        console.log(`[STATUS-MON] Processados ${results.length} voo(s).`);
      }
    } catch (err) {
      console.error('[STATUS-MON] Erro fatal:', err);
    }
  });
  return statusCronJob;
}
```

Update the `module.exports` line:

```js
module.exports = { startScheduler, runCheckCycle, processFlight, startStatusScheduler };
```

- [ ] **Step 5: Start status scheduler in server.js**

In `backend/server.js`, replace the import:

```js
const { startScheduler, processFlight } = require('./services/scheduler');
```

with:

```js
const { startScheduler, processFlight, startStatusScheduler } = require('./services/scheduler');
```

And inside the `app.listen` callback, after `startScheduler();`, add:

```js
    startStatusScheduler();
```

- [ ] **Step 6: Smoke test cron locally**

Run:
```bash
cd backend && AVIATION_API_MODE=stub node server.js
```

Wait up to 5 minutes (or temporarily change cron to `*/1 * * * *` to validate; revert before commit). Check for `[STATUS-MON] Cron iniciado` and `[STATUS-MON] Processados N voo(s).` lines. Then Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/monitoredFlights.js backend/services/scheduler.js \
        backend/server.js backend/__tests__/routes-monitoredFlights.test.js
git commit -m "feat(backend): wire check-now endpoint and status cron */5 min"
```

---

## Phase 4 — Frontend: tabs + StatusTab

End-state: SPA has tabs in the header, the existing price-monitoring UI is preserved unchanged inside `PrecosTab`, and a new `StatusTab` lets the user manage status-monitored flights with create/edit/delete/check-now/toggle/history.

### Task 4.1: Extract PrecosTab from App.jsx

**Files:**
- Create: `frontend/src/components/PrecosTab.jsx`
- Modify: `frontend/src/App.jsx`

> **Important:** This is a **move**, not a rewrite. Do not change the behavior of the price tab.

- [ ] **Step 1: Create PrecosTab.jsx with current App body**

Create `frontend/src/components/PrecosTab.jsx`. Open the current `frontend/src/App.jsx` (341 lines), and copy **everything inside the function `App`** (everything from line 24 `const [flights...` through line 339 `</div>` of the returned JSX, but NOT the wrapping `<div className="max-w-7xl ...">` — that stays in App.jsx).

The new component:

```jsx
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plane, Plus, Edit2, Trash2, ExternalLink, CheckCircle2, Circle, AlertCircle, Calendar, DollarSign, User, Link as LinkIcon, X, Users, GripVertical, RefreshCw, Mail, MessageSquare } from 'lucide-react';
import { useForm } from 'react-hook-form';
import Toast from './Toast';

const API_URL = '/api/flights';
const fmt = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff/60000);
  if (mins < 60) return `Verificado há ${mins} min`;
  const hrs = Math.floor(mins/60);
  if (hrs < 24) return `Verificado há ${hrs}h`;
  return `Verificado há ${Math.floor(hrs/24)} dias`;
}

export default function PrecosTab() {
  // ... (copy ENTIRE body of previous App() here, minus the outer max-w-7xl wrapper)
  // Replace the return wrapper from `<div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">`
  // to a React fragment: `<>`
  // The trailing `</div>` becomes `</>`.
}
```

> The header (`<header>`), Toast, and SettingsModal stay inside `PrecosTab` for this extraction step. They will be hoisted in Task 4.2.

- [ ] **Step 2: Reduce App.jsx to a thin shell that renders PrecosTab**

Replace `frontend/src/App.jsx` entirely with:

```jsx
import PrecosTab from './components/PrecosTab';

function App() {
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <PrecosTab />
    </div>
  );
}

export default App;
```

- [ ] **Step 3: Verify in browser (no behavior change)**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173. Confirm: the page looks **identical** to before. Add/edit/delete a flight as a smoke test. Then stop dev server.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/PrecosTab.jsx
git commit -m "refactor(frontend): extract PrecosTab from App.jsx (no behavior change)"
```

---

### Task 4.2: Tabs component + App shell with header

**Files:**
- Create: `frontend/src/components/Tabs.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/PrecosTab.jsx` (hoist header out)

- [ ] **Step 1: Create Tabs.jsx**

Create `frontend/src/components/Tabs.jsx`:

```jsx
export default function Tabs({ active, onChange, tabs }) {
  return (
    <div className="flex gap-1 bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-xl p-1 mb-6">
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all cursor-pointer flex-1 justify-center ${
            active === t.value
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Hoist header + Toast + SettingsModal out of PrecosTab**

Edit `frontend/src/components/PrecosTab.jsx` and **remove** the `<header>` block, the `<SettingsModal>` mount, and the `<Toast>` mount. Keep `showToast`/`setToast` local but expose toast via a prop:

Change the signature to `export default function PrecosTab({ showToast })` and remove the local `toast` state. Replace internal calls to `showToast` to use the prop.

Also remove the `import logo from './assets/logo.png'`, `import Toast`, `import SettingsModal`, and the `Settings`, `Plus` icons used by the header.

- [ ] **Step 3: New App.jsx**

Replace `frontend/src/App.jsx` with:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { Plane, DollarSign, Settings, Activity } from 'lucide-react';
import logo from './assets/logo.png';
import Tabs from './components/Tabs';
import Toast from './components/Toast';
import SettingsModal from './components/SettingsModal';
import PrecosTab from './components/PrecosTab';
import StatusTab from './components/StatusTab';

const TABS = [
  { value: 'precos', label: 'Preços', icon: <DollarSign className="w-4 h-4" /> },
  { value: 'status', label: 'Status', icon: <Activity className="w-4 h-4" /> }
];

function App() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'precos');
  const [toast, setToast] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const showToast = useCallback((message, type='info') => setToast({ message, type }), []);

  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Clube do Voo" className="w-14 h-14 rounded-full object-cover border-2 border-indigo-500/30 shadow-lg shadow-indigo-500/20" />
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Monitoramento de Voos Prime</h1>
            <p className="text-slate-400 text-sm mt-1">Painel administrativo de passagens aéreas monitoradas</p>
          </div>
        </div>
        <button onClick={()=>setSettingsOpen(true)} className="p-2.5 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer border border-slate-700/50" title="Configurações">
          <Settings className="w-5 h-5" />
        </button>
      </header>

      <Tabs active={activeTab} onChange={setActiveTab} tabs={TABS} />

      {activeTab === 'precos' ? <PrecosTab showToast={showToast} /> : <StatusTab showToast={showToast} />}

      <SettingsModal isOpen={settingsOpen} onClose={()=>setSettingsOpen(false)} onToast={showToast} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={()=>setToast(null)} />}
    </div>
  );
}

export default App;
```

- [ ] **Step 4: Stub StatusTab so app boots**

Create `frontend/src/components/StatusTab.jsx` (full impl in Task 4.3):

```jsx
export default function StatusTab() {
  return (
    <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-12 text-center text-slate-400">
      Aba Status em construção…
    </div>
  );
}
```

- [ ] **Step 5: Verify in browser**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173. Confirm:
- Header shows logo + title + Settings button (no Plus button anymore — that's in PrecosTab).
- Tabs row appears below header.
- Clicking "Status" shows placeholder; clicking "Preços" shows the original table.
- Toggle: New Voo modal still opens from PrecosTab.
- Reload page → last active tab is restored.

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Tabs.jsx \
        frontend/src/components/PrecosTab.jsx frontend/src/components/StatusTab.jsx
git commit -m "feat(frontend): add Tabs in header with localStorage persistence"
```

---

### Task 4.3: StatusTab table + create modal

**Files:**
- Modify: `frontend/src/components/StatusTab.jsx`
- Create: `frontend/src/components/StatusModal.jsx`

- [ ] **Step 1: Implement StatusModal**

Create `frontend/src/components/StatusModal.jsx`:

```jsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { X, User, Plane, Calendar, Mail, MessageSquare, Clock } from 'lucide-react';

const CADENCIA_OPTIONS = [
  { value: 15, label: 'A cada 15 minutos' },
  { value: 30, label: 'A cada 30 minutos' },
  { value: 60, label: 'A cada 1 hora' },
  { value: 120, label: 'A cada 2 horas' },
  { value: 240, label: 'A cada 4 horas' },
  { value: 360, label: 'A cada 6 horas' },
  { value: 720, label: 'A cada 12 horas' },
  { value: 1440, label: '1× por dia' }
];

const inputCls = "w-full bg-slate-800/50 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all px-4 py-2.5 rounded-lg";

export default function StatusModal({ isOpen, onClose, editing, onSubmit }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    if (editing) {
      reset({
        cliente: editing.cliente,
        numero_voo: editing.numero_voo,
        data_voo: editing.data_voo,
        email_cliente: editing.email_cliente || '',
        telegram_chat_id: editing.telegram_chat_id || '',
        cadencia_minutos: editing.cadencia_minutos
      });
    } else {
      reset({ cliente:'', numero_voo:'', data_voo:'', email_cliente:'', telegram_chat_id:'', cadencia_minutos:60 });
    }
  }, [editing, reset, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-semibold text-white">{editing ? 'Editar Voo' : 'Monitorar Novo Voo'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><User className="w-4 h-4" /> Cliente</label>
            <input {...register('cliente', { required: true })} className={inputCls} placeholder="Nome do passageiro" />
            {errors.cliente && <span className="text-xs text-red-400">Obrigatório</span>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><Plane className="w-4 h-4" /> Número do Voo</label>
              <input {...register('numero_voo', { required: true, pattern: /^[A-Z0-9]{2}\d{1,4}$/i })}
                     className={inputCls} placeholder="LA8084" disabled={!!editing} />
              {errors.numero_voo && <span className="text-xs text-red-400">Formato: 2 letras/dígitos + 1-4 dígitos</span>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><Calendar className="w-4 h-4" /> Data do Voo</label>
              <input type="date" {...register('data_voo', { required: true })} className={inputCls} disabled={!!editing} />
              {errors.data_voo && <span className="text-xs text-red-400">Obrigatório</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><Mail className="w-4 h-4" /> E-mail</label>
              <input type="email" {...register('email_cliente')} className={inputCls} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Telegram ID</label>
              <input {...register('telegram_chat_id')} className={inputCls} placeholder="@usuario ou ID" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><Clock className="w-4 h-4" /> Cadência de Checagem</label>
            <select {...register('cadencia_minutos', { required: true, valueAsNumber: true })} className={`${inputCls} appearance-none`}>
              {CADENCIA_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>)}
            </select>
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t border-slate-700/50">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer">Cancelar</button>
            <button type="submit" className="px-5 py-2.5 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95">
              {editing ? 'Salvar' : 'Monitorar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement StatusTab**

Replace `frontend/src/components/StatusTab.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plane, Plus, Edit2, Trash2, RefreshCw, Pause, Play, Clock, Activity, AlertTriangle, CheckCircle2, History } from 'lucide-react';
import StatusModal from './StatusModal';
import StatusHistoryDrawer from './StatusHistoryDrawer';

const API_URL = '/api/monitored-flights';

const STATUS_STYLES = {
  scheduled: { color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: '🟢', label: 'Programado' },
  active:    { color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: '🟢', label: 'Em voo' },
  delayed:   { color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',       icon: '🟡', label: 'Atrasado' },
  cancelled: { color: 'bg-red-500/10 text-red-400 border-red-500/20',             icon: '🔴', label: 'Cancelado' },
  diverted:  { color: 'bg-red-500/10 text-red-400 border-red-500/20',             icon: '🔴', label: 'Desviado' },
  landed:    { color: 'bg-slate-500/10 text-slate-400 border-slate-500/20',       icon: '⚫', label: 'Pousou' }
};

function formatLocal(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatTimeShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function untilNow(iso) {
  if (!iso) return '—';
  const diffMin = Math.round((new Date(iso) - Date.now()) / 60000);
  if (diffMin < -1) return 'vencido';
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `em ${diffMin}min`;
  return `em ${Math.floor(diffMin/60)}h${diffMin%60 ? (diffMin%60)+'min' : ''}`;
}

export default function StatusTab({ showToast }) {
  const [flights, setFlights] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [checkingId, setCheckingId] = useState(null);

  const fetchFlights = useCallback(async () => {
    try { setFlights((await axios.get(API_URL)).data); }
    catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchFlights(); }, [fetchFlights]);
  useEffect(() => {
    const t = setInterval(fetchFlights, 30000);
    return () => clearInterval(t);
  }, [fetchFlights]);

  const handleSubmit = async (data) => {
    try {
      if (editing) {
        await axios.put(`${API_URL}/${editing.id}`, data);
        showToast('Voo atualizado', 'success');
      } else {
        await axios.post(API_URL, data);
        showToast('Voo monitorado', 'success');
      }
      setModalOpen(false); setEditing(null);
      fetchFlights();
    } catch (e) {
      showToast(e.response?.data?.error || 'Erro ao salvar', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remover este voo do monitoramento?')) return;
    try { await axios.delete(`${API_URL}/${id}`); fetchFlights(); showToast('Removido', 'success'); }
    catch (e) { showToast('Erro ao remover', 'error'); }
  };

  const handleToggle = async (id) => {
    try { await axios.post(`${API_URL}/${id}/toggle`); fetchFlights(); }
    catch (e) { showToast('Erro ao alternar', 'error'); }
  };

  const handleCheckNow = async (id) => {
    setCheckingId(id);
    try {
      const { data } = await axios.post(`${API_URL}/${id}/check-now`);
      if (data.sucesso) showToast(`Status: ${data.status_atual}`, 'success');
      else showToast(data.erro || 'Falha ao consultar', 'error');
      fetchFlights();
    } catch (e) { showToast('Erro ao consultar', 'error'); }
    finally { setCheckingId(null); }
  };

  const stats = {
    total: flights.length,
    ativos: flights.filter(f => f.monitoramento_ativo).length,
    alertas24h: 0,  // populated only when history is queried per-flight; kept as 0 placeholder
    proximaCheck: flights
      .filter(f => f.monitoramento_ativo && f.proxima_verificacao)
      .map(f => f.proxima_verificacao)
      .sort()[0]
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => { setEditing(null); setModalOpen(true); }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-medium shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95">
          <Plus className="w-5 h-5" /> Monitorar Voo
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Plane className="w-5 h-5" />} label="Total" value={stats.total} />
        <StatCard icon={<Activity className="w-5 h-5" />} label="Ativos" value={`${stats.ativos} / ${stats.total}`} />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Alertas (24h)" value={stats.alertas24h} />
        <StatCard icon={<Clock className="w-5 h-5" />} label="Próx. check" value={untilNow(stats.proximaCheck)} />
      </div>

      <main className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/80 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-6 py-4 font-semibold">Cliente</th>
                <th className="px-4 py-4 font-semibold">Voo</th>
                <th className="px-4 py-4 font-semibold">Data</th>
                <th className="px-4 py-4 font-semibold">Trecho</th>
                <th className="px-4 py-4 font-semibold">Status</th>
                <th className="px-4 py-4 font-semibold">Partida</th>
                <th className="px-4 py-4 font-semibold">Próx. check</th>
                <th className="px-6 py-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400">Carregando...</td></tr>
              ) : flights.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                  <Plane className="w-12 h-12 mx-auto text-slate-600 mb-3 opacity-50" />Nenhum voo sendo monitorado.
                </td></tr>
              ) : flights.map(f => {
                const style = STATUS_STYLES[f.status_atual] || { color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: '⚪', label: f.status_atual || '—' };
                return (
                  <tr key={f.id} className="hover:bg-slate-800/30 group">
                    <td className="px-6 py-4 font-semibold text-slate-200">{f.cliente}</td>
                    <td className="px-4 py-4 font-mono text-slate-300">{f.numero_voo}</td>
                    <td className="px-4 py-4 text-slate-300">{f.data_voo}</td>
                    <td className="px-4 py-4 text-slate-300">{f.origem || '?'}→{f.destino || '?'}</td>
                    <td className="px-4 py-4">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${style.color}`}>
                        {style.icon} {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-300 text-sm">
                      <div>{formatTimeShort(f.partida_programada)} {f.partida_estimada && f.partida_estimada !== f.partida_programada && <span className="text-amber-400">→ {formatTimeShort(f.partida_estimada)}</span>}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-xs">{f.monitoramento_ativo ? untilNow(f.proxima_verificacao) : <span className="text-slate-600">pausado</span>}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleCheckNow(f.id)} disabled={checkingId === f.id} className="p-2 text-slate-400 hover:text-amber-400 bg-slate-800 hover:bg-amber-500/20 rounded-lg cursor-pointer disabled:opacity-50" title="Checar agora">
                          <RefreshCw className={`w-4 h-4 ${checkingId === f.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={() => setHistoryId(f.id)} className="p-2 text-slate-400 hover:text-purple-400 bg-slate-800 hover:bg-purple-500/20 rounded-lg cursor-pointer" title="Histórico">
                          <History className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleToggle(f.id)} className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer" title={f.monitoramento_ativo ? 'Pausar' : 'Reativar'}>
                          {f.monitoramento_ativo ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button onClick={() => { setEditing(f); setModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-400 bg-slate-800 hover:bg-blue-500/20 rounded-lg cursor-pointer" title="Editar">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(f.id)} className="p-2 text-slate-400 hover:text-red-400 bg-slate-800 hover:bg-red-500/20 rounded-lg cursor-pointer" title="Remover">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      <StatusModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} editing={editing} onSubmit={handleSubmit} />
      <StatusHistoryDrawer flightId={historyId} onClose={() => setHistoryId(null)} />
    </>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
      <div className="bg-indigo-500/10 p-2.5 rounded-lg text-indigo-400 border border-indigo-500/20">{icon}</div>
      <div><div className="text-xs text-slate-400 font-medium">{label}</div><div className="text-lg font-bold text-white">{value}</div></div>
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

```bash
cd backend && AVIATION_API_MODE=stub node server.js &
cd frontend && npm run dev
```

In the SPA:
- Switch to "Status" tab.
- Click "Monitorar Voo", create `LA8084 / 2026-05-22 / João`. Should appear in the table.
- Click ▶ (check now). Stub returns `scheduled`; status badge updates to 🟢 Programado.
- Click ⏸ to pause; status check column shows "pausado". Click ▶ to reactivate.
- Click ✏ to edit cadência to "A cada 15 minutos".
- Click 🗑 to delete. Confirm modal, row disappears.

Stop both processes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/StatusTab.jsx frontend/src/components/StatusModal.jsx
git commit -m "feat(frontend): StatusTab with CRUD, check-now, toggle"
```

---

### Task 4.4: StatusHistoryDrawer (timeline)

**Files:**
- Create: `frontend/src/components/StatusHistoryDrawer.jsx`

- [ ] **Step 1: Implement drawer**

Create `frontend/src/components/StatusHistoryDrawer.jsx`:

```jsx
import { useEffect, useState } from 'react';
import axios from 'axios';
import { X, CheckCircle2, AlertTriangle, XCircle, Clock, Archive, AlertOctagon } from 'lucide-react';

const EVENT_META = {
  check_ok:           { icon: CheckCircle2, color: 'text-emerald-400', label: 'Verificação OK' },
  cancelado:          { icon: XCircle,      color: 'text-red-400',     label: 'Cancelado' },
  atrasado:           { icon: AlertTriangle,color: 'text-amber-400',   label: 'Atrasado' },
  reagendado:         { icon: Clock,        color: 'text-amber-400',   label: 'Reagendado' },
  portao_alterado:    { icon: AlertTriangle,color: 'text-slate-400',   label: 'Portão alterado' },
  terminal_alterado:  { icon: AlertTriangle,color: 'text-slate-400',   label: 'Terminal alterado' },
  arquivado_auto:     { icon: Archive,      color: 'text-slate-500',   label: 'Arquivado automaticamente' },
  erro_api:           { icon: AlertOctagon, color: 'text-orange-400',  label: 'Erro na consulta da API' }
};

function fmtLocal(iso) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

export default function StatusHistoryDrawer({ flightId, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!flightId) { setData(null); return; }
    axios.get(`/api/monitored-flights/${flightId}`)
      .then(r => setData(r.data))
      .catch(() => setData({ flight: null, history: [] }));
  }, [flightId]);

  if (!flightId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-slate-900 border-l border-slate-700/50 shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl flex justify-between items-center p-6 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">
            Histórico {data?.flight && <span className="text-slate-400 font-normal text-sm">— {data.flight.numero_voo} / {data.flight.data_voo}</span>}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {!data ? (
            <p className="text-slate-400 text-sm">Carregando…</p>
          ) : data.history.length === 0 ? (
            <p className="text-slate-400 text-sm">Nenhum evento registrado ainda.</p>
          ) : (
            <ol className="relative border-l border-slate-700 ml-3 space-y-6">
              {data.history.map(ev => {
                const meta = EVENT_META[ev.evento] || { icon: AlertTriangle, color: 'text-slate-400', label: ev.evento };
                const Icon = meta.icon;
                const payload = ev.payload_json ? JSON.parse(ev.payload_json) : null;
                return (
                  <li key={ev.id} className="ml-6">
                    <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 bg-slate-900 rounded-full ring-4 ring-slate-900 ${meta.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="text-xs text-slate-500">{fmtLocal(ev.verificado_em)} {ev.notificado ? <span className="ml-2 text-emerald-400">• notificado</span> : ''}</div>
                    <div className={`text-sm font-semibold ${meta.color}`}>{meta.label}</div>
                    {Array.isArray(payload) && payload.length > 0 && (
                      <ul className="mt-1 text-xs text-slate-400 space-y-0.5">
                        {payload.map((p, i) => (
                          <li key={i}><b>{p.campo}:</b> {p.antes || '—'} → {p.depois || '—'}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Start both server + dev. In Status tab, on any flight, click 📜 (History). Drawer slides from the right, shows timeline. After clicking ▶ check-now, reopening drawer shows a new `check_ok` entry.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StatusHistoryDrawer.jsx
git commit -m "feat(frontend): StatusHistoryDrawer with event timeline"
```

---

### Task 4.5: Documentation + .env.example

**Files:**
- Modify: `README.md` (create if missing)
- Modify: `.env.example` (create if missing)

- [ ] **Step 1: Create/update .env.example at repo root**

Create or append to `.env.example`:

```
# === Existing (price monitoring) ===
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=
TELEGRAM_BOT_TOKEN=
CHECK_INTERVAL_HOURS=6
MAX_CONCURRENT_SCRAPERS=3
ALERT_RESET_THRESHOLD=1.10

# === Status monitoring (new) ===
# Set to "stub" for local dev without API key; "real" to call AeroDataBox.
AVIATION_API_MODE=stub
RAPIDAPI_KEY=
AERODATABOX_HOST=aerodatabox.p.rapidapi.com
DELAY_THRESHOLD_MIN=15
STATUS_MONITOR_BATCH_SIZE=10
```

- [ ] **Step 2: Add README section**

If `README.md` exists at repo root, append:

```markdown
## Aba Status de Voos

Monitora cancelamentos, atrasos e reagendamentos via AeroDataBox (RapidAPI).

### Obtendo uma chave da API

1. Crie conta em https://rapidapi.com.
2. Assine **AeroDataBox** (free tier para testes; plano BASIC ~$10/mês para produção).
3. Copie a chave em "X-RapidAPI-Key" e cole em `RAPIDAPI_KEY` no `.env`.
4. Defina `AVIATION_API_MODE=real`.

### Configurações

| Variável | Default | Descrição |
|---|---|---|
| `AVIATION_API_MODE` | `stub` | `stub` retorna dados fakes (dev). `real` chama a API. |
| `DELAY_THRESHOLD_MIN` | `15` | Minutos mínimos de atraso para gerar alerta. |
| `STATUS_MONITOR_BATCH_SIZE` | `10` | Voos processados por ciclo do scheduler (a cada 5min). |

### Polling

A cadência por voo é configurável na UI (15min, 30min, 1h, …, 1×/dia). O scheduler roda a cada 5min e processa apenas voos cujo `proxima_verificacao` já venceu. Voos com status `landed` há mais de 2h são automaticamente pausados.
```

If `README.md` does not exist, create with the above as the only content (plus a top-level `# Painel de Voos Monitorados` heading).

- [ ] **Step 3: Commit**

```bash
git add README.md .env.example
git commit -m "docs: add status monitoring section to README and env example"
```

---

## Phase 5 — Final verification

### Task 5.1: Full test suite + manual end-to-end

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && npm test`
Expected: all suites PASS.

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: build completes without errors.

- [ ] **Step 3: Full local smoke test**

Run:
```bash
cd backend && AVIATION_API_MODE=stub node server.js
```

Open http://localhost:3000 (server now also serves built frontend). Smoke-test:

- [ ] Preços tab: list/add/edit/delete a flight → unchanged behavior.
- [ ] Tabs persist after reload.
- [ ] Status tab: add `LA8084 / future-date / Test`.
- [ ] Click check-now → status updates to "Programado".
- [ ] Click history → timeline shows `check_ok`.
- [ ] Edit cadência → próxima verificação column updates.
- [ ] Toggle pause → status check column shows "pausado".
- [ ] Delete → row disappears, history is cascade-removed.

Stop server.

- [ ] **Step 4: Verify Dockerfile still builds** (optional but recommended)

```bash
docker build -t painel-voos:test .
```

Expected: build completes. No code changes needed in the Dockerfile — both new tables migrate on startup, and `npm ci --omit=dev` keeps Jest out of production image.

- [ ] **Step 5: Final commit (if any leftover changes)**

```bash
git status
# If clean, skip. Otherwise:
git add -A && git commit -m "chore: final verification"
```

---

## Done criteria (mirror of spec §10)

- [ ] Criar voo via UI → aparece na lista.
- [ ] Editar cadência → `proxima_verificacao` recalculada.
- [ ] check-now → snapshot atualiza, histórico ganha evento.
- [ ] Mudança para `cancelled` → email + Telegram com template **vermelho**.
- [ ] Atraso ≥ threshold ou reagendamento → email + Telegram com template **âmbar**.
- [ ] Mesma condição em ciclo seguinte → não duplica alerta (anti-spam).
- [ ] `landed` + 2h → automaticamente pausado.
- [ ] Aba Preços continua funcional (zero regressão).
- [ ] Tabs persistem ao recarregar.
- [ ] Todos timestamps DB em UTC; UI exibe local.

## Reference

- Spec: [docs/superpowers/specs/2026-05-17-aba-status-voos-design.md](../specs/2026-05-17-aba-status-voos-design.md)
- AeroDataBox docs: https://rapidapi.com/aedbx-aedbx/api/aerodatabox
