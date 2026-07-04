(function () {
  'use strict';

  // =========================================================================
  // TODO: INSERT REAL AWS COGNITO CONFIGURATIONS HERE
  // Match these values to your live AWS Console User Pool Settings
  // =========================================================================
  const COGNITO_CONFIG = {
      UserPoolId: 'YOUR_AWS_COGNITO_USER_POOL_ID', 
      ClientId: 'YOUR_AWS_COGNITO_APP_CLIENT_ID',   
      Region: 'YOUR_AWS_REGION'                     
  };
  // =========================================================================

  // TODO: Replace with your Cognito Hosted UI domain, for example:
  // https://your-domain-prefix.auth.us-east-1.amazoncognito.com
  const COGNITO_HOSTED_UI_DOMAIN = 'YOUR_AWS_COGNITO_HOSTED_UI_DOMAIN';

  // TODO: Add this exact URL to Cognito App Client > Allowed callback URLs.
  const REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;
  const DASHBOARD_URL = './dashboard.html';

  const form = document.querySelector('#loginForm');
  const email = document.querySelector('#email');
  const password = document.querySelector('#password');
  const googleLogin = document.querySelector('#googleLogin');
  const togglePassword = document.querySelector('#togglePassword');
  const authStatus = document.querySelector('#authStatus');

  function parseOAuthHash() {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const params = new URLSearchParams(hash);
    return {
      accessToken: params.get('access_token'),
      idToken: params.get('id_token'),
      expiresIn: params.get('expires_in'),
      tokenType: params.get('token_type')
    };
  }

  function storeSession(tokens) {
    const expiresAt = Date.now() + (Number(tokens.expiresIn || 3600) * 1000);
    sessionStorage.setItem('equiledger.accessToken', tokens.accessToken);
    sessionStorage.setItem('equiledger.idToken', tokens.idToken || '');
    sessionStorage.setItem('equiledger.tokenType', tokens.tokenType || 'Bearer');
    sessionStorage.setItem('equiledger.expiresAt', String(expiresAt));
  }

  function buildHostedUiUrl(identityProvider) {
    if (COGNITO_HOSTED_UI_DOMAIN.includes('YOUR_AWS')) {
      authStatus.textContent = 'Add your Cognito Hosted UI domain in auth.js before OAuth redirects will work.';
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

    if (password.value.length < 6) {
      passwordField.classList.add('is-invalid');
      passwordError.textContent = 'Password must be at least 6 characters';
      valid = false;
    }

    return valid;
  }

  function init() {
    const tokens = parseOAuthHash();
    if (tokens.accessToken) {
      storeSession(tokens);
      window.history.replaceState({}, document.title, REDIRECT_URI);
      window.location.assign(DASHBOARD_URL);
      return;
    }

    googleLogin.addEventListener('click', function () {
      const url = buildHostedUiUrl('Google');
      if (url) window.location.assign(url);
    });

    togglePassword.addEventListener('click', function () {
      const isHidden = password.type === 'password';
      password.type = isHidden ? 'text' : 'password';
      togglePassword.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!validateCredentials()) return;

      authStatus.textContent = 'Email sign-in UI validated. Wire USER_PASSWORD_AUTH or SRP with amazon-cognito-identity-js if you enable native users.';
    });
  }

  init();
})();
