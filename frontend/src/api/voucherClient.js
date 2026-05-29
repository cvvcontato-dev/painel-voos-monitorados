import api from '../hooks/useApi';

// Reaproveita o singleton axios de useApi.js, que já injeta X-CSRF-Token
// em todas as requisições mutating (post/put/delete/patch) e trata 401.

export const list = () => api.get('/api/vouchers/').then(r => r.data);

export const get = (id) => api.get(`/api/vouchers/${id}`).then(r => r.data);

export const upload = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/api/vouchers/', fd).then(r => r.data);
};

export const update = (id, unified) =>
  api.put(`/api/vouchers/${id}`, { unified }).then(r => r.data);

export const remove = (id) => api.delete(`/api/vouchers/${id}`);

export const exportUrl = (id, format) => `/api/vouchers/${id}/export?format=${format}`;
