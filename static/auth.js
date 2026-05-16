(function () {
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
        btn.textContent = currentUser ? currentUser.username : '登录';
        btn.title = currentUser ? (options.loggedInTitle || '查看账号') : (options.loggedOutTitle || '登录或注册账号');
      }
      if (typeof options.onUpdateAuthUI === 'function') options.onUpdateAuthUI({ user: currentUser });
    }

    function openAuth() {
      display('auth-overlay', 'flex');
      if (accountPanel) {
        text('auth-title', currentUser ? '账号状态' : '邮箱登录');
        display('auth-form', currentUser ? 'none' : 'grid');
        display('account-panel', currentUser ? 'grid' : 'none');
        if (currentUser) {
          text('account-name', currentUser.username);
          return;
        }
      }
      text('auth-msg', '行情可免登录查看。登录后可保存自选股、筛选条件、历史记录和提醒设置。');
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
      if (!email) { msg.textContent = '请输入邮箱'; return; }
      if (turnstileSiteKey && !getTurnstileToken()) { msg.textContent = '请先完成人机验证'; return; }
      btn.disabled = true;
      msg.textContent = '验证码发送中...';
      try {
        const res = await fetch('/api/auth/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, turnstileToken: getTurnstileToken() }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || '验证码发送失败');
        msg.textContent = json.message || '如果邮箱可用，验证码已发送，请查收';
        let sec = 60;
        btn.textContent = `${sec}s`;
        const timer = setInterval(() => {
          sec -= 1;
          if (sec <= 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.textContent = '发送验证码';
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
      if (!username || !password) { msg.textContent = '请输入邮箱和密码'; return; }
      if (mode === 'register' && password.length < 8) { msg.textContent = '密码至少8位'; return; }
      if (mode === 'register' && !/^\d{6}$/.test(code)) { msg.textContent = '请输入6位邮箱验证码'; return; }
      msg.textContent = mode === 'register' ? '注册中...' : '登录中...';
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
        if (!json.success) throw new Error(json.error || '操作失败');
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

    // ── Forgot / Reset Password ───────────────────────────────────────────
    let forgotMode = false;

    function showForgotMode() {
      forgotMode = true;
      const title = document.getElementById('auth-title');
      if (title) title.textContent = '重置密码';
      display('auth-code-row', codeRowDisplay);
      const msg = document.getElementById('auth-msg');
      if (msg) msg.textContent = '输入注册邮箱和新密码，点击发送验证码';
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
      const title = document.getElementById('auth-title');
      if (title) title.textContent = '邮箱登录';
      display('auth-code-row', 'none');
      const msg = document.getElementById('auth-msg');
      if (msg) msg.textContent = '行情可免登录查看。登录后可保存自选股、筛选条件、历史记录和提醒设置。';
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
      if (!email) { msg.textContent = '请输入邮箱'; return; }
      btn.disabled = true;
      msg.textContent = '验证码发送中...';
      try {
        const res = await fetch('/api/auth/forgot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || '发送失败');
        msg.textContent = json.message || '验证码已发送，请查收邮件';
        let sec = 60;
        btn.textContent = `${sec}s`;
        const timer = setInterval(() => {
          sec -= 1;
          if (sec <= 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.textContent = '发送验证码';
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
      if (!email) { msg.textContent = '请输入邮箱'; return; }
      if (!password || password.length < 8) { msg.textContent = '新密码至少8位'; return; }
      if (!/^\d{6}$/.test(code)) { msg.textContent = '请输入6位验证码'; return; }
      if (resetBtn) resetBtn.disabled = true;
      msg.textContent = '重置中...';
      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, code }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || '重置失败');
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
