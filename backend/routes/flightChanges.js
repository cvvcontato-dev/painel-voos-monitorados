const express = require('express');
const multer = require('multer');
const fs = require('fs');
const db = require('../database');
const { validate } = require('../services/voucherSchema');
const { normalize } = require('../services/voucherNormalizer');
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
const fail = (req, res, e) => {
  if (e && e.status && e.body) return res.status(e.status).json(e.body);
  console.error('[FLIGHT-CHANGES]', req.method, req.originalUrl, 'caso=' + req.params.id, 'user=' + (req.session && req.session.userId), e && e.message);
  return res.status(500).json({ error: 'erro interno' });
};

async function supportPhone() {
  const s = await get(`SELECT contact_phone FROM voucher_settings WHERE id = 1`, []);
  return (s && s.contact_phone) || '';
}

function parse(json) { try { return json ? JSON.parse(json) : null; } catch { return null; } }

/**
 * Remove um voucher (linha + arquivo) de forma best-effort. Escopo por user_id.
 * Só é chamado para o voucher NOVO do caso, nunca para o antigo (que pode ser da aba Vouchers).
 */
async function dropVoucher(id, userId) {
  if (!id) return;
  try {
    const v = await get(`SELECT source_file_path FROM vouchers WHERE id = ? AND user_id = ?`, [id, userId]);
    if (!v) return;
    await run(`DELETE FROM vouchers WHERE id = ? AND user_id = ?`, [id, userId]);
    String(v.source_file_path || '').split('|').filter(Boolean).forEach(p => fs.unlink(p, () => {}));
  } catch (e) { console.error('[FLIGHT-CHANGES] cleanup de voucher falhou', id, e.message); }
}

/** Monta a resposta de detalhe (inclui diff e as mensagens prontas). */
async function detail(row, { emailSent = false } = {}) {
  const old = parse(row.old_json), novo = parse(row.new_json);
  const diff = old && novo ? diffVouchers(old, novo) : null;
  const phone = await supportPhone();
  emailSent = emailSent || !!row.confirmation_email_sent_at;
  return {
    id: row.id, status: row.status, client_name: row.client_name, locator: row.locator,
    old_voucher_id: row.old_voucher_id, new_voucher_id: row.new_voucher_id,
    notice_sent_at: row.notice_sent_at, confirmed_at: row.confirmed_at, created_at: row.created_at,
    confirmation_email_sent_at: row.confirmation_email_sent_at,
    old, new: novo, diff, support_phone: phone,
    messages: {
      notice: old ? buildNoticeText(old, { supportPhone: phone }) : null,
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
  } catch (e) { fail(req, res, e); }
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
    // Se o voucher antigo veio de upload, ele permanece em `vouchers` de propósito (fica disponível na aba Vouchers).
    let r;
    try {
      r = await run(
        `INSERT INTO flight_changes (user_id, old_voucher_id, client_name, locator, old_json) VALUES (?, ?, ?, ?, ?)`,
        [userId, voucherId, unified.passengers?.[0]?.name || null, unified.reservation?.locator || null, JSON.stringify(unified)]);
    } catch (e) {
      if (req.file) await dropVoucher(voucherId, userId);
      throw e;
    }
    res.status(201).json(await detail(await own(r.lastID, userId)));
  } catch (e) { fail(req, res, e); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    res.json(await detail(row));
  } catch (e) { fail(req, res, e); }
});

router.post('/:id/notice-sent', async (req, res) => {
  try {
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (row.status === 'aviso_pendente') {
      await run(`UPDATE flight_changes SET status='aviso_enviado', notice_sent_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status='aviso_pendente'`, [row.id]);
    }
    res.json(await detail(await own(row.id, req.session.userId)));
  } catch (e) { fail(req, res, e); }
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
    let upd;
    try {
      upd = await run(`UPDATE flight_changes SET new_voucher_id=?, new_json=?, diff_json=?, updated_at=datetime('now')
                         WHERE id=? AND user_id=? AND status != 'confirmado'`,
        [newId, JSON.stringify(unified), JSON.stringify(diff), row.id, userId]);
    } catch (e) { await dropVoucher(newId, userId); throw e; }
    if (upd.changes === 0) {   // confirmado por outra requisição entre a leitura e a escrita
      await dropVoucher(newId, userId);
      return res.status(409).json({ error: 'caso já confirmado' });
    }
    // Re-upload: o voucher NOVO anterior fica órfão. Nunca apagar o antigo (old_voucher_id).
    if (row.new_voucher_id && row.new_voucher_id !== newId && row.new_voucher_id !== row.old_voucher_id) {
      await dropVoucher(row.new_voucher_id, userId);
    }
    res.json(await detail(await own(row.id, userId)));
  } catch (e) { fail(req, res, e); }
});

router.put('/:id/new', async (req, res) => {
  try {
    const userId = req.session.userId;
    const row = await own(req.params.id, userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (!row.new_json) return res.status(409).json({ error: 'sem voucher novo' });
    if (row.status === 'confirmado') return res.status(409).json({ error: 'caso já confirmado' });
    const atual = parse(row.new_json);
    if (!atual) return res.status(500).json({ error: 'voucher_novo_corrompido' });
    const body = req.body && req.body.unified;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(422).json({ error: 'dados inválidos' });
    // meta não é editável: o servidor é a fonte (ex.: sourceFileHash). Mesmo fluxo do PUT /api/vouchers/:id.
    const unified = normalize({ ...body, meta: atual.meta });
    unified.meta = atual.meta;
    const v = validate(unified);
    if (!v.ok) return res.status(422).json({ error: 'dados inválidos', details: v.errors });
    const diff = diffVouchers(parse(row.old_json), unified);
    const json = JSON.stringify(unified);
    // Duas escritas sem transação explícita (uma única conexão sqlite3 compartilhada com o resto do app:
    // BEGIN/COMMIT poderia englobar queries de outras requisições). Em vez disso: caso primeiro (com guarda de
    // status) e, se a escrita em `vouchers` falhar, restaura o JSON anterior do caso.
    const upd = await run(`UPDATE flight_changes SET new_json=?, diff_json=?, updated_at=datetime('now')
                            WHERE id=? AND user_id=? AND status != 'confirmado'`, [json, JSON.stringify(diff), row.id, userId]);
    if (upd.changes === 0) return res.status(409).json({ error: 'caso já confirmado' });
    // O PDF enviado por e-mail é renderizado a partir de `vouchers`: mantém em sincronia.
    if (row.new_voucher_id) {
      try {
        await run(`UPDATE vouchers SET unified_json=?, layout_version=?, updated_at=datetime('now') WHERE id=? AND user_id=?`,
          [json, unified.layoutVersion, row.new_voucher_id, userId]);
      } catch (e) {
        await run(`UPDATE flight_changes SET new_json=?, diff_json=? WHERE id=? AND user_id=?`,
          [row.new_json, row.diff_json, row.id, userId]).catch(() => {});
        throw e;
      }
    }
    res.json(await detail(await own(row.id, userId)));
  } catch (e) { fail(req, res, e); }
});

router.post('/:id/confirm', async (req, res) => {
  try {
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (!row.new_json) return res.status(409).json({ error: 'sem_voucher_novo' });
    const old = parse(row.old_json), novo = parse(row.new_json);
    if (!old || !novo) return res.status(500).json({ error: 'voucher_corrompido', message: 'Os dados do voucher deste caso estão corrompidos.' });
    const diff = diffVouchers(old, novo);
    if (!diff.hasChanges) return res.status(409).json({ error: 'nada_mudou' });
    if (row.status !== 'confirmado') {
      await run(`UPDATE flight_changes SET status='confirmado', confirmed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?`, [row.id, req.session.userId]);
    }
    res.json(await detail(await own(row.id, req.session.userId)));
  } catch (e) { fail(req, res, e); }
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
      const old = parse(row.old_json), novo = parse(row.new_json);
      if (!old || !novo) return res.status(500).json({ error: 'voucher_corrompido', message: 'Os dados do voucher deste caso estão corrompidos.' });
      const diff = diffVouchers(old, novo);
      if (!diff.hasChanges) return res.status(409).json({ error: 'nada_mudou' });
      // Fonte única = new_json do caso: o PDF é renderizado a partir de `vouchers`, então sobrescreve com ele.
      const sync = await run(`UPDATE vouchers SET unified_json=?, layout_version=?, updated_at=datetime('now') WHERE id=? AND user_id=?`,
        [row.new_json, novo.layoutVersion || 'azul.confirmacao.v1', row.new_voucher_id, userId]);
      if (sync.changes === 0) return res.status(409).json({ error: 'voucher_novo_removido' });
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
    if (kind === 'confirmacao') {
      await run(`UPDATE flight_changes SET confirmation_email_sent_at=datetime('now') WHERE id=? AND user_id=?`, [row.id, userId]);
    }
    console.log(`[FLIGHT-CHANGES] email enviado kind=${kind} caso=${row.id} user=${userId} destinos=${emails.length}`);
    res.json({ sent: emails.length, messageId: result.messageId, subject: result.subject });
  } catch (e) { fail(req, res, e); }
  finally { if (pdfPath) fs.unlink(pdfPath, () => {}); }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const row = await own(req.params.id, userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    const r = await run(`DELETE FROM flight_changes WHERE id = ? AND user_id = ?`, [row.id, userId]);
    if (!r.changes) return res.status(404).json({ error: 'não encontrado' });
    // Apaga só o voucher NOVO (criado por este fluxo). O antigo pode ser da aba Vouchers: nunca remover.
    if (row.new_voucher_id && row.new_voucher_id !== row.old_voucher_id) await dropVoucher(row.new_voucher_id, userId);
    res.status(204).end();
  } catch (e) { fail(req, res, e); }
});

module.exports = router;
