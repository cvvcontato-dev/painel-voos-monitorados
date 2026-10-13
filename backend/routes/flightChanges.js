const express = require('express');
const multer = require('multer');
const fs = require('fs');
const db = require('../database');
const { validate } = require('../services/voucherSchema');
const { renderVoucher } = require('../services/voucherRenderer');
const { sendVoucherEmail } = require('../services/notifier');
const { sendNoticeEmail } = require('../services/flightChangeEmail');
const { extractAndValidate, saveVoucher } = require('../helpers/voucherStore');
const { diffVouchers } = require('../helpers/flightChangeDiff');
const { buildNoticeText, buildConfirmationText } = require('../helpers/flightChangeMessage');

const router = express.Router();
const uploader = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
// Erros do multer (ex.: arquivo grande demais) viram resposta clara, não 500 genérico.
const upload = {
  single: (field) => (req, res, next) => uploader.single(field)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Arquivo acima de 15 MB.' });
    console.error('[FLIGHT-CHANGES] upload:', err.message);
    return res.status(400).json({ error: 'upload inválido' });
  })
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const get = (sql, p) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const run = (sql, p) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const fail = (res, e) => {
  if (e && e.status && e.body) return res.status(e.status).json(e.body);
  console.error('[FLIGHT-CHANGES]', e && e.message);
  return res.status(500).json({ error: 'erro interno' });
};

async function supportPhone() {
  const s = await get(`SELECT contact_phone FROM voucher_settings WHERE id = 1`, []);
  return (s && s.contact_phone) || '';
}

function parse(json) { try { return json ? JSON.parse(json) : null; } catch { return null; } }

/** Monta a resposta de detalhe (inclui diff e as mensagens prontas). */
async function detail(row, { emailSent = false } = {}) {
  const old = parse(row.old_json), novo = parse(row.new_json);
  const diff = novo ? diffVouchers(old, novo) : null;
  const phone = await supportPhone();
  return {
    id: row.id, status: row.status, client_name: row.client_name, locator: row.locator,
    old_voucher_id: row.old_voucher_id, new_voucher_id: row.new_voucher_id,
    notice_sent_at: row.notice_sent_at, confirmed_at: row.confirmed_at, created_at: row.created_at,
    old, new: novo, diff, support_phone: phone,
    messages: {
      notice: buildNoticeText(old, { supportPhone: phone }),
      confirmation: novo && diff ? buildConfirmationText(novo, diff, { emailSent }) : null
    }
  };
}

const own = (id, userId) => get(`SELECT * FROM flight_changes WHERE id = ? AND user_id = ?`, [id, userId]);

router.get('/', async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, status, client_name, locator, notice_sent_at, confirmed_at, created_at
         FROM flight_changes WHERE user_id = ?
        ORDER BY CASE status WHEN 'confirmado' THEN 1 ELSE 0 END, created_at DESC, id DESC`, [req.session.userId]);
    res.json(rows);
  } catch (e) { fail(res, e); }
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const userId = req.session.userId;
    let unified, voucherId = null;
    const vid = req.body && req.body.voucher_id;
    if (req.file) {
      unified = await extractAndValidate(req.file);
      voucherId = await saveVoucher({ userId, file: req.file, unified });
    } else if (vid) {
      const v = await get(`SELECT id, unified_json FROM vouchers WHERE id = ? AND user_id = ?`, [vid, userId]);
      if (!v) return res.status(404).json({ error: 'voucher não encontrado' });
      unified = parse(v.unified_json);
      if (!unified) return res.status(500).json({ error: 'voucher corrompido' });
      voucherId = v.id;
    } else {
      return res.status(400).json({ error: 'envie um arquivo ou voucher_id' });
    }
    const r = await run(
      `INSERT INTO flight_changes (user_id, old_voucher_id, client_name, locator, old_json) VALUES (?, ?, ?, ?, ?)`,
      [userId, voucherId, unified.passengers?.[0]?.name || null, unified.reservation?.locator || null, JSON.stringify(unified)]);
    res.status(201).json(await detail(await own(r.lastID, userId)));
  } catch (e) { fail(res, e); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    res.json(await detail(row));
  } catch (e) { fail(res, e); }
});

router.post('/:id/notice-sent', async (req, res) => {
  try {
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (row.status === 'aviso_pendente') {
      await run(`UPDATE flight_changes SET status='aviso_enviado', notice_sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [row.id]);
    }
    res.json(await detail(await own(row.id, req.session.userId)));
  } catch (e) { fail(res, e); }
});

router.post('/:id/new-voucher', upload.single('file'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const row = await own(req.params.id, userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (row.status === 'confirmado') return res.status(409).json({ error: 'caso já confirmado' });
    if (!req.file) return res.status(400).json({ error: 'arquivo obrigatório (campo "file")' });
    const unified = await extractAndValidate(req.file);
    const newId = await saveVoucher({ userId, file: req.file, unified });
    const diff = diffVouchers(parse(row.old_json), unified);
    await run(`UPDATE flight_changes SET new_voucher_id=?, new_json=?, diff_json=?, updated_at=datetime('now') WHERE id=?`,
      [newId, JSON.stringify(unified), JSON.stringify(diff), row.id]);
    res.json(await detail(await own(row.id, userId)));
  } catch (e) { fail(res, e); }
});

router.put('/:id/new', async (req, res) => {
  try {
    const userId = req.session.userId;
    const row = await own(req.params.id, userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (!row.new_json) return res.status(409).json({ error: 'sem voucher novo' });
    if (row.status === 'confirmado') return res.status(409).json({ error: 'caso já confirmado' });
    const unified = req.body && req.body.unified;
    const atual = parse(row.new_json);
    if (unified && typeof unified === 'object' && !unified.meta) unified.meta = atual.meta;   // meta não é editável
    const v = validate(unified);
    if (!v.ok) return res.status(422).json({ error: 'dados inválidos', details: v.errors });
    unified.meta = { ...atual.meta, ...unified.meta };
    const diff = diffVouchers(parse(row.old_json), unified);
    await run(`UPDATE flight_changes SET new_json=?, diff_json=?, updated_at=datetime('now') WHERE id=?`,
      [JSON.stringify(unified), JSON.stringify(diff), row.id]);
    // O PDF enviado por e-mail é renderizado a partir da linha em `vouchers`: mantém em sincronia.
    if (row.new_voucher_id) {
      await run(`UPDATE vouchers SET unified_json=?, updated_at=datetime('now') WHERE id=? AND user_id=?`,
        [JSON.stringify(unified), row.new_voucher_id, userId]);
    }
    res.json(await detail(await own(row.id, userId)));
  } catch (e) { fail(res, e); }
});

router.post('/:id/confirm', async (req, res) => {
  try {
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (!row.new_json) return res.status(409).json({ error: 'sem_voucher_novo' });
    const diff = diffVouchers(parse(row.old_json), parse(row.new_json));
    if (!diff.hasChanges) return res.status(409).json({ error: 'nada_mudou' });
    if (row.status !== 'confirmado') {
      await run(`UPDATE flight_changes SET status='confirmado', confirmed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [row.id]);
    }
    res.json(await detail(await own(row.id, req.session.userId), { emailSent: !!(req.body && req.body.emailSent) }));
  } catch (e) { fail(res, e); }
});

router.post('/:id/send-email', async (req, res) => {
  let raw = req.body && req.body.emails;
  if (Array.isArray(raw)) raw = raw.join(',');
  if (typeof raw !== 'string' || !raw.trim()) return res.status(400).json({ error: 'destinatários obrigatórios' });
  const emails = Array.from(new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)));
  if (!emails.length || emails.some(e => !EMAIL_RE.test(e))) return res.status(400).json({ error: 'e-mail inválido' });
  const kind = req.body && req.body.kind;
  if (kind !== 'aviso' && kind !== 'confirmacao') return res.status(400).json({ error: 'kind deve ser "aviso" ou "confirmacao"' });

  let pdfPath = null;
  try {
    const userId = req.session.userId;
    const row = await own(req.params.id, userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    const bcc = process.env.EMAIL_USER || null;
    let result;
    if (kind === 'aviso') {
      result = await sendNoticeEmail({ to: emails, bcc, voucher: parse(row.old_json), supportPhone: await supportPhone() });
    } else {
      if (!row.new_json || !row.new_voucher_id) return res.status(409).json({ error: 'sem_voucher_novo' });
      const novo = parse(row.new_json);
      const diff = diffVouchers(parse(row.old_json), novo);
      if (!diff.hasChanges) return res.status(409).json({ error: 'nada_mudou' });
      const settings = (await get(`SELECT contact_phone, contact_email, contact_site, contact_extra FROM voucher_settings WHERE id = 1`, [])) || {};
      const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      pdfPath = await renderVoucher({ voucherId: row.new_voucher_id, format: 'pdf', cookieHeader: req.headers.cookie, baseUrl });
      result = await sendVoucherEmail({
        to: emails, bcc, voucherData: novo, settings, attachmentPath: pdfPath,
        subject: 'Seu voo foi reajustado ✈️ Novo voucher em anexo',
        customMessage: buildConfirmationText(novo, diff, { emailSent: true }).replace(/\*/g, '')
      });
    }
    if (!result.sucesso) return res.status(500).json({ error: 'falha ao enviar e-mail', details: result.erro });
    res.json({ sent: emails.length, messageId: result.messageId, subject: result.subject });
  } catch (e) { fail(res, e); }
  finally { if (pdfPath) fs.unlink(pdfPath, () => {}); }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await run(`DELETE FROM flight_changes WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId]);
    if (!r.changes) return res.status(404).json({ error: 'não encontrado' });
    res.status(204).end();
  } catch (e) { fail(res, e); }
});

module.exports = router;
