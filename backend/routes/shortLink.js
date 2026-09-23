// Link curto público do cartão de embarque: GET /c/:code → 302 para o link da cia.
// Montado ANTES do requireAuth (o cliente final abre direto do WhatsApp/e-mail).

const express = require('express');
const store = require('../services/boardingPassStore');
const { isAllowedHost } = require('../helpers/boardingPassLink');
const { SOCIAL_WHATSAPP_URL } = require('../services/notifier');

const router = express.Router();

// Robôs de pré-visualização de link (WhatsApp, Facebook, Telegram etc.)
// recebem o redirect, mas não contam como abertura do cliente.
const BOT_UA = /whatsapp|facebookexternalhit|telegrambot|slackbot|bot\b|crawler|spider|preview/i;

const EXPIRED_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link expirado</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:60px 20px;color:#5b6878">
<h1 style="color:#00539C;font-size:22px">Este link expirou</h1>
<p>Fale com a Clube do Voo Viagens para receber seu cartão de embarque novamente.</p>
<p><a href="${SOCIAL_WHATSAPP_URL}" style="display:inline-block;margin-top:12px;background:#25D366;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Falar no WhatsApp</a></p>
</body></html>`;

router.get('/:code', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex,nofollow');
  const code = String(req.params.code || '');
  let link = null;
  if (/^[A-Za-z0-9]{8}$/.test(code)) {
    try { link = await store.findLinkByCode(code); }
    catch (err) { console.error('[SHORT-LINK] erro ao buscar', err.message); }
  }
  if (!link || !isAllowedHost(link.cleanUrl)) {
    return res.status(404).type('html').send(EXPIRED_HTML);
  }
  if (!BOT_UA.test(req.get('user-agent') || '')) {
    try { await store.registerOpen(link.id); }
    catch (err) { console.error('[SHORT-LINK] erro ao registrar abertura', err.message); }
  }
  res.redirect(302, link.cleanUrl);
});

module.exports = router;
