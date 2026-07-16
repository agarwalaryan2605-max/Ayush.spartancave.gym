/* ============================================
   SPARTAN CAVE - Login Page Logic
   ============================================ */

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // If already logged in, redirect to admin
  const token = localStorage.getItem('spartan_token');
  if (token) {
    verifyAndRedirect(token);
  }
});

/* ============================================
   Login Handler
   ============================================ */
async function handleLogin(event) {
  event.preventDefault();

  const loginBtn = document.getElementById('loginBtn');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  // Basic validation
  if (!username || !password) {
    showLoginError('Please enter both username and password');
    return;
  }

  // Disable button
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<div class="loading-spinner" style="width:18px;height:18px;"></div> Logging in...';

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok && data.token) {
      // Store token
      localStorage.setItem('spartan_token', data.token);
      if (data.admin) {
        localStorage.setItem('spartan_admin', JSON.stringify(data.admin));
      }

      // Redirect to admin dashboard
      hideLoginError();
      window.location.href = 'admin.html';
    } else {
      showLoginError(data.message || 'Invalid username or password');
      resetLoginBtn();
    }
  } catch (err) {
    showLoginError('Network error. Please check your connection.');
    resetLoginBtn();
  }
}

/* ============================================
   Verify Existing Token
   ============================================ */
async function verifyAndRedirect(token) {
  try {
    const response = await fetch('/api/admin/verify', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      window.location.href = 'admin.html';
    } else {
      // Token invalid, clear it
      localStorage.removeItem('spartan_token');
      localStorage.removeItem('spartan_admin');
    }
  } catch {
    // Network error, don't redirect but don't clear token either
  }
}

/* ============================================
   Password Toggle
   ============================================ */
function togglePassword() {
  const passwordInput = document.getElementById('password');
  const eyeIcon = document.getElementById('eyeIcon');

  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    eyeIcon.setAttribute('data-lucide', 'eye-off');
  } else {
    passwordInput.type = 'password';
    eyeIcon.setAttribute('data-lucide', 'eye');
  }

  lucide.createIcons();
}

/* ============================================
   Error Display
   ============================================ */
function showLoginError(message) {
  const errorEl = document.getElementById('loginError');
  const errorText = document.getElementById('loginErrorText');
  errorText.textContent = message;
  errorEl.classList.add('show');
}

function hideLoginError() {
  document.getElementById('loginError').classList.remove('show');
}

function resetLoginBtn() {
  const loginBtn = document.getElementById('loginBtn');
  loginBtn.disabled = false;
  loginBtn.innerHTML = '<i data-lucide="log-in" style="width:18px;height:18px;"></i> Login';
  lucide.createIcons();
}
