// Guarda o PDF do voucher (versão atual) para download na página pública do itinerário.
// Arquivo: <DB_PATH>/voucher-pdfs/voucher-<id>-<hash>.pdf, onde <hash> identifica o conteúdo
// (unified_json) — alterou o voucher, o hash muda e o PDF antigo deixa de ser servido.
// O PDF contém nomes de passageiros (PII): é apagado junto com o voucher/caso (purge) e por
// sweep() quando o voucher some ou o arquivo passa do prazo (padrão 90 dias, igual ao link).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../database');
const { renderVoucher } = require('./voucherRenderer');
const { pdfsDir } = require('../helpers/voucherWorkspace');

const DEFAULT_RETENTION_DAYS = 90;
const TMP_MAX_AGE_MS = 60 * 60 * 1000;
const PDF_RE = /^voucher-(\d+)-([0-9a-f]{12})\.pdf$/;
const TMP_RE = /^voucher-\d+-[0-9a-f]{12}\.pdf\.\d+\.\d+\.tmp$/;

const inflight = new Map();   // dedupe por voucher+versão
let queue = Promise.resolve(); // fila FIFO global: um render (Chromium) por vez

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
  const re = new RegExp(`^voucher-${id}-[0-9a-f]{12}\\.pdf$`);
  try { return fs.readdirSync(pdfsDir()).filter(f => re.test(f)); } catch { return []; }
}

// unified_json corrente do voucher no banco (null = voucher não existe mais).
const currentJson = (id) => new Promise((resolve, reject) =>
  db.get(`SELECT unified_json FROM vouchers WHERE id = ?`, [id], (err, row) => err ? reject(err) : resolve(row ? row.unified_json : null)));

async function doEnsure({ voucherId, unifiedJson, cookieHeader, baseUrl }) {
  const id = safeId(voucherId);
  const wanted = filePath(id, unifiedJson);
  if (exists(id, unifiedJson)) return wanted;
  const tmpRender = await renderVoucher({ voucherId: id, format: 'pdf', cookieHeader, baseUrl });
  let tmpDest = null;
  try {
    tmpDest = `${wanted}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.copyFile(tmpRender, tmpDest);
    // O render lê o banco no momento em que roda: o nome do arquivo segue o conteúdo CORRENTE do voucher
    // (e não o que foi pedido), e se o voucher foi removido durante o render não deixamos órfão.
    const cur = await currentJson(id);
    if (cur == null) throw new Error('voucher removido durante a geração do PDF');
    const dest = filePath(id, cur);
    await fs.promises.rename(tmpDest, dest);
    tmpDest = null;
    // Versões de outro hash deste voucher (nunca a corrente).
    const keep = path.basename(dest);
    for (const f of listOf(id)) if (f !== keep) await fs.promises.unlink(path.join(pdfsDir(), f)).catch(() => {});
    return dest;
  } finally {
    // O render cai no exportsDir (efêmero): só o arquivo guardado fica.
    await fs.promises.unlink(tmpRender).catch(() => {});
    if (tmpDest) await fs.promises.unlink(tmpDest).catch(() => {});
  }
}

/**
 * Garante o PDF da versão atual. Chamadas da mesma versão compartilham a mesma promise e todos os
 * renders passam por uma fila FIFO (concorrência 1); uma falha não trava a fila.
 * `unifiedJson` deve ser o conteúdo de vouchers.unified_json (é o que o render lê).
 */
function ensure(args) {
  let id;
  try { id = safeId(args.voucherId); } catch (e) { return Promise.reject(e); }
  const key = `${id}-${hashOf(args.unifiedJson)}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = new Promise((resolve, reject) => {
    queue = queue.then(() => doEnsure(args)).then(resolve, reject);   // `queue` nunca rejeita
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Remove todos os PDFs guardados do voucher (ao apagar o voucher/caso). */
function purge(voucherId) {
  let id;
  try { id = safeId(voucherId); } catch { return 0; }
  let n = 0;
  for (const f of listOf(id)) {
    try { fs.unlinkSync(path.join(pdfsDir(), f)); n++; } catch { /* já removido */ }
  }
  return n;
}

/**
 * Faxina: apaga PDFs de vouchers que não existem mais, PDFs mais velhos que o prazo
 * (padrão VOUCHER_PDF_RETENTION_DAYS ou 90) e temporários `.tmp` com mais de 1 hora.
 */
async function sweep({ maxAgeDays } = {}) {
  const envDays = Number(process.env.VOUCHER_PDF_RETENTION_DAYS);
  const days = maxAgeDays > 0 ? maxAgeDays : (envDays > 0 ? envDays : DEFAULT_RETENTION_DAYS);
  const now = Date.now();
  let removed = 0;
  let names;
  try { names = fs.readdirSync(pdfsDir()); } catch { return { removed: 0 }; }
  for (const f of names) {
    const full = path.join(pdfsDir(), f);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    let apagar = false;
    if (TMP_RE.test(f)) {
      apagar = now - st.mtimeMs > TMP_MAX_AGE_MS;
    } else {
      const m = PDF_RE.exec(f);
      if (!m) continue;   // nunca mexe em arquivo que não é nosso
      apagar = now - st.mtimeMs > days * 86400000 || (await currentJson(Number(m[1]))) == null;
    }
    if (apagar) {
      try { fs.unlinkSync(full); removed++; } catch { /* já removido */ }
    }
  }
  return { removed };
}

module.exports = { ensure, filePath, exists, purge, sweep, hashOf };
