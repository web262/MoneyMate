// frontend/js/register.js
// Use the shared API helper so requests hit your Render backend.
import { registerAccount } from './api.js';

(() => {
  const form     = document.getElementById('signup-form');
  const btn      = document.getElementById('submitBtn');
  const toastEl  = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  if (!form) return; // not on the register page

  const toast = toastEl ? new bootstrap.Toast(toastEl, { delay: 3000 }) : null;
  const showError = (msg) => {
    if (toastMsg) toastMsg.textContent = msg || 'Registration failed.';
    if (toast) toast.show(); else alert(msg || 'Registration failed.');
  };

  // --- live password match validation ---------------------------------------
  const pwdEl = document.getElementById('password');
  const cfmEl = document.getElementById('confirm');
  const validateMatch = () => {
    if (!pwdEl || !cfmEl) return;
    cfmEl.setCustomValidity(pwdEl.value !== cfmEl.value ? 'Passwords do not match' : '');
  };
  ['password', 'confirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validateMatch);
  });

  // --- submit ---------------------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    validateMatch();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    const full_name = (document.getElementById('full_name')?.value || '').trim();
    const email     = (document.getElementById('email')?.value || '').trim().toLowerCase();
    const password  = document.getElementById('password')?.value || '';
    const confirm   = document.getElementById('confirm')?.value || '';

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Creating...`;
    }

    try {
      // Map full_name -> name for the backend. confirm is only for client-side match.
      const data = await registerAccount({ name: full_name, email, password });

      // If your backend returns {success:true} (optional check)
      if (data?.success === false) {
        throw new Error(data?.message || 'Registration failed');
      }

      // Success → send user to Login
      window.location.href = 'login.html?registered=1';
      return;
    } catch (err) {
      // Friendly error mapping where possible
      const msg = (err && err.message) || 'Registration failed';
      if (/409/.test(msg) || /already/i.test(msg)) {
        showError('Email already registered.');
      } else if (/400/.test(msg) || /invalid/i.test(msg)) {
        showError('Invalid data. Please check your inputs.');
      } else {
        showError(msg);
      }
    } finally {
      // Restore button
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-user-check me-2"></i> Create account`;
      }
    }
  });
})();
