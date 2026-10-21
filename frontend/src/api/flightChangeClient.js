import api from '../hooks/useApi';

// Reaproveita o singleton axios de useApi.js (CSRF + tratamento de 401).

const BASE = '/api/flight-changes';

const form = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return fd;
};

export const list = () => api.get(BASE).then(r => r.data);
export const get = (id) => api.get(`${BASE}/${id}`).then(r => r.data);
export const createFromFile = (file) => api.post(BASE, form(file)).then(r => r.data);
export const createFromVoucher = (voucher_id) => api.post(BASE, { voucher_id }).then(r => r.data);
export const markNoticeSent = (id) => api.post(`${BASE}/${id}/notice-sent`, {}).then(r => r.data);
export const uploadNewVoucher = (id, file) => api.post(`${BASE}/${id}/new-voucher`, form(file)).then(r => r.data);
export const saveNew = (id, unified) => api.put(`${BASE}/${id}/new`, { unified }).then(r => r.data);
export const setAffected = (id, affected) => api.put(`${BASE}/${id}/affected`, { affected }).then(r => r.data);
export const confirm =(id) => api.post(`${BASE}/${id}/confirm`, {}).then(r => r.data);
export const sendEmail = (id, kind, emails) => api.post(`${BASE}/${id}/send-email`, { kind, emails }).then(r => r.data);
export const emailPreview = (id, kind) => api.get(`${BASE}/${id}/email-preview`, { params: { kind } }).then(r => r.data);
export const remove = (id) => api.delete(`${BASE}/${id}`);

// Lista de vouchers salvos para o seletor. Usa o mesmo endpoint da aba Cartões de
// Embarque, que já devolve {id, label} (passageiro · trecho) — GET /api/vouchers
// só traz id/carrier/datas, sem nome nem localizador.
export const voucherList = () => api.get('/api/boarding-passes/voucher-options').then(r => r.data);

const CODE_MSGS = {
  nada_mudou: 'Nenhuma diferença encontrada entre os vouchers — não há o que confirmar.',
  sem_voucher_novo: 'Envie o voucher novo antes de continuar.',
  voucher_novo_removido: 'O voucher novo deste caso foi removido. Envie-o novamente.',
  voucher_corrompido: 'Os dados do voucher deste caso estão corrompidos.',
  voucher_novo_corrompido: 'Os dados do voucher novo estão corrompidos. Envie-o novamente.',
  escolha_trechos: 'Marque ao menos uma viagem alterada antes de continuar.',
  trechos_invalidos: 'Seleção de viagens inválida. Recarregue o caso.'
};

// Código de erro do backend (ex.: 'escolha_trechos'), ou null.
export const errorCode = (err) => {
  const e = err?.response?.data?.error;
  return typeof e === 'string' ? e : null;
};

export function errorMessage(err, fallback = 'Erro inesperado') {
  const data = err?.response?.data;
  if (data) {
    if (Array.isArray(data.details) && data.details.length) {
      return `${data.error || 'Dados inválidos'}: ${data.details.map(String).join('; ')}`;
    }
    // Códigos mapeados têm texto próprio, mesmo que o backend mande message.
    if (data.error === 'trechos_invalidos' || data.error === 'escolha_trechos') return CODE_MSGS[data.error];
    if (data.message) return data.message;
    if (data.error) return CODE_MSGS[data.error] || String(data.error);
  }
  return err?.message || fallback;
}
