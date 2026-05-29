const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../database');
const { runOnce } = require('../services/voucherRetention');

describe('voucherRetention.runOnce', () => {
  test('apaga arquivos de vouchers com mais de 30 dias e mantém JSON+audit', async () => {
    // FK ON em database.js — precisamos de um user real.
    // Schema users: email, nome NOT NULL, password_hash NOT NULL, role, criado_em NOT NULL
    const userId = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM users LIMIT 1`, (err, row) => {
        if (err) return reject(err);
        if (row) return resolve(row.id);
        db.run(
          `INSERT INTO users (email, nome, password_hash, role, criado_em)
           VALUES ('retention@test.com', 'retention', 'x', 'admin', datetime('now'))`,
          function (e) { e ? reject(e) : resolve(this.lastID); }
        );
      });
    });

    const tmp = path.join(os.tmpdir(), `vr-${Date.now()}.pdf`);
    fs.writeFileSync(tmp, 'x');

    const voucherId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO vouchers (user_id, carrier, layout_version, source_file_path, source_file_hash, unified_json, created_at)
         VALUES (?, 'azul','azul.confirmacao.v1', ?, 'h', '{}', datetime('now','-40 days'))`,
        [userId, tmp],
        function (err) { err ? reject(err) : resolve(this.lastID); }
      );
    });

    const cleaned = await runOnce();
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(tmp)).toBe(false);

    // wait a beat for the async UPDATE/INSERT to settle (sqlite3 callbacks are async)
    await new Promise(r => setTimeout(r, 200));

    const after = await new Promise(r => db.get(`SELECT source_file_path, unified_json FROM vouchers WHERE id = ?`, [voucherId], (e, row) => r(row)));
    expect(after.source_file_path).toBeNull();
    expect(after.unified_json).toBe('{}'); // JSON preserved

    const audit = await new Promise(r => db.get(`SELECT * FROM voucher_audit_log WHERE voucher_id = ? AND action = 'retention_cleanup'`, [voucherId], (e, row) => r(row)));
    expect(audit).toBeTruthy();
  });
});
