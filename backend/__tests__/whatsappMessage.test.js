const { buildMessage } = require('../services/whatsappMessage');
const { normalize } = require('../services/promoNormalizer');

// Promoção doméstica equivalente ao modelo aprovado pelo cliente (Porto Seguro).
const domestic = normalize({
  origin_code: 'SSA', origin_city: 'Salvador',
  destination_city: 'Porto Seguro', destination_country: 'Brasil', destination_country_code: 'BR',
  travel_month_label: 'Setembro', availability_note: 'sob consulta', nights: 7, passengers: 2,
  flight_type: 'Direto', airlines: ['GOL'], baggage: ['carry_on'],
  hotel_name: 'Rede Andrade Terra Brasil', hotel_stars: 3, hotel_rating_value: 8.1, hotel_rating_text: 'Muito bom',
  meal_plan: 'Café da Manhã', installments: 10, installment_amount: 241.10, total_price: 2411,
  _meta: { agency_commission_detected: 227 }
});

test('matches the approved domestic template line by line', () => {
  const msg = buildMessage(domestic);
  expect(msg).toContain('✈️🇧🇷 *Porto Seguro: Pacote Exclusivo Clube do Voo Viagens! * 🌟');
  expect(msg).toContain('🌍 *Origem: * SSA (Salvador)');
  expect(msg).toContain('📍 *Destino: * Porto Seguro-Brasil');
  expect(msg).toContain('📅 *Disponibilidade: * Datas em Setembro (7 noites, sob consulta)');
  expect(msg).toContain('👫 *Para: * 2 pessoas');
  expect(msg).toContain('🏨 *Hospedagem: * Rede Andrade Terra Brasil (3 estrelas, Muito bom 8.1, Porto Seguro, com Café da Manhã)');
  expect(msg).toContain('✈️ *Voo: * Direto (GOL - Incluso bagagem de mão)');
  expect(msg).toContain('💳 *Pagamento: * 10x de R$ 241,10 (sem juros)');
  // Valor total sem separador de milhar: R$ 2411 (e não R$ 2.411)
  expect(msg).toContain('💰 *Valor total para 2 pessoas: * R$ 2411 (taxas inclusas)');
  expect(msg).toContain('✨ *Personalize: * Precisa de outras datas ou roteiro? Fale conosco!');
  expect(msg).toContain('📲 *Garanta já sua viagem inesquecível! *');
  // Disclaimer fixo no final, em itálico (underscores estilo WhatsApp)
  expect(msg).toContain('⚠️ _Os valores anunciados estão sujeitos a alterações sem aviso prévio. _');
});

test('never leaks the agency commission', () => {
  expect(buildMessage(domestic)).not.toContain('227');
});

test('international destination uses the destination country flag', () => {
  const intl = normalize({
    origin_code: 'SSA', origin_city: 'Salvador',
    destination_city: 'Aruba', destination_country: 'Aruba', destination_country_code: 'AW',
    travel_month_label: 'Junho', nights: 7, passengers: 2, flight_type: 'Com paradas',
    airlines: ['GOL'], baggage: ['carry_on', 'checked'],
    hotel_name: 'Caribbean Palm Village Resort', hotel_stars: 3, hotel_rating_value: 8.2,
    hotel_rating_text: 'Muito bom', installments: 10, installment_amount: 1331.30, total_price: 13313
  });
  const msg = buildMessage(intl);
  expect(msg).toContain('✈️🇦🇼 *Aruba:');           // bandeira de Aruba, não do Brasil
  expect(msg).toContain('📍 *Destino: * Aruba-Aruba');
  expect(msg).toContain('✈️ *Voo: * Com paradas (GOL - Incluso bagagem de mão e bagagem despachada)');
});
