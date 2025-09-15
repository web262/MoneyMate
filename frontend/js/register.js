// frontend/js/register.js
(() => {
  const form    = document.getElementById('signup-form');
  const btn     = document.getElementById('submitBtn');
  const toastEl = document.getElementById('toast');
  const toastMsg= document.getElementById('toastMsg');

  if (!form) return; // page doesn't have the signup form

  const toast = toastEl ? new bootstrap.Toast(toastEl, { delay: 3000 }) : null;
  const showError = (msg) => {
    if (toastMsg) toastMsg.textContent = msg || 'Registration failed.';
    if (toast) toast.show();
    else alert(msg || 'Registration failed.');
  };

  // live password match validation
  const pwdEl = document.getElementById('password');
  const cfmEl = document.getElementById('confirm');
  const validateMatch = () => {
    if (!pwdEl || !cfmEl) return;
    cfmEl.setCustomValidity(pwdEl.value !== cfmEl.value ? 'Passwords do not match' : '');
  };
  ['password','confirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validateMatch);
  });

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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // IMPORTANT: map full_name -> name for the backend
        body: JSON.stringify({
          name: full_name,
          email,
          password,
          confirmPassword: confirm // optional; backend validates if present
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success) {
        // no auto-login; go to login page with flag
        window.location.href = 'login.html?registered=1';
        return;
      }

      // restore button
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-user-check me-2"></i> Create account`;
      }

      // friendly error mapping
      if (res.status === 409) return showError('Email already registered.');
      if (res.status === 400) return showError(data?.message || 'Invalid data. Please check inputs.');
      return showError(data?.message || `Request failed (${res.status})`);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-user-check me-2"></i> Create account`;
      }
      showError('Network error. Please try again.');
    }
  });
})();
