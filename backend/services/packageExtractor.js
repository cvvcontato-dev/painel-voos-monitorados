const { extractVoucher, callGemini } = require('./voucherExtractor');
const { PROMPTS, STUBS } = require('./packagePrompts');
const { normalizeItem } = require('./packageNormalizer');
const { KINDS } = require('./packageSchema');

async function extractPackageItem(buffer, mimetype, kind) {
  if (!KINDS.includes(kind)) throw new Error(`tipo de serviço inválido: ${kind}`);
  if (kind === 'flight') return await extractVoucher(buffer, mimetype); // já normalizado
  if (!process.env.GEMINI_API_KEY) return normalizeItem(STUBS[kind], kind);
  const raw = await callGemini(buffer, mimetype, PROMPTS[kind]);
  return normalizeItem(raw, kind);
}

module.exports = { extractPackageItem };
