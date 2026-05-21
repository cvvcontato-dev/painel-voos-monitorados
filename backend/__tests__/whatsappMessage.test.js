const { buildMessage } = require('../services/whatsappMessage');
const promo = {
  origin_city: 'Salvador', destination_city: 'Maceió', nights: 6, passengers: 2,
  display_availability: 'Agosto (sob consulta)', flight_type: 'Direto', airlines: ['GOL'],
  baggage: ['carry_on'], hotel_name: 'Hotel Praia Bonita', hotel_stars: 3,
  hotel_rating_value: 8.3, hotel_rating_text: 'Muito bom', meal_plan: 'Café da Manhã',
  installments: 10, installment_amount: 374.70, total_price: 3747.0, cta_text: 'Reserve agora',
  _meta: { agency_commission_detected: 227 }
};

test('message includes destination and price but never the commission', () => {
  const msg = buildMessage(promo);
  expect(msg).toContain('Maceió');
  expect(msg).toContain('374,70');
  expect(msg).not.toContain('227');
});

test('formats currency in pt-BR', () => {
  expect(buildMessage(promo)).toMatch(/R\$\s?3\.747,00/);
});
