const { CARRIERS, LAYOUT_VERSIONS } = require('./voucherSchema');

const LAYOUT_ALIASES = {
  'v1': 'azul.confirmacao.v1',
  'azul-confirmacao-v1': 'azul.confirmacao.v1',
  'azul.v1': 'azul.confirmacao.v1'
};

// Aceita ISO completo (devolvido como veio), 'AAAA-MM-DD HH:mm[:ss]', 'AAAA-MM-DDTHH:mm[:ss]' sem fuso e
// 'dd/mm/aaaa hh:mm[:ss]' (os dois últimos viram -03:00). Valor que não é string volta intacto
// (quem valida decide; nunca lança).
function toISO(dt) {
  if (typeof dt !== 'string') return dt;
  const s = dt.trim();
  if (!s) return dt;
  const local = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (local) return `${local[1]}-${local[2]}-${local[3]}T${local[4]}:${local[5]}:${local[6] || '00'}-03:00`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || '00'}-03:00`;
  return dt;
}

function normalize(raw = {}) {
  const v = JSON.parse(JSON.stringify(raw || {}));
  v.carrier = CARRIERS.includes(v.carrier) ? v.carrier : 'azul';
  v.layoutVersion = LAYOUT_VERSIONS.includes(v.layoutVersion)
    ? v.layoutVersion
    : (LAYOUT_ALIASES[v.layoutVersion] || 'azul.confirmacao.v1');

  v.passengers = Array.isArray(v.passengers) ? v.passengers : [];
  v.trips = Array.isArray(v.trips) ? v.trips : [];
  v.baggage = Array.isArray(v.baggage) ? v.baggage : [];
  v.branding = v.branding || { airlineName: 'Azul' };
  v.reservation = v.reservation || { locator: '', status: '' };
  v.route = v.route || { origin: '', destination: '' };

  v.trips.forEach(t => {
    if (t && t.departure) t.departure.datetime = toISO(t.departure.datetime);
    if (t && t.arrival)   t.arrival.datetime   = toISO(t.arrival.datetime);
  });

  v.meta = {
    parsedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    parserVersion: 'gemini-2.0-flash@2026-05',
    confidence: 0.85,
    ...(v.meta || {})
  };
  return v;
}

module.exports = { normalize, toISO };
