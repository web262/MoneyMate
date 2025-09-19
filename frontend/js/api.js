// frontend/src/api.js
const BASE_URL = process.env.REACT_APP_API_BASE_URL || "";

export async function api(path, method = "GET", body = null) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    credentials: "include", // keep if you use cookie-based auth
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const j = await res.json(); if (j?.message) msg = j.message; } catch {}
    throw new Error(msg);
  }
  return res.json();
}
