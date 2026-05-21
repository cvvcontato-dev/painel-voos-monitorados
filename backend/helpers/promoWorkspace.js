const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = process.env.PROMO_OUTPUT_DIR || path.join(__dirname, '..', 'output', 'promos');

function baseDir() { fs.mkdirSync(BASE, { recursive: true }); return BASE; }

function create() {
  const promo_id = crypto.randomUUID();
  const dir = path.join(baseDir(), promo_id);
  fs.mkdirSync(dir, { recursive: true });
  return { promo_id, dir };
}

function dirFor(promo_id) { return path.join(baseDir(), promo_id); }

function publicUrl(promo_id, filename) {
  return `/api/promotions/${promo_id}/file/${filename}`;
}

function resolveFile(promo_id, filename) {
  const dir = dirFor(promo_id);
  const target = path.resolve(dir, filename);
  if (target !== dir && !target.startsWith(dir + path.sep)) return null;
  return target;
}

function cleanupExpired(ttlMs = 24 * 3600 * 1000) {
  const root = baseDir();
  const now = Date.now();
  for (const name of fs.readdirSync(root)) {
    const p = path.join(root, name);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory() && now - st.mtimeMs > ttlMs) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    } catch (e) { /* ignore */ }
  }
}

module.exports = { create, dirFor, publicUrl, resolveFile, cleanupExpired, baseDir };
