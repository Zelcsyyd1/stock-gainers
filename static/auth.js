(function () {
  const I18N = {
    login: '\u767b\u5f55',
    account: '\u8d26\u53f7\u72b6\u6001',
    accountTitle: '\u67e5\u770b\u8d26\u53f7',
    loginTitle: '\u767b\u5f55\u6216\u6ce8\u518c\u8d26\u53f7',
    emailLogin: '\u90ae\u7bb1\u767b\u5f55',
    marketGuest: '\u884c\u60c5\u53ef\u514d\u767b\u5f55\u67e5\u770b\u3002\u767b\u5f55\u540e\u53ef\u4fdd\u5b58\u81ea\u9009\u80a1\u3001\u7b5b\u9009\u6761\u4ef6\u3001\u5386\u53f2\u8bb0\u5f55\u548c\u63d0\u9192\u8bbe\u7f6e\u3002',
    enterEmail: '\u8bf7\u8f93\u5165\u90ae\u7bb1',
    captchaFirst: '\u8bf7\u5148\u5b8c\u6210\u4eba\u673a\u9a8c\u8bc1',
    codeSending: '\u9a8c\u8bc1\u7801\u53d1\u9001\u4e2d...',
    codeSendFail: '\u9a8c\u8bc1\u7801\u53d1\u9001\u5931\u8d25',
    codeSent: '\u5982\u679c\u90ae\u7bb1\u53ef\u7528\uff0c\u9a8c\u8bc1\u7801\u5df2\u53d1\u9001\uff0c\u8bf7\u67e5\u6536',
    sendCode: '\u53d1\u9001\u9a8c\u8bc1\u7801',
    enterEmailPassword: '\u8bf7\u8f93\u5165\u90ae\u7bb1\u548c\u5bc6\u7801',
    passwordMin: '\u5bc6\u7801\u81f3\u5c118\u4f4d',
    enterSixCode: '\u8bf7\u8f93\u51656\u4f4d\u90ae\u7bb1\u9a8c\u8bc1\u7801',
    registering: '\u6ce8\u518c\u4e2d...',
    loggingIn: '\u767b\u5f55\u4e2d...',
    opFail: '\u64cd\u4f5c\u5931\u8d25',
    resetTitle: '\u91cd\u7f6e\u5bc6\u7801',
    resetHint: '\u8f93\u5165\u6ce8\u518c\u90ae\u7bb1\u548c\u65b0\u5bc6\u7801\uff0c\u70b9\u51fb\u53d1\u9001\u9a8c\u8bc1\u7801',
    backLogin: '\u90ae\u7bb1\u767b\u5f55',
    resetSent: '\u9a8c\u8bc1\u7801\u5df2\u53d1\u9001\uff0c\u8bf7\u67e5\u6536\u90ae\u4ef6',
    newPasswordMin: '\u65b0\u5bc6\u7801\u81f3\u5c118\u4f4d',
    enterResetCode: '\u8bf7\u8f93\u51656\u4f4d\u9a8c\u8bc1\u7801',
    resetting: '\u91cd\u7f6e\u4e2d...',
    resetFail: '\u91cd\u7f6e\u5931\u8d25',
  };

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function display(id, value) {
    const el = document.getElementById(id);
    if (el) el.style.display = value;
  }

  function value(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function createAuthController(options = {}) {
    let currentUser = null;
    let turnstileSiteKey = null;
    let turnstileWidgetId = null;
    const accountPanel = options.accountPanel !== false;
    const codeRowDisplay = options.codeRowDisplay || 'grid';

    function setCurrentUser(user) {
      currentUser = user || null;
      if (typeof options.onUserChange === 'function') options.onUserChange(currentUser);
    }

    async function initAuth() {
      try {
        const res = await fetch('/api/auth/me');
        const json = await res.json();
        turnstileSiteKey = json.turnstile_site_key || null;
        if (json.success && json.user) setCurrentUser(json.user);
        if (typeof options.onAuthLoaded === 'function') {
          options.onAuthLoaded({ user: currentUser, profile: json.profile || null, json });
        }
      } catch {}
      updateAuthUI();
    }

    function updateAuthUI() {
      const btn = document.getElementById('auth-btn');
      if (btn) {
        btn.textContent = currentUser ? currentUser.username : I18N.login;
        btn.title = currentUser ? (options.loggedInTitle || I18N.accountTitle) : (options.loggedOutTitle || I18N.loginTitle);
      }
      if (typeof options.onUpdateAuthUI === 'function') options.onUpdateAuthUI({ user: currentUser });
    }

    function openAuth() {
      display('auth-overlay', 'flex');
      if (accountPanel) {
        text('auth-title', currentUser ? I18N.account : I18N.emailLogin);
        display('auth-form', currentUser ? 'none' : 'grid');
        display('account-panel', currentUser ? 'grid' : 'none');
        if (currentUser) {
          text('account-name', currentUser.username);
          return;
        }
      }
      text('auth-msg', I18N.marketGuest);
      renderTurnstile();
      setTimeout(() => {
        const input = document.getElementById('auth-username');
        if (input) input.focus();
      }, 50);
    }

    function closeAuth() {
      display('auth-overlay', 'none');
      if (forgotMode) showLoginMode();
    }

    function renderTurnstile() {
      const target = document.getElementById('auth-turnstile');
      if (!target || !turnstileSiteKey || turnstileWidgetId !== null) return;
      const mount = () => {
        if (window.turnstile && turnstileWidgetId === null) {
          turnstileWidgetId = window.turnstile.render(target, { sitekey: turnstileSiteKey });
        }
      };
      if (window.turnstile) return mount();
      if (!document.getElementById('turnstile-script')) {
        const script = document.createElement('script');
        script.id = 'turnstile-script';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = mount;
        document.head.appendChild(script);
      }
    }

    function getTurnstileToken() {
      if (!turnstileSiteKey) return '';
      return window.turnstile && turnstileWidgetId !== null ? window.turnstile.getResponse(turnstileWidgetId) : '';
    }

    function resetTurnstile() {
      if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    }

    async function sendAuthCode() {
      const email = value('auth-username');
      const msg = document.getElementById('auth-msg');
      const btn = document.getElementById('auth-send-code');
      if (!msg || !btn) return;
      if (!email) { msg.textContent = I18N.enterEmail; return; }
      if (turnstileSiteKey && !getTurnstileToken()) { msg.textContent = I18N.captchaFirst; return; }
      btn.disabled = true;
      msg.textContent = I18N.codeSending;
      try {
        const res = await fetch('/api/auth/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, turnstileToken: getTurnstileToken() }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || I18N.codeSendFail);
        msg.textContent = json.message || I18N.codeSent;
        let sec = 60;
        btn.textContent = `${sec}s`;
        const timer = setInterval(() => {
          sec -= 1;
          if (sec <= 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.textContent = I18N.sendCode;
            resetTurnstile();
          } else {
            btn.textContent = `${sec}s`;
          }
        }, 1000);
      } catch (e) {
        msg.textContent = e.message;
        btn.disabled = false;
        resetTurnstile();
      }
    }

    async function submitAuth(mode) {
      const username = value('auth-username');
      const passwordEl = document.getElementById('auth-password');
      const password = passwordEl ? passwordEl.value : '';
      const code = value('auth-code');
      const msg = document.getElementById('auth-msg');
      const loginBtn = document.getElementById('auth-login');
      const registerBtn = document.getElementById('auth-register');
      if (!msg || !loginBtn || !registerBtn) return;
      if (!username || !password) { msg.textContent = I18N.enterEmailPassword; return; }
      if (mode === 'register' && password.length < 8) { msg.textContent = I18N.passwordMin; return; }
      if (mode === 'register' && !/^\d{6}$/.test(code)) { msg.textContent = I18N.enterSixCode; return; }
      msg.textContent = mode === 'register' ? I18N.registering : I18N.loggingIn;
      loginBtn.disabled = true;
      registerBtn.disabled = true;
      const body = { username, password };
      if (mode === 'register') body.code = code;
      try {
        const res = await fetch(`/api/auth/${mode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || I18N.opFail);
        setCurrentUser(json.user);
        if (typeof options.onAuthSuccess === 'function') {
          options.onAuthSuccess({ mode, user: currentUser, profile: json.profile || null, json });
        }
        updateAuthUI();
        closeAuth();
      } catch (e) {
        msg.textContent = e.message;
      } finally {
        loginBtn.disabled = false;
        registerBtn.disabled = false;
      }
    }

    let forgotMode = false;

    function showForgotMode() {
      forgotMode = true;
      text('auth-title', I18N.resetTitle);
      display('auth-code-row', codeRowDisplay);
      text('auth-msg', I18N.resetHint);
      const loginBtn = document.getElementById('auth-login');
      const registerBtn = document.getElementById('auth-register');
      const forgotLink = document.getElementById('auth-forgot');
      if (loginBtn) loginBtn.style.display = 'none';
      if (registerBtn) registerBtn.style.display = 'none';
      if (forgotLink) forgotLink.style.display = 'none';
      const resetBtn = document.getElementById('auth-reset-btn');
      if (resetBtn) resetBtn.style.display = '';
      const backBtn = document.getElementById('auth-back-login');
      if (backBtn) backBtn.style.display = '';
    }

    function showLoginMode() {
      forgotMode = false;
      text('auth-title', I18N.emailLogin);
      display('auth-code-row', 'none');
      text('auth-msg', I18N.marketGuest);
      const loginBtn = document.getElementById('auth-login');
      const registerBtn = document.getElementById('auth-register');
      const forgotLink = document.getElementById('auth-forgot');
      if (loginBtn) loginBtn.style.display = '';
      if (registerBtn) registerBtn.style.display = '';
      if (forgotLink) forgotLink.style.display = '';
      const resetBtn = document.getElementById('auth-reset-btn');
      if (resetBtn) resetBtn.style.display = 'none';
      const backBtn = document.getElementById('auth-back-login');
      if (backBtn) backBtn.style.display = 'none';
    }

    async function sendForgotCode() {
      const email = value('auth-username');
      const msg = document.getElementById('auth-msg');
      const btn = document.getElementById('auth-send-code');
      if (!msg || !btn) return;
      if (!email) { msg.textContent = I18N.enterEmail; return; }
      btn.disabled = true;
      msg.textContent = I18N.codeSending;
      try {
        const res = await fetch('/api/auth/forgot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || I18N.codeSendFail);
        msg.textContent = json.message || I18N.resetSent;
        let sec = 60;
        btn.textContent = `${sec}s`;
        const timer = setInterval(() => {
          sec -= 1;
          if (sec <= 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.textContent = I18N.sendCode;
          } else {
            btn.textContent = `${sec}s`;
          }
        }, 1000);
      } catch (e) {
        msg.textContent = e.message;
        btn.disabled = false;
      }
    }

    async function submitResetPassword() {
      const email = value('auth-username');
      const passwordEl = document.getElementById('auth-password');
      const password = passwordEl ? passwordEl.value : '';
      const code = value('auth-code');
      const msg = document.getElementById('auth-msg');
      const resetBtn = document.getElementById('auth-reset-btn');
      if (!msg) return;
      if (!email) { msg.textContent = I18N.enterEmail; return; }
      if (!password || password.length < 8) { msg.textContent = I18N.newPasswordMin; return; }
      if (!/^\d{6}$/.test(code)) { msg.textContent = I18N.enterResetCode; return; }
      if (resetBtn) resetBtn.disabled = true;
      msg.textContent = I18N.resetting;
      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, code }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || I18N.resetFail);
        setCurrentUser(json.user);
        if (typeof options.onAuthSuccess === 'function') {
          options.onAuthSuccess({ mode: 'reset', user: currentUser, profile: json.profile || null, json });
        }
        updateAuthUI();
        closeAuth();
      } catch (e) {
        msg.textContent = e.message;
      } finally {
        if (resetBtn) resetBtn.disabled = false;
      }
    }

    async function logout() {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      setCurrentUser(null);
      updateAuthUI();
      if (typeof options.onLogout === 'function') options.onLogout();
    }

    function bindDefaultEvents(extra = {}) {
      const authBtn = document.getElementById('auth-btn');
      if (authBtn) authBtn.addEventListener('click', extra.authButton || openAuth);
      const quickLogin = document.getElementById('quick-login-btn');
      if (quickLogin) quickLogin.addEventListener('click', openAuth);
      const closeBtn = document.getElementById('auth-close');
      if (closeBtn) closeBtn.addEventListener('click', closeAuth);
      const overlay = document.getElementById('auth-overlay');
      if (overlay) overlay.addEventListener('click', e => {
        if (e.target === e.currentTarget) closeAuth();
      });
      const loginBtn = document.getElementById('auth-login');
      if (loginBtn) loginBtn.addEventListener('click', () => {
        display('auth-code-row', 'none');
        submitAuth('login');
      });
      const registerBtn = document.getElementById('auth-register');
      if (registerBtn) registerBtn.addEventListener('click', () => {
        const row = document.getElementById('auth-code-row');
        const code = value('auth-code');
        if (row && (row.style.display === 'none' || !row.style.display)) {
          row.style.display = codeRowDisplay;
          sendAuthCode();
          return;
        }
        if (!code) {
          sendAuthCode();
          return;
        }
        submitAuth('register');
      });
      const sendBtn = document.getElementById('auth-send-code');
      if (sendBtn) sendBtn.addEventListener('click', () => {
        if (forgotMode) sendForgotCode();
        else sendAuthCode();
      });
      const password = document.getElementById('auth-password');
      if (password) password.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          if (forgotMode) submitResetPassword();
          else submitAuth('login');
        }
      });
      const forgotLink = document.getElementById('auth-forgot');
      if (forgotLink) forgotLink.addEventListener('click', e => {
        e.preventDefault();
        showForgotMode();
      });
      const resetBtn = document.getElementById('auth-reset-btn');
      if (resetBtn) resetBtn.addEventListener('click', submitResetPassword);
      const backBtn = document.getElementById('auth-back-login');
      if (backBtn) backBtn.addEventListener('click', e => {
        e.preventDefault();
        showLoginMode();
      });
    }

    return {
      initAuth,
      updateAuthUI,
      openAuth,
      closeAuth,
      sendAuthCode,
      submitAuth,
      logout,
      bindDefaultEvents,
      getCurrentUser: () => currentUser,
      setCurrentUser,
    };
  }

  window.createAuthController = createAuthController;
})();
