// frontend/js/api.js
const META_BASE =
  (typeof document !== "undefined" &&
    document.querySelector('meta[name="mm-api-base"]')?.content) || null;

const RUNTIME_BASE =
  (typeof window !== "undefined" && window.MM_API_BASE) || null;

// your live Render URL (note: this is your new working service)
const DEFAULT_BASE = "https://moneymate-2.onrender.com/api";

export const API_BASE = (RUNTIME_BASE || META_BASE || DEFAULT_BASE).replace(/\/+$/, "");

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

function normalizeUrl(path) {
  if (!path) return API_BASE;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}
function resolveArgs(methodOrOpts, body) {
  return typeof methodOrOpts === "string"
    ? { method: methodOrOpts || "GET", body }
    : (methodOrOpts || { method: "GET" });
}

export async function api(path, methodOrOpts = "GET", maybeBody = null) {
  const { method = "GET", body, headers = {}, timeoutMs = 20000, ...rest } =
    resolveArgs(methodOrOpts, maybeBody);

  const token = getToken();
  const url = normalizeUrl(path);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new DOMException("timeout", "AbortError")), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method,
      mode: "cors",
      credentials: "omit",
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

  let data = null, text = "";
  const ct = res.headers.get("content-type") || "";
  try { data = ct.includes("application/json") ? await res.json() : null; if (!data) text = await res.text(); } catch {}

  if (!res.ok) {
    if (res.status === 401) clearToken();
    const msg = (data && (data.error || data.message)) || text || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data ?? (text ? { ok: true, text } : { ok: true });
}

export const getJSON  = (path)       => api(path, "GET");
export const postJSON = (path, body) => api(path, "POST", body);
export const putJSON  = (path, body) => api(path, "PUT", body);
export const delJSON  = (path)       => api(path, "DELETE");

// AUTH HELPERS — use trailing slashes
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

// Expose for quick debugging
if (typeof window !== "undefined") {
  window.api = api;
  window.MMAuth = { getToken, setToken, clearToken, login, registerAccount, logout };
  window.MM_API_BASE = API_BASE;
}
