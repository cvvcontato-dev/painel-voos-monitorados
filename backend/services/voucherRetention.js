const fs = require('fs');
const cron = require('node-cron');
const db = require('../database');

const RETENTION_DAYS = Number(process.env.VOUCHER_RETENTION_DAYS || 30);

function runOnce() {
  return new Promise((resolve) => {
    db.all(
      `SELECT id, source_file_path, user_id FROM vouchers
       WHERE source_file_path IS NOT NULL
         AND created_at <= datetime('now', ?)`,
      [`-${RETENTION_DAYS} days`],
      (err, rows) => {
        if (err) { console.error('[voucherRetention] erro ao listar', err.message); return resolve(0); }
        if (!rows || !rows.length) return resolve(0);
        let n = 0;
        rows.forEach(r => {
          try { if (fs.existsSync(r.source_file_path)) fs.unlinkSync(r.source_file_path); }
          catch (e) { console.error('[voucherRetention] erro ao remover arquivo', r.source_file_path, e.message); }
          db.run(`UPDATE vouchers SET source_file_path = NULL WHERE id = ?`, [r.id]);
          db.run(
            `INSERT INTO voucher_audit_log (voucher_id, user_id, action, details) VALUES (?, ?, 'retention_cleanup', ?)`,
            [r.id, r.user_id, JSON.stringify({ retentionDays: RETENTION_DAYS })],
            (err2) => { if (err2) console.error('[voucherRetention] audit falhou', err2.message); }
          );
          n++;
        });
        resolve(n);
      }
    );
  });
}

function startJob() {
  cron.schedule('30 3 * * *', () => runOnce().then(n => { if (n) console.log(`[voucherRetention] limpou ${n} arquivos`); }));
}

module.exports = { runOnce, startJob };
