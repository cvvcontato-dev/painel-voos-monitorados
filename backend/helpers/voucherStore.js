const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { extractVoucher } = require('../services/voucherExtractor');
const { validate } = require('../services/voucherSchema');
const { uploadsDir } = require('./voucherWorkspace');

/** Extrai e valida. Lança { status, body } em caso de falha (mesmos códigos de routes/vouchers.js). */
async function extractAndValidate(file) {
  let unified;
  try {
    unified = await extractVoucher(file.buffer, file.mimetype);
  } catch (err) {
    console.error('[VOUCHER-STORE] extração falhou:', err.message);
    if (err.code === 'gemini_unavailable' || /503|service unavailable|high demand/i.test(err.message)) {
      throw { status: 503, body: { error: 'Serviço de extração (Gemini) com alta demanda. Tente novamente em instantes.', retryable: true } };
    }
    if (/quota|exceeded/i.test(err.message)) {
      throw { status: 429, body: { error: 'Cota da API Gemini esgotada. Aguarde alguns minutos.', retryable: true } };
    }
    if (/mimetype não suportado/.test(err.message)) {
      throw { status: 400, body: { error: 'Formato não suportado. Envie PDF, PNG, JPG ou WebP.' } };
    }
    throw { status: 500, body: { error: 'erro ao processar voucher' } };
  }
  const v = validate(unified);
  if (!v.ok) throw { status: 422, body: { error: 'schema inválido após extração', details: v.errors } };
  unified.meta.sourceFileHash = 'sha256:' + crypto.createHash('sha256').update(file.buffer).digest('hex');
  return unified;
}

/** Grava o arquivo + linha em `vouchers`. Resolve com o id. */
function saveVoucher({ userId, file, unified }) {
  const hash = unified.meta.sourceFileHash;
  const filename = `${Date.now()}-${hash.slice(7, 19)}${path.extname(file.originalname || '') || ''}`;
  const filePath = path.join(uploadsDir(), filename);
  fs.writeFileSync(filePath, file.buffer);
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO vouchers (user_id, carrier, layout_version, source_file_path, source_file_hash, unified_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, unified.carrier, unified.layoutVersion, filePath, hash, JSON.stringify(unified)],
      function (err) {
        if (err) { fs.unlink(filePath, () => {}); return reject(err); }
        resolve(this.lastID);
      }
    );
  });
}

module.exports = { extractAndValidate, saveVoucher };
