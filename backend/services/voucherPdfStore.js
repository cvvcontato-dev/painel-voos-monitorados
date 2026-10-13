// Guarda o PDF do voucher (versão atual) para download na página pública do itinerário.
// Arquivo: <DB_PATH>/voucher-pdfs/voucher-<id>-<hash>.pdf, onde <hash> identifica o conteúdo
// (unified_json) — alterou o voucher, o hash muda e o PDF antigo deixa de ser servido.
// O PDF contém nomes de passageiros (PII): é apagado junto com o voucher/caso e pela retenção.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { renderVoucher } = require('./voucherRenderer');
const { pdfsDir } = require('../helpers/voucherWorkspace');

const inflight = new Map();

function hashOf(unifiedJson) {
  return crypto.createHash('sha256').update(String(unifiedJson == null ? '' : unifiedJson)).digest('hex').slice(0, 12);
}

// id inteiro positivo; o nome do arquivo é sempre montado aqui (nunca vem do cliente).
function safeId(voucherId) {
  const n = Number(voucherId);
  if (!Number.isSafeInteger(n) || n <= 0 || String(voucherId) !== String(n)) throw new Error('voucherId inválido');
  return n;
}

const fileName = (id, hash) => `voucher-${id}-${hash}.pdf`;

function filePath(voucherId, unifiedJson) {
  const id = safeId(voucherId);
  return path.join(pdfsDir(), fileName(id, hashOf(unifiedJson)));
}

function exists(voucherId, unifiedJson) {
  try { return fs.statSync(filePath(voucherId, unifiedJson)).isFile(); } catch { return false; }
}

function listOf(id) {
  const re = new RegExp(`^voucher-${id}-[0-9a-f]{12}\.pdf$`);
  try { return fs.readdirSync(pdfsDir()).filter(f => re.test(f)); } catch { return []; }
}

async function doEnsure({ voucherId, unifiedJson, cookieHeader, baseUrl }) {
  const id = safeId(voucherId);
  const dest = filePath(id, unifiedJson);
  if (exists(id, unifiedJson)) return dest;
  const tmpRender = await renderVoucher({ voucherId: id, format: 'pdf', cookieHeader, baseUrl });
  const tmpDest = `${dest}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.copyFile(tmpRender, tmpDest);
    await fs.promises.rename(tmpDest, dest);
  } catch (e) {
    await fs.promises.unlink(tmpDest).catch(() => {});
    throw e;
  } finally {
    // O render cai no exportsDir (efêmero): só o arquivo guardado fica.
    await fs.promises.unlink(tmpRender).catch(() => {});
  }
  // Versões antigas (outro hash) deste voucher.
  const keep = path.basename(dest);
  for (const f of listOf(id)) if (f !== keep) await fs.promises.unlink(path.join(pdfsDir(), f)).catch(() => {});
  return dest;
}

/**
 * Garante o PDF da versão atual. Chamadas concorrentes da mesma versão compartilham a mesma promise.
 * `unifiedJson` deve ser exatamente o conteúdo de vouchers.unified_json (é o que o render lê).
 */
function ensure(args) {
  let id;
  try { id = safeId(args.voucherId); } catch (e) { return Promise.reject(e); }
  const key = `${id}-${hashOf(args.unifiedJson)}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = doEnsure(args).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Remove todos os PDFs guardados do voucher (LGPD: ao apagar o voucher/caso ou expirar a retenção). */
function purge(voucherId) {
  let id;
  try { id = safeId(voucherId); } catch { return 0; }
  let n = 0;
  for (const f of listOf(id)) {
    try { fs.unlinkSync(path.join(pdfsDir(), f)); n++; } catch { /* já removido */ }
  }
  return n;
}

module.exports = { ensure, filePath, exists, purge, hashOf };
