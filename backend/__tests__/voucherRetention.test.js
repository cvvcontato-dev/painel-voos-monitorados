const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../database');
const { runOnce, runOncePackages } = require('../services/voucherRetention');

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

    const { cleaned, failed } = await runOnce();
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(failed).toBe(0);
    expect(fs.existsSync(tmp)).toBe(false);

    const after = await new Promise(r => db.get(`SELECT source_file_path, unified_json FROM vouchers WHERE id = ?`, [voucherId], (e, row) => r(row)));
    expect(after.source_file_path).toBeNull();
    expect(after.unified_json).toBe('{}'); // JSON preserved

    const audit = await new Promise(r => db.get(`SELECT * FROM voucher_audit_log WHERE voucher_id = ? AND action = 'retention_cleanup'`, [voucherId], (e, row) => r(row)));
    expect(audit).toBeTruthy();
  });
});

describe('voucherRetention.runOncePackages', () => {
  test('apaga arquivos de pacotes com mais de 30 dias e nullifica source_file_paths', async () => {
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

    const tmp1 = path.join(os.tmpdir(), `pr-${Date.now()}-1.pdf`);
    const tmp2 = path.join(os.tmpdir(), `pr-${Date.now()}-2.pdf`);
    fs.writeFileSync(tmp1, 'x');
    fs.writeFileSync(tmp2, 'x');
    const sourcePaths = `${tmp1}|${tmp2}`;

    const packageId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO packages (user_id, title, package_json, source_file_paths, source_file_hash, created_at)
         VALUES (?, 'pkg', '{}', ?, 'h', datetime('now','-40 days'))`,
        [userId, sourcePaths],
        function (err) { err ? reject(err) : resolve(this.lastID); }
      );
    });

    const { cleaned, failed } = await runOncePackages();
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(failed).toBe(0);
    expect(fs.existsSync(tmp1)).toBe(false);
    expect(fs.existsSync(tmp2)).toBe(false);

    const after = await new Promise(r => db.get(`SELECT source_file_paths, package_json FROM packages WHERE id = ?`, [packageId], (e, row) => r(row)));
    expect(after.source_file_paths).toBeNull();
    expect(after.package_json).toBe('{}'); // JSON preserved

    const audit = await new Promise(r => db.get(`SELECT * FROM package_audit_log WHERE package_id = ? AND action = 'retention_cleanup'`, [packageId], (e, row) => r(row)));
    expect(audit).toBeTruthy();
  });

  test('sem pacotes antigos retorna cleaned:0, failed:0', async () => {
    const result = await runOncePackages();
    expect(result).toEqual({ cleaned: 0, failed: 0 });
  });
});
