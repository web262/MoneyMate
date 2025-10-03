// frontend/js/api.js — universal API helper for static frontend + Render backend

// ====== BASE URL ======
// You can override at runtime with:
//   window.MM_API_BASE = "https://moneymate-2.onrender.com/api"
// or set a meta tag: <meta name="mm-api-base" content="https://.../api">
const META_BASE =
  (typeof document !== "undefined" &&
    document.querySelector('meta[name="mm-api-base"]')?.content) || null;

const RUNTIME_BASE =
  (typeof window !== "undefined" && window.MM_API_BASE) || null;

// Live Render backend (with trailing /api)
const DEFAULT_BASE = "https://moneymate-2.onrender.com/api";

export const API_BASE = (RUNTIME_BASE || META_BASE || DEFAULT_BASE).replace(/\/+$/, "");

// ====== TOKEN STORAGE ======
const TOKEN_KEY = "mm_jwt";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token, { remember = false } = {}) {
  // keep exactly one copy (either localStorage or sessionStorage)
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (token) {
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

// ====== INTERNALS ======
function normalizeUrl(path) {
  if (!path) return API_BASE;
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

function resolveArgs(methodOrOpts, body) {
  if (typeof methodOrOpts === "string") {
    return { method: methodOrOpts || "GET", body };
  }
  // object style: api("/x", { method, headers, body, ... })
  return methodOrOpts || { method: "GET" };
}

// ====== CORE REQUEST ======
export async function api(path, methodOrOpts = "GET", maybeBody = null) {
  const { method = "GET", body, headers = {}, timeoutMs = 20000, ...rest } =
    resolveArgs(methodOrOpts, maybeBody);

  const token = getToken();
  const url = normalizeUrl(path);

  // Timeout support
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new DOMException("timeout", "AbortError")), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method,
      mode: "cors",
      credentials: "omit", // JWT in header; no cookies
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ac.signal,
      ...rest,
    });
  } catch (err) {
    clearTimeout(t);
    if (err?.name === "AbortError") throw new Error("Network timeout. Please try again.");
    throw new Error("Network error. Check your connection and try again.");
  } finally {
    clearTimeout(t);
  }

  // Parse response
  let data = null;
  let text = "";
  const ct = res.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) data = await res.json();
    else text = await res.text();
  } catch (_) {}

  if (!res.ok) {
    if (res.status === 401) clearToken();
    const msg =
      (data && (data.error || data.message)) ||
      text ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data ?? (text ? { ok: true, text } : { ok: true });
}

// ====== CONVENIENCE HELPERS ======
export const getJSON  = (path)       => api(path, "GET");
export const postJSON = (path, body) => api(path, "POST", body);
export const putJSON  = (path, body) => api(path, "PUT", body);
export const delJSON  = (path)       => api(path, "DELETE");

// ====== AUTH HELPERS (note the trailing slashes) ======
export async function login(email, password) {
  const data = await postJSON("/auth/login/", { email, password });
  const token =
    data?.access_token || data?.token || data?.jwt || data?.accessToken;
  if (!token) throw new Error("No token returned by server.");
  return { token, user: data.user ?? null, raw: data };
}

export async function registerAccount(payload) {
  // expected payload: { name, email, password }
  return await postJSON("/auth/register/", payload);
}

export function logout() {
  clearToken();
}

// ====== GLOBAL FALLBACKS (for non-module pages) ======
if (typeof window !== "undefined") {
  window.api = api;
  window.MMAuth = { getToken, setToken, clearToken, login, registerAccount, logout };
  window.MM_API_BASE = API_BASE; // read-only exposure for debugging
}
