// frontend/js/api.js (example)
const API_BASE = 'https://moneymate-1-30px.onrender.com';

export async function api(path, method = 'GET', body = null) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const j = await res.json(); if (j?.message) msg = j.message; } catch {}
    throw new Error(msg);
  }
  return res.json();
}
