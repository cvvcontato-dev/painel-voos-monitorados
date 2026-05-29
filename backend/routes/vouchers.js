const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { extractVoucher } = require('../services/voucherExtractor');
const { validate } = require('../services/voucherSchema');
const { normalize } = require('../services/voucherNormalizer');
const { uploadsDir } = require('../helpers/voucherWorkspace');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function audit(voucherId, userId, action, details, sourceHash) {
  db.run(
    `INSERT INTO voucher_audit_log (voucher_id, user_id, action, source_file_hash, details) VALUES (?, ?, ?, ?, ?)`,
    [voucherId, userId, action, sourceHash || null, details ? JSON.stringify(details) : null]
  );
}

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'arquivo obrigatório (campo "file")' });
  try {
    const unified = await extractVoucher(req.file.buffer, req.file.mimetype);
    const v = validate(unified);
    if (!v.ok) return res.status(422).json({ error: 'schema inválido após extração', details: v.errors });

    const hash = 'sha256:' + crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    unified.meta.sourceFileHash = hash;
    const filename = `${Date.now()}-${hash.slice(7, 19)}${path.extname(req.file.originalname) || ''}`;
    const filePath = path.join(uploadsDir(), filename);
    fs.writeFileSync(filePath, req.file.buffer);

    db.run(
      `INSERT INTO vouchers (user_id, carrier, layout_version, source_file_path, source_file_hash, unified_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.userId, unified.carrier, unified.layoutVersion, filePath, hash, JSON.stringify(unified)],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        audit(this.lastID, req.session.userId, 'create', { filename: req.file.originalname }, hash);
        res.status(201).json({ id: this.lastID, unified });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', (req, res) => {
  db.all(
    `SELECT id, carrier, layout_version, created_at, updated_at FROM vouchers WHERE user_id = ? ORDER BY id DESC LIMIT 100`,
    [req.session.userId],
    (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});

router.get('/:id', (req, res) => {
  db.get(
    `SELECT * FROM vouchers WHERE id = ? AND user_id = ?`,
    [req.params.id, req.session.userId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'não encontrado' });
      row.unified = JSON.parse(row.unified_json);
      delete row.unified_json;
      res.json(row);
    }
  );
});

router.put('/:id', (req, res) => {
  const unified = req.body && req.body.unified;
  if (!unified) return res.status(400).json({ error: 'campo "unified" obrigatório' });
  const norm = normalize(unified);
  const v = validate(norm);
  if (!v.ok) return res.status(422).json({ error: 'schema inválido', details: v.errors });
  db.run(
    `UPDATE vouchers SET unified_json = ?, layout_version = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
    [JSON.stringify(norm), norm.layoutVersion, req.params.id, req.session.userId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'não encontrado' });
      audit(req.params.id, req.session.userId, 'update', null, null);
      res.json({ id: Number(req.params.id), unified: norm });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.get(`SELECT source_file_path FROM vouchers WHERE id = ? AND user_id = ?`,
    [req.params.id, req.session.userId], (err, row) => {
      if (err || !row) return res.status(404).json({ error: 'não encontrado' });
      try { if (row.source_file_path && fs.existsSync(row.source_file_path)) fs.unlinkSync(row.source_file_path); } catch (_) {}
      db.run(`DELETE FROM vouchers WHERE id = ?`, [req.params.id], () => {
        audit(req.params.id, req.session.userId, 'delete', null, null);
        res.status(204).end();
      });
    });
});

module.exports = router;
