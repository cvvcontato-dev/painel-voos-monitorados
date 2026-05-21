const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ws = require('../helpers/promoWorkspace');
const { extract } = require('../services/geminiExtractor');
const { normalize } = require('../services/promoNormalizer');
const { validate, stripInternal } = require('../services/promoValidator');
const { buildMessage } = require('../services/whatsappMessage');
const { renderImage } = require('../services/promoRenderer');
const { listBackgrounds } = require('../services/backgroundResolver');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post('/extract', upload.single('print'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo "print" é obrigatório' });
  try {
    const { promo_id, dir } = ws.create();
    const ext = (req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
    fs.writeFileSync(path.join(dir, `print.${ext}`), req.file.buffer);
    const { promotion, _meta } = await extract(req.file.buffer, req.file.mimetype);
    const normalized = normalize(promotion);
    const { warnings, normalized_promotion } = validate(normalized);
    _meta.validation_warnings = warnings;
    // Contract: agency commission ("Seu ganho") must never leak to client output.
    delete _meta.agency_commission_detected;
    return res.json({
      promo_id, promotion: { ...normalized_promotion, promo_id }, _meta,
      workspace: { promo_id, print_url: ws.publicUrl(promo_id, `print.${ext}`) }
    });
  } catch (err) {
    if (err.code === 'unavailable') return res.status(503).json({ error: 'Serviço de extração indisponível. Tente novamente.' });
    if (err.code === 'unprocessable') return res.status(422).json({ error: 'Não foi possível ler o print. Preencha manualmente.' });
    return res.status(500).json({ error: err.message });
  }
});

router.post('/validate', (req, res) => {
  const { promotion } = req.body || {};
  if (!promotion) return res.status(400).json({ error: 'promotion é obrigatório' });
  return res.json(validate(normalize(promotion)));
});

router.post('/render-message', (req, res) => {
  const { promotion } = req.body || {};
  if (!promotion) return res.status(400).json({ error: 'promotion é obrigatório' });
  return res.json({ message_text: buildMessage(stripInternal(promotion)) });
});

router.post('/render-image', async (req, res) => {
  const { promotion, background_choice } = req.body || {};
  if (!promotion || !UUID_RE.test(promotion.promo_id || '')) return res.status(400).json({ error: 'promotion.promo_id inválido' });
  try {
    const out = await renderImage(promotion.promo_id, stripInternal(promotion), { backgroundUrl: background_choice || null });
    return res.json(out);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.get('/backgrounds', async (req, res) => {
  const { destination } = req.query;
  if (!destination) return res.status(400).json({ error: 'destination é obrigatório' });
  return res.json(await listBackgrounds(destination));
});

router.get('/:promo_id/file/:name', (req, res) => {
  const target = ws.resolveFile(req.params.promo_id, req.params.name);
  if (!target || !fs.existsSync(target)) return res.status(404).json({ error: 'Arquivo não encontrado' });
  return res.sendFile(target);
});

module.exports = router;
