const fs = require('fs');
const path = require('path');
process.env.PROMO_OUTPUT_DIR = path.join(__dirname, '.tmp-promos-render');
const ws = require('../helpers/promoWorkspace');
const { renderImage, fillTemplate } = require('../services/promoRenderer');

afterAll(() => { try { fs.rmSync(process.env.PROMO_OUTPUT_DIR, { recursive: true, force: true }); } catch (e) {} });

const promo = {
  origin_city: 'Salvador', destination_city: 'Maceió', nights: 6, passengers: 2,
  display_availability: 'Agosto (sob consulta)', flight_type: 'Direto', airlines: ['GOL'],
  baggage: ['carry_on'], hotel_name: 'Hotel Praia Bonita', hotel_stars: 3,
  hotel_rating_value: 8.3, hotel_rating_text: 'Muito bom', meal_plan: 'Café da Manhã',
  installments: 10, installment_amount: 374.70, total_price: 3747, cta_text: 'Reserve agora',
  _meta: { agency_commission_detected: 227 }
};

test('fillTemplate resolves all tokens and renders core content', () => {
  const html = fillTemplate({ ...promo }, null);
  expect(html).not.toContain('{{');
  expect(html).toContain('MACEIÓ');
  expect(html).toContain('SAINDO DE SALVADOR');
  expect(html).toContain('R$ 374,70');
});

// fillTemplate only reads customer-facing fields (never _meta), so the commission
// cannot reach the HTML. The commission-stripping guarantee itself is covered by
// promoValidator's stripInternal tests; asserting it on rendered HTML is unreliable
// because the embedded base64 logo coincidentally contains arbitrary digit sequences.
test('fillTemplate ignores internal _meta fields entirely', () => {
  const withMeta = fillTemplate({ ...promo, _meta: { agency_commission_detected: 999888 } }, null);
  const withoutMeta = fillTemplate({ ...promo }, null);
  expect(withMeta).toBe(withoutMeta);
});

test('renders a PNG with fixed dimensions', async () => {
  const { promo_id } = ws.create();
  const out = await renderImage(promo_id, promo, { backgroundUrl: null });
  expect(out.image_width).toBe(1080);
  expect(out.image_height).toBe(1620);
  expect(fs.existsSync(ws.resolveFile(promo_id, 'promocao_final.png'))).toBe(true);
}, 60000);
