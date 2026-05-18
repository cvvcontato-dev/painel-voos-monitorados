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
const monitoredFlightsRouter = require('../routes/monitoredFlights');
const authRouter = require('../routes/auth');
const usersRouter = require('../routes/users');
const csrfMiddleware = require('../middleware/csrf');
const requireAuth = require('../middleware/requireAuth');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/monitored-flights', monitoredFlightsRouter);
  return app;
}

function makeAuthApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(session({
    store: new SqliteStore({
      db: 'sessions-test.sqlite',  // separate file — prevents Windows file lock on database.sqlite
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
  app.use('/api/users', usersRouter);
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  return app;
}

/**
 * Read the csrf token from a supertest response's set-cookie header.
 * Usage: const csrf = getCsrfFromResponse(res); then agent.post(...).set('X-CSRF-Token', csrf)
 */
function getCsrfFromResponse(res) {
  const cookies = (res.headers['set-cookie'] || []).join('; ');
  const match = cookies.match(/csrf=([^;]+)/);
  return match ? match[1] : '';
}

async function waitForDb() {
  // Poll until the monitored_flights_status table actually exists (migrations done)
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
  throw new Error('waitForDb: monitored_flights_status table never appeared after 5s');
}

module.exports = { makeApp, makeAuthApp, getCsrfFromResponse, waitForDb };
