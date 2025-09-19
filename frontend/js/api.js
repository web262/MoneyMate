// frontend/js/api.js  — universal API helper for static frontend + Render backend
const API_BASE = 'https://moneymate-1-30px.onrender.com'; // Render base URL
const TOKEN_KEY = 'mm_jwt';

// ----- token storage helpers -------------------------------------------------
export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}
export function setToken(token, { remember = false } = {}) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  const store = remember ? localStorage : sessionStorage;
  if (token) store.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

// ----- args resolver: supports both (path, method, body) and (path, opts) ----
function resolveArgs(methodOrOpts, body) {
  if (typeof methodOrOpts === 'string') {
    return { method: methodOrOpts || 'GET', body };
  }
  // object style
  return methodOrOpts || { method: 'GET' };
}

// ----- core request ----------------------------------------------------------
export async function api(path, methodOrOpts = 'GET', maybeBody = null) {
  const { method = 'GET', body, headers = {} } = resolveArgs(methodOrOpts, maybeBody);
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch (_) {}

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// ----- convenience helpers ---------------------------------------------------
export const getJSON  = (path)        => api(path, 'GET');
export const postJSON = (path, body)  => api(path, 'POST', body);
export const putJSON  = (path, body)  => api(path, 'PUT', body);
export const delJSON  = (path)        => api(path, 'DELETE');

// Auth flows (adjust endpoints if your backend differs)
export async function login(email, password) {
  const data = await postJSON('/api/auth/login', { email, password });
  const token = data?.access_token || data?.token || data?.jwt || data?.accessToken;
  if (!token) throw new Error('No token returned by server.');
  return { token, user: data.user ?? null, raw: data };
}

export async function registerAccount(payload) {
  // expected payload: { name, email, password }
  return await postJSON('/api/auth/register', payload);
}

export function logout() {
  clearToken();
}

// Expose for legacy non-module pages: window.api('/path','POST',{...})
// and window.MMAuth helpers.
window.api      = api;
window.MMAuth   = { getToken, setToken, clearToken, login, registerAccount };
