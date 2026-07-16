const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { extractPackageItem } = require('../services/packageExtractor');
const { assemblePackage } = require('../services/packageAssembler');
const { validatePackage, KINDS } = require('../services/packageSchema');
const { packageUploadsDir } = require('../helpers/voucherWorkspace');
const { renderPackageFlightPdf } = require('../services/voucherRenderer');
const { sendPackageEmail } = require('../services/notifier');
const { sign: signVoucherToken } = require('../helpers/voucherToken');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function audit(packageId, userId, action, details, sourceHash) {
  db.run(
    `INSERT INTO package_audit_log (package_id, user_id, action, source_file_hash, details) VALUES (?, ?, ?, ?, ?)`,
    [packageId, userId, action, sourceHash || null, details ? JSON.stringify(details) : null],
    (err) => { if (err) console.error('[PACKAGE-AUDIT] falha', action, packageId, err.message); }
  );
}

const uploadMulti = upload.array('files', 12);

router.post('/', uploadMulti, async (req, res) => {
  const files = req.files || [];
  let kinds = req.body?.kinds; if (typeof kinds === 'string') kinds = [kinds]; kinds = Array.isArray(kinds) ? kinds : [];
  if (files.length !== kinds.length) return res.status(400).json({ error: 'files e kinds precisam ter o mesmo tamanho' });
  if (files.length < 2 || files.length > 12) return res.status(400).json({ error: 'Envie entre 2 e 12 serviços' });
  if (kinds.some(k => !KINDS.includes(k))) return res.status(400).json({ error: 'tipo de serviço inválido' });
  if (!kinds.includes('flight')) return res.status(400).json({ error: 'Envie ao menos 1 voo' });
  if (!kinds.includes('hotel')) return res.status(400).json({ error: 'Envie ao menos 1 hotel' });

  try {
    const items = await Promise.all(files.map(async (f, i) => {
      try { return { item: await extractPackageItem(f.buffer, f.mimetype, kinds[i]), kind: kinds[i] }; }
      catch (e) { e._idx = i; e._kind = kinds[i]; throw e; }
    }));
    const pkg = assemblePackage(items);
    const v = validatePackage(pkg);
    if (!v.ok) {
      console.error('[PACKAGES] pacote inválido', v.errors);
      return res.status(422).json({ error: 'pacote inválido', details: v.errors });
    }

    const ts = Date.now();
    const hashes = files.map(f => 'sha256:' + crypto.createHash('sha256').update(f.buffer).digest('hex'));
    const composedHash = `package:${hashes.map(h => h.slice(7, 15)).join('+')}`.slice(0, 120);

    const paths = files.map((f, i) => path.join(packageUploadsDir(), `${ts}-${kinds[i]}-${hashes[i].slice(7, 15)}${path.extname(f.originalname) || ''}`));
    const written = [];
    try { paths.forEach((p, i) => { fs.writeFileSync(p, files[i].buffer); written.push(p); }); }
    catch (writeErr) { written.forEach(p => { try { fs.unlinkSync(p); } catch (_) {} }); throw writeErr; }
    const filePath = paths.join('|');

    db.run(
      `INSERT INTO packages (user_id, title, package_json, source_file_paths, source_file_hash) VALUES (?, ?, ?, ?, ?)`,
      [req.session.userId, pkg.title, JSON.stringify(pkg), filePath, composedHash],
      function (err) {
        if (err) {
          paths.forEach(p => fs.unlink(p, () => {}));
          console.error('[PACKAGES] erro ao salvar', err.message);
          return res.status(500).json({ error: 'falha ao salvar pacote' });
        }
        audit(this.lastID, req.session.userId, 'create', { kinds, files: files.map(f => f.originalname) }, composedHash);
        res.status(201).json({ id: this.lastID, package: pkg });
      }
    );
  } catch (err) {
    const idxInfo = err._kind ? ` #${(err._idx ?? 0) + 1} (${err._kind})` : '';
    console.error('[PACKAGES] erro ao processar', err.message);
    if (err.code === 'gemini_unavailable' || /503|service unavailable|high demand/i.test(err.message)) {
      return res.status(503).json({ error: `Serviço de extração (Gemini) com alta demanda ao ler o serviço${idxInfo}. Tente em instantes.`, retryable: true });
    }
    if (/quota|exceeded/i.test(err.message)) {
      return res.status(429).json({ error: `Cota da API Gemini esgotada ao ler o serviço${idxInfo}.`, retryable: true });
    }
    if (/voo|hotel|2 e 12|serviço inválido/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    res.status(502).json({ error: `Não consegui ler o serviço${idxInfo}. ${err.message}` });
  }
});

router.get('/', (req, res) => {
  db.all(`SELECT id, title, package_json, created_at FROM packages WHERE user_id = ? ORDER BY id DESC`,
    [req.session.userId], (err, rows) => {
      if (err) return res.status(500).json({ error: 'erro ao listar pacotes' });
      const list = (rows || []).map(r => {
        let holder = '', summary = { flights: false, hotels: 0, addons: 0 };
        try { const p = JSON.parse(r.package_json); holder = p.holder || ''; summary = { flights: !!p.flights, hotels: (p.hotels||[]).length, addons: (p.addons||[]).length }; } catch (_) {}
        return { id: r.id, title: r.title, holder, summary, created_at: r.created_at };
      });
      res.json(list);
    });
});

router.get('/:id', (req, res) => {
  db.get(`SELECT * FROM packages WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], (err, row) => {
    if (err) return res.status(500).json({ error: 'erro ao buscar pacote' });
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    let pkg; try { pkg = JSON.parse(row.package_json); } catch { return res.status(500).json({ error: 'pacote corrompido' }); }
    res.json({ id: row.id, title: row.title, package: pkg, created_at: row.created_at });
  });
});

router.post('/:id/send-email', async (req, res) => {
  let raw = req.body?.emails;
  if (Array.isArray(raw)) raw = raw.join(',');
  if (typeof raw !== 'string' || !raw.trim()) return res.status(400).json({ error: 'destinatários obrigatórios' });
  const emails = Array.from(new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)));
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emails.length || emails.some(e => !EMAIL_RE.test(e))) return res.status(400).json({ error: 'e-mail inválido' });
  const customMessage = typeof req.body?.message === 'string' ? req.body.message : '';

  db.get(`SELECT * FROM packages WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], async (err, row) => {
    if (err) return res.status(500).json({ error: 'erro ao buscar pacote' });
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    let pkg; try { pkg = JSON.parse(row.package_json); } catch { return res.status(500).json({ error: 'pacote corrompido' }); }

    db.get(`SELECT contact_phone, contact_email, contact_site, contact_extra FROM voucher_settings WHERE id = 1`, async (sErr, settingsRow) => {
      const settings = settingsRow || {};
      const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const attachmentPaths = (row.source_file_paths || '').split('|').filter(Boolean);
      // PDF do voucher de voo do pacote — best-effort (não bloqueia o envio se falhar).
      try {
        const flightPdf = await renderPackageFlightPdf({ packageId: req.params.id, cookieHeader: req.headers.cookie, baseUrl });
        if (flightPdf) attachmentPaths.push(flightPdf);
      } catch (e) { console.error('[PACKAGES] PDF de voo falhou (segue sem):', e.message); }
      const pageUrl = `${baseUrl}/pacote/${signVoucherToken(req.params.id)}`;
      try {
        const result = await sendPackageEmail({ to: emails, bcc: process.env.EMAIL_USER || null, packageData: pkg, settings, attachmentPaths, customMessage, pageUrl });
        if (result.sucesso) {
          audit(req.params.id, req.session.userId, 'email_sent', { to: emails, subject: result.subject, messageId: result.messageId }, null);
          res.json({ sent: emails.length, messageId: result.messageId, subject: result.subject });
        } else {
          audit(req.params.id, req.session.userId, 'email_failed', { to: emails, erro: result.erro }, null);
          res.status(500).json({ error: 'falha ao enviar e-mail', details: result.erro });
        }
      } catch (e) {
        audit(req.params.id, req.session.userId, 'email_failed', { to: emails, erro: e.message }, null);
        res.status(500).json({ error: 'falha ao processar envio' });
      }
    });
  });
});

router.put('/:id', (req, res) => {
  const pkg = req.body?.package;
  if (!pkg || typeof pkg !== 'object') return res.status(400).json({ error: 'package obrigatório' });
  const v = validatePackage(pkg);
  if (!v.ok) return res.status(422).json({ error: 'pacote inválido', details: v.errors });
  db.run(`UPDATE packages SET package_json = ?, title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
    [JSON.stringify(pkg), pkg.title || null, req.params.id, req.session.userId],
    function (err) {
      if (err) return res.status(500).json({ error: 'erro ao salvar' });
      if (this.changes === 0) return res.status(404).json({ error: 'não encontrado' });
      audit(req.params.id, req.session.userId, 'update', { title: pkg.title }, null);
      res.json({ id: Number(req.params.id), package: pkg });
    });
});

router.delete('/:id', (req, res) => {
  db.get(`SELECT source_file_paths FROM packages WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], (err, row) => {
    if (err) return res.status(500).json({ error: 'erro ao buscar' });
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    db.run(`DELETE FROM packages WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], function (dErr) {
      if (dErr) return res.status(500).json({ error: 'erro ao excluir' });
      (row.source_file_paths || '').split('|').filter(Boolean).forEach(p => { try { fs.unlink(p, () => {}); } catch (_) {} });
      audit(req.params.id, req.session.userId, 'delete', null, null);
      res.json({ deleted: true });
    });
  });
});

module.exports = router;
