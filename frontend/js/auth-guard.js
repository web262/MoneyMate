// frontend/js/auth-guard.js
import { getToken, verifyToken, clearToken } from "./api.js";

export async function requireAuth() {
  const token = getToken();
  if (!token) return redirectToLogin(), false;
  try {
    await verifyToken();         // server-side check (Authorization header added by api.js)
    return true;
  } catch {
    clearToken();
    redirectToLogin();
    return false;
  }
}

export function redirectToLogin() {
  const next = encodeURIComponent(location.pathname + location.search);
  location.replace(`./login.html?next=${next}`);
}
