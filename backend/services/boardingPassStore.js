// Persistência da aba Cartões de Embarque (SQLite).
// Todas as funções de envio são escopadas por user_id, como os vouchers.

const crypto = require('crypto');
const db = require('../database');
const { segmentLabel } = require('../helpers/boardingPassMessage');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null)));
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
}

function generateShortCode() {
  let out = '';
  for (const b of crypto.randomBytes(8)) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function parseJson(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

function rowToLink(r) {
  return {
    id: r.id,
    passengerIndex: r.passenger_index,
    segmentIndex: r.segment_index,
    originalUrl: r.original_url,
    cleanUrl: r.clean_url,
    carrier: r.carrier,
    recognized: !!r.recognized,
    data: parseJson(r.parsed_json, null),
    shortCode: r.short_code,
    openCount: r.open_count,
    firstOpenedAt: r.first_opened_at,
    lastOpenedAt: r.last_opened_at
  };
}

function rowToSend(r, links) {
  return {
    id: r.id,
    voucherId: r.voucher_id,
    payload: parseJson(r.payload_json, { passengers: [] }),
    flightDate: r.flight_date,
    emailStatus: r.email_status,
    emailSentAt: r.email_sent_at,
    emailLog: parseJson(r.email_log_json, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    links
  };
}

async function insertLink(sendId, l, prev) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = prev ? prev.short_code : (l.recognized ? generateShortCode() : null);
    try {
      await dbRun(
        `INSERT INTO boarding_pass_links
           (send_id, passenger_index, segment_index, original_url, clean_url, carrier, recognized,
            parsed_json, short_code, open_count, first_opened_at, last_opened_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sendId, l.passengerIndex, l.segmentIndex, l.originalUrl, l.cleanUrl, l.carrier,
          l.recognized ? 1 : 0, l.data ? JSON.stringify(l.data) : null, code,
          prev ? prev.open_count : 0, prev ? prev.first_opened_at : null, prev ? prev.last_opened_at : null]
      );
      return;
    } catch (err) {
      if (!prev && code && /UNIQUE/i.test(err.message)) continue; // colisão de código: tenta outro
      throw err;
    }
  }
  throw new Error('não foi possível gerar código curto único');
}

// Recria os links do envio, preservando código curto e contadores quando
// (passageiro, trecho, link limpo) não mudou.
async function saveLinks(sendId, links) {
  const existing = await dbAll(`SELECT * FROM boarding_pass_links WHERE send_id = ?`, [sendId]);
  const byKey = new Map(existing.map(r => [`${r.passenger_index}:${r.segment_index}:${r.clean_url}`, r]));
  await dbRun(`DELETE FROM boarding_pass_links WHERE send_id = ?`, [sendId]);
  for (const l of links) {
    await insertLink(sendId, l, byKey.get(`${l.passengerIndex}:${l.segmentIndex}:${l.cleanUrl}`));
  }
}

async function createSend(userId, v) {
  const r = await dbRun(
    `INSERT INTO boarding_pass_sends (user_id, voucher_id, payload_json, flight_date) VALUES (?, ?, ?, ?)`,
    [userId, v.voucherId, JSON.stringify(v.payload), v.flightDate]
  );
  await saveLinks(r.lastID, v.links);
  return getSend(userId, r.lastID);
}

async function updateSend(userId, id, v) {
  const r = await dbRun(
    `UPDATE boarding_pass_sends SET voucher_id = ?, payload_json = ?, flight_date = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [v.voucherId, JSON.stringify(v.payload), v.flightDate, id, userId]
  );
  if (r.changes === 0) return null;
  await saveLinks(Number(id), v.links);
  return getSend(userId, id);
}

async function getSend(userId, id) {
  const row = await dbGet(`SELECT * FROM boarding_pass_sends WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!row) return null;
  const links = await dbAll(
    `SELECT * FROM boarding_pass_links WHERE send_id = ? ORDER BY passenger_index, segment_index`, [row.id]
  );
  return rowToSend(row, links.map(rowToLink));
}

async function listSends(userId) {
  const rows = await dbAll(
    `SELECT * FROM boarding_pass_sends WHERE user_id = ? ORDER BY id DESC LIMIT 100`, [userId]
  );
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const linkRows = await dbAll(
    `SELECT * FROM boarding_pass_links WHERE send_id IN (${ids.map(() => '?').join(',')})
     ORDER BY passenger_index, segment_index`, ids
  );
  return rows.map(r => {
    const links = linkRows.filter(l => l.send_id === r.id).map(rowToLink);
    const send = rowToSend(r, links);
    const passengers = send.payload.passengers || [];
    const first = links[0];
    const firstFallback = first ? ((passengers[first.passengerIndex] || {}).segments || [])[first.segmentIndex] : null;
    return {
      id: send.id,
      voucherId: send.voucherId,
      createdAt: send.createdAt,
      flightDate: send.flightDate,
      emailStatus: send.emailStatus,
      emailSentAt: send.emailSentAt,
      title: first ? segmentLabel(first, firstFallback && firstFallback.label, first.segmentIndex) : 'Cartões de embarque',
      passengers: passengers.map((p, i) => ({
        name: p.name,
        opened: links.some(l => l.passengerIndex === i && l.openCount > 0)
      }))
    };
  });
}

async function deleteSend(userId, id) {
  const row = await dbGet(`SELECT id FROM boarding_pass_sends WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!row) return false;
  await dbRun(`DELETE FROM boarding_pass_links WHERE send_id = ?`, [row.id]);
  await dbRun(`DELETE FROM boarding_pass_sends WHERE id = ?`, [row.id]);
  return true;
}

async function recordEmailResult(id, status, log) {
  await dbRun(
    `UPDATE boarding_pass_sends SET email_status = ?, email_log_json = ?, email_sent_at = datetime('now') WHERE id = ?`,
    [status, JSON.stringify(log), id]
  );
}

async function findLinkByCode(code) {
  const r = await dbGet(`SELECT * FROM boarding_pass_links WHERE short_code = ?`, [code]);
  return r ? rowToLink(r) : null;
}

async function registerOpen(linkId) {
  await dbRun(
    `UPDATE boarding_pass_links
       SET open_count = open_count + 1,
           first_opened_at = COALESCE(first_opened_at, datetime('now')),
           last_opened_at = datetime('now')
     WHERE id = ?`, [linkId]
  );
}

// --- Leitura de vouchers (para o prefill) ---
async function listVoucherRows(userId) {
  return dbAll(`SELECT id, unified_json FROM vouchers WHERE user_id = ? ORDER BY id DESC LIMIT 30`, [userId]);
}

async function getVoucherUnified(userId, voucherId) {
  const r = await dbGet(`SELECT unified_json FROM vouchers WHERE id = ? AND user_id = ?`, [voucherId, userId]);
  return r ? parseJson(r.unified_json, null) : null;
}

async function lastVoucherEmails(voucherId) {
  const r = await dbGet(
    `SELECT details FROM voucher_audit_log WHERE voucher_id = ? AND action = 'email_sent' ORDER BY id DESC LIMIT 1`,
    [voucherId]
  );
  const details = r ? parseJson(r.details, {}) : {};
  return Array.isArray(details.to) ? details.to : [];
}

module.exports = {
  createSend, updateSend, getSend, listSends, deleteSend, recordEmailResult,
  findLinkByCode, registerOpen,
  listVoucherRows, getVoucherUnified, lastVoucherEmails,
  generateShortCode
};
