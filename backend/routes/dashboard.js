const express = require('express');
const db = require('../database');

const router = express.Router();

function getCount(sql, params = []) {
  return new Promise((resolve) => {
    db.get(sql, params, (err, row) => {
      if (err || !row) return resolve(0);
      resolve(Number(row.cnt) || 0);
    });
  });
}

router.get('/summary', async (req, res) => {
  const userId = req.session.userId;
  try {
    const [alertasPreco, voosMonitorados, alteracoesPendentes, statusAtencao, statusAtivos, totalVouchers] = await Promise.all([
      getCount(`SELECT COUNT(*) as cnt FROM flights WHERE preco_atual > 0 AND preco_atual <= preco_esperado AND status != 'comprado'`),
      getCount(`SELECT COUNT(*) as cnt FROM flights WHERE status != 'comprado'`),
      getCount(`SELECT COUNT(*) as cnt FROM flight_changes WHERE user_id = ? AND status != 'confirmado'`, [userId]),
      getCount(`SELECT COUNT(*) as cnt FROM monitored_flights_status WHERE monitoramento_ativo = 1 AND status_atual IS NOT NULL AND status_atual NOT IN ('Programado', 'programado', 'Concluído', 'concluido', 'Pousou', 'pousou')`),
      getCount(`SELECT COUNT(*) as cnt FROM monitored_flights_status WHERE monitoramento_ativo = 1`),
      getCount(`SELECT COUNT(*) as cnt FROM vouchers WHERE user_id = ?`, [userId])
    ]);

    res.json({
      precos: {
        alertas: alertasPreco,
        total: voosMonitorados
      },
      alteracoes: {
        pendentes: alteracoesPendentes
      },
      status: {
        atencao: statusAtencao,
        ativos: statusAtivos
      },
      vouchers: {
        total: totalVouchers
      }
    });
  } catch (err) {
    console.error('[DASHBOARD] erro ao obter resumo:', err.message);
    res.status(500).json({ error: 'erro ao obter resumo do painel' });
  }
});

module.exports = router;
