const fs = require('fs'); const path = require('path');
const dir = path.join(__dirname, '..', 'static', 'promo-backgrounds');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'maceio.jpg'), 'x');
const { listBackgrounds, slugify } = require('../services/backgroundResolver');

afterAll(() => { try { fs.unlinkSync(path.join(dir, 'maceio.jpg')); } catch (e) {} });

test('slugify normalizes accents and spaces', () => {
  expect(slugify('Maceió')).toBe('maceio');
  expect(slugify('Porto Seguro')).toBe('porto-seguro');
});

test('local images are returned first with source local', async () => {
  const { options } = await listBackgrounds('Maceió');
  expect(options[0].source).toBe('local');
});
