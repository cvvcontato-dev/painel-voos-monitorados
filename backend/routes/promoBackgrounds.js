const express = require('express');
const multer = require('multer');
const library = require('../services/backgroundLibrary');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: library.MAX_BYTES } });

// Só importamos de URL do próprio CDN do Pexels. Sem essa trava, a rota viraria um
// "baixe qualquer endereço" a partir do servidor (SSRF), inclusive redes internas.
const PEXELS_HOST = 'images.pexels.com';
const FETCH_TIMEOUT_MS = 15000;

const STATUS_BY_CODE = {
  invalid_destination: 400, invalid_image: 400, invalid_url: 400, limit: 409,
  too_large: 413, not_found: 404, upstream: 502
};

function sendError(res, err) {
  const status = STATUS_BY_CODE[err.code];
  if (status) return res.status(status).json({ error: err.message });
  console.error('[PROMO-BG]', err);
  return res.status(500).json({ error: 'Erro interno ao processar o banco de fundos.' });
}

const asBool = (v) => v === true || v === 'true' || v === '1' || v === 1;

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function downloadPexelsImage(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl)); } catch { url = null; }
  if (!url || url.protocol !== 'https:' || url.hostname !== PEXELS_HOST) {
    const e = new Error('Só é possível importar imagens do Pexels.'); e.code = 'invalid_url'; throw e;
  }
  let res;
  try {
    res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    const e = new Error(`Não consegui baixar a imagem do Pexels (${err.message}).`); e.code = 'upstream'; throw e;
  }
  if (!res.ok) {
    const e = new Error(`O Pexels respondeu ${res.status} ao baixar a imagem.`); e.code = 'upstream'; throw e;
  }
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > library.MAX_BYTES) {
    const e = new Error('Imagem acima de 8 MB.'); e.code = 'too_large'; throw e;
  }
  return Buffer.from(await res.arrayBuffer());
}

// GET /api/promo-backgrounds — o banco inteiro, agrupado por destino
router.get('/', async (req, res) => {
  try { res.json({ destinations: await library.listBank(), max_per_destination: library.MAX_PER_DESTINATION }); }
  catch (err) { sendError(res, err); }
});

// GET /api/promo-backgrounds/file/:filename — serve a imagem (autenticado, cache longo:
// o nome do arquivo tem sufixo aleatório, então uma foto nunca muda sob o mesmo nome)
router.get('/file/:filename', (req, res) => {
  const full = library.resolveFile(req.params.filename);
  if (!full) return res.status(404).json({ error: 'Imagem não encontrada.' });
  res.set('Cache-Control', 'private, max-age=2592000, immutable');
  return res.sendFile(full);
});

// POST /api/promo-backgrounds — upload (multipart: image, destination, make_default)
router.post('/', (req, res) => {
  upload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) {
      if (uploadErr.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Imagem acima de 8 MB.' });
      return res.status(400).json({ error: 'Falha ao receber o arquivo.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Arquivo "image" é obrigatório.' });
    try {
      const image = await library.add({
        destination: req.body?.destination,
        buffer: req.file.buffer,
        source: 'upload',
        makeDefault: asBool(req.body?.make_default)
      });
      res.status(201).json({ image });
    } catch (err) { sendError(res, err); }
  });
});

// POST /api/promo-backgrounds/from-url — salva no banco uma foto sugerida pelo Pexels
router.post('/from-url', async (req, res) => {
  const { destination, url, make_default } = req.body || {};
  try {
    const buffer = await downloadPexelsImage(url);
    const image = await library.add({
      destination, buffer, source: 'pexels', sourceUrl: url, makeDefault: asBool(make_default)
    });
    res.status(201).json({ image });
  } catch (err) { sendError(res, err); }
});

// PUT /api/promo-backgrounds/:id/default — define a foto padrão do destino
router.put('/:id/default', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido.' });
  try { res.json({ image: await library.setDefault(id) }); }
  catch (err) { sendError(res, err); }
});

// DELETE /api/promo-backgrounds/:id
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido.' });
  try { res.json(await library.remove(id)); }
  catch (err) { sendError(res, err); }
});

module.exports = router;
