import { getSession, clearSession, roleForRoute } from './session.js';

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/pos`;

export async function api(path, { method = 'GET', body } = {}) {
  const role = roleForRoute();
  const token = getSession(role)?.token;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  // Sesión vencida (12 h): volver al login. Los logins devuelven 401 con
  // PIN/contraseña mal: ahí no se recarga, para que se vea el error.
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    clearSession(role);
    window.location.reload();
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data;
}

export const productImageUrl = (templateId) => `${API}/products/${templateId}/image`;
