const fs = require('fs');
const path = require('path');
process.env.PROMO_OUTPUT_DIR = path.join(__dirname, '.tmp-promos');
const ws = require('../helpers/promoWorkspace');

afterAll(() => { try { fs.rmSync(process.env.PROMO_OUTPUT_DIR, { recursive: true, force: true }); } catch (e) {} });

test('create() returns a uuid promo_id and makes the dir', () => {
  const { promo_id, dir } = ws.create();
  expect(promo_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(fs.existsSync(dir)).toBe(true);
});

test('publicUrl maps a filename to a safe API url, never an absolute path', () => {
  const { promo_id } = ws.create();
  const url = ws.publicUrl(promo_id, 'print.png');
  expect(url).toBe(`/api/promotions/${promo_id}/file/print.png`);
  expect(url).not.toContain(process.env.PROMO_OUTPUT_DIR);
});

test('cleanupExpired removes dirs older than ttl', () => {
  const { promo_id, dir } = ws.create();
  const past = Date.now() - 25 * 3600 * 1000;
  fs.utimesSync(dir, new Date(past), new Date(past));
  ws.cleanupExpired(24 * 3600 * 1000);
  expect(fs.existsSync(dir)).toBe(false);
});

test('resolveFile rejects path traversal', () => {
  const { promo_id } = ws.create();
  expect(ws.resolveFile(promo_id, '../../etc/passwd')).toBeNull();
});
