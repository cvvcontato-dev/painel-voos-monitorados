import api from '../hooks/useApi';

export async function login({ email, password, remember }) {
  const res = await api.post('/api/auth/login', { email, password, remember });
  return res.data;
}

export async function logout() {
  const res = await api.post('/api/auth/logout');
  return res.data;
}

export async function me() {
  const res = await api.get('/api/auth/me');
  return res.data;
}

export async function changePassword({ current_password, new_password }) {
  const res = await api.post('/api/auth/change-password', { current_password, new_password });
  return res.data;
}
