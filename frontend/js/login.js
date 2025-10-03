// frontend/js/login.js
import { login, setToken } from "./api.js";

(() => {
  const form       = document.getElementById("signin-form");
  const btn        = document.getElementById("submitBtn");
  const toastEl    = document.getElementById("toast");
  const toastMsg   = document.getElementById("toastMsg");
  const rememberEl = document.getElementById("remember");

  if (!form) return;

  const toast = (toastEl && window.bootstrap)
    ? new bootstrap.Toast(toastEl, { delay: 3000 })
    : null;

  const showError = (msg) => {
    if (toastMsg) toastMsg.textContent = msg || "Login failed.";
    if (toast) toast.show(); else alert(msg || "Login failed.");
  };

  // message after registration
  if (new URLSearchParams(location.search).has("registered")) {
    if (toastMsg) toastMsg.textContent = "Account created! Please sign in.";
    if (toast) toast.show();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      return;
    }

    const email    = (document.getElementById("email")?.value || "").trim().toLowerCase();
    const password = document.getElementById("password")?.value || "";
    const remember = !!(rememberEl && rememberEl.checked);

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Signing in...`;
    }

    try {
      const { token } = await login(email, password);
      setToken(token, { remember });

      // redirect (same tab) to ?next=... or dashboard.html
      const next = new URLSearchParams(location.search).get("next") || "dashboard.html";
      location.replace(next);
    } catch (err) {
      showError(err?.message || "Invalid email or password.");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="me-2"><i class="fa-solid fa-arrow-right-to-bracket"></i></span> Sign in`;
      }
    }
  });
})();
