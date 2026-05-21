const { validate, stripInternal } = require('../services/promoValidator');

const base = {
  origin_city: 'Salvador', destination_city: 'Porto Seguro', hotel_name: 'Rede Andrade Terra Brasil',
  airlines: ['GOL'], nights: 7, total_price: 2411, installments: 10, installment_amount: 241.10,
  _meta: { agency_commission_detected: 227 }
};

test('valid promotion passes', () => {
  expect(validate(base).valid).toBe(true);
});

test('stripInternal removes commission and underscore-prefixed keys', () => {
  const clean = stripInternal(base);
  expect(clean._meta).toBeUndefined();
  expect(JSON.stringify(clean)).not.toContain('227');
});

test('stripInternal removes top-level agency_commission (extractor field name)', () => {
  const clean = stripInternal({ ...base, agency_commission: 227 });
  expect(clean.agency_commission).toBeUndefined();
  expect(JSON.stringify(clean)).not.toContain('227');
});

test('missing destination is an error', () => {
  const r = validate({ ...base, destination_city: '' });
  expect(r.valid).toBe(false);
  expect(r.errors.join(' ')).toMatch(/destino/i);
});

test('installment mismatch beyond 10 cents is an error', () => {
  const r = validate({ ...base, installment_amount: 200 });
  expect(r.valid).toBe(false);
  expect(r.errors.join(' ')).toMatch(/parcela/i);
});

test('hotel rating missing produces a warning, not an error', () => {
  const r = validate({ ...base, hotel_rating_value: null });
  expect(r.warnings.join(' ')).toMatch(/nota/i);
  expect(r.valid).toBe(true);
});

test('nights out of range warns', () => {
  expect(validate({ ...base, nights: 60 }).warnings.join(' ')).toMatch(/noites/i);
});

test('overlong hotel_name is truncated in normalized_promotion with warning', () => {
  const long = 'X'.repeat(60);
  const r = validate({ ...base, hotel_name: long });
  expect(r.normalized_promotion.hotel_name.length).toBeLessThanOrEqual(45);
  expect(r.warnings.join(' ')).toMatch(/hotel/i);
});

test('overlong meal_plan is truncated with warning', () => {
  const r = validate({ ...base, meal_plan: 'Y'.repeat(50) });
  expect(r.normalized_promotion.meal_plan.length).toBeLessThanOrEqual(30);
  expect(r.warnings.join(' ')).toMatch(/meal_plan/i);
});

test('more than 3 airlines are trimmed with warning', () => {
  const r = validate({ ...base, airlines: ['GOL', 'LATAM', 'Azul', 'Voepass'] });
  expect(r.normalized_promotion.airlines).toHaveLength(3);
  expect(r.warnings.join(' ')).toMatch(/companhia/i);
});

test('validate does not mutate its input argument', () => {
  const original = JSON.parse(JSON.stringify(base));
  validate({ ...base, hotel_name: 'Z'.repeat(60), airlines: ['A', 'B', 'C', 'D'] });
  expect(base).toEqual(original);
});
