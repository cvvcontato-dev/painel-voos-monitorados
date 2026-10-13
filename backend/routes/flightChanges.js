const express = require('express');
const multer = require('multer');
const fs = require('fs');
const db = require('../database');
const { validate } = require('../services/voucherSchema');
const { normalize } = require('../services/voucherNormalizer');
const pdfStore = require('../services/voucherPdfStore');
const { sendVoucherEmail, buildVoucherEmailHtml, AGENCY_LOGO_PATH, AGENCY_LOGO_CID } = require('../services/notifier');
const { sendNoticeEmail, buildNoticeEmailHtml, SUBJECT: NOTICE_SUBJECT } = require('../services/flightChangeEmail');
const { sign: signVoucherToken } = require('../helpers/voucherToken');
const { extractAndValidate, extractFlightsMerged, saveVoucher } = require('../helpers/voucherStore');
const { diffVouchers } = require('../helpers/flightChangeDiff');
const { buildNoticeText, buildConfirmationText, buildChangeSummaryLines } = require('../helpers/flightChangeMessage');

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
async function dropVoucher(id, userId, exceptCaseId = 0) {
  if (!id) return;
  try {
    // Outro caso pode usar este voucher (ex.: como antigo): nesse caso não apaga nem a linha nem o arquivo.
    const emUso = await get(`SELECT 1 FROM flight_changes WHERE (old_voucher_id = ? OR new_voucher_id = ?) AND id != ?`, [id, id, exceptCaseId]);
    if (emUso) return;
    pdfStore.purge(id);   // PDF guardado (PII dos passageiros) some junto com o voucher
    const v = await get(`SELECT source_file_path FROM vouchers WHERE id = ? AND user_id = ?`, [id, userId]);
    if (!v) return;
    await run(`DELETE FROM vouchers WHERE id = ? AND user_id = ?`, [id, userId]);
    String(v.source_file_path || '').split('|').filter(Boolean).forEach(p => fs.unlink(p, () => {}));
  } catch (e) { console.error('[FLIGHT-CHANGES] cleanup de voucher falhou', id, e.message); }
}

// Base interna usada pelo Playwright para abrir /voucher-preview (precisa alcançar este servidor).
const renderBaseUrl = () => process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

/**
 * Guarda o PDF da versão atual do voucher novo em segundo plano (fire-and-forget): é o arquivo que a página
 * pública do itinerário oferece para download. Nunca atrasa nem quebra a resposta; falhas só vão para o log.
 * O render precisa da sessão do operador (cookie), por isso é disparado dentro da requisição dele.
 */
function storePdfInBackground(req, voucherId, userId) {
  (async () => {
    const v = await get(`SELECT unified_json FROM vouchers WHERE id = ? AND user_id = ?`, [voucherId, userId]);
    if (!v) return;
    await pdfStore.ensure({ voucherId, unifiedJson: v.unified_json, cookieHeader: req.headers.cookie, baseUrl: renderBaseUrl() });
  })().catch(e => console.error('[FLIGHT-CHANGES] pdf:', e && e.message));
}

// Base pública dos links do voucher novo: SOMENTE PUBLIC_BASE_URL (nunca o Host da requisição, que é forjável).
// Sem a variável, o link é desativado (new_voucher_url = null; mensagem e e-mail seguem sem ele).
const publicBaseUrl = () => String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
if (process.env.NODE_ENV === 'production' && !publicBaseUrl()) console.warn('[FLIGHT-CHANGES] PUBLIC_BASE_URL ausente: links de voucher novo desativados');
// Link público assinado da página do itinerário do voucher novo (mesmo padrão da aba Vouchers).
const itinerarioUrlOf = (voucherId, baseUrl) => (voucherId && baseUrl ? `${baseUrl}/itinerario/${signVoucherToken(voucherId)}` : '');
const detailFor = (req, row, opts) => detail(row, { ...opts, baseUrl: publicBaseUrl() });

/**
 * Fonte ÚNICA do e-mail de confirmação: usada pelo envio e pelo preview (sem divergência).
 * customMessage = resumo das mudanças em texto puro (o e-mail já tem o PDF anexo e o link do itinerário).
 */
function confirmationEmailArgs(novo, diff, settings, itinerarioUrl) {
  return {
    subject: 'Seu voo foi reajustado ✈️ Novo voucher em anexo',
    voucherData: novo, settings,
    customMessage: ['Seu voo foi reajustado. Veja o que mudou:', '', ...buildChangeSummaryLines(diff)].join('\n'),
    itinerarioUrl
  };
}

const loadSettings = async () => (await get(`SELECT contact_phone, contact_email, contact_site, contact_extra FROM voucher_settings WHERE id = 1`, [])) || {};

/** Monta a resposta de detalhe (inclui diff e as mensagens prontas). */
async function detail(row, { emailSent = false, baseUrl = '' } = {}) {
  const old = parse(row.old_json), novo = parse(row.new_json);
  const diff = old && novo ? diffVouchers(old, novo) : null;
  const phone = await supportPhone();
  emailSent = emailSent || !!row.confirmation_email_sent_at;
  const voucherUrl = itinerarioUrlOf(row.new_voucher_id, baseUrl);
  return {
    id: row.id, status: row.status, client_name: row.client_name, locator: row.locator,
    old_voucher_id: row.old_voucher_id, new_voucher_id: row.new_voucher_id, new_voucher_url: voucherUrl || null,
    notice_sent_at: row.notice_sent_at, confirmed_at: row.confirmed_at, created_at: row.created_at,
    confirmation_email_sent_at: row.confirmation_email_sent_at,
    old, new: novo, diff, support_phone: phone,
    messages: {
      notice: old ? buildNoticeText(old, { supportPhone: phone }) : null,
      confirmation: novo && diff ? buildConfirmationText(novo, diff, { emailSent, voucherUrl }) : null
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
    res.status(201).json(await detailFor(req, await own(r.lastID, userId)));
  } catch (e) { fail(req, res, e); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    res.json(await detailFor(req, row));
  } catch (e) { fail(req, res, e); }
});

router.post('/:id/notice-sent', async (req, res) => {
  try {
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (row.status === 'aviso_pendente') {
      await run(`UPDATE flight_changes SET status='aviso_enviado', notice_sent_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status='aviso_pendente'`, [row.id]);
    }
    res.json(await detailFor(req, await own(row.id, req.session.userId)));
  } catch (e) { fail(req, res, e); }
});

router.post('/:id/new-voucher', upload.single('file'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const row = await own(req.params.id, userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (row.status === 'confirmado') return res.status(409).json({ error: 'caso já confirmado' });
    if (!req.file) return res.status(400).json({ error: 'arquivo obrigatório (campo "file")' });
    const oldVoucher = parse(row.old_json);
    const unified = await extractFlightsMerged(req.file, oldVoucher);
    const newId = await saveVoucher({ userId, file: req.file, unified });
    const diff = diffVouchers(oldVoucher, unified);
    let upd;
    try {
      upd = await run(`UPDATE flight_changes SET new_voucher_id=?, new_json=?, diff_json=?, confirmation_email_sent_at=NULL, updated_at=datetime('now')
                         WHERE id=? AND user_id=? AND status != 'confirmado'`,
        [newId, JSON.stringify(unified), JSON.stringify(diff), row.id, userId]);
    } catch (e) { await dropVoucher(newId, userId, row.id); throw e; }
    if (upd.changes === 0) {   // confirmado por outra requisição entre a leitura e a escrita
      await dropVoucher(newId, userId, row.id);
      return res.status(409).json({ error: 'caso já confirmado' });
    }
    // Re-upload: o voucher NOVO anterior fica órfão. Nunca apagar o antigo (old_voucher_id).
    if (row.new_voucher_id && row.new_voucher_id !== newId && row.new_voucher_id !== row.old_voucher_id) {
      await dropVoucher(row.new_voucher_id, userId, row.id);
    }
    storePdfInBackground(req, newId, userId);
    res.json(await detailFor(req, await own(row.id, userId)));
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
    const upd = await run(`UPDATE flight_changes SET new_json=?, diff_json=?, confirmation_email_sent_at=NULL, updated_at=datetime('now')
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
      storePdfInBackground(req, row.new_voucher_id, userId);
    }
    res.json(await detailFor(req, await own(row.id, userId)));
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
    res.json(await detailFor(req, await own(row.id, req.session.userId)));
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
      const settings = await loadSettings();
      // PDF guardado (mesmo arquivo do botão na página do itinerário): reaproveita se já existe para esta versão. NÃO apagar.
      const pdfPath = await pdfStore.ensure({ voucherId: row.new_voucher_id, unifiedJson: row.new_json, cookieHeader: req.headers.cookie, baseUrl: renderBaseUrl() });
      const args = confirmationEmailArgs(novo, diff, settings, itinerarioUrlOf(row.new_voucher_id, publicBaseUrl()));
      result = await sendVoucherEmail({ to: emails, bcc, attachmentPath: pdfPath, ...args });
    }
    if (!result.sucesso) return res.status(500).json({ error: 'falha ao enviar e-mail', details: result.erro });
    if (kind === 'confirmacao') {
      await run(`UPDATE flight_changes SET confirmation_email_sent_at=datetime('now') WHERE id=? AND user_id=?`, [row.id, userId]);
    }
    console.log(`[FLIGHT-CHANGES] email enviado kind=${kind} caso=${row.id} user=${userId} destinos=${emails.length}`);
    res.json({ sent: emails.length, messageId: result.messageId, subject: result.subject });
  } catch (e) { fail(req, res, e); }
});

// Logo do e-mail vai como anexo CID; no preview (navegador) troca por data URI para a imagem aparecer.
function inlineLogo(html) {
  let uri;
  try { uri = 'data:image/png;base64,' + fs.readFileSync(AGENCY_LOGO_PATH).toString('base64'); } catch { return html; }
  return html.split(`cid:${AGENCY_LOGO_CID}`).join(uri);
}

router.get('/:id/email-preview', async (req, res) => {
  try {
    const kind = req.query.kind;
    if (kind !== 'aviso' && kind !== 'confirmacao') return res.status(400).json({ error: 'kind deve ser "aviso" ou "confirmacao"' });
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (kind === 'aviso') {
      const old = parse(row.old_json);
      if (!old) return res.status(500).json({ error: 'voucher_corrompido', message: 'Os dados do voucher deste caso estão corrompidos.' });
      return res.json({ subject: NOTICE_SUBJECT, html: inlineLogo(buildNoticeEmailHtml(old, { supportPhone: await supportPhone() })) });
    }
    if (!row.new_json || !row.new_voucher_id) return res.status(409).json({ error: 'sem_voucher_novo' });
    const old = parse(row.old_json), novo = parse(row.new_json);
    if (!old || !novo) return res.status(500).json({ error: 'voucher_corrompido', message: 'Os dados do voucher deste caso estão corrompidos.' });
    const diff = diffVouchers(old, novo);
    if (!diff.hasChanges) return res.status(409).json({ error: 'nada_mudou' });
    const args = confirmationEmailArgs(novo, diff, await loadSettings(), itinerarioUrlOf(row.new_voucher_id, publicBaseUrl()));
    const html = await buildVoucherEmailHtml({ voucherData: args.voucherData, settings: args.settings, customMessage: args.customMessage, itinerarioUrl: args.itinerarioUrl });
    res.json({ subject: args.subject, html: inlineLogo(html) });
  } catch (e) { fail(req, res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const row = await own(req.params.id, userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    const r = await run(`DELETE FROM flight_changes WHERE id = ? AND user_id = ?`, [row.id, userId]);
    if (!r.changes) return res.status(404).json({ error: 'não encontrado' });
    // Apaga só o voucher NOVO (criado por este fluxo). O antigo pode ser da aba Vouchers: nunca remover.
    if (row.new_voucher_id && row.new_voucher_id !== row.old_voucher_id) await dropVoucher(row.new_voucher_id, userId, row.id);
    res.status(204).end();
  } catch (e) { fail(req, res, e); }
});

module.exports = router;
