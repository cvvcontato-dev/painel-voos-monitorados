const fs = require('fs');
const cron = require('node-cron');
const db = require('../database');

const RETENTION_DAYS = Number(process.env.VOUCHER_RETENTION_DAYS || 30);

function dbAll(sql, params) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
}
function dbRun(sql, params) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
}

async function processRow(r) {
  // Try unlink. ENOENT is fine — file already gone, still safe to null path + audit.
  let fileExisted = true;
  let unlinkError = null;
  try {
    if (fs.existsSync(r.source_file_path)) fs.unlinkSync(r.source_file_path);
    else fileExisted = false;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('[voucherRetention] erro ao remover arquivo', r.source_file_path, e.message);
      return { ok: false, error: e.message };
    }
    fileExisted = false;
  }
  try {
    await dbRun(`UPDATE vouchers SET source_file_path = NULL WHERE id = ?`, [r.id]);
    await dbRun(
      `INSERT INTO voucher_audit_log (voucher_id, user_id, action, details) VALUES (?, ?, 'retention_cleanup', ?)`,
      [r.id, r.user_id, JSON.stringify({ retentionDays: RETENTION_DAYS, fileExisted, unlinkError })]
    );
    return { ok: true };
  } catch (e) {
    console.error('[voucherRetention] erro ao registrar limpeza', r.id, e.message);
    return { ok: false, error: e.message };
  }
}

async function runOnce() {
  let rows;
  try {
    rows = await dbAll(
      `SELECT id, source_file_path, user_id FROM vouchers
       WHERE source_file_path IS NOT NULL AND created_at <= datetime('now', ?)`,
      [`-${RETENTION_DAYS} days`]
    );
  } catch (err) {
    console.error('[voucherRetention] erro ao listar', err.message);
    return { cleaned: 0, failed: 0 };
  }
  if (!rows.length) return { cleaned: 0, failed: 0 };
  const results = await Promise.all(rows.map(processRow));
  const cleaned = results.filter(r => r.ok).length;
  const failed = results.length - cleaned;
  if (failed) console.error(`[voucherRetention] ${failed} falha(s) — verificar logs`);
  return { cleaned, failed };
}

async function processPackageRow(r) {
  const paths = (r.source_file_paths || '').split('|').filter(Boolean);
  let unlinkError = null;
  for (const p of paths) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); }
    catch (e) { if (e.code !== 'ENOENT') { unlinkError = e.message; console.error('[packageRetention] erro ao remover', p, e.message); } }
  }
  try {
    await dbRun(`UPDATE packages SET source_file_paths = NULL WHERE id = ?`, [r.id]);
    await dbRun(
      `INSERT INTO package_audit_log (package_id, user_id, action, details) VALUES (?, ?, 'retention_cleanup', ?)`,
      [r.id, r.user_id, JSON.stringify({ retentionDays: RETENTION_DAYS, count: paths.length, unlinkError })]
    );
    return { ok: true };
  } catch (e) {
    console.error('[packageRetention] erro ao registrar limpeza', r.id, e.message);
    return { ok: false, error: e.message };
  }
}

async function runOncePackages() {
  let rows;
  try {
    rows = await dbAll(
      `SELECT id, source_file_paths, user_id FROM packages
       WHERE source_file_paths IS NOT NULL AND created_at <= datetime('now', ?)`,
      [`-${RETENTION_DAYS} days`]
    );
  } catch (err) {
    console.error('[packageRetention] erro ao listar', err.message);
    return { cleaned: 0, failed: 0 };
  }
  if (!rows.length) return { cleaned: 0, failed: 0 };
  const results = await Promise.all(rows.map(processPackageRow));
  const cleaned = results.filter(r => r.ok).length;
  const failed = results.length - cleaned;
  if (failed) console.error(`[packageRetention] ${failed} falha(s) — verificar logs`);
  return { cleaned, failed };
}

function startJob() {
  // NOTE: chamado APENAS por server.js dentro do app.listen — não invocar de testes.
  cron.schedule('30 3 * * *', () => {
    runOnce().then(({ cleaned, failed }) => {
      if (cleaned || failed) console.log(`[voucherRetention] limpou ${cleaned}, falhou ${failed}`);
    });
    runOncePackages().then(({ cleaned, failed }) => {
      if (cleaned || failed) console.log(`[packageRetention] limpou ${cleaned}, falhou ${failed}`);
    });
  });
}

module.exports = { runOnce, runOncePackages, startJob };
