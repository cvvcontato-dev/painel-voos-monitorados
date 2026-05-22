const { stripInternal } = require('./promoValidator');

// Valor monetário pt-BR. decimals=true força 2 casas (parcela); senão omite centavos quando inteiro.
function money(v, { decimals = false } = {}) {
  const n = Number(v) || 0;
  const opts = decimals
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : (Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return 'R$ ' + n.toLocaleString('pt-BR', opts);
}

function baggageLabel(b = []) {
  const parts = [];
  if (b.includes('carry_on')) parts.push('bagagem de mão');
  if (b.includes('checked')) parts.push('bagagem despachada');
  return parts.join(' e ');
}

// Disponibilidade no formato "Datas em Setembro (7 noites, sob consulta)".
function availabilityLine(p) {
  const month = p.travel_month_label || p.display_availability || '';
  const inner = [];
  if (p.nights) inner.push(`${p.nights} noites`);
  if (p.availability_note) inner.push(p.availability_note);
  const suffix = inner.length ? ` (${inner.join(', ')})` : '';
  return `Datas em ${month}${suffix}`;
}

function hotelLine(p) {
  const det = [];
  if (p.hotel_stars) det.push(`${p.hotel_stars} estrelas`);
  if (p.hotel_rating_value) det.push(`${p.hotel_rating_text ? p.hotel_rating_text + ' ' : ''}${p.hotel_rating_value}`);
  if (p.destination_city) det.push(p.destination_city);
  if (p.meal_plan) det.push(`com ${p.meal_plan}`);
  return `${p.hotel_name}${det.length ? ` (${det.join(', ')})` : ''}`;
}

function flightLine(p) {
  const extras = [];
  if (p.airlines?.length) extras.push(p.airlines.join('/'));
  const bag = baggageLabel(p.baggage);
  if (bag) extras.push(`Incluso ${bag}`);
  return `${p.flight_type || 'Direto'}${extras.length ? ` (${extras.join(' - ')})` : ''}`;
}

function buildMessage(rawPromo) {
  const p = stripInternal(rawPromo);
  const flag = p.destination_flag || '🇧🇷';
  const cta = p.cta_text || 'Garanta já sua viagem inesquecível!';
  const customization = p.customization_text || 'Precisa de outras datas ou roteiro? Fale conosco!';
  const passengers = p.passengers || 2;

  const lines = [];
  lines.push(`✈️${flag} ${p.destination_city}: Pacote Exclusivo Clube do Voo Viagens! 🌟`);
  lines.push('');
  lines.push(`🌍 Origem: ${p.origin_code || ''}${p.origin_city ? ` (${p.origin_city})` : ''}`);
  lines.push(`📍 Destino: ${p.destination_city}${p.destination_country ? `-${p.destination_country}` : ''}`);
  lines.push(`📅 Disponibilidade: ${availabilityLine(p)}`);
  lines.push(`👫 Para: ${passengers} pessoas`);
  lines.push('');
  lines.push(`🏨 Hospedagem: ${hotelLine(p)}`);
  lines.push(`✈️ Voo: ${flightLine(p)}`);
  lines.push('');
  lines.push(`💳 Pagamento: ${p.installments || 10}x de ${money(p.installment_amount, { decimals: true })} (sem juros)`);
  lines.push(`💰 Valor total para ${passengers} pessoas: ${money(p.total_price)} (taxas inclusas)`);
  lines.push(`✨ Personalize: ${customization}`);
  lines.push(`📲 ${cta}`);
  return lines.join('\n');
}

// brl: valor sempre com 2 casas (usado na arte/PNG, ex.: "R$ 374,70").
function brl(v) { return money(v, { decimals: true }); }

module.exports = { buildMessage, money, brl };
