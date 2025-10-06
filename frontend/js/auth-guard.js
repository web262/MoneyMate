// frontend/js/auth-guard.js
import { getToken, verifyToken, getJSON, clearToken } from "./api.js";

export async function requireAuth() {
  const token = getToken();
  if (!token) return redirectToLogin(), false;

  try {
    // Primary: cheap token verification
    await verifyToken();                 // POST /auth/token/verify
    return true;
  } catch {
    // Fallback: hit /auth/me with Bearer (works with our backend too)
    try {
      await getJSON("/auth/me");
      return true;
    } catch {
      clearToken();
      redirectToLogin();
      return false;
    }
  }
}

export function redirectToLogin() {
  const next = encodeURIComponent(location.pathname + location.search);
  location.replace(`./login.html?next=${next}`);
}
