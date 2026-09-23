// Retenção da aba Cartões de Embarque: apaga envios (e links) N dias após o voo.
// Sem data de voo, conta a partir da criação. BOARDING_PASS_RETENTION_DAYS (default 7).

const cron = require('node-cron');
const db = require('../database');

const RETENTION_DAYS = Number(process.env.BOARDING_PASS_RETENTION_DAYS || 7);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
}

async function runOnce() {
  try {
    const r = await dbRun(
      `DELETE FROM boarding_pass_sends WHERE date(COALESCE(flight_date, created_at)) <= date('now', ?)`,
      [`-${RETENTION_DAYS} days`]
    );
    // Garantia extra caso foreign_keys esteja desligado nesta conexão.
    await dbRun(`DELETE FROM boarding_pass_links WHERE send_id NOT IN (SELECT id FROM boarding_pass_sends)`);
    return { deleted: r.changes };
  } catch (err) {
    console.error('[boardingPassRetention] erro', err.message);
    return { deleted: 0 };
  }
}

function startJob() {
  // NOTE: chamado APENAS por server.js dentro do app.listen — não invocar de testes.
  cron.schedule('45 3 * * *', () => {
    runOnce().then(({ deleted }) => {
      if (deleted) console.log(`[boardingPassRetention] apagou ${deleted} envio(s)`);
    });
  });
}

module.exports = { runOnce, startJob };
