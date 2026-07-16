import api from '../hooks/useApi';

// Cliente da API de pacotes. Reaproveita o singleton axios de useApi.js
// (injeta X-CSRF-Token nas requisições mutating e trata 401).

export const list = () => api.get('/api/packages').then(r => r.data);

export const get = (id) => api.get(`/api/packages/${id}`).then(r => r.data);

// items: [{ file, kind }] — pareados por índice nos campos files[]/kinds[].
export const uploadPackage = (items) => {
  const fd = new FormData();
  items.forEach(({ file, kind }) => { fd.append('files', file); fd.append('kinds', kind); });
  return api.post('/api/packages', fd).then(r => r.data);
};

export const update = (id, pkg) =>
  api.put(`/api/packages/${id}`, { package: pkg }).then(r => r.data);

export const remove = (id) => api.delete(`/api/packages/${id}`);

export const sendEmail = (id, emails, message) =>
  api.post(`/api/packages/${id}/send-email`, { emails, message }).then(r => r.data);
