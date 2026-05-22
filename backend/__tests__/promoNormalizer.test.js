const { normalize } = require('../services/promoNormalizer');

test('maps known airport codes to cities', () => {
  const out = normalize({ origin_code: 'SSA', destination_code: 'BPS' });
  expect(out.origin_city).toBe('Salvador');
  expect(out.destination_city).toBe('Porto Seguro');
});

test('prefers an extracted city name over the IATA code', () => {
  // Aruba (AUA) não está no mapa de aeroportos: deve usar o nome extraído, não "AUA".
  const out = normalize({ destination_code: 'AUA', destination_city: 'Aruba' });
  expect(out.destination_city).toBe('Aruba');
});

test('ignores a city field that is actually an airport code', () => {
  const out = normalize({ destination_code: 'BPS', destination_city: 'BPS' });
  expect(out.destination_city).toBe('Porto Seguro');
});

test('applies business defaults (meal, cta, customization)', () => {
  const out = normalize({});
  expect(out.meal_plan).toBe('Café da Manhã');
  expect(out.cta_text).toBe('Garanta já sua viagem inesquecível!');
  expect(out.customization_text).toBe('Precisa de outras datas ou roteiro? Fale conosco!');
});

test('defaults destination flag to Brazil and uses country code when present', () => {
  expect(normalize({ destination_city: 'Maceió' }).destination_flag).toBe('🇧🇷');
  expect(normalize({ destination_city: 'Aruba', destination_country_code: 'AW' }).destination_flag).toBe('🇦🇼');
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

test('derives nights from date range when not provided', () => {
  const out = normalize({ start_date: '2026-09-12', end_date: '2026-09-19' });
  expect(out.nights).toBe(7);
});

test('keeps explicit nights when provided', () => {
  const out = normalize({ nights: 6, start_date: '2026-09-12', end_date: '2026-09-19' });
  expect(out.nights).toBe(6);
});

test('normalizes baggage to closed values', () => {
  const out = normalize({ baggage_raw: ['bagagem de mão', 'bagagem despachada'] });
  expect(out.baggage).toEqual(['carry_on', 'checked']);
});

test('keeps display_availability without parens when no note', () => {
  const out = normalize({ start_date: '2026-08-01', end_date: '2026-08-07' });
  expect(out.display_availability).toBe('Agosto');
});
