const express = require('express');
const db = require('../database');
const { verify } = require('../helpers/voucherToken');
const { renderItinerarioPage } = require('../helpers/itinerarioPage');
const { manageBookingUrl, lastNameOf } = require('../helpers/voucherCarrier');

const router = express.Router();

router.get('/:token', (req, res) => {
  const v = verify(req.params.token);
  if (!v.ok) {
    return res.status(403).send(`<!doctype html><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px 20px;color:#5b6878"><h1 style="color:#00569e">Link inválido ou expirado</h1><p>Entre em contato com a Clube do Voo Viagens.</p></body>`);
  }
  db.get(`SELECT unified_json FROM vouchers WHERE id = ?`, [v.voucherId], (err, row) => {
    if (err || !row) {
      return res.status(404).send(`<!doctype html><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px 20px;color:#5b6878"><h1 style="color:#00569e">Reserva não encontrada</h1></body>`);
    }
    let unified;
    try { unified = JSON.parse(row.unified_json); } catch { return res.status(500).send('Erro ao ler reserva'); }
    db.get(`SELECT contact_phone, contact_email, contact_site FROM voucher_settings WHERE id = 1`, async (sErr, settingsRow) => {
      const settings = settingsRow || {};
      // Usa helper compartilhado que entende "SILVA, MAYARA" → "SILVA".
      const lastName = lastNameOf((unified.passengers || [])[0]?.name);
      const bookingUrl = manageBookingUrl(
        (unified.carrier || 'azul').toLowerCase(),
        unified.reservation?.locator,
        lastName,
        unified.route?.origin
      );
      try {
        const html = await renderItinerarioPage({ voucherData: unified, settings, bookingUrl });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex,nofollow');
        res.send(html);
      } catch (e) {
        console.error('[itinerario] render error', e);
        res.status(500).send('Erro ao renderizar itinerário');
      }
    });
  });
});

module.exports = router;
