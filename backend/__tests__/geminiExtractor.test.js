process.env.EXTRACTION_MODE = 'stub';
const { extract } = require('../services/geminiExtractor');

test('stub mode returns a structured promotion without calling the API', async () => {
  const { promotion, _meta } = await extract(Buffer.from('fake'), 'image/jpeg');
  expect(promotion.destination_city || promotion.destination_code).toBeTruthy();
  expect(Array.isArray(_meta.low_confidence_fields)).toBe(true);
});
