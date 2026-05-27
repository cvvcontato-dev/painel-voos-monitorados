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

export async function listBackgrounds(destination, country) {
  try {
    const res = await api.get('/api/promotions/backgrounds', { params: { destination, country } });
    return res.data;
  } catch (err) { throw toApiError(err); }
}
