const AIRPORTS = {
  SSA: 'Salvador', BPS: 'Porto Seguro', FLN: 'Florianópolis', CNF: 'Belo Horizonte',
  GRU: 'São Paulo', GIG: 'Rio de Janeiro', REC: 'Recife', MCZ: 'Maceió', FOR: 'Fortaleza',
  BSB: 'Brasília', CWB: 'Curitiba', POA: 'Porto Alegre', NAT: 'Natal', VIX: 'Vitória'
};
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function cityFromCode(code, fallback) {
  if (!code) return fallback || null;
  return AIRPORTS[String(code).toUpperCase()] || fallback || code;
}

function monthLabel(isoDate) {
  if (!isoDate) return null;
  const m = Number(String(isoDate).slice(5, 7));
  return MONTHS[m - 1] || null;
}

function normalizeBaggage(raw) {
  if (!Array.isArray(raw)) return [];
  const out = new Set();
  for (const item of raw) {
    const s = String(item).toLowerCase();
    if (s.includes('mão') || s.includes('mao') || s.includes('carry')) out.add('carry_on');
    if (s.includes('despach') || s.includes('checked')) out.add('checked');
  }
  return [...out];
}

function normalize(raw = {}) {
  const out = { ...raw };
  out.origin_city = raw.origin_city || cityFromCode(raw.origin_code, raw.origin_city);
  out.destination_city = raw.destination_city || cityFromCode(raw.destination_code, raw.destination_city);

  const month = raw.travel_month_label || monthLabel(raw.start_date);
  if (month) out.travel_month_label = month;
  out.availability_note = raw.availability_note || null;
  if (out.travel_month_label) {
    out.display_availability = out.availability_note
      ? `${out.travel_month_label} (${out.availability_note})`
      : out.travel_month_label;
  }

  out.installments = raw.installments || 10;
  if (raw.total_price != null) {
    out.total_price = Number(raw.total_price);
    out.installment_amount = raw.installment_amount != null
      ? Number(raw.installment_amount)
      : Math.round((out.total_price / out.installments) * 100) / 100;
  }

  if (raw.baggage_raw) out.baggage = normalizeBaggage(raw.baggage_raw);
  else if (Array.isArray(raw.baggage)) out.baggage = raw.baggage;

  if (raw.flight_type) {
    const ft = String(raw.flight_type).toLowerCase();
    out.flight_type = ft.includes('parad') || ft.includes('escala') ? raw.flight_type : 'Direto';
  }
  return out;
}

module.exports = { normalize, cityFromCode, monthLabel, normalizeBaggage, AIRPORTS };
