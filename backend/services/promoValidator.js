const LIMITS = { hotel_name: 45, meal_plan: 30, airlines: 3 };
const CENTS_TOLERANCE = 0.10;

function stripInternal(promotion) {
  const clean = {};
  for (const [k, v] of Object.entries(promotion || {})) {
    if (k.startsWith('_')) continue;
    clean[k] = v;
  }
  delete clean.agency_commission_detected;
  return clean;
}

function truncate(s, max) {
  if (typeof s !== 'string' || s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function validate(promotion = {}) {
  const errors = [];
  const warnings = [];
  const n = { ...promotion };

  if (!n.origin_city) errors.push('Origem é obrigatória');
  if (!n.destination_city) errors.push('Destino é obrigatório');
  if (!n.hotel_name) errors.push('Hotel é obrigatório');
  if (!Array.isArray(n.airlines) || n.airlines.length === 0) errors.push('Voo/companhia é obrigatório');
  if (n.total_price == null) errors.push('Preço total é obrigatório');

  if (n.total_price != null && n.installment_amount != null && n.installments) {
    const expected = n.installment_amount * n.installments;
    if (Math.abs(expected - n.total_price) > CENTS_TOLERANCE)
      errors.push(`Parcela inconsistente: ${n.installments}× ${n.installment_amount} ≠ total ${n.total_price}`);
  }

  if (n.nights != null && (n.nights < 1 || n.nights > 30))
    warnings.push(`Número de noites fora do comum (${n.nights}) — revise`);
  if (n.hotel_rating_value == null) warnings.push('Nota do hotel ausente — confirme manualmente');

  for (const [field, max] of Object.entries(LIMITS)) {
    if (field === 'airlines') {
      if (Array.isArray(n.airlines) && n.airlines.length > max) {
        warnings.push(`Muitas companhias (${n.airlines.length}); exibindo as ${max} primeiras`);
        n.airlines = n.airlines.slice(0, max);
      }
    } else if (typeof n[field] === 'string' && n[field].length > max) {
      warnings.push(`Campo ${field} longo demais para o card — truncado`);
      n[field] = truncate(n[field], max);
    }
  }

  return { valid: errors.length === 0, errors, warnings, normalized_promotion: n };
}

module.exports = { validate, stripInternal, LIMITS, CENTS_TOLERANCE };
