const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { extractVoucher } = require('../services/voucherExtractor');
const { validate } = require('../services/voucherSchema');
const { normalize } = require('../services/voucherNormalizer');
const { renderVoucher } = require('../services/voucherRenderer');
const { uploadsDir } = require('../helpers/voucherWorkspace');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function audit(voucherId, userId, action, details, sourceHash) {
  db.run(
    `INSERT INTO voucher_audit_log (voucher_id, user_id, action, source_file_hash, details) VALUES (?, ?, ?, ?, ?)`,
    [voucherId, userId, action, sourceHash || null, details ? JSON.stringify(details) : null],
    (err) => { if (err) console.error('[VOUCHER-AUDIT] falha ao registrar', action, 'voucher', voucherId, err.message); }
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
        if (err) {
          fs.unlink(filePath, () => {}); // best-effort orphan cleanup
          console.error('[VOUCHERS] falha ao persistir voucher', err.message);
          return res.status(500).json({ error: 'falha ao salvar voucher' });
        }
        audit(this.lastID, req.session.userId, 'create', { filename: req.file.originalname }, hash);
        res.status(201).json({ id: this.lastID, unified });
      }
    );
  } catch (err) {
    console.error('[VOUCHERS] erro ao processar upload', err.message);
    res.status(500).json({ error: 'erro ao processar voucher' });
  }
});

router.get('/', (req, res) => {
  db.all(
    `SELECT id, carrier, layout_version, created_at, updated_at FROM vouchers WHERE user_id = ? ORDER BY id DESC LIMIT 100`,
    [req.session.userId],
    (err, rows) => {
      if (err) { console.error('[VOUCHERS] erro ao listar', err.message); return res.status(500).json({ error: 'erro ao listar vouchers' }); }
      res.json(rows);
    }
  );
});

router.get('/:id', (req, res) => {
  db.get(
    `SELECT * FROM vouchers WHERE id = ? AND user_id = ?`,
    [req.params.id, req.session.userId],
    (err, row) => {
      if (err) { console.error('[VOUCHERS] erro ao buscar voucher', err.message); return res.status(500).json({ error: 'erro ao buscar voucher' }); }
      if (!row) return res.status(404).json({ error: 'não encontrado' });
      row.unified = JSON.parse(row.unified_json);
      delete row.unified_json;
      delete row.source_file_path; // server-only path, não expor
      res.json(row);
    }
  );
});

router.get('/:id/export', async (req, res) => {
  const format = (req.query.format || 'pdf').toLowerCase();
  if (!['pdf', 'png'].includes(format)) return res.status(400).json({ error: 'format inválido' });
  db.get(`SELECT id FROM vouchers WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], async (err, row) => {
    if (err) { console.error('[VOUCHERS] erro ao buscar para export', err.message); return res.status(500).json({ error: 'erro ao buscar voucher' }); }
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    try {
      const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const outPath = await renderVoucher({
        voucherId: req.params.id, format,
        cookieHeader: req.headers.cookie, baseUrl
      });
      audit(req.params.id, req.session.userId, 'export', { format }, null);
      res.download(outPath);
    } catch (e) {
      console.error('[VOUCHERS] falha no export', e.message);
      res.status(500).json({ error: 'falha ao gerar export' });
    }
  });
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
      if (err) { console.error('[VOUCHERS] erro ao atualizar voucher', err.message); return res.status(500).json({ error: 'erro ao atualizar voucher' }); }
      if (this.changes === 0) return res.status(404).json({ error: 'não encontrado' });
      audit(req.params.id, req.session.userId, 'update', null, null);
      res.json({ id: Number(req.params.id), unified: norm });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.get(`SELECT source_file_path FROM vouchers WHERE id = ? AND user_id = ?`,
    [req.params.id, req.session.userId], (err, row) => {
      if (err) { console.error('[VOUCHERS] erro ao buscar voucher para delete', err.message); return res.status(500).json({ error: 'erro ao buscar voucher' }); }
      if (!row) return res.status(404).json({ error: 'não encontrado' });
      db.run(`DELETE FROM vouchers WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], function (delErr) {
        if (delErr) { console.error('[VOUCHERS] erro ao deletar voucher', delErr.message); return res.status(500).json({ error: 'falha ao remover voucher' }); }
        if (this.changes === 0) return res.status(404).json({ error: 'não encontrado' });
        try { if (row.source_file_path && fs.existsSync(row.source_file_path)) fs.unlinkSync(row.source_file_path); }
        catch (e) { console.error('[VOUCHERS] arquivo órfão após delete', row.source_file_path, e.message); }
        audit(req.params.id, req.session.userId, 'delete', null, null);
        res.status(204).end();
      });
    });
});

module.exports = router;
