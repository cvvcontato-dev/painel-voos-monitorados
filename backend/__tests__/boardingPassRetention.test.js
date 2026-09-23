const db = require('../database');
const { runOnce } = require('../services/boardingPassRetention');

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { e ? reject(e) : resolve(this); }));
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => e ? reject(e) : resolve(row)));
}

async function userId() {
  const row = await get(`SELECT id FROM users LIMIT 1`);
  if (row) return row.id;
  const r = await run(`INSERT INTO users (email, nome, password_hash, role, criado_em)
                       VALUES ('bp-retention@test.com', 'bp', 'x', 'admin', datetime('now'))`);
  return r.lastID;
}

async function insertSend(uid, flightDateSql, createdAtSql) {
  const r = await run(
    `INSERT INTO boarding_pass_sends (user_id, payload_json, flight_date, created_at)
     VALUES (?, '{"passengers":[]}', ${flightDateSql}, ${createdAtSql})`, [uid]);
  await run(`INSERT INTO boarding_pass_links (send_id, passenger_index, segment_index, original_url, clean_url)
             VALUES (?, 0, 0, 'u', 'u')`, [r.lastID]);
  return r.lastID;
}

test('apaga envios 7+ dias após o voo (ou após a criação, sem data) e seus links', async () => {
  const uid = await userId();
  const oldFlight = await insertSend(uid, "date('now','-10 days')", "datetime('now','-20 days')");
  const future = await insertSend(uid, "date('now','+3 days')", "datetime('now','-20 days')");
  const oldNoDate = await insertSend(uid, 'NULL', "datetime('now','-10 days')");
  const recentNoDate = await insertSend(uid, 'NULL', "datetime('now','-1 days')");

  const { deleted } = await runOnce();
  expect(deleted).toBeGreaterThanOrEqual(2);

  const exists = async id => !!(await get(`SELECT id FROM boarding_pass_sends WHERE id = ?`, [id]));
  expect(await exists(oldFlight)).toBe(false);
  expect(await exists(oldNoDate)).toBe(false);
  expect(await exists(future)).toBe(true);
  expect(await exists(recentNoDate)).toBe(true);

  const orphan = await get(`SELECT COUNT(*) AS n FROM boarding_pass_links WHERE send_id IN (?, ?)`, [oldFlight, oldNoDate]);
  expect(orphan.n).toBe(0);
});
