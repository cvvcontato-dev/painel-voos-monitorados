const express = require('express');
const path = require('path');
const requireAdmin = require('../middleware/requireAdmin');
const { runBackup, listBackups, resolveBackupPath } = require('../services/backup');

const router = express.Router();

// Todas as rotas de backup são restritas a admin.
router.use(requireAdmin);

// GET /api/backups — lista as cópias disponíveis
router.get('/', (req, res) => {
  res.json({ backups: listBackups(), retencao: parseInt(process.env.BACKUP_KEEP, 10) || 14 });
});

// POST /api/backups/run — dispara um backup manual
router.post('/run', async (req, res) => {
  try {
    const r = await runBackup();
    if (!r.ok) return res.status(500).json({ error: r.motivo || 'falha_no_backup' });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backups/:arquivo — baixa uma cópia (permite guardar fora do servidor)
router.get('/:arquivo', (req, res) => {
  const caminho = resolveBackupPath(req.params.arquivo);
  if (!caminho) return res.status(404).json({ error: 'backup_nao_encontrado' });
  res.download(caminho, path.basename(caminho));
});

module.exports = router;
