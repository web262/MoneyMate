// frontend/js/api.js

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
      credentials: "include",           // <-- IMPORTANT: send/receive Flask session cookie
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
    if (res.status === 401) clearToken(); // clear local JWT on unauthorized
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

// ===== Auth helpers (keep trailing slashes to avoid 308) =====
export async function login(email, password) {
  const data = await postJSON("/auth/login/", { email, password });
  const token = data?.access_token || data?.token || data?.jwt || data?.accessToken;
  if (!token) throw new Error("No token returned by server.");
  return { token, user: data.user ?? null, raw: data };
}
export async function registerAccount(payload) {
  return await postJSON("/auth/register/", payload);
}
export function logout() { clearToken(); }

// Expose for quick debugging in browser console
if (typeof window !== "undefined") {
  window.api = api;
  window.MMAuth = { getToken, setToken, clearToken, login, registerAccount, logout };
  window.MM_API_BASE = API_BASE;
}
