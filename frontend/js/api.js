// frontend/js/api.js
// Single-source API helpers for MoneyMate frontend
// Robust to CORS, cold starts, and both cookie- and token-based auth.

/* ============================== Base URL =============================== */

const META_BASE =
  (typeof document !== "undefined" &&
    document.querySelector('meta[name="mm-api-base"]')?.content) || null;

const RUNTIME_BASE =
  (typeof window !== "undefined" && window.MM_API_BASE) || null;

// Your live Render API base (WITHOUT trailing slash, WITH /api path)
const DEFAULT_BASE = "https://moneymate-2.onrender.com/api";

/** Final base (runtime override > meta tag > default) */
export const API_BASE = (RUNTIME_BASE || META_BASE || DEFAULT_BASE).replace(/\/+$/, "");

/* ============================ Credentials ============================== */
/**
 * If you truly use cookie/session auth from the browser, set this to true
 * (AND configure Flask-CORS with supports_credentials=True and exact origin).
 *
 * You can override via:
 *   <meta name="mm-use-credentials" content="true">
 *   window.MM_USE_CREDENTIALS = true
 */
function readBoolMeta(name) {
  const v = typeof document !== "undefined"
    ? document.querySelector(`meta[name="${name}"]`)?.content
    : null;
  return typeof v === "string" ? v.trim().toLowerCase() === "true" : null;
}

const META_CREDS = readBoolMeta("mm-use-credentials");
const RUNTIME_CREDS = (typeof window !== "undefined" && typeof window.MM_USE_CREDENTIALS === "boolean")
  ? window.MM_USE_CREDENTIALS
  : null;

export const USE_CREDENTIALS = (RUNTIME_CREDS ?? META_CREDS ?? false);

/* ============================== Tokens ================================= */

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

/* ============================== Internals ============================== */

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

/**
 * Sleep helper for retry backoff
 */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ============================== Core API =============================== */
/**
 * api(path, optsOrMethod, body?)
 * - Times out by default after 20s
 * - 1 automatic retry for network/cold-start errors
 * - Avoids sending Content-Type for FormData
 * - Uses Authorization: Bearer <jwt> if available
 * - Uses credentials (cookies) only if USE_CREDENTIALS=true
 */
export async function api(path, methodOrOpts = "GET", maybeBody = null) {
  const { method = "GET", body, headers = {}, timeoutMs = 20000, retry = 1, ...rest } =
    resolveArgs(methodOrOpts, maybeBody);

  const token = getToken();
  const url = normalizeUrl(path);

  const makeOnce = async () => {
    const ac = new AbortController();
    const timer = setTimeout(
      () => ac.abort(new DOMException("timeout", "AbortError")),
      timeoutMs
    );

    const isForm = (typeof FormData !== "undefined") && (body instanceof FormData);

    const opts = {
      method,
      mode: "cors",
      credentials: USE_CREDENTIALS ? "include" : "same-origin",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      signal: ac.signal,
      ...rest,
    };

    // Only set Content-Type for JSON bodies; fetch will set boundaries for FormData
    if (body != null) {
      if (isForm) {
        opts.body = body;
      } else {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
    }

    let res;
    try {
      res = await fetch(url, opts);
    } catch (err) {
      clearTimeout(timer);
      if (err?.name === "AbortError") {
        const e = new Error("Network timeout. Please try again.");
        e.code = "TIMEOUT";
        throw e;
      }
      const e = new Error("Network error contacting server. If the server just woke up, retry.");
      e.code = "NETWORK";
      throw e;
    } finally {
      clearTimeout(timer);
    }

    const ct = res.headers.get("content-type") || "";
    let data = null, text = "";

    try {
      if (res.status !== 204) {
        if (ct.includes("application/json")) data = await res.json();
        else text = await res.text();
      }
    } catch (_) {
      // ignore parse errors; we'll surface status/text below
    }

    if (!res.ok) {
      const msg =
        (data && (data.error || data.message)) ||
        text ||
        `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = data ?? null;
      throw err;
    }

    return data ?? (text ? { ok: true, text } : { ok: true });
  };

  // One retry on transient network/cold-start issues
  try {
    return await makeOnce();
  } catch (e) {
    if ((e.code === "NETWORK" || e.code === "TIMEOUT") && retry > 0) {
      await delay(1200); // small backoff for cold starts
      return await api(path, { method, headers, timeoutMs, retry: retry - 1, ...rest }, maybeBody);
    }
    throw e;
  }
}

/* =========================== Convenience =============================== */

export const getJSON  = (path)       => api(path, "GET");
export const postJSON = (path, body) => api(path, "POST", body);
export const putJSON  = (path, body) => api(path, "PUT", body);
export const delJSON  = (path)       => api(path, "DELETE");

/* ============================== Auth =================================== */

export async function login(email, password, { remember = false } = {}) {
  const data = await postJSON("/auth/login", { email, password });
  const token = data?.access_token || data?.token || data?.jwt || data?.accessToken;
  if (token) setToken(token, { remember }); // JWT path
  return { token, user: data.user ?? null, raw: data };
}

export async function registerAccount(payload, { remember = false } = {}) {
  // Expect 200/201 and possibly a token if backend chooses to auto-login
  const data = await postJSON("/auth/register", payload);
  const token = data?.access_token || data?.token || data?.jwt || data?.accessToken;
  if (token) setToken(token, { remember });
  return data;
}

export async function logout() {
  try {
    await postJSON("/auth/logout", {});
  } catch (_) { /* ignore */ }
  clearToken();
}

/**
 * Server-side token verification helper (optional).
 * Backend should implement POST /api/auth/token/verify to validate Bearer token.
 */
export function verifyToken() {
  return postJSON("/auth/token/verify", {});
}

/* ============================= Debugging =============================== */

if (typeof window !== "undefined") {
  window.api = api;
  window.MMAuth = { getToken, setToken, clearToken, login, registerAccount, logout, verifyToken };
  window.MM_API_BASE = API_BASE;
  window.MM_USE_CREDENTIALS = USE_CREDENTIALS;
}
