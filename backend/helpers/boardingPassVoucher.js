// Converte um voucher (schema unified) em dados de pré-preenchimento da aba
// Cartões de Embarque. Datas sempre em America/Sao_Paulo.

const { airportCity, normalizeFlightNumber } = require('./voucherCarrier');

const TZ = 'America/Sao_Paulo';
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

function spDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return ymdFmt.format(d); // YYYY-MM-DD
}

function cityOr(iata) {
  return airportCity(iata) || iata;
}

function tripLabel(trip) {
  const t = trip || {};
  const fn = normalizeFlightNumber(t.flightNumber || '').replace(/\s+/g, '');
  const o = t.departure && t.departure.airport;
  const d = t.arrival && t.arrival.airport;
  const ymd = spDate(t.departure && t.departure.datetime);
  const parts = [
    fn || null,
    o && d ? `${cityOr(o)} → ${cityOr(d)}` : null,
    ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : null
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function voucherToPrefill(unified) {
  const u = unified || {};
  const trips = Array.isArray(u.trips) ? u.trips : [];
  const labels = trips.length ? trips.map(tripLabel) : [null];
  const passengers = (Array.isArray(u.passengers) ? u.passengers : []).map(p => ({
    name: String((p && p.name) || ''),
    segments: labels.map(label => ({ label }))
  }));
  const dates = trips.map(t => spDate(t && t.departure && t.departure.datetime)).filter(Boolean).sort();
  return { passengers, flightDate: dates[0] || null };
}

function voucherOptionLabel(unified, id) {
  const u = unified || {};
  const pax = Array.isArray(u.passengers) ? u.passengers : [];
  const trips = Array.isArray(u.trips) ? u.trips : [];
  const who = pax.length ? `${pax[0].name}${pax.length > 1 ? ` +${pax.length - 1}` : ''}` : null;
  const first = trips.length ? tripLabel(trips[0]) : null;
  const parts = [who, first].filter(Boolean);
  return parts.length ? parts.join(' · ') : `Voucher #${id}`;
}

module.exports = { voucherToPrefill, voucherOptionLabel, tripLabel };
