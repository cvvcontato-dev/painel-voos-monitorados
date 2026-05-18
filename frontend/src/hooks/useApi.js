import axios from 'axios';

// Singleton axios instance shared across the app
const api = axios.create({ baseURL: '/' });

// Read csrf cookie value
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/);
  return match ? match[1] : null;
}

// CSRF header on all mutating requests except login
api.interceptors.request.use((config) => {
  const mutating = ['post', 'put', 'delete', 'patch'];
  if (mutating.includes(config.method) && !config.url?.endsWith('/auth/login')) {
    const token = getCsrfToken();
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

// 401 handler — emit a custom event that AuthContext listens to
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes('/auth/login') &&
      !error.config?.url?.includes('/auth/me')
    ) {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }
    return Promise.reject(error);
  }
);

export default api;
