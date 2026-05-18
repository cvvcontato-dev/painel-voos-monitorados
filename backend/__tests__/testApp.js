process.env.AVIATION_API_MODE = 'stub';
process.env.DB_PATH = require('path').join(__dirname, '.tmp');
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'AdminPass123!';
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

module.exports = { makeApp, waitForDb };
