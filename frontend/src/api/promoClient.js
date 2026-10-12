import api from '../hooks/useApi';

// Normaliza qualquer erro do axios num shape único para a UI consumir.
export function toApiError(err) {
  const status = err?.response?.status;
  const data = err?.response?.data || {};
  const map = { 503: 'unavailable', 422: 'unprocessable', 400: 'validation', 403: 'csrf' };
  const kind = status ? (map[status] || 'unknown') : 'network';
  return { kind, message: data.error || err.message || 'Erro inesperado', fields: data.errors || [] };
}

export async function extractPrint(file) {
  const fd = new FormData();
  fd.append('print', file);
  try {
    const res = await api.post('/api/promotions/extract', fd);
    return res.data;
  } catch (err) { throw toApiError(err); }
}

export async function validatePromotion(promotion) {
  try {
    const res = await api.post('/api/promotions/validate', { promotion });
    return res.data;
  } catch (err) { throw toApiError(err); }
}

export async function renderMessage(promotion) {
  try {
    const res = await api.post('/api/promotions/render-message', { promotion });
    return res.data;
  } catch (err) { throw toApiError(err); }
}

export async function renderImage(promotion, background_choice) {
  try {
    const res = await api.post('/api/promotions/render-image', { promotion, background_choice });
    return res.data;
  } catch (err) { throw toApiError(err); }
}

// opts.query = busca livre no Pexels; opts.includePexels = soma sugestões do Pexels às fotos do banco.
export async function listBackgrounds(destination, country, opts = {}) {
  try {
    const res = await api.get('/api/promotions/backgrounds', {
      params: {
        destination, country,
        q: opts.query || undefined,
        include_pexels: opts.includePexels ? '1' : undefined
      }
    });
    return res.data;
  } catch (err) { throw toApiError(err); }
}

// ── Banco de fundos (uma ou mais fotos por destino, uma delas padrão) ──────────
export async function getBackgroundBank() {
  try {
    const res = await api.get('/api/promo-backgrounds');
    return res.data;
  } catch (err) { throw toApiError(err); }
}

export async function uploadBackground({ destination, file, makeDefault = false }) {
  const fd = new FormData();
  fd.append('destination', destination);
  fd.append('make_default', makeDefault ? 'true' : 'false');
  fd.append('image', file);
  try {
    const res = await api.post('/api/promo-backgrounds', fd);
    return res.data.image;
  } catch (err) { throw toApiError(err); }
}

export async function saveBackgroundFromUrl({ destination, url, makeDefault = false }) {
  try {
    const res = await api.post('/api/promo-backgrounds/from-url', { destination, url, make_default: makeDefault });
    return res.data.image;
  } catch (err) { throw toApiError(err); }
}

export async function setDefaultBackground(id) {
  try {
    const res = await api.put(`/api/promo-backgrounds/${id}/default`);
    return res.data.image;
  } catch (err) { throw toApiError(err); }
}

export async function deleteBackground(id) {
  try {
    const res = await api.delete(`/api/promo-backgrounds/${id}`);
    return res.data;
  } catch (err) { throw toApiError(err); }
}
