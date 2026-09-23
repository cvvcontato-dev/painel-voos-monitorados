import api from '../hooks/useApi';

// Reaproveita o singleton axios de useApi.js (CSRF + tratamento de 401).

const BASE = '/api/boarding-passes';

export const parseLink = (url) => api.post(`${BASE}/parse-link`, { url }).then(r => r.data);
export const list = () => api.get(BASE).then(r => r.data);
export const get = (id) => api.get(`${BASE}/${id}`).then(r => r.data);
export const create = (payload) => api.post(BASE, payload).then(r => r.data);
export const update = (id, payload) => api.put(`${BASE}/${id}`, payload).then(r => r.data);
export const remove = (id) => api.delete(`${BASE}/${id}`);
export const messages = (id, useOriginal) =>
  api.get(`${BASE}/${id}/messages`, { params: { useOriginal: useOriginal ? 1 : 0 } }).then(r => r.data);
export const sendEmail = (id) => api.post(`${BASE}/${id}/send-email`).then(r => r.data);
export const voucherOptions = () => api.get(`${BASE}/voucher-options`).then(r => r.data);
export const voucherPrefill = (voucherId) => api.get(`${BASE}/voucher-prefill/${voucherId}`).then(r => r.data);
