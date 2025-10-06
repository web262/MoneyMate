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

// ===== Token helpers (JWT) =====
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
export function verifyToken() {
  // simple ping; server uses Authorization header from api()
  return postJSON("/auth/token/verify", {});
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

async function parseMaybeJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (res.status === 204) return null;
  if (ct.includes("application/json")) {
    try { return await res.json(); } catch { return null; }
  }
  try { return await res.text(); } catch { return null; }
}

// ===== Core request (JWT in header; NO cookies) =====
export async function api(path, methodOrOpts = "GET", maybeBody = null) {
  const { method = "GET", body, headers = {}, timeoutMs = 20000, ...rest } =
    resolveArgs(methodOrOpts, maybeBody);

  const token = getToken();
  const url = normalizeUrl(path);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException("timeout", "AbortError")), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method,
      mode: "cors",
      // IMPORTANT: no 'credentials: include' (avoids cross-site cookie issues on GitHub Pages)
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
    clearTimeout(timer);
    if (err?.name === "AbortError") throw new Error("Network timeout. Please try again.");
    throw new Error("Network error. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  const payload = await parseMaybeJson(res);
  const data = typeof payload === "string" ? { text: payload } : payload;

  if (!res.ok) {
  // Do NOT clear the token here; the guard decides what to do.
  const msg = (data && (data.error || data.message)) || text || `Request failed (${res.status})`;
  throw new Error(msg);
}


  return data ?? { ok: true };
}

// ===== Convenience helpers =====
export const getJSON  = (path)       => api(path, "GET");
export const postJSON = (path, body) => api(path, "POST", body);
export const putJSON  = (path, body) => api(path, "PUT", body);
export const patchJSON= (path, body) => api(path, "PATCH", body);
export const delJSON  = (path)       => api(path, "DELETE");

// ===== Auth helpers (no trailing slashes needed) =====
export async function registerAccount(payload, { remember = false } = {}) {
  const data = await postJSON("/auth/register", payload);
  const token = data?.access_token || data?.token || data?.jwt || data?.accessToken;
  if (token) setToken(token, { remember });
  return data;
}

export async function login(email, password, { remember = false } = {}) {
  const data = await postJSON("/auth/login", { email, password });
  const token = data?.access_token || data?.token || data?.jwt || data?.accessToken;
  if (!token) throw new Error("No token returned by server.");
  setToken(token, { remember });
  return { token, user: data.user ?? null, raw: data };
}

export async function verifyToken() {
  return await postJSON("/auth/token/verify", {});
}

export async function refreshToken() {
  const data = await postJSON("/auth/token/refresh", {});
  const token = data?.access_token;
  if (token) setToken(token, { remember: !!localStorage.getItem(TOKEN_KEY) });
  return data;
}

export async function serverLogout() {
  // Clears server session fallback (harmless if unused)
  try { await postJSON("/auth/logout", {}); } catch {}
}

export function logout() {
  clearToken();
  // optional: also ping server
  serverLogout();
}

// ===== Transactions =====
export async function listTransactions(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return await getJSON(`/transactions${qs ? `?${qs}` : ""}`);
}

export async function createTransaction(tx) {
  return await postJSON("/transactions", tx);
}

export async function updateTransaction(id, patch) {
  return await patchJSON(`/transactions/${id}`, patch);
}

export async function deleteTransaction(id) {
  return await delJSON(`/transactions/${id}`);
}

// ===== CSV export/import =====
export async function exportCSV(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = normalizeUrl(`/transactions/export${qs ? `?${qs}` : ""}`);
  const token = getToken();

  const res = await fetch(url, {
    method: "GET",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status} ${res.statusText}`);
  return await res.blob(); // caller should trigger download
}

export async function importCSV(fileOrText) {
  const token = getToken();
  const init = { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } };

  if (fileOrText instanceof File) {
    const form = new FormData();
    form.append("file", fileOrText);
    init.body = form;
  } else {
    init.headers["Content-Type"] = "text/csv; charset=utf-8";
    init.body = typeof fileOrText === "string" ? fileOrText : new TextDecoder().decode(fileOrText);
  }

  const res = await fetch(normalizeUrl("/transactions/import"), init);
  const data = await parseMaybeJson(res);
  if (!res.ok || (data && (data.ok === false || data.success === false))) {
    const msg = (data && (data.message || data.error)) || `Import failed: ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ===== Dashboard summary =====
export async function getSummary() {
  return await getJSON("/transactions/summary");
}

// Expose for quick debugging in browser console
if (typeof window !== "undefined") {
  window.MMApi = {
    API_BASE, getToken, setToken, clearToken,
    login, registerAccount, verifyToken, refreshToken, logout, serverLogout,
    listTransactions, createTransaction, updateTransaction, deleteTransaction,
    exportCSV, importCSV, getSummary,
  };
  window.MM_API_BASE = API_BASE;
}
