const { nowUtcIso, addMinutesUtc } = require('../helpers/time');

const STATUS_MAP = {
  Expected: 'scheduled',
  CheckIn: 'scheduled',
  Boarding: 'scheduled',
  GateClosed: 'scheduled',
  Departed: 'active',
  EnRoute: 'active',
  Approaching: 'active',
  Arrived: 'landed',
  Landed: 'landed',
  Canceled: 'cancelled',
  Cancelled: 'cancelled',
  Diverted: 'diverted',
  Delayed: 'delayed'
};

function normalizeStatus(raw) {
  if (!raw) return 'scheduled';
  return STATUS_MAP[raw] || 'scheduled';
}

function toIsoUtc(rawTime) {
  // AeroDataBox returns "2026-05-22 14:00Z" → coerce to "2026-05-22T14:00:00.000Z"
  if (!rawTime) return null;
  const cleaned = rawTime.replace(' ', 'T').replace(/Z$/, ':00Z');
  // Handle case where seconds already present
  const d = new Date(cleaned);
  if (isNaN(d)) return null;
  return d.toISOString();
}

function normalizeAeroDataBox(rawArr) {
  if (!Array.isArray(rawArr) || rawArr.length === 0) return null;
  const r = rawArr[0];
  return {
    numero_voo: (r.number || '').replace(/\s+/g, ''),
    companhia: r.airline?.name || null,
    origem: r.departure?.airport?.iata || null,
    destino: r.arrival?.airport?.iata || null,
    status: normalizeStatus(r.status),
    partida_programada: toIsoUtc(r.departure?.scheduledTime?.utc),
    partida_estimada: toIsoUtc(r.departure?.revisedTime?.utc) || toIsoUtc(r.departure?.scheduledTime?.utc),
    chegada_programada: toIsoUtc(r.arrival?.scheduledTime?.utc),
    chegada_estimada: toIsoUtc(r.arrival?.revisedTime?.utc) || toIsoUtc(r.arrival?.scheduledTime?.utc),
    portao: r.departure?.gate || null,
    terminal: r.departure?.terminal || null,
    raw: r
  };
}

function stubResponse(numeroVoo, dataVoo) {
  if (numeroVoo.toUpperCase().startsWith('X')) {
    return { ok: false, error: 'not_found' };
  }
  // Deterministic stub: same input → same output
  const base = `${dataVoo}T14:00:00.000Z`;
  return {
    ok: true,
    data: {
      numero_voo: numeroVoo.toUpperCase(),
      companhia: 'STUB AIRLINES',
      origem: 'GRU',
      destino: 'MIA',
      status: 'scheduled',
      partida_programada: base,
      partida_estimada: base,
      chegada_programada: addMinutesUtc(base, 540),
      chegada_estimada: addMinutesUtc(base, 540),
      portao: 'A12',
      terminal: '3',
      raw: { stub: true, fetched_at: nowUtcIso() }
    }
  };
}

async function fetchFlightStatus(numeroVoo, dataVoo) {
  if ((process.env.AVIATION_API_MODE || 'stub') === 'stub') {
    return stubResponse(numeroVoo, dataVoo);
  }

  const key = process.env.RAPIDAPI_KEY;
  const host = process.env.AERODATABOX_HOST || 'aerodatabox.p.rapidapi.com';
  if (!key) return { ok: false, error: 'config_error' };

  const url = `https://${host}/flights/number/${encodeURIComponent(numeroVoo)}/${encodeURIComponent(dataVoo)}`;

  try {
    const res = await fetch(url, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host }
    });
    if (res.status === 404) return { ok: false, error: 'not_found' };
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers?.get?.('Retry-After') || '60', 10);
      return { ok: false, error: 'rate_limited', retryAfter };
    }
    if (res.status >= 500) return { ok: false, error: 'server_error' };
    if (!res.ok) return { ok: false, error: `http_${res.status}` };

    const body = await res.json();
    const normalized = normalizeAeroDataBox(body);
    if (!normalized) return { ok: false, error: 'not_found' };
    return { ok: true, data: normalized };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { fetchFlightStatus, normalizeStatus };
