const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { destinationKey } = require('../helpers/slug');

// Banco de fundos: uma ou mais fotos por destino, com uma marcada como padrão.
// Metadados na tabela promo_backgrounds; arquivos em <DB_PATH>/promo-backgrounds/.
// Fica no volume persistente de propósito — backend/static é recriado a cada deploy.

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PER_DESTINATION = 12;
const FILE_RE = /^[a-z0-9][a-z0-9-]*\.(jpg|png|webp)$/;
const URL_PREFIX = '/api/promo-backgrounds/file/';

// O require do banco é preguiçoso: importar este módulo não pode abrir o SQLite
// (os testes de serviços puros não devem disparar o seed do admin).
function db() { return require('../database'); }
const dbRun = (sql, p = []) => new Promise((res, rej) => db().run(sql, p, function (e) {
  if (e) rej(e); else res({ changes: this.changes, lastID: this.lastID });
}));
const dbGet = (sql, p = []) => new Promise((res, rej) => db().get(sql, p, (e, r) => e ? rej(e) : res(r)));
const dbAll = (sql, p = []) => new Promise((res, rej) => db().all(sql, p, (e, r) => e ? rej(e) : res(r || [])));

function libDir() {
  return path.join(process.env.DB_PATH || path.join(__dirname, '..'), 'promo-backgrounds');
}

function fail(code, message) {
  const e = new Error(message); e.code = code; return e;
}

/** Identifica o tipo pelos bytes (não confia no Content-Type enviado pelo cliente). */
function detectImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { ext: 'png', mime: 'image/png' };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

const urlFor = (filename) => `${URL_PREFIX}${filename}`;

function toOption(row) {
  const url = urlFor(row.filename);
  return {
    source: 'library', id: row.id, url, thumb: url,
    is_default: !!row.is_default, destination: row.destination_label, created_at: row.created_at,
    source_url: row.source_url || null
  };
}

const fileExists = (filename) => { try { return fs.existsSync(path.join(libDir(), filename)); } catch { return false; } };

/** Fotos do destino, a padrão primeiro. Linhas cujo arquivo sumiu são ignoradas. */
async function listForDestination(destination) {
  const key = destinationKey(destination);
  if (!key) return [];
  const rows = await dbAll(
    `SELECT * FROM promo_backgrounds WHERE destination_slug = ?
      ORDER BY is_default DESC, created_at ASC, id ASC`, [key]);
  return rows.filter(r => fileExists(r.filename)).map(toOption);
}

/** Banco inteiro agrupado por destino, para a tela de gerenciamento. */
async function listBank() {
  const rows = await dbAll(
    `SELECT * FROM promo_backgrounds ORDER BY destination_slug ASC, is_default DESC, created_at ASC, id ASC`);
  const groups = new Map();
  for (const r of rows) {
    if (!fileExists(r.filename)) continue;
    if (!groups.has(r.destination_slug)) {
      groups.set(r.destination_slug, { slug: r.destination_slug, label: r.destination_label, images: [] });
    }
    groups.get(r.destination_slug).images.push({ ...toOption(r), origin: r.source, bytes: r.bytes });
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/**
 * Salva uma foto no banco. A primeira foto de um destino vira a padrão; as
 * seguintes só viram se makeDefault for pedido.
 */
async function add({ destination, buffer, source = 'upload', sourceUrl = null, makeDefault = false }) {
  const label = String(destination ?? '').trim().replace(/\s+/g, ' ');
  const key = destinationKey(label);
  if (!key) throw fail('invalid_destination', 'Informe o nome do destino.');
  if (label.length > 80) throw fail('invalid_destination', 'Nome do destino muito longo (máx. 80 caracteres).');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw fail('invalid_image', 'Arquivo vazio.');
  if (buffer.length > MAX_BYTES) throw fail('too_large', 'Imagem acima de 8 MB.');
  const kind = detectImage(buffer);
  if (!kind) throw fail('invalid_image', 'Formato não suportado. Envie JPG, PNG ou WebP.');

  const { n } = await dbGet('SELECT COUNT(*) AS n FROM promo_backgrounds WHERE destination_slug = ?', [key]);
  if (n >= MAX_PER_DESTINATION) {
    throw fail('limit', `Limite de ${MAX_PER_DESTINATION} fotos por destino. Remova alguma antes de adicionar.`);
  }

  const dir = libDir();
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${key.slice(0, 40)}-${crypto.randomBytes(5).toString('hex')}.${kind.ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);

  let id;
  try {
    const r = await dbRun(
      `INSERT INTO promo_backgrounds (destination_slug, destination_label, filename, is_default, source, source_url, mime, bytes)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
      [key, label, filename, source === 'pexels' ? 'pexels' : 'upload',
       source === 'pexels' && sourceUrl ? String(sourceUrl).slice(0, 500) : null, kind.mime, buffer.length]);
    id = r.lastID;
  } catch (err) {
    try { fs.unlinkSync(path.join(dir, filename)); } catch { /* ignore */ }
    throw err;
  }

  const hasDefault = await dbGet('SELECT 1 AS x FROM promo_backgrounds WHERE destination_slug = ? AND is_default = 1', [key]);
  if (makeDefault || !hasDefault) await setDefault(id);
  return toOption(await dbGet('SELECT * FROM promo_backgrounds WHERE id = ?', [id]));
}

/** Marca uma foto como padrão do destino (num único UPDATE, então nunca há duas). */
async function setDefault(id) {
  const row = await dbGet('SELECT * FROM promo_backgrounds WHERE id = ?', [id]);
  if (!row) throw fail('not_found', 'Foto não encontrada.');
  await dbRun(
    `UPDATE promo_backgrounds SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE destination_slug = ?`,
    [id, row.destination_slug]);
  return toOption(await dbGet('SELECT * FROM promo_backgrounds WHERE id = ?', [id]));
}

/** Remove a foto; se era a padrão, a mais antiga que restar assume. */
async function remove(id) {
  const row = await dbGet('SELECT * FROM promo_backgrounds WHERE id = ?', [id]);
  if (!row) throw fail('not_found', 'Foto não encontrada.');
  await dbRun('DELETE FROM promo_backgrounds WHERE id = ?', [id]);
  try { fs.unlinkSync(path.join(libDir(), row.filename)); } catch { /* arquivo já ausente */ }
  if (row.is_default) {
    await dbRun(
      `UPDATE promo_backgrounds SET is_default = 1
        WHERE id = (SELECT id FROM promo_backgrounds WHERE destination_slug = ? ORDER BY created_at ASC, id ASC LIMIT 1)`,
      [row.destination_slug]);
  }
  return { removed: true };
}

/** Caminho em disco de um arquivo do banco, validando o nome (sem path traversal). */
function resolveFile(filename) {
  if (!FILE_RE.test(String(filename))) return null;
  const full = path.join(libDir(), filename);
  if (path.dirname(path.resolve(full)) !== path.resolve(libDir())) return null;
  return fs.existsSync(full) ? full : null;
}

/** Converte uma URL do banco (/api/promo-backgrounds/file/x.jpg) em caminho em disco. */
function pathFromUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(URL_PREFIX)) return null;
  return resolveFile(url.slice(URL_PREFIX.length));
}

module.exports = {
  add, setDefault, remove, listForDestination, listBank, resolveFile, pathFromUrl,
  detectImage, urlFor, MAX_BYTES, MAX_PER_DESTINATION, URL_PREFIX
};
