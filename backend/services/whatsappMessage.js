const { stripInternal } = require('./promoValidator');

function brl(v) {
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function baggageLabel(b = []) {
  const parts = [];
  if (b.includes('carry_on')) parts.push('bagagem de mão');
  if (b.includes('checked')) parts.push('bagagem despachada');
  return parts.join(' + ');
}

function buildMessage(rawPromo) {
  const p = stripInternal(rawPromo);
  const lines = [];
  lines.push(`✈️ *${p.destination_city}* saindo de ${p.origin_city}`);
  lines.push(`📅 ${p.nights} noites | ${p.display_availability || ''} | ${p.passengers || 2} pessoas`);
  const bag = baggageLabel(p.baggage);
  lines.push(`🛫 Voo ${p.flight_type}${p.airlines?.length ? ' - ' + p.airlines.join('/') : ''}${bag ? ' - ' + bag : ''}`);
  lines.push(`🏨 ${p.hotel_name}${p.hotel_stars ? ` (${p.hotel_stars}⭐` : ''}${p.hotel_rating_value ? `, ${p.hotel_rating_text || ''} ${p.hotel_rating_value})` : p.hotel_stars ? ')' : ''}`);
  if (p.meal_plan) lines.push(`🍽️ ${p.meal_plan}`);
  lines.push('');
  lines.push(`💳 ${p.installments}x sem juros de *${brl(p.installment_amount)}*`);
  lines.push(`💰 Total ${brl(p.total_price)} para ${p.passengers || 2} pessoas`);
  if (p.taxes_included !== false) lines.push('_Taxas e impostos incluídos_');
  lines.push('');
  lines.push(`👉 ${p.cta_text || 'Garanta já sua viagem!'}`);
  return lines.join('\n');
}

module.exports = { buildMessage, brl };
