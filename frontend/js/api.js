// frontend/js/api.js
// Single-source API helpers for MoneyMate frontend

// ===== Base URL resolution =====
const META_BASE =
  (typeof document !== "undefined" &&
    document.querySelector('meta[name="mm-api-base"]')?.content) || null;

const RUNTIME_BASE =
  (typeof window !== "undefined" && window.MM_API_BASE) || null;

// Your live Render API (with /api)
const DEFAULT_BASE = "https://moneymate-2.onrender.com/api";

// Final base (runtime override > meta tag > default)
export const API_BASE = (RUNTIME_BASE || META_BASE || DEFAULT_BASE).replace(/\/+$/, "");

// ===== Token helpers (JWT is optional; server also uses session cookie) =====
const TOKEN_KEY = "mm_jwt";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token, { remember = false } = {}) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

// ===== Internals =====
function normalizeUrl(path) {
  if (!path) return API_BASE;
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

function resolveArgs(methodOrOpts, body) {
  return typeof methodOrOpts === "string"
    ? { method: methodOrOpts || "GET", body }
    : (methodOrOpts || { method: "GET" });
}

// ===== Core request (cookies enabled) =====
export async function api(path, methodOrOpts = "GET", maybeBody = null) {
  const { method = "GET", body, headers = {}, timeoutMs = 20000, ...rest } =
    resolveArgs(methodOrOpts, maybeBody);

  const token = getToken();
  const url = normalizeUrl(path);

  const ac = new AbortController();
  const t = setTimeout(
    () => ac.abort(new DOMException("timeout", "AbortError")),
    timeoutMs
  );

  let res;
  try {
    res = await fetch(url, {
      method,
      mode: "cors",
      credentials: "include",           // send/receive cookies if used
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

  // Parse JSON when present; safely handle 204/empty text
  const ct = res.headers.get("content-type") || "";
  let data = null, text = "";
  try {
    if (res.status !== 204) {
      if (ct.includes("application/json")) data = await res.json();
      else text = await res.text();
    }
  } catch (_) { /* ignore parse errors */ }

  if (!res.ok) {
    // IMPORTANT: Do NOT auto-clear JWT on 401 here.
    // Let the app-level guard decide what to do with auth failures.
    const msg =
      (data && (data.error || data.message)) ||
      text ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data ?? (text ? { ok: true, text } : { ok: true });
}

// ===== Convenience helpers =====
export const getJSON  = (path)       => api(path, "GET");
export const postJSON = (path, body) => api(path, "POST", body);
export const putJSON  = (path, body) => api(path, "PUT", body);
export const delJSON  = (path)       => api(path, "DELETE");

// ===== Auth helpers =====
export async function login(email, password, { remember = false } = {}) {
  const data = await postJSON("/auth/login", { email, password });
  const token = data?.access_token || data?.token || data?.jwt || data?.accessToken;
  // If server uses JWT, store it. If server used session cookie, token may be undefined.
  if (token) setToken(token, { remember });
  return { token, user: data.user ?? null, raw: data };
}

export async function registerAccount(payload, { remember = false } = {}) {
  // The register endpoint returns 201 on success (account created).
  const data = await postJSON("/auth/register", payload);
  // Optionally auto-login if server returns token
  const token = data?.access_token || data?.token || data?.jwt || data?.accessToken;
  if (token) setToken(token, { remember });
  return data;
}

export async function logout() {
  try {
    await postJSON("/auth/logout", {});
  } catch (_) {
    /* ignore network errors */
  }
  clearToken();
}

// ===== Verify token helper (single definition!) =====
export function verifyToken() {
  // Simple server-side check: server validates Authorization header and returns user info.
  // Note: this endpoint must exist on the backend: POST /api/auth/token/verify
  return postJSON("/auth/token/verify", {});
}

// Expose for quick debugging in browser console
if (typeof window !== "undefined") {
  window.api = api;
  window.MMAuth = { getToken, setToken, clearToken, login, registerAccount, logout, verifyToken };
  window.MM_API_BASE = API_BASE;
}
