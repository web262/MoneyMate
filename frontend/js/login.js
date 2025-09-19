// frontend/js/login.js
// Use the shared API helper so calls go to the Render backend.
import { login, setToken } from './api.js';

(() => {
  const form       = document.getElementById('signin-form');
  const btn        = document.getElementById('submitBtn');
  const toastEl    = document.getElementById('toast');
  const toastMsg   = document.getElementById('toastMsg');
  const rememberEl = document.getElementById('remember');

  if (!form) return; // not on this page

  const toast = (toastEl && window.bootstrap)
    ? new bootstrap.Toast(toastEl, { delay: 3000 })
    : null;

  const showError = (msg) => {
    if (toastMsg) toastMsg.textContent = msg || 'Login failed.';
    if (toast) toast.show(); else alert(msg || 'Login failed.');
  };

  // If redirected from registration, show a friendly note
  if (new URLSearchParams(location.search).has('registered')) {
    if (toastMsg) toastMsg.textContent = 'Account created! Please sign in.';
    if (toast) toast.show();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    const email    = (document.getElementById('email')?.value || '').trim().toLowerCase();
    const password = document.getElementById('password')?.value || '';
    const remember = !!(rememberEl && rememberEl.checked);

    // button -> loading
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Signing in...`;
    }

    try {
      // Ask backend for a token
      const { token } = await login(email, password);
      // Save it (remember = localStorage, else sessionStorage)
      setToken(token, { remember });

      // success -> go to dashboard
      window.location.href = 'dashboard.html';
    } catch (err) {
      const msg = err?.message || 'Invalid email or password.';
      showError(msg);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="me-2"><i class="fa-solid fa-arrow-right-to-bracket"></i></span> Sign in`;
      }
    }
  });
})();
