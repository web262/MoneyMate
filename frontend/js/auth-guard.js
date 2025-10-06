// frontend/js/auth-guard.js
import { getToken, verifyToken, clearToken } from "./api.js";

export async function requireAuth() {
  const token = getToken();
  if (!token) {
    redirectToLogin();
    return false;
  }
  try {
    // lightweight server check; uses Authorization header from api.js
    await verifyToken(); // POST /auth/token/verify
    return true;
  } catch (_) {
    clearToken();
    redirectToLogin();
    return false;
  }
}

export function redirectToLogin() {
  const here = encodeURIComponent(location.pathname + location.search);
  location.replace(`./login.html?next=${here}`);
}
