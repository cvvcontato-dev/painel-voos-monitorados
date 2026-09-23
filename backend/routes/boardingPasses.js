const express = require('express');
const store = require('../services/boardingPassStore');
const { parseBoardingPassLink } = require('../helpers/boardingPassLink');
const { validateSendPayload } = require('../helpers/boardingPassPayload');
const { buildWhatsappMessages, buildRecipientGroups } = require('../helpers/boardingPassMessage');
const { voucherToPrefill, voucherOptionLabel } = require('../helpers/boardingPassVoucher');
const { sendBoardingPassEmail } = require('../services/boardingPassEmail');

const router = express.Router();

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

function fail(res, message, err) {
  console.error(`[BOARDING-PASSES] ${message}`, err && err.message);
  res.status(500).json({ error: message });
}

router.post('/parse-link', (req, res) => {
  res.json(parseBoardingPassLink(req.body && req.body.url));
});

router.get('/voucher-options', async (req, res) => {
  try {
    const rows = await store.listVoucherRows(req.session.userId);
    res.json(rows.map(r => {
      let unified = null;
      try { unified = JSON.parse(r.unified_json); } catch { /* voucher corrompido: rótulo genérico */ }
      return { id: r.id, label: voucherOptionLabel(unified, r.id) };
    }));
  } catch (err) { fail(res, 'erro ao listar vouchers', err); }
});

router.get('/voucher-prefill/:voucherId', async (req, res) => {
  try {
    const unified = await store.getVoucherUnified(req.session.userId, req.params.voucherId);
    if (!unified) return res.status(404).json({ error: 'voucher não encontrado' });
    const lastEmails = await store.lastVoucherEmails(req.params.voucherId);
    res.json({ ...voucherToPrefill(unified), lastEmails });
  } catch (err) { fail(res, 'erro ao carregar voucher', err); }
});

router.get('/', async (req, res) => {
  try { res.json(await store.listSends(req.session.userId)); }
  catch (err) { fail(res, 'erro ao listar envios', err); }
});

router.post('/', async (req, res) => {
  const v = validateSendPayload(req.body);
  if (!v.ok) return res.status(422).json({ error: 'dados inválidos', errors: v.errors });
  try { res.status(201).json(await store.createSend(req.session.userId, v)); }
  catch (err) { fail(res, 'erro ao salvar envio', err); }
});

router.get('/:id', async (req, res) => {
  try {
    const send = await store.getSend(req.session.userId, req.params.id);
    if (!send) return res.status(404).json({ error: 'não encontrado' });
    res.json(send);
  } catch (err) { fail(res, 'erro ao buscar envio', err); }
});

router.put('/:id', async (req, res) => {
  const v = validateSendPayload(req.body);
  if (!v.ok) return res.status(422).json({ error: 'dados inválidos', errors: v.errors });
  try {
    const send = await store.updateSend(req.session.userId, req.params.id, v);
    if (!send) return res.status(404).json({ error: 'não encontrado' });
    res.json(send);
  } catch (err) { fail(res, 'erro ao atualizar envio', err); }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await store.deleteSend(req.session.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'não encontrado' });
    res.status(204).end();
  } catch (err) { fail(res, 'erro ao apagar envio', err); }
});

router.get('/:id/messages', async (req, res) => {
  try {
    const send = await store.getSend(req.session.userId, req.params.id);
    if (!send) return res.status(404).json({ error: 'não encontrado' });
    const useOriginal = req.query.useOriginal === '1';
    res.json(buildWhatsappMessages(send.payload, send.links, { baseUrl: baseUrl(), useOriginal }));
  } catch (err) { fail(res, 'erro ao gerar mensagens', err); }
});

router.post('/:id/send-email', async (req, res) => {
  let send;
  try { send = await store.getSend(req.session.userId, req.params.id); }
  catch (err) { return fail(res, 'erro ao buscar envio', err); }
  if (!send) return res.status(404).json({ error: 'não encontrado' });

  const groups = buildRecipientGroups(send.payload, send.links, 'email', { baseUrl: baseUrl(), useOriginal: false })
    .filter(g => g.contact);
  if (!groups.length) return res.status(400).json({ error: 'nenhum e-mail informado' });

  const skipped = send.payload.emailMode === 'individual'
    ? send.payload.passengers.filter(p => !p.email).map(p => p.name)
    : [];

  const log = [];
  for (const g of groups) {
    const to = g.contact.split(',').map(s => s.trim()).filter(Boolean);
    const r = await sendBoardingPassEmail({ to, bcc: process.env.EMAIL_USER || null, group: g });
    log.push({ to, ok: !!r.sucesso, error: r.sucesso ? null : r.erro, at: new Date().toISOString() });
  }
  const sent = log.filter(l => l.ok).length;
  const failed = log.length - sent;
  const status = failed === 0 ? 'sent' : sent ? 'partial' : 'failed';

  try { await store.recordEmailResult(send.id, status, log); }
  catch (err) { console.error('[BOARDING-PASSES] erro ao registrar envio', err.message); }

  const body = { status, sent, failed, skipped, log };
  if (!sent) return res.status(500).json({ error: 'falha ao enviar e-mail', ...body });
  res.json(body);
});

module.exports = router;
