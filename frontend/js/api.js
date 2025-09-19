// ===== MoneyMate API helper (static frontend) ===============================
// We’ll use Bearer tokens stored in storage instead of cookies.
// Make sure your backend returns a JSON body like:
//   { "access_token": "<JWT>", "user": {...} }
// and accepts: Authorization: Bearer <JWT>

const API_BASE = 'https://moneymate-1-30px.onrender.com'; // your Render backend

// --- token storage (session by default, or local if "remember me") ----------
const KEY = 'mm_jwt';

function getStore(persist) {
  return persist ? window.localStorage : window.sessionStorage;
}
export function getToken() {
  return localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
}
export function setToken(token, { remember = false } = {}) {
  // remove from both, then set in the chosen store
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
  if (token) getStore(remember).setItem(KEY, token);
}
export function clearToken() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
}

// --- generic request wrapper -------------------------------------------------
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    // Do NOT send cookies; we’re using Authorization header
    // credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // Try to parse JSON either way
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// --- auth helpers ------------------------------------------------------------
export async function login(email, password) {
  // Adjust the endpoint to match your backend. Common patterns:
  // /api/auth/login OR /api/login
  const data = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  // Accept several common token field names
  const token =
    data?.access_token || data?.token || data?.jwt || data?.accessToken;

  if (!token) {
    throw new Error('No token returned by server.');
  }

  return { token, user: data.user ?? null, raw: data };
}

export function logout() {
  clearToken();
}

// Example convenience methods you can use elsewhere
export const getJSON = (path) => api(path);
export const postJSON = (path, body) => api(path, { method: 'POST', body });
export const putJSON = (path, body) => api(path, { method: 'PUT', body });
export const delJSON = (path) => api(path, { method: 'DELETE' });
