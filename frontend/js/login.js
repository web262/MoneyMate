// frontend/js/login.js
const form = document.getElementById('signin-form');
const btn = document.getElementById('submitBtn');
const toastEl = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
const toast = new bootstrap.Toast(toastEl, { delay: 3000 });

function showError(msg) {
  toastMsg.textContent = msg || 'Login failed.';
  toast.show();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Signing in...`;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) {
      window.location.href = 'dashboard.html';
    } else {
      showError(data?.message || 'Invalid email or password.');
      btn.disabled = false;
      btn.innerHTML = `<span class="me-2"><i class="fa-solid fa-arrow-right-to-bracket"></i></span> Sign in`;
    }
  } catch {
    showError('Network error. Please try again.');
    btn.disabled = false;
    btn.innerHTML = `<span class="me-2"><i class="fa-solid fa-arrow-right-to-bracket"></i></span> Sign in`;
  }
});
