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
  // Real implementation in Phase 2
  throw new Error('Real AeroDataBox client not yet implemented');
}

module.exports = { fetchFlightStatus, normalizeStatus };
