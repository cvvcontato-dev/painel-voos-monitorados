// Centraliza extração, validação e persistência de vouchers (usado por routes/vouchers.js e routes/flightChanges.js).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const voucherExtractor = require('../services/voucherExtractor');
const { mergeNewFlights } = require('./flightChangeMerge');
const { validate } = require('../services/voucherSchema');
const { uploadsDir } = require('./voucherWorkspace');

/** Converte erro do extrator em { status, body } (mesmos códigos de routes/vouchers.js). */
function mapExtractionError(err) {
  console.error('[VOUCHER-STORE] extração falhou:', err.message);
  if (err.code === 'gemini_unavailable' || /503|service unavailable|high demand/i.test(err.message)) {
    return { status: 503, body: { error: 'Serviço de extração (Gemini) está com alta demanda no momento. Tente novamente em alguns instantes.', retryable: true } };
  }
  if (/\b402\b|payment required|credits are depleted/i.test(err.message)) {
    return { status: 402, body: { error: 'Créditos da IA esgotados. Recarregue o saldo no Google AI Studio (ai.studio) e tente novamente.', retryable: false } };
  }
  if (/quota|exceeded/i.test(err.message)) {
    return { status: 429, body: { error: 'Cota da API Gemini esgotada. Aguarde alguns minutos e tente novamente.', retryable: true } };
  }
  if (err.code === 'gemini_not_configured') {
    return { status: 503, body: { error: err.message } };
  }
  if (err.code === 'flights_unreadable') {
    return { status: 422, body: { error: err.message } };
  }
  if (/mimetype não suportado/.test(err.message)) {
    return { status: 400, body: { error: 'Formato não suportado. Envie PDF, PNG, JPG ou WebP.' } };
  }
  return { status: 500, body: { error: 'erro ao processar voucher' } };
}

const hashOf = (file) => 'sha256:' + crypto.createHash('sha256').update(file.buffer).digest('hex');

/** Extrai e valida. Lança { status, body } em caso de falha (mesmos códigos de routes/vouchers.js). */
async function extractAndValidate(file) {
  let unified;
  try {
    unified = await voucherExtractor.extractVoucher(file.buffer, file.mimetype);
  } catch (err) {
    throw mapExtractionError(err);
  }
  const v = validate(unified);
  if (!v.ok) throw { status: 422, body: { error: 'schema inválido após extração', details: v.errors } };
  unified.meta.sourceFileHash = hashOf(file);
  return unified;
}

/** Contexto de datas para o prompt: ano (e data) da 1ª partida do voucher antigo. */
function referenceOf(v) {
  const iso = v && Array.isArray(v.trips) && v.trips[0] && v.trips[0].departure && v.trips[0].departure.datetime;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? { referenceYear: Number(m[1]), referenceDate: `${m[3]}/${m[2]}/${m[1]}` } : {};
}

/** Print/PDF só com voos: extrai e normaliza os trechos ({ carrier, locator, trips }), ainda sem mesclar. */
async function extractFlightsRaw(file, oldVoucher) {
  try {
    return await voucherExtractor.extractFlights(file.buffer, file.mimetype, referenceOf(oldVoucher));
  } catch (err) {
    throw mapExtractionError(err);
  }
}

/**
 * Extrai os voos e mescla com o voucher ANTIGO (passageiros etc. ficam dele). `opts.affected` restringe a
 * troca aos trechos marcados (ver helpers/flightChangeMerge.js).
 */
async function extractFlightsMerged(file, oldVoucher, opts) {
  const extracted = await extractFlightsRaw(file, oldVoucher);
  const unified = mergeNewFlights(oldVoucher, extracted, opts);   // lança { status: 422, body } se inválido
  unified.meta.sourceFileHash = hashOf(file);
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

module.exports = { extractAndValidate, extractFlightsRaw, extractFlightsMerged, saveVoucher, hashOf };
