const express = require('express');
const db = require('../database');
const { verify } = require('../helpers/voucherToken');
const { renderPackagePage } = require('../helpers/packagePage');

const router = express.Router();

router.get('/:token', (req, res) => {
  const v = verify(req.params.token);
  if (!v.ok) {
    return res.status(403).send(`<!doctype html><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px 20px;color:#5b6878"><h1 style="color:#00539C">Link inválido ou expirado</h1><p>Entre em contato com a Clube do Voo Viagens.</p></body>`);
  }
  db.get(`SELECT package_json FROM packages WHERE id = ?`, [v.voucherId], (err, row) => {
    if (err || !row) {
      return res.status(404).send(`<!doctype html><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px 20px;color:#5b6878"><h1 style="color:#00539C">Pacote não encontrado</h1></body>`);
    }
    let pkg;
    try { pkg = JSON.parse(row.package_json); } catch { return res.status(500).send('Erro ao ler pacote'); }
    db.get(`SELECT contact_phone, contact_email, contact_site FROM voucher_settings WHERE id = 1`, async (sErr, settingsRow) => {
      const settings = settingsRow || {};
      try {
        const html = await renderPackagePage({ packageData: pkg, settings });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex,nofollow');
        res.send(html);
      } catch (e) {
        console.error('[pacote] render error', e);
        res.status(500).send('Erro ao renderizar pacote');
      }
    });
  });
});

module.exports = router;
