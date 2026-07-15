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
const { sendVoucherEmail } = require('../services/notifier');
const { manageBookingUrl } = require('../helpers/voucherCarrier');
const { sign: signVoucherToken } = require('../helpers/voucherToken');
const { combineVouchers } = require('../services/voucherCombiner');

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
    // Erros transientes do Gemini: devolve 503 com mensagem útil pro frontend.
    if (err.code === 'gemini_unavailable' || /503|service unavailable|high demand/i.test(err.message)) {
      return res.status(503).json({
        error: 'Serviço de extração (Gemini) está com alta demanda no momento. Tente novamente em alguns instantes.',
        retryable: true
      });
    }
    if (/quota|exceeded/i.test(err.message)) {
      return res.status(429).json({
        error: 'Cota da API Gemini esgotada. Aguarde alguns minutos e tente novamente.',
        retryable: true
      });
    }
    res.status(500).json({ error: 'erro ao processar voucher' });
  }
});

// Combine: 2 a 8 arquivos no campo 'files', 2 a 8 roles no campo 'roles' (pareados por índice)
const uploadMulti = upload.array('files', 8);

router.post('/combine', uploadMulti, async (req, res) => {
  const files = req.files || [];
  let roles = req.body?.roles;
  if (typeof roles === 'string') roles = [roles];
  roles = Array.isArray(roles) ? roles : [];

  if (files.length !== roles.length) return res.status(400).json({ error: 'files e roles precisam ter o mesmo tamanho' });
  if (files.length < 2 || files.length > 8) return res.status(400).json({ error: 'Envie entre 2 e 8 vouchers' });
  const VALID = ['ida', 'interno', 'volta'];
  if (roles.some(r => !VALID.includes(r))) return res.status(400).json({ error: 'tipo de voucher inválido' });
  if (roles.filter(r => r === 'ida').length !== 1) return res.status(400).json({ error: 'Envie exatamente 1 voucher de ida' });
  if (roles.filter(r => r === 'volta').length > 1) return res.status(400).json({ error: 'No máximo 1 voucher de volta' });

  try {
    // Extrai todos em paralelo. Se qualquer um falhar, nada é persistido.
    const unifiedList = await Promise.all(files.map(async (f, i) => {
      try {
        return await extractVoucher(f.buffer, f.mimetype);
      } catch (e) {
        e._voucherIndex = i; e._voucherRole = roles[i];
        throw e;
      }
    }));

    const items = unifiedList.map((voucher, i) => ({ voucher, role: roles[i] }));
    const unified = combineVouchers(items);

    const v = validate(unified);
    if (!v.ok) {
      console.error('[VOUCHERS] combine falhou na validação', v.errors);
      return res.status(422).json({ error: 'schema inválido após combinar', details: v.errors });
    }

    // Salva todos os arquivos originais + hash composto
    const ts = Date.now();
    const hashes = files.map(f => 'sha256:' + crypto.createHash('sha256').update(f.buffer).digest('hex'));
    const composedHash = `combine:${hashes.map(h => h.slice(7, 15)).join('+')}`.slice(0, 120);
    unified.meta.sourceFileHash = composedHash;

    const paths = files.map((f, i) => path.join(uploadsDir(), `${ts}-${roles[i]}-${hashes[i].slice(7, 15)}${path.extname(f.originalname) || ''}`));
    paths.forEach((p, i) => fs.writeFileSync(p, files[i].buffer));
    const filePath = paths.join('|');

    db.run(
      `INSERT INTO vouchers (user_id, carrier, layout_version, source_file_path, source_file_hash, unified_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.userId, unified.carrier, unified.layoutVersion, filePath, composedHash, JSON.stringify(unified)],
      function (err) {
        if (err) {
          paths.forEach(p => fs.unlink(p, () => {}));
          console.error('[VOUCHERS] erro ao salvar voucher combinado', err.message);
          return res.status(500).json({ error: 'falha ao salvar voucher' });
        }
        audit(this.lastID, req.session.userId, 'create', {
          combined: true, roles, files: files.map(f => f.originalname)
        }, composedHash);
        res.status(201).json({ id: this.lastID, unified });
      }
    );
  } catch (err) {
    const idxInfo = err._voucherRole ? ` #${(err._voucherIndex ?? 0) + 1} (${err._voucherRole})` : '';
    console.error('[VOUCHERS] erro ao processar combine', err.message);
    if (err.code === 'gemini_unavailable' || /503|service unavailable|high demand/i.test(err.message)) {
      return res.status(503).json({ error: `Serviço de extração (Gemini) com alta demanda ao ler o voucher${idxInfo}. Tente em instantes.`, retryable: true });
    }
    if (/quota|exceeded/i.test(err.message)) {
      return res.status(429).json({ error: `Cota da API Gemini esgotada ao ler o voucher${idxInfo}.`, retryable: true });
    }
    // Erros de validação do combiner (ex: "Envie exatamente 1 voucher de ida") → 400
    if (/ida|volta|2 e 8|combinar/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    res.status(502).json({ error: `Não consegui ler o voucher${idxInfo}. ${err.message}` });
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

router.get('/settings', (req, res) => {
  db.get(`SELECT contact_phone, contact_email, contact_site, contact_extra, updated_at FROM voucher_settings WHERE id = 1`,
    (err, row) => {
      if (err) { console.error('[VOUCHERS] erro ao buscar settings', err.message); return res.status(500).json({ error: 'erro ao buscar configurações' }); }
      res.json(row || { contact_phone: '', contact_email: '', contact_site: '', contact_extra: '' });
    });
});

router.put('/settings', (req, res) => {
  const { contact_phone = '', contact_email = '', contact_site = '', contact_extra = '' } = req.body || {};
  db.run(
    `UPDATE voucher_settings SET contact_phone = ?, contact_email = ?, contact_site = ?, contact_extra = ?, updated_at = datetime('now') WHERE id = 1`,
    [contact_phone, contact_email, contact_site, contact_extra],
    function (err) {
      if (err) { console.error('[VOUCHERS] erro ao salvar settings', err.message); return res.status(500).json({ error: 'erro ao salvar configurações' }); }
      res.json({ contact_phone, contact_email, contact_site, contact_extra });
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
      res.download(outPath, (err) => {
        // Always cleanup the export file — exports are ephemeral
        require('fs').unlink(outPath, () => {});
        if (err) console.error('[VOUCHERS] erro ao enviar export', err.message);
      });
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
        try {
          // source_file_path pode ser "path1|path2" no caso de voucher merged.
          const paths = String(row.source_file_path || '').split('|').filter(Boolean);
          paths.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
        } catch (e) { console.error('[VOUCHERS] arquivo órfão após delete', row.source_file_path, e.message); }
        audit(req.params.id, req.session.userId, 'delete', null, null);
        res.status(204).end();
      });
    });
});

router.post('/:id/send-email', async (req, res) => {
  let raw = req.body?.emails;
  if (Array.isArray(raw)) raw = raw.join(',');
  if (typeof raw !== 'string' || !raw.trim()) {
    return res.status(400).json({ error: 'destinatários obrigatórios' });
  }
  const emails = Array.from(new Set(
    raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  ));
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emails.length || emails.some(e => !EMAIL_RE.test(e))) {
    return res.status(400).json({ error: 'e-mail inválido' });
  }
  const customMessage = typeof req.body?.message === 'string' ? req.body.message : '';

  db.get(`SELECT * FROM vouchers WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], async (err, row) => {
    if (err) { console.error('[VOUCHERS] erro ao buscar para envio', err.message); return res.status(500).json({ error: 'erro ao buscar voucher' }); }
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    let unified;
    try { unified = JSON.parse(row.unified_json); } catch { return res.status(500).json({ error: 'voucher corrompido' }); }

    db.get(`SELECT contact_phone, contact_email, contact_site, contact_extra FROM voucher_settings WHERE id = 1`, async (sErr, settingsRow) => {
      const settings = settingsRow || {};
      let pdfPath = null;
      try {
        const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        pdfPath = await renderVoucher({
          voucherId: req.params.id,
          format: 'pdf',
          cookieHeader: req.headers.cookie,
          baseUrl
        });
        // Usa o helper compartilhado que entende "SILVA, MAYARA" → "SILVA"
        // (em vez de "MAYARA" que era o bug anterior).
        const firstPassengerLastName = require('../helpers/voucherCarrier')
          .lastNameOf((unified.passengers || [])[0]?.name);
        const rawCarrier = (unified.carrier || 'azul').toLowerCase();
        const isMulti = rawCarrier === 'multi';
        const primaryCarrier = isMulti
          ? (unified.reservation?.primaryCarrier || 'azul').toLowerCase()
          : rawCarrier;
        const bookingUrl = manageBookingUrl(
          primaryCarrier,
          unified.reservation?.locator,
          firstPassengerLastName,
          unified.route?.origin
        );
        // Quando multi-cia, calcula também a URL de check-in da volta.
        let secondaryBookingUrl = null;
        if (isMulti && unified.reservation?.secondaryCarrier) {
          secondaryBookingUrl = manageBookingUrl(
            unified.reservation.secondaryCarrier.toLowerCase(),
            unified.reservation.secondaryLocator || unified.reservation.locator,
            firstPassengerLastName,
            unified.route?.destination
          );
        }
        const itinerarioUrl = `${baseUrl}/itinerario/${signVoucherToken(req.params.id)}`;
        const result = await sendVoucherEmail({
          to: emails,
          bcc: process.env.EMAIL_USER || null,
          voucherData: unified,
          settings,
          attachmentPath: pdfPath,
          customMessage,
          bookingUrl,
          secondaryBookingUrl,
          itinerarioUrl
        });
        if (result.sucesso) {
          audit(req.params.id, req.session.userId, 'email_sent', { to: emails, bcc: !!process.env.EMAIL_USER, subject: result.subject, messageId: result.messageId }, null);
          res.json({ sent: emails.length, messageId: result.messageId, subject: result.subject });
        } else {
          audit(req.params.id, req.session.userId, 'email_failed', { to: emails, erro: result.erro }, null);
          res.status(500).json({ error: 'falha ao enviar e-mail', details: result.erro });
        }
      } catch (e) {
        console.error('[VOUCHERS] erro no fluxo de envio', e.message);
        audit(req.params.id, req.session.userId, 'email_failed', { to: emails, erro: e.message }, null);
        res.status(500).json({ error: 'falha ao processar envio' });
      } finally {
        if (pdfPath) require('fs').unlink(pdfPath, () => {});
      }
    });
  });
});

module.exports = router;
