(function () {
  'use strict';

  if (typeof AmazonConfig === 'undefined') {
    console.error("Critical Error: config.js is missing.");
    alert("Application Configuration Missing! Ensure config.js exists.");
    return; 
  }

 
  const COGNITO_CONFIG = {
    ClientId: AmazonConfig.COGNITO_CLIENT_ID,   
  };

  const COGNITO_HOSTED_UI_DOMAIN = AmazonConfig.COGNITO_HOSTED_UI_DOMAIN;
  const API_CONFIG = { baseUrl: AmazonConfig.API_GATEWAY_URL };
  
  const REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;
  const DASHBOARD_URL = './dashboard.html';
  
  const oauthContainer = document.querySelector('#oauthContainer');
  const loginForm = document.querySelector('#loginForm');
  const registerForm = document.querySelector('#registerForm');
  const confirmForm = document.querySelector('#confirmForm');

  const email = document.querySelector('#email');
  const password = document.querySelector('#password');
  const googleLogin = document.querySelector('#googleLogin');
  const togglePassword = document.querySelector('#togglePassword');
  const authStatus = document.querySelector('#authStatus');

  const registerName = document.querySelector('#registerName');
  const registerEmail = document.querySelector('#registerEmail');
  const registerPassword = document.querySelector('#registerPassword');
  const registerTogglePassword = document.querySelector('#registerTogglePassword');
  const registerStatus = document.querySelector('#registerStatus');

  const confirmCode = document.querySelector('#confirmCode');
  const confirmStatus = document.querySelector('#confirmStatus');

  let pendingConfirmationEmail = '';

  function apiUrl(path) {
    return `${API_CONFIG.baseUrl.replace(/\/$/, '')}${path}`;
  }

  async function apiPost(path, payload) {
    if (API_CONFIG.baseUrl.includes('YOUR_API')) {
      throw new Error('Configure your API Gateway URL in auth.js.');
    }
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Request failed with ${res.status}`);
    }
    return data;
  }

  function showPanel(panel) {
    [loginForm, registerForm, confirmForm].forEach(form => { form.hidden = true; });
    panel.hidden = false;
    
    // Hide OAuth buttons if we aren't on the login screen
    if (oauthContainer) {
      oauthContainer.style.display = (panel === loginForm) ? 'block' : 'none';
    }
  }

  function parseOAuthHash() {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const params = new URLSearchParams(hash);
    return {
      accessToken: params.get('access_token'),
      idToken: params.get('id_token'),
      expiresIn: params.get('expires_in'),
      tokenType: params.get('token_type'),
      error: params.get('error_description') || params.get('error')
    };
  }

  function storeSession(tokens) {
    const expiresAt = Date.now() + (Number(tokens.expiresIn || 3600) * 1000);
    sessionStorage.setItem('equiledger.accessToken', tokens.accessToken);
    if (tokens.idToken) sessionStorage.setItem('equiledger.idToken', tokens.idToken);
    sessionStorage.setItem('equiledger.tokenType', tokens.tokenType || 'Bearer');
    sessionStorage.setItem('equiledger.expiresAt', String(expiresAt));
  }

  function buildHostedUiUrl(identityProvider) {
    if (COGNITO_HOSTED_UI_DOMAIN.includes('YOUR_AWS')) {
      authStatus.textContent = 'Configure your Hosted UI Domain in auth.js.';
      return null;
    }
    const params = new URLSearchParams({
      client_id: COGNITO_CONFIG.ClientId,
      response_type: 'token',
      scope: 'openid email profile',
      redirect_uri: REDIRECT_URI,
      identity_provider: identityProvider
    });
    return `${COGNITO_HOSTED_UI_DOMAIN.replace(/\/$/, '')}/oauth2/authorize?${params.toString()}`;
  }

  function validateCredentials() {
    let valid = true;
    const emailField = email.closest('.field');
    const passwordField = password.closest('.field');
    const emailError = document.querySelector('#emailError');
    const passwordError = document.querySelector('#passwordError');

    emailField.classList.remove('is-invalid');
    passwordField.classList.remove('is-invalid');
    emailError.textContent = '';
    passwordError.textContent = '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      emailField.classList.add('is-invalid');
      emailError.textContent = 'Enter a valid email address';
      valid = false;
    }

    if (password.value.length < 1) {
      passwordField.classList.add('is-invalid');
      passwordError.textContent = 'Password is required';
      valid = false;
    }
    return valid;
  }

  function validateRegistration() {
    let valid = true;
    const emailField = registerEmail.closest('.field');
    const passwordField = registerPassword.closest('.field');
    const emailError = document.querySelector('#registerEmailError');
    const passwordError = document.querySelector('#registerPasswordError');

    emailField.classList.remove('is-invalid');
    passwordField.classList.remove('is-invalid');
    emailError.textContent = '';
    passwordError.textContent = '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerEmail.value.trim())) {
      emailField.classList.add('is-invalid');
      emailError.textContent = 'Enter a valid email address';
      valid = false;
    }

    if (registerPassword.value.length < 8) {
      passwordField.classList.add('is-invalid');
      passwordError.textContent = 'Password must be at least 8 characters';
      valid = false;
    }
    return valid;
  }

  function setupPasswordToggle(inputEl, buttonEl) {
    buttonEl.addEventListener('click', function () {
      const isHidden = inputEl.type === 'password';
      inputEl.type = isHidden ? 'text' : 'password';
      buttonEl.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
  }

  function init() {
    const tokens = parseOAuthHash();
    
    if (tokens.error) {
      authStatus.textContent = `Federation error: ${tokens.error.replace(/\+/g, ' ')}`;
      window.history.replaceState({}, document.title, REDIRECT_URI);
    } else if (tokens.accessToken) {
      storeSession(tokens);
      window.history.replaceState({}, document.title, REDIRECT_URI);
      window.location.assign(DASHBOARD_URL);
      return;
    }

    setupPasswordToggle(password, togglePassword);
    setupPasswordToggle(registerPassword, registerTogglePassword);

    googleLogin.addEventListener('click', function () {
      const url = buildHostedUiUrl('Google');
      if (url) window.location.assign(url);
    });

    // --- Login account ---------------------------------------------
    loginForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!validateCredentials()) return;

      const submitButton = document.querySelector('#loginSubmit');
      submitButton.disabled = true;
      authStatus.textContent = 'Signing in...';

      try {
        const result = await apiPost('/auth/login', {
          email: email.value.trim().toLowerCase(),
          password: password.value
        });
        
        storeSession(result.tokens);
        authStatus.textContent = 'Success! Redirecting...';
        window.location.assign(DASHBOARD_URL);
      } catch (error) {
        console.error(error);
        authStatus.textContent = error.message || 'Sign in failed. Check your credentials.';
      } finally {
        submitButton.disabled = false;
      }
    });

    // --- Navigation Links ---------------------------------------------
    document.querySelector('#showRegister').addEventListener('click', function (event) {
      event.preventDefault();
      registerStatus.textContent = '';
      showPanel(registerForm);
    });

    document.querySelector('#showLogin').addEventListener('click', function (event) {
      event.preventDefault();
      authStatus.textContent = '';
      showPanel(loginForm);
    });

    document.querySelector('#showLoginFromConfirm').addEventListener('click', function (event) {
      event.preventDefault();
      authStatus.textContent = '';
      showPanel(loginForm);
    });

    // --- Register account ---------------------------------------------
    registerForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!validateRegistration()) return;

      const submitButton = document.querySelector('#registerSubmit');
      submitButton.disabled = true;
      registerStatus.textContent = 'Creating your account...';

      // Force email to lowercase to prevent case sensitivity issues
      const cleanEmail = registerEmail.value.trim().toLowerCase();

      try {
        const result = await apiPost('/auth/register', {
          name: registerName.value.trim(),
          email: cleanEmail,
          password: registerPassword.value
        });

        pendingConfirmationEmail = cleanEmail;

        if (result.confirmed) {
          registerStatus.textContent = 'Account created and already verified. You can sign in now.';
          setTimeout(() => showPanel(loginForm), 1200);
        } else {
          registerStatus.textContent = '';
          confirmStatus.textContent = `Verification code sent to ${pendingConfirmationEmail}.`;
          showPanel(confirmForm);
        }
      } catch (error) {
        console.error(error);
        registerStatus.textContent = error.message || 'Registration failed. Please try again.';
      } finally {
        submitButton.disabled = false;
      }
    });

    // --- Confirm account -------------------------------------------------
    confirmForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const codeError = document.querySelector('#confirmCodeError');
      codeError.textContent = '';

      if (!confirmCode.value.trim()) {
        codeError.textContent = 'Enter the verification code sent to your email';
        return;
      }

      if (!pendingConfirmationEmail) {
        confirmStatus.textContent = 'No pending registration found. Please register again.';
        return;
      }

      const submitButton = document.querySelector('#confirmSubmit');
      submitButton.disabled = true;
      confirmStatus.textContent = 'Verifying...';

      try {
        await apiPost('/auth/confirm', {
          email: pendingConfirmationEmail,
          code: confirmCode.value.trim()
        });
        confirmStatus.textContent = 'Account verified! Redirecting to sign in...';
        setTimeout(() => {
          email.value = pendingConfirmationEmail;
          showPanel(loginForm);
          authStatus.textContent = 'Account verified. Sign in with your new credentials.';
        }, 1200);
      } catch (error) {
        console.error(error);
        confirmStatus.textContent = error.message || 'Verification failed. Please try again.';
      } finally {
        submitButton.disabled = false;
      }
    });

    document.querySelector('#resendCode').addEventListener('click', async function (event) {
      event.preventDefault();
      if (!pendingConfirmationEmail) {
        confirmStatus.textContent = 'No pending registration found. Please register again.';
        return;
      }
      confirmStatus.textContent = 'Resending code...';
      try {
        await apiPost('/auth/resend-code', { email: pendingConfirmationEmail });
        confirmStatus.textContent = `New verification code sent to ${pendingConfirmationEmail}.`;
      } catch (error) {
        console.error(error);
        confirmStatus.textContent = error.message || 'Could not resend code.';
      }
    });
  }

  init();
})();