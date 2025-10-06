// frontend/js/login.js
import { login, setToken, clearToken } from "./api.js";

(() => {
  const $ = (id) => document.getElementById(id);

  const form       = $("signin-form");
  const btn        = $("submitBtn");
  const toastEl    = $("toast");
  const toastMsgEl = $("toastMsg");
  const emailEl    = $("email");
  const passEl     = $("password");
  const rememberEl = $("remember");

  if (!form) return;

  // Start clean to avoid loops caused by a bad/stale token
  clearToken();

  const toast = (toastEl && window.bootstrap)
    ? new bootstrap.Toast(toastEl, { delay: 3000 })
    : null;

  const showMsg = (msg) => {
    if (toastMsgEl) toastMsgEl.textContent = msg;
    if (toast) toast.show(); else alert(msg);
  };

  // Friendly message after registration
  if (new URLSearchParams(location.search).has("registered")) {
    showMsg("Account created! Please sign in.");
  }

  // Prevent double submits
  let pending = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (pending) return;

    // Bootstrap validation
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      return;
    }

    const email    = (emailEl?.value || "").trim().toLowerCase();
    const password = passEl?.value || "";
    const remember = !!(rememberEl && rememberEl.checked);

    pending = true;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML =
        `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Signing in...`;
    }

    try {
      // api.js.login() already stores the token; we also set it explicitly if returned.
      const { token } = await login(email, password, { remember });
      if (token) setToken(token, { remember });

      const next = new URLSearchParams(location.search).get("next") || "./dashboard.html";
      location.replace(next);
    } catch (err) {
      const msg =
        err?.message === "Failed to fetch" ? "Network error. Check your connection." :
        err?.message || "Invalid email or password.";
      showMsg(msg);
      pending = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="me-2"><i class="fa-solid fa-arrow-right-to-bracket"></i></span> Sign in`;
      }
    }
  });
})();
