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

function nightsBetween(start, end) {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return null;
  const diff = Math.round((b - a) / (24 * 3600 * 1000));
  return diff > 0 ? diff : null;
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

// Converte um código de país ISO-3166 alpha-2 (ex.: BR, AW) na bandeira emoji.
function flagFromCountryCode(cc) {
  if (!cc || String(cc).length !== 2) return null;
  const A = 0x1F1E6;
  const u = String(cc).toUpperCase();
  if (!/^[A-Z]{2}$/.test(u)) return null;
  return String.fromCodePoint(A + u.charCodeAt(0) - 65) + String.fromCodePoint(A + u.charCodeAt(1) - 65);
}

const DEFAULT_CTA = 'Garanta já sua viagem inesquecível!';
const DEFAULT_CUSTOMIZATION = 'Precisa de outras datas ou roteiro? Fale conosco!';
const DEFAULT_MEAL = 'Café da Manhã';

// Um nome de cidade válido não é um código IATA (3 letras maiúsculas).
function looksLikeAirportCode(s) {
  return typeof s === 'string' && /^[A-Z]{3}$/.test(s.trim());
}

function normalize(raw = {}) {
  const out = { ...raw };
  out.origin_city = (raw.origin_city && !looksLikeAirportCode(raw.origin_city))
    ? raw.origin_city : cityFromCode(raw.origin_code, raw.origin_city);
  out.destination_city = (raw.destination_city && !looksLikeAirportCode(raw.destination_city))
    ? raw.destination_city : cityFromCode(raw.destination_code, raw.destination_city);

  const month = raw.travel_month_label || monthLabel(raw.start_date);
  if (month) out.travel_month_label = month;

  // Noites: usa o valor extraído ou deriva do intervalo de datas (check-in → check-out).
  if (raw.nights != null && raw.nights !== '') out.nights = Number(raw.nights);
  else out.nights = nightsBetween(raw.start_date, raw.end_date);

  out.availability_note = raw.availability_note || null;
  if (out.travel_month_label) {
    out.display_availability = out.availability_note
      ? `${out.travel_month_label} (${out.availability_note})`
      : out.travel_month_label;
  }

  out.installments = Number(raw.installments) || 10;
  if (raw.total_price != null && raw.total_price !== '') {
    out.total_price = Number(raw.total_price);
    out.installment_amount = (raw.installment_amount != null && raw.installment_amount !== '')
      ? Number(raw.installment_amount)
      : Math.round((out.total_price / out.installments) * 100) / 100;
  }

  if (raw.baggage_raw) out.baggage = normalizeBaggage(raw.baggage_raw);
  else if (Array.isArray(raw.baggage)) out.baggage = raw.baggage;
  // Bagagem de mão é praticamente sempre inclusa nesses pacotes — default quando vazio.
  if (!Array.isArray(out.baggage) || out.baggage.length === 0) out.baggage = ['carry_on'];

  if (raw.flight_type) {
    const ft = String(raw.flight_type).toLowerCase();
    out.flight_type = ft.includes('parad') || ft.includes('escala') ? raw.flight_type : 'Direto';
  }

  // Defaults de negócio (sempre presentes mesmo quando o print não traz):
  out.meal_plan = raw.meal_plan || DEFAULT_MEAL;
  out.cta_text = raw.cta_text || DEFAULT_CTA;
  out.customization_text = raw.customization_text || DEFAULT_CUSTOMIZATION;

  // País/bandeira do destino (default Brasil quando ausente — operação majoritariamente doméstica).
  const cc = raw.destination_country_code
    || (/bra[sz]il/i.test(raw.destination_country || '') ? 'BR' : null)
    || (!raw.destination_country ? 'BR' : null);
  out.destination_country = raw.destination_country || (cc === 'BR' ? 'Brasil' : raw.destination_country) || 'Brasil';
  out.destination_country_code = cc;
  out.destination_flag = flagFromCountryCode(cc) || '🇧🇷';

  return out;
}

module.exports = {
  normalize, cityFromCode, monthLabel, nightsBetween, normalizeBaggage,
  flagFromCountryCode, AIRPORTS, DEFAULT_CTA, DEFAULT_CUSTOMIZATION, DEFAULT_MEAL
};
