const express = require('express');
const fs = require('fs');
const db = require('../database');
const { verify } = require('../helpers/voucherToken');
const { renderItinerarioPage } = require('../helpers/itinerarioPage');
const pdfStore = require('../services/voucherPdfStore');

const router = express.Router();

const invalidLinkHtml = `<!doctype html><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px 20px;color:#5b6878"><h1 style="color:#00569e">Link inválido ou expirado</h1><p>Entre em contato com a Clube do Voo Viagens.</p></body>`;
const pdfMissingHtml = `<!doctype html><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px 20px;color:#5b6878"><h1 style="color:#00569e">Voucher em PDF indisponível</h1><p>Entre em contato com a Clube do Voo Viagens para receber o arquivo.</p></body>`;

// Mesma verificação da página: token assinado e NÃO tipado (ex.: 'pkg').
const verifyItinerarioToken = (token) => { const v = verify(token); return v.ok && !v.type ? v : null; };

// Download do voucher em PDF guardado pelo servidor (services/voucherPdfStore). Só serve o arquivo
// da versão ATUAL do voucher (hash do unified_json); o nome do arquivo nunca vem da requisição.
router.get('/:token/voucher.pdf', (req, res) => {
  const v = verifyItinerarioToken(req.params.token);
  if (!v) return res.status(403).send(invalidLinkHtml);
  db.get(`SELECT unified_json FROM vouchers WHERE id = ?`, [v.voucherId], (err, row) => {
    if (err || !row) return res.status(404).send(pdfMissingHtml);
    let loc = '';
    try { loc = String(JSON.parse(row.unified_json)?.reservation?.locator || ''); } catch { /* sem localizador */ }
    const safeLoc = loc.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) || 'reserva';
    let file;
    try { file = pdfStore.exists(v.voucherId, row.unified_json) ? pdfStore.filePath(v.voucherId, row.unified_json) : null; } catch { file = null; }
    if (!file) return res.status(404).send(pdfMissingHtml);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Voucher-${safeLoc}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex,nofollow');
    fs.createReadStream(file).on('error', () => { if (!res.headersSent) res.status(404).send(pdfMissingHtml); else res.destroy(); }).pipe(res);
  });
});

router.get('/:token', (req, res) => {
  // Rejeita tokens tipados (ex.: 'pkg') — o itinerário só aceita o token legado de voucher.
  const v = verifyItinerarioToken(req.params.token);
  if (!v) return res.status(403).send(invalidLinkHtml);
  db.get(`SELECT unified_json FROM vouchers WHERE id = ?`, [v.voucherId], (err, row) => {
    if (err || !row) {
      return res.status(404).send(`<!doctype html><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px 20px;color:#5b6878"><h1 style="color:#00569e">Reserva não encontrada</h1></body>`);
    }
    let unified;
    try { unified = JSON.parse(row.unified_json); } catch { return res.status(500).send('Erro ao ler reserva'); }
    db.get(`SELECT contact_phone, contact_email, contact_site FROM voucher_settings WHERE id = 1`, async (sErr, settingsRow) => {
      const settings = settingsRow || {};
      // As URLs de check-in por grupo de reserva são derivadas dentro de
      // renderItinerarioPage (via buildReservationGroups + manageBookingUrl).
      try {
        // Botão de download só quando o PDF da versão atual já está guardado.
        let pdfUrl = '';
        try { if (pdfStore.exists(v.voucherId, row.unified_json)) pdfUrl = `/itinerario/${encodeURIComponent(req.params.token)}/voucher.pdf`; } catch { /* sem botão */ }
        const html = await renderItinerarioPage({ voucherData: unified, settings, pdfUrl });
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
