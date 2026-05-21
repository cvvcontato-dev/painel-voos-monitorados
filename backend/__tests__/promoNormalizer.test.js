const { normalize } = require('../services/promoNormalizer');

test('maps known airport codes to cities', () => {
  const out = normalize({ origin_code: 'SSA', destination_code: 'BPS' });
  expect(out.origin_city).toBe('Salvador');
  expect(out.destination_city).toBe('Porto Seguro');
});

test('builds month label and display_availability from date range', () => {
  const out = normalize({ start_date: '2026-09-12', end_date: '2026-09-19', availability_note: 'sob consulta' });
  expect(out.travel_month_label).toBe('Setembro');
  expect(out.display_availability).toBe('Setembro (sob consulta)');
});

test('derives installment_amount from total and installments (default 10)', () => {
  const out = normalize({ total_price: 2411.0 });
  expect(out.installments).toBe(10);
  expect(out.installment_amount).toBeCloseTo(241.10, 2);
});

test('normalizes baggage to closed values', () => {
  const out = normalize({ baggage_raw: ['bagagem de mão', 'bagagem despachada'] });
  expect(out.baggage).toEqual(['carry_on', 'checked']);
});

test('keeps display_availability without parens when no note', () => {
  const out = normalize({ start_date: '2026-08-01', end_date: '2026-08-07' });
  expect(out.display_availability).toBe('Agosto');
});
