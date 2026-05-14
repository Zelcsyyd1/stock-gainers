/* === auth.js === */
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
      if (sendBtn) sendBtn.addEventListener('click', sendAuthCode);
      const password = document.getElementById('auth-password');
      if (password) password.addEventListener('keydown', e => {
        if (e.key === 'Enter') submitAuth('login');
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


/* === js/utils.js === */
function escapeHtml(s) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(s ?? '')));
  return d.innerHTML;
}

function fmt(n, dec=2) {
  if (n===undefined||n===null||n===''||n==='-') return '--';
  const v=parseFloat(n); return isNaN(v)?'--':v.toFixed(dec);
}
function fmtVol(n) {
  if (!n||n==='-') return '--';
  const v=parseInt(n); if(isNaN(v)) return '--';
  return v>=100000000?(v/100000000).toFixed(2)+'亿':v>=10000?(v/10000).toFixed(2)+'万':v.toString();
}
function fmtMoney(n) {
  if (!n||n==='-') return '--';
  const v=parseFloat(n); if(isNaN(v)||v<=0) return '--';
  return v>=1e12?(v/1e12).toFixed(2)+'万亿':v>=1e8?(v/1e8).toFixed(2)+'亿':v>=1e4?(v/1e4).toFixed(0)+'万':'--';
}
function fmtCap(n) {
  if (!n||n==='-') return '--';
  const v=parseFloat(n); return isNaN(v)?'--':(v/1e8).toFixed(2);
}
function fmtAmp(s) {
  const h=parseFloat(s.high), l=parseFloat(s.low), pc=parseFloat(s.prev_close);
  if(!h||!l||!pc||pc<=0) return '--';
  return ((h-l)/pc*100).toFixed(2)+'%';
}
function fmtPct(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '--';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}
function fmtBigMoney(v) {
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return '--';
  const sign = n > 0 ? '+' : '';
  const abs = Math.abs(n);
  if (abs >= 1e8) return sign + (n / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return sign + (n / 1e4).toFixed(0) + '万';
  return sign + n.toFixed(0);
}
function pctClass(v) { const n=parseFloat(v); if(isNaN(n)||n===0) return 'flat'; return n>0?'up':'down'; }
function isLimitUp(v) { return parseFloat(v)>=9.9; }

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, { position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)', background:'#2a2d3e', color:'#e2e8f0', padding:'8px 20px', borderRadius:'8px', fontSize:'13px', zIndex:'9999', border:'1px solid #4e8ef7', transition:'opacity .3s' });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 2000);
}

function sortedData(data) {
  return [...data].sort((a,b) => {
    let va=parseFloat(a[sortCol])||0, vb=parseFloat(b[sortCol])||0;
    return sortDir==='asc'?va-vb:vb-va;
  });
}


/* === js/state.js === */
let allData = [], screenCandidates = [], watchlist = [];
let page = 1, board = 'all';
let autoInterval = null, countdown = 30;
let sortCol = 'change_pct', sortDir = 'desc';
let isScreenMode = false, isWatchlistMode = false;
let autoScreenDone = false; // 防止同一天重复自动选股
let currentUser = null;
const FETCH_SIZE = 300;   // 后端每次拉取总数
const PAGE_SIZE  = 50;    // 每页显示数

// 默认设置
const DEFAULT_SETTINGS = { min_pct:3, max_pct:5, max_cap:200, min_vr:1, min_tr:5, max_tr:10, browser_notif:false, auto_screen:false, webhook:'' };
let settings = { ...DEFAULT_SETTINGS };

let isSearchMode = false;
let searchResults = [];
let searchTimer = null;

let chartData = null, chartTab = 'kline';
let currentKlt = 101, chartKltCache = {}, chartCurrentCode = '';

let compareList = [];

let isSectorMode = false, currentSectorType = 'industry';

let isLimitupMode = false;

let activeQuickFilter = null;

let currentTheme = localStorage.getItem('theme') || 'dark';


/* === js/settings.js === */
function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem('screenSettings')); if (s) settings = { ...DEFAULT_SETTINGS, ...s }; } catch {}
}
function saveSettings() {
  settings.min_pct   = parseFloat(document.getElementById('s-min-pct').value) || 3;
  settings.max_pct   = parseFloat(document.getElementById('s-max-pct').value) || 5;
  settings.max_cap   = parseFloat(document.getElementById('s-max-cap').value) || 200;
  settings.min_vr    = parseFloat(document.getElementById('s-min-vr').value)  || 1;
  settings.min_tr    = parseFloat(document.getElementById('s-min-tr').value)  || 5;
  settings.max_tr    = parseFloat(document.getElementById('s-max-tr').value)  || 10;
  settings.browser_notif = document.getElementById('s-browser-notif').checked;
  settings.auto_screen   = document.getElementById('s-auto-screen').checked;
  settings.webhook       = document.getElementById('s-webhook').value.trim();
  localStorage.setItem('screenSettings', JSON.stringify(settings));
  syncProfileToCloud();

  if (settings.browser_notif && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  closeSettings();
  showToast('设置已保存');
}
function applySettingsToUI() {
  document.getElementById('s-min-pct').value = settings.min_pct;
  document.getElementById('s-max-pct').value = settings.max_pct;
  document.getElementById('s-max-cap').value = settings.max_cap;
  document.getElementById('s-min-vr').value  = settings.min_vr;
  document.getElementById('s-min-tr').value  = settings.min_tr;
  document.getElementById('s-max-tr').value  = settings.max_tr;
  document.getElementById('s-browser-notif').checked = settings.browser_notif;
  document.getElementById('s-auto-screen').checked   = settings.auto_screen;
  document.getElementById('s-webhook').value         = settings.webhook;
}
function resetSettings() {
  settings = { ...DEFAULT_SETTINGS };
  applySettingsToUI();
  localStorage.removeItem('screenSettings');
  syncProfileToCloud();
  showToast('已恢复默认');
}
function openSettings() {
  applySettingsToUI();
  document.getElementById('settings-drawer').classList.add('open');
  document.getElementById('settings-overlay').style.display = 'block';
}
function closeSettings() {
  document.getElementById('settings-drawer').classList.remove('open');
  document.getElementById('settings-overlay').style.display = 'none';
}


/* === js/profile.js === */
/* Account */
function profilePayload() {
  return {
    watchlist,
    settings,
    near_limit_range: typeof nearLimitRange !== 'undefined' ? nearLimitRange : null,
    theme: localStorage.getItem('theme') || (typeof currentTheme !== 'undefined' ? currentTheme : null),
  };
}

function hasProfileData(profile) {
  return !!(profile && (
    (Array.isArray(profile.watchlist) && profile.watchlist.length) ||
    profile.settings ||
    profile.near_limit_range ||
    profile.theme
  ));
}

function applyProfile(profile) {
  if (!profile) return;
  if (Array.isArray(profile.watchlist)) {
    watchlist = profile.watchlist;
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
  }
  if (profile.settings) {
    settings = { ...DEFAULT_SETTINGS, ...profile.settings };
    localStorage.setItem('screenSettings', JSON.stringify(settings));
  }
  if (profile.near_limit_range && typeof nearLimitRange !== 'undefined') {
    nearLimitRange = profile.near_limit_range;
    localStorage.setItem(NEAR_LIMIT_RANGE_KEY, JSON.stringify(nearLimitRange));
    if (typeof syncNearLimitInputs === 'function') syncNearLimitInputs();
  }
  if (profile.theme && typeof currentTheme !== 'undefined') {
    currentTheme = profile.theme;
    localStorage.setItem('theme', currentTheme);
    if (typeof applyTheme === 'function') applyTheme(currentTheme);
  }
}

let profileSyncTimer = null;
function syncProfileToCloud(immediate = false) {
  if (!currentUser) return;
  clearTimeout(profileSyncTimer);
  const run = async () => {
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profilePayload()),
      });
    } catch {}
  };
  if (immediate) run();
  else profileSyncTimer = setTimeout(run, 300);
}

const auth = createAuthController({
  accountPanel: false,
  codeRowDisplay: 'flex',
  loggedInTitle: '点击退出登录',
  onUserChange(user) {
    currentUser = user;
  },
  onAuthLoaded({ user, profile }) {
    if (!user) return;
    if (hasProfileData(profile)) applyProfile(profile);
    else syncProfileToCloud(true);
  },
  onUpdateAuthUI({ user }) {
    const guestBadge = document.getElementById('guest-mode-badge');
    if (guestBadge) guestBadge.style.display = user ? 'none' : '';
  },
  onAuthSuccess({ mode, profile }) {
    if (hasProfileData(profile)) applyProfile(profile);
    else syncProfileToCloud(true);
    applySettingsToUI();
    renderStarButtons();
    showToast(mode === 'register' ? '注册并登录成功' : '登录成功');
    if (isWatchlistMode) fetchWatchlist();
  },
  onLogout() {
    showToast('已退出登录');
  },
});
const initAuth = auth.initAuth;
const updateAuthUI = auth.updateAuthUI;
const openAuth = auth.openAuth;
const closeAuth = auth.closeAuth;
const logout = auth.logout;

function loadWatchlist() {
  try { watchlist = JSON.parse(localStorage.getItem('watchlist')) || []; } catch { watchlist = []; }
}
function saveWatchlist() {
  localStorage.setItem('watchlist', JSON.stringify(watchlist));
  syncProfileToCloud();
}
function updateDataMeta(source, time) {
  const sourceEl = document.getElementById('stat-source');
  const timeEl = document.getElementById('stat-time');
  if (sourceEl) sourceEl.textContent = source || '本地自选';
  if (timeEl) timeEl.textContent = time ? String(time).slice(11) : new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' });
}
function isStarred(code) { return watchlist.some(w => w.code === code); }
function toggleStar(code, name) {
  if (isStarred(code)) {
    watchlist = watchlist.filter(w => w.code !== code);
    showToast(`已移除 ${name}`);
  } else {
    watchlist.push({ code, name });
    showToast(`已添加 ${name} 到自选股`);
  }
  saveWatchlist();
  renderStarButtons();
  if (isWatchlistMode) fetchWatchlist();
}
function renderStarButtons() {
  document.querySelectorAll('.star-btn').forEach(btn => {
    btn.classList.toggle('starred', isStarred(btn.dataset.code));
    btn.textContent = isStarred(btn.dataset.code) ? '★' : '☆';
  });
}

async function fetchWatchlist() {
  if (!watchlist.length) {
    showEmpty('自选股为空，请从涨势榜点击 ☆ 添加');
    return;
  }
  showLoading();
  try {
    const resp = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: watchlist.map(w => w.code) }),
    });
    const json = await resp.json();
    if (json.success) {
      allData = json.data;
      updateDataMeta('自选股', null);
      renderNormalTable();
      renderStats();
    } else {
      showEmpty(json.error ? `自选股行情暂不可用：${json.error}` : '自选股行情暂不可用，请稍后刷新');
    }
  } catch(e) {
    console.error(e);
    showEmpty('网络异常，自选股行情加载失败');
  }
}


/* === js/data.js === */
async function fetchData() {
  if (isScreenMode) return;
  if (isWatchlistMode) { fetchWatchlist(); return; }
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  try {
    const res = await fetch(`/api/stocks?board=${board}&size=${FETCH_SIZE}`);
    const json = await res.json();
    if (json.success) {
      allData = json.data;
      updateMarketBadge(json.market_open, json.market_status);
      updateDataMeta(json.source, json.time);
      renderNormalTable();
      renderStats();
    } else {
      updateDataMeta(json.source || '数据接口', json.time);
      showEmpty(json.error ? `数据暂不可用：${json.error}` : '数据暂不可用，请稍后刷新');
    }
  } catch(e) {
    console.error(e);
    updateDataMeta('数据接口', null);
    showEmpty('网络异常，数据加载失败，请稍后刷新');
  }
  finally { btn.classList.remove('spinning'); }
}

function updateMarketBadge(open, status) {
  const badge = document.getElementById('market-badge');
  document.getElementById('market-status-text').textContent = status;
  badge.className = open ? 'open' : 'closed';
}

async function fetchIndices() {
  try {
    const res = await fetch('/api/indices');
    const json = await res.json();
    if (!json.success) return;
    json.data.forEach(idx => {
      const el = document.getElementById('idx-' + idx.code);
      if (!el) return;
      const pct = parseFloat(idx.change_pct);
      const isUp = pct > 0, isDown = pct < 0;
      const cls = isUp ? 'up' : isDown ? 'down' : 'flat';
      const sign = pct > 0 ? '+' : '';
      const amp = idx.prev_close > 0
        ? ((parseFloat(idx.high) - parseFloat(idx.low)) / parseFloat(idx.prev_close) * 100).toFixed(2)
        : '--';
      el.querySelector('.idx-price').textContent = parseFloat(idx.price).toFixed(2);
      el.querySelector('.idx-price').className = 'idx-price ' + cls;
      el.querySelector('.idx-change').innerHTML = `<span class="${cls}">${sign}${pct.toFixed(2)}%&nbsp;&nbsp;${sign}${parseFloat(idx.change).toFixed(2)}</span>`;
      el.querySelector('.idx-extra').textContent = `振幅 ${amp}%  量 ${fmtMoney(idx.turnover)}`;
      el.className = 'index-card ' + (isUp ? 'up-card' : isDown ? 'down-card' : '');
    });
  } catch(e) { console.error(e); }
}
setInterval(fetchIndices, 10000);


/* === js/screen.js === */
async function runScreen() {
  isScreenMode = true;
  isSearchMode = false; searchResults = [];
  document.getElementById('search-badge').style.display = 'none';
  stopAuto();
  const btn = document.getElementById('screen-btn');
  btn.disabled = true;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:13px;height:13px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> 筛选中…`;

  document.getElementById('screen-banner').style.display = '';
  updateBannerConditions();
  document.getElementById('screen-summary').textContent = '扫描全市场中…';
  showScreenProgress();

  try {
    const q = new URLSearchParams({
      min_pct: settings.min_pct, max_pct: settings.max_pct,
      max_cap: settings.max_cap, min_vr: settings.min_vr,
      min_tr: settings.min_tr,  max_tr: settings.max_tr,
    });
    const res = await fetch(`/api/screen?${q}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '筛选失败');

    screenCandidates = json.all_candidates || [];
    const passed = json.passed || [];

    updateMarketBadge(json.market_open, json.market_open ? '交易中' : '已收盘');
    updateDataMeta(json.source || '选股扫描', json.time);
    document.getElementById('screen-summary').innerHTML =
      `扫描 <b style="color:var(--text)">${json.total_scanned}</b> 只 → ` +
      `初筛 <b style="color:var(--gold)">${json.total_candidates}</b> 只 → ` +
      `<b style="color:var(--green);font-size:15px">${json.total_passed}</b> 只通过`;

    renderScreenTable(screenCandidates);
    renderStats();

    // 通知
    if (passed.length > 0) sendNotifications(passed);
  } catch(e) {
    showEmpty('筛选失败：' + e.message);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:13px;height:13px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> 重新筛选`;
  }
}

function updateBannerConditions() {
  document.getElementById('banner-conditions').innerHTML = [
    `涨幅 ${settings.min_pct}%-${settings.max_pct}%`,
    `30日有涨停`,
    `市值 < ${settings.max_cap}亿`,
    `量比 > ${settings.min_vr}`,
    `换手率 ${settings.min_tr}%-${settings.max_tr}%`,
    `分时均线条件`,
  ].map(t => `<span class="cond-tag active">${t}</span>`).join('');
}

function exitScreenMode() {
  isScreenMode = false;
  screenCandidates = [];
  activeQuickFilter = null;
  document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('near-limit-control')?.classList.remove('active');
  document.getElementById('screen-banner').style.display = 'none';
  document.getElementById('screen-btn').innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:13px;height:13px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> 2:30 选股`;
  showLoading();
  if (document.getElementById('auto-refresh').checked) startAuto();
  fetchData();
}

async function sendNotifications(passed) {
  const msg = `✅ 选股完成：${passed.length} 只通过\n` +
    passed.slice(0, 5).map(s => `${s.name}(${s.code}) +${parseFloat(s.change_pct).toFixed(2)}%`).join('\n') +
    (passed.length > 5 ? `\n...共${passed.length}只` : '');

  // 浏览器通知
  if (settings.browser_notif && Notification.permission === 'granted') {
    new Notification('A股 2:30 选股结果', { body: msg, icon: '/favicon.ico' });
    document.getElementById('notif-dot').style.display = 'block';
  }

  // Webhook 推送
  if (settings.webhook) {
    const payload = settings.webhook.includes('qyapi.weixin') ? {
      msgtype: 'text', text: { content: msg }
    } : settings.webhook.includes('dingtalk') ? {
      msgtype: 'text', text: { content: msg }
    } : { text: msg, stocks: passed };

    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: settings.webhook, payload }),
      });
    } catch {}
  }
}


/* === js/history.js === */
async function openHistory() {
  document.getElementById('history-overlay').style.display = 'flex';
  const body = document.getElementById('history-body');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)"><div class="spinner"></div><div>加载中…</div></div>';
  try {
    const res = await fetch('/api/history');
    const json = await res.json();
    const history = json.history || [];
    if (!history.length) {
      body.innerHTML = json.storage === 'disabled'
        ? '<div id="history-empty">账号服务未配置，历史记录暂不保存；行情和选股功能可继续使用</div>'
        : '<div id="history-empty">暂无历史记录，先运行一次选股</div>';
      return;
    }
    body.innerHTML = history.map(h => `
      <div class="history-item">
        <div class="hi-header">
          <span class="hi-time">${h.time}</span>
          <span class="hi-badge ${h.total_passed===0?'zero':''}">${h.total_passed} 只通过</span>
        </div>
        <div class="hi-params">
          涨幅 ${h.params.min_pct}-${h.params.max_pct}% · 市值&lt;${h.params.max_cap}亿 · 量比&gt;${h.params.min_vr} · 换手率 ${h.params.min_tr}-${h.params.max_tr}%
          · 扫描 ${h.total_scanned} 只 · 初筛 ${h.total_candidates} 只
        </div>
        <div class="hi-stocks">
          ${h.passed.length ? h.passed.map(s => `<span class="hi-stock-tag up">${escapeHtml(s.name)} +${parseFloat(s.change_pct).toFixed(2)}%</span>`).join('') : '<span style="color:var(--muted);font-size:12px">无股票通过</span>'}
        </div>
      </div>
    `).join('');
  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px">加载失败：${e.message}</div>`;
  }
}
function closeHistory() {
  document.getElementById('history-overlay').style.display = 'none';
}


/* === js/render.js === */
function currentListData() {
  if (isScreenMode) return screenCandidates;
  if (isSearchMode) return searchResults;
  return getFilteredData();
}

function renderNormalTable() {
  document.getElementById('thead-normal').style.display = '';
  document.getElementById('thead-screen').style.display = 'none';
  const baseData = currentListData();
  const sorted = sortedData(baseData);
  hideAll();
  if (!sorted.length) { showEmpty(isWatchlistMode ? '自选股为空，从涨势榜点 ☆ 添加' : '暂无数据'); return; }
  showTable();

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (page > totalPages) page = totalPages;
  const pageData = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  document.getElementById('tbody').innerHTML = pageData.map((s,i) => {
    const pc = pctClass(s.change_pct);
    const pctCls = isLimitUp(s.change_pct) ? 'change-pct limit-up' : `change-pct ${pc}`;
    const mkt = s.market==='SH' ? '<span class="badge badge-sh">沪</span>' : '<span class="badge badge-sz">深</span>';
    const starred = isStarred(s.code);
    const capV = parseFloat(s.market_cap), vrV = parseFloat(s.volume_ratio), trV = parseFloat(s.turnover_rate);
    const capC = capV>0&&capV<20e9 ? 'style="color:var(--green)"' : '';
    const vrC  = vrV>1             ? 'style="color:var(--gold)"'  : '';
    const trC  = trV>=5&&trV<=10   ? 'style="color:var(--gold)"'  : '';
    const globalIdx = (page-1)*PAGE_SIZE + i + 1;
    const inCmp = compareList.some(c=>c.code===s.code);
    const inflowV = parseFloat(s.net_inflow)||0;
    const inflowC = inflowV>0?'style="color:var(--red)"':inflowV<0?'style="color:var(--green)"':'style="color:var(--muted)"';
    return `<tr>
      <td><button class="star-btn ${starred?'starred':''}" data-code="${escapeHtml(s.code)}" data-name="${escapeHtml(s.name)}" onclick="toggleStar('${escapeHtml(s.code)}','${escapeHtml(s.name)}')">${starred?'★':'☆'}</button></td>
      <td><button class="cmp-btn ${inCmp?'in-compare':''}" onclick="toggleCompare(${JSON.stringify(s).replace(/"/g,'&quot;')})" title="加入对比">${inCmp?'✓比':'+ 比'}</button></td>
      <td style="color:var(--muted);font-size:11px">${globalIdx}</td>
      <td style="cursor:pointer" onclick="openChart('${escapeHtml(s.code)}','${escapeHtml(s.name)}',${s.price},${s.change_pct})"><div class="stock-name">${escapeHtml(s.name)}${mkt}</div><div class="stock-code">${escapeHtml(s.code)}</div></td>
      <td><span class="${pctCls}">${isLimitUp(s.change_pct)?'涨停 ':''}${fmt(s.change_pct)}%</span></td>
      <td class="${pc}">${fmt(s.price)}</td>
      <td class="${pc}">${parseFloat(s.change)>0?'+':''}${fmt(s.change)}</td>
      <td ${vrC}>${fmt(s.volume_ratio)}</td>
      <td ${trC}>${fmt(s.turnover_rate)}%</td>
      <td ${capC}>${fmtCap(s.market_cap)}</td>
      <td>${fmt(s.open)}</td>
      <td class="up">${fmt(s.high)}</td>
      <td class="down">${fmt(s.low)}</td>
      <td style="color:var(--muted)">${fmtAmp(s)}</td>
      <td style="color:var(--muted)">${fmtMoney(s.turnover)}</td>
      <td ${inflowC}>${fmtMoney(s.net_inflow)}</td>
      <td style="color:var(--muted)">${fmt(s.pe)}</td>
    </tr>`;
  }).join('');

  document.querySelectorAll('#thead-normal th[data-col]').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    if (th.dataset.col===sortCol) th.classList.add(sortDir==='asc'?'sort-asc':'sort-desc');
  });
  document.getElementById('page-num').textContent = `${page} / ${totalPages}`;
  document.getElementById('prev-btn').disabled = page <= 1;
  document.getElementById('next-btn').disabled = page >= totalPages;
  document.getElementById('pagination').style.display = 'flex';
}

function renderScreenTable(candidates) {
  document.getElementById('thead-normal').style.display = 'none';
  document.getElementById('thead-screen').style.display = '';
  hideAll();
  if (!candidates||!candidates.length) { showEmpty('无符合条件的股票'); return; }
  showTable();
  document.getElementById('pagination').style.display = 'none';

  const sorted = [...candidates].sort((a,b) => {
    if (a.pass!==b.pass) return a.pass?-1:1;
    return (parseFloat(b.change_pct)||0)-(parseFloat(a.change_pct)||0);
  });

  document.getElementById('tbody').innerHTML = sorted.map((s,i) => {
    const pc = pctClass(s.change_pct);
    const pctCls = isLimitUp(s.change_pct)?'change-pct limit-up':`change-pct ${pc}`;
    const mkt = s.market==='SH'?'<span class="badge badge-sh">沪</span>':'<span class="badge badge-sz">深</span>';
    const starred = isStarred(s.code);
    const limitCell = s.had_limit_up===false ? '<span class="check-fail">✗</span>' : s.had_limit_up ? '<span class="check-pass">✓</span>' : '<span class="check-skip">-</span>';
    const intradayCell = (s.fail_reason && s.had_limit_up!==false)
      ? `<span class="check-fail" style="font-size:11px">✗ ${s.fail_reason}</span>`
      : s.pass ? '<span class="check-pass">✓</span>' : '<span class="check-skip">-</span>';
    const result = s.pass
      ? '<b class="check-pass" style="font-size:14px">✓ 通过</b>'
      : `<span class="check-fail" style="font-size:11px">${s.fail_reason||'✗'}</span>`;
    return `<tr class="${s.pass?'pass-row':'fail-row'}">
      <td><button class="star-btn ${starred?'starred':''}" data-code="${escapeHtml(s.code)}" data-name="${escapeHtml(s.name)}" onclick="toggleStar('${escapeHtml(s.code)}','${escapeHtml(s.name)}')">${starred?'★':'☆'}</button></td>
      <td style="color:var(--muted);font-size:11px">${i+1}</td>
      <td><div class="stock-name">${escapeHtml(s.name)}${mkt}</div><div class="stock-code">${escapeHtml(s.code)}</div></td>
      <td><span class="${pctCls}">${fmt(s.change_pct)}%</span></td>
      <td class="${pc}">${fmt(s.price)}</td>
      <td style="color:var(--gold)">${fmt(s.volume_ratio)}</td>
      <td style="color:var(--gold)">${fmt(s.turnover_rate)}%</td>
      <td style="color:var(--green)">${fmtCap(s.market_cap)}</td>
      <td style="text-align:center">${limitCell}</td>
      <td style="text-align:left">${intradayCell}</td>
      <td>${result}</td>
    </tr>`;
  }).join('');
}

function renderStats() {
  const data = currentListData();
  const valid = data.filter(s=>!isNaN(parseFloat(s.change_pct)));
  document.getElementById('stat-total').textContent = isScreenMode ? `${screenCandidates.filter(s=>s.pass).length}/${screenCandidates.length}` : valid.length;
  if (!valid.length) {
    document.getElementById('dist-bar-wrap').style.display='none';
    document.getElementById('stat-turnover').textContent = '--';
    document.getElementById('stat-inflow').textContent = '--';
    document.getElementById('stat-inflow').className = 'value';
    return;
  }
  const maxPct  = Math.max(...valid.map(s=>parseFloat(s.change_pct)||0));
  const limits  = valid.filter(s=>parseFloat(s.change_pct)>=9.9).length;
  const upCount = valid.filter(s=>parseFloat(s.change_pct)>0).length;
  const dnCount = valid.filter(s=>parseFloat(s.change_pct)<0).length;
  const avg = valid.reduce((a,s)=>a+(parseFloat(s.change_pct)||0),0)/valid.length;
  const turnover = valid.reduce((a,s)=>a+(parseFloat(s.turnover)||0),0);
  const netInflow = valid.reduce((a,s)=>a+(parseFloat(s.net_inflow)||0),0);
  document.getElementById('stat-max').textContent = maxPct.toFixed(2)+'%';
  document.getElementById('stat-limit').textContent = limits;
  const ratioEl = document.getElementById('stat-ratio');
  ratioEl.innerHTML = `<span class="up">${upCount}</span><span style="color:var(--muted)"> / </span><span class="down">${dnCount}</span>`;
  ratioEl.className = 'value';
  const el = document.getElementById('stat-avg');
  el.textContent = (avg>=0?'+':'')+avg.toFixed(2)+'%';
  el.className = 'value '+(avg>0?'up':avg<0?'down':'flat');
  document.getElementById('stat-turnover').textContent = fmtMoney(turnover);
  const inflowEl = document.getElementById('stat-inflow');
  inflowEl.textContent = fmtBigMoney(netInflow);
  inflowEl.className = 'value '+(netInflow>0?'up':netInflow<0?'down':'flat');

  // 涨幅分布条
  if (!isScreenMode) {
    const buckets = [
      { label:'跌停',  color:'#05a662', min:-99, max:-9.9 },
      { label:'大跌',  color:'#12b86e', min:-9.9,max:-5   },
      { label:'下跌',  color:'#3fcf93', min:-5,  max:-2   },
      { label:'微跌',  color:'#6be0b8', min:-2,  max:0    },
      { label:'微涨',  color:'#f08080', min:0,   max:2    },
      { label:'上涨',  color:'#f04d4d', min:2,   max:5    },
      { label:'大涨',  color:'#e02020', min:5,   max:9.9  },
      { label:'涨停',  color:'#cc0000', min:9.9, max:99   },
    ];
    const counts = buckets.map(b => valid.filter(s=>{ const v=parseFloat(s.change_pct); return v>b.min && v<=b.max; }).length);
    const total = counts.reduce((a,b)=>a+b,0)||1;
    const barEl = document.getElementById('dist-bar');
    const detailEl = document.getElementById('dist-detail');
    barEl.innerHTML = buckets.map((b,i)=>counts[i]>0
      ? `<div class="dist-seg" style="flex:${counts[i]};background:${b.color}" title="${b.label} ${counts[i]}只"></div>`
      : ''
    ).join('');
    detailEl.innerHTML = buckets.map((b,i)=>counts[i]>0
      ? `<div class="dist-item"><div class="dist-dot" style="background:${b.color}"></div><span style="color:var(--muted)">${b.label}</span> <b style="color:${b.color}">${counts[i]}</b></div>`
      : ''
    ).join('');
    const flatCount = valid.filter(s=>parseFloat(s.change_pct)===0).length;
    document.getElementById('dist-summary').innerHTML =
      `<span class="up">${upCount}涨</span> <span style="color:var(--muted)">${flatCount}平</span> <span class="down">${dnCount}跌</span>`;
    document.getElementById('dist-bar-wrap').style.display = '';
  } else {
    document.getElementById('dist-bar-wrap').style.display = 'none';
  }
}

function hideAll() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('screen-progress').style.display = 'none';
  document.getElementById('empty').style.display = 'none';
  document.getElementById('stock-table').style.display = 'none';
  document.getElementById('pagination').style.display = 'none';
}
function showLoading() {
  hideAll(); document.getElementById('loading').style.display = '';
}
function showEmpty(msg) {
  hideAll();
  const el = document.getElementById('empty');
  el.textContent = msg; el.style.display = '';
}
function showScreenProgress() {
  hideAll(); document.getElementById('screen-progress').style.display = '';
}
function showTable() {
  document.getElementById('stock-table').style.display = '';
}


/* === js/chart.js === */
async function openChart(code, name, price, pct) {
  chartData = null; chartTab = 'kline';
  currentKlt = 101; chartKltCache = {}; chartCurrentCode = code;
  document.getElementById('chart-overlay').style.display = 'flex';
  document.getElementById('klt-tabs').style.display = 'flex';
  document.querySelectorAll('.klt-btn').forEach(b => b.classList.toggle('active', +b.dataset.klt === 101));
  document.getElementById('chart-name').textContent = name;
  document.getElementById('chart-code').textContent = code;
  document.getElementById('chart-consecutive').innerHTML = '';
  const priceEl = document.getElementById('chart-price');
  const pctEl   = document.getElementById('chart-pct');
  const pc = parseFloat(pct);
  priceEl.textContent = parseFloat(price).toFixed(2);
  priceEl.className = 'chart-price ' + (pc>0?'up':pc<0?'down':'flat');
  pctEl.textContent  = (pc>0?'+':'')+pc.toFixed(2)+'%';
  pctEl.className    = 'chart-pct change-pct ' + (pc>=9.9?'limit-up':pc>0?'up':pc<0?'down':'flat');
  document.getElementById('chart-meta').innerHTML = '';
  document.getElementById('chart-svg-wrap').innerHTML = '<div class="chart-loading"><div class="spinner"></div><div>加载中…</div></div>';
  document.getElementById('tab-kline').classList.add('active');
  document.getElementById('tab-trend').classList.remove('active');

  try {
    const res = await fetch(`/api/chart/${code}`);
    chartData = await res.json();
    if (chartData.consecutive >= 2) {
      document.getElementById('chart-consecutive').innerHTML =
        `<span class="consecutive-badge">${chartData.consecutive}连板</span>`;
    }
    renderChartMeta(code, price, pct);
    renderKlineChart();
  } catch(e) {
    document.getElementById('chart-svg-wrap').innerHTML = `<div class="chart-loading" style="color:var(--red)">加载失败</div>`;
  }
}

function switchChartTab(tab) {
  chartTab = tab;
  document.getElementById('tab-kline').classList.toggle('active', tab==='kline');
  document.getElementById('tab-trend').classList.toggle('active', tab==='trend');
  document.getElementById('klt-tabs').style.display = tab === 'kline' ? 'flex' : 'none';
  if (!chartData) return;
  tab === 'kline' ? renderKlineChart() : renderTrendChart();
}

function renderChartMeta(code, price, pct) {
  if (!chartData?.klines?.length) return;
  const k = chartData.klines[chartData.klines.length - 1];
  const amp = k.prev_close > 0 ? ((k.high-k.low)/k.prev_close*100).toFixed(2)+'%'
            : k.close > 0 ? ((k.high-k.low)/k.close*100).toFixed(2)+'%' : '--';
  document.getElementById('chart-meta').innerHTML = [
    { l:'今开', v: k.open.toFixed(2) },
    { l:'最高', v: k.high.toFixed(2), c:'up' },
    { l:'最低', v: k.low.toFixed(2),  c:'down' },
    { l:'成交量', v: fmtVol(k.volume) },
    { l:'连板数', v: chartData.consecutive > 0 ? chartData.consecutive+'天' : '无' },
  ].map(m=>`<div class="meta-item"><div class="ml">${m.l}</div><div class="mv ${m.c||''}">${m.v}</div></div>`).join('');
}

function renderKlineChart() {
  const wrap = document.getElementById('chart-svg-wrap');
  const klines = chartData?.klines;
  if (!klines || klines.length < 2) { wrap.innerHTML='<div class="chart-loading">数据不足</div>'; return; }
  const W=wrap.clientWidth||800, H=300, PL=50, PR=10, PT=10, PB=40, VH=55;
  const cW=W-PL-PR, cH=H-PT-PB-VH-8;
  const n=Math.min(klines.length,60), data=klines.slice(-n);
  const prices=[...data.map(k=>k.high),...data.map(k=>k.low)];
  const pMax=Math.max(...prices), pMin=Math.min(...prices);
  const pRange=pMax-pMin||1;
  const vols=data.map(k=>k.volume), vMax=Math.max(...vols)||1;
  const py=v=>PT+cH-(v-pMin)/pRange*cH;
  const bw=Math.max(2,(cW/n)*0.7), gap=cW/n;

  // 计算均线（基于完整klines，避免头部数据不足）
  function calcMA(arr, period) {
    return arr.map((_, i) => {
      if (i < period - 1) return null;
      return arr.slice(i - period + 1, i + 1).reduce((s, k) => s + k.close, 0) / period;
    });
  }
  const offset = klines.length - n;
  const ma5  = calcMA(klines, 5).slice(offset);
  const ma10 = calcMA(klines, 10).slice(offset);
  const ma20 = calcMA(klines, 20).slice(offset);

  function buildMAPath(maArr) {
    let d = '';
    maArr.forEach((v, i) => {
      if (v === null) return;
      const x = PL + i * gap + gap / 2, y = py(v);
      d += d === '' ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }

  let lines='', candles='', volumes='', xLabels='';
  for(let i=0;i<=4;i++){
    const y=PT+cH*i/4;
    const price=pMax-pRange*i/4;
    lines+=`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#2a2d3e" stroke-width="1"/>`;
    lines+=`<text x="${PL-4}" y="${y+4}" text-anchor="end" fill="#7c8499" font-size="10">${price.toFixed(2)}</text>`;
  }
  data.forEach((k,i)=>{
    const x=PL+i*gap+gap/2;
    const isUp=k.close>=k.open;
    const color=isUp?'#f04d4d':'#12b86e';
    const top=py(Math.max(k.open,k.close)), bot=py(Math.min(k.open,k.close));
    const bodyH=Math.max(1,bot-top);
    candles+=`<line x1="${x}" y1="${py(k.high)}" x2="${x}" y2="${py(k.low)}" stroke="${color}" stroke-width="1"/>`;
    candles+=`<rect x="${x-bw/2}" y="${top}" width="${bw}" height="${bodyH}" fill="${color}"/>`;
    const vh=Math.max(1,(k.volume/vMax)*(VH-4));
    const vy=H-PB-vh;
    volumes+=`<rect x="${x-bw/2}" y="${vy}" width="${bw}" height="${vh}" fill="${isUp?'rgba(240,77,77,.5)':'rgba(18,184,110,.5)'}"/>`;
    if(i%Math.ceil(n/6)===0){
      xLabels+=`<text x="${x}" y="${H-PB+14}" text-anchor="middle" fill="#7c8499" font-size="9">${k.date.slice(5)}</text>`;
    }
  });

  const d5=buildMAPath(ma5), d10=buildMAPath(ma10), d20=buildMAPath(ma20);
  const maLines =
    (d5  ? `<path d="${d5}"  stroke="#4e8ef7" stroke-width="1.2" fill="none"/>` : '') +
    (d10 ? `<path d="${d10}" stroke="#f5a623" stroke-width="1.2" fill="none"/>` : '') +
    (d20 ? `<path d="${d20}" stroke="#a06ee1" stroke-width="1.2" fill="none"/>` : '');

  const legend = `
    <circle cx="${PL+6}" cy="${H-5}" r="3" fill="#4e8ef7"/>
    <text x="${PL+12}" y="${H-2}" fill="#4e8ef7" font-size="9">MA5</text>
    <circle cx="${PL+38}" cy="${H-5}" r="3" fill="#f5a623"/>
    <text x="${PL+44}" y="${H-2}" fill="#f5a623" font-size="9">MA10</text>
    <circle cx="${PL+74}" cy="${H-5}" r="3" fill="#a06ee1"/>
    <text x="${PL+80}" y="${H-2}" fill="#a06ee1" font-size="9">MA20</text>`;

  wrap.innerHTML=`<svg width="${W}" height="${H}" style="display:block">
    ${lines}
    <line x1="${PL}" y1="${H-PB-VH-4}" x2="${W-PR}" y2="${H-PB-VH-4}" stroke="#2a2d3e" stroke-width="1"/>
    ${volumes}${candles}${maLines}${xLabels}${legend}
    <line id="kline-hover-line" x1="${PL}" y1="${PT}" x2="${PL}" y2="${H-PB}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" style="display:none"/>
  </svg>
  <div class="chart-tooltip" id="kline-tooltip"></div>`;

  const svg = wrap.querySelector('svg');
  const tooltip = wrap.querySelector('#kline-tooltip');
  const hoverLine = wrap.querySelector('#kline-hover-line');
  const hideTooltip = () => {
    tooltip.style.display = 'none';
    hoverLine.style.display = 'none';
  };
  svg.addEventListener('mouseleave', hideTooltip);
  svg.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < PL || x > W - PR) { hideTooltip(); return; }
    const idx = Math.max(0, Math.min(data.length - 1, Math.floor((x - PL) / gap)));
    const k = data[idx];
    const cx = PL + idx * gap + gap / 2;
    const pct = Number.isFinite(k.change_pct)
      ? k.change_pct
      : (k.prev_close ? ((k.close - k.prev_close) / k.prev_close) * 100 : 0);
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    const sign = pct > 0 ? '+' : '';
    hoverLine.setAttribute('x1', cx);
    hoverLine.setAttribute('x2', cx);
    hoverLine.style.display = '';
    tooltip.innerHTML = `
      <div class="tt-date">${k.date}</div>
      <div class="tt-row"><span>涨跌幅</span><b class="${cls}">${sign}${pct.toFixed(2)}%</b></div>
      <div class="tt-row"><span>开盘</span><b>${fmt(k.open)}</b></div>
      <div class="tt-row"><span>最高</span><b class="up">${fmt(k.high)}</b></div>
      <div class="tt-row"><span>最低</span><b class="down">${fmt(k.low)}</b></div>
      <div class="tt-row"><span>收盘</span><b>${fmt(k.close)}</b></div>
      <div class="tt-row"><span>成交量</span><b>${fmtVol(k.volume)}</b></div>`;
    tooltip.style.display = 'block';
    const tooltipW = tooltip.offsetWidth || 160;
    const tooltipH = tooltip.offsetHeight || 130;
    let left = cx + 18;
    if (left + tooltipW > W - 8) left = cx - tooltipW - 18;
    const top = Math.max(8, Math.min(H - tooltipH - 8, e.clientY - rect.top - tooltipH / 2));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  });
}

function renderTrendChart() {
  const wrap = document.getElementById('chart-svg-wrap');
  const trends = chartData?.trends;
  if (!trends || trends.length < 5) {
    wrap.innerHTML='<div class="chart-loading">分时数据不足（非交易时间）</div>'; return;
  }
  const pts = trends.map(t=>{const p=t.split(',');return{time:p[0].slice(-5),price:+p[2],avg:+p[7],vol:+p[5]};}).filter(p=>p.price>0&&p.avg>0);
  if (pts.length<2){wrap.innerHTML='<div class="chart-loading">数据不足</div>';return;}

  // 从K线数据获取昨日收盘价
  const prevClose = (() => {
    const ks = chartData?.klines;
    if (!ks || ks.length < 2) return null;
    return ks[ks.length - 1].prev_close || null;
  })();

  const W=wrap.clientWidth||800, H=260, PL=50, PR=10, PT=10, PB=30, VH=45;
  const cW=W-PL-PR, cH=H-PT-PB-VH-8;
  const n=pts.length;
  const allPrices=[...pts.map(p=>p.price),...pts.map(p=>p.avg)];
  if (prevClose) allPrices.push(prevClose);
  const pMax=Math.max(...allPrices), pMin=Math.min(...allPrices);
  const pRange=pMax-pMin||1;
  const vols=pts.map(p=>p.vol), vMax=Math.max(...vols)||1;
  const px=i=>PL+i*(cW/(n-1));
  const py=v=>PT+cH-(v-pMin)/pRange*cH;
  let grid='', priceLine='', avgLine='', volBars='', xLabels='';
  for(let i=0;i<=4;i++){
    const y=PT+cH*i/4;
    grid+=`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#2a2d3e" stroke-width="1"/>`;
    grid+=`<text x="${PL-4}" y="${y+4}" text-anchor="end" fill="#7c8499" font-size="10">${(pMax-pRange*i/4).toFixed(2)}</text>`;
  }
  pts.forEach((p,i)=>{
    if(i>0){
      priceLine+=`<line x1="${px(i-1)}" y1="${py(pts[i-1].price)}" x2="${px(i)}" y2="${py(p.price)}" stroke="#f04d4d" stroke-width="1.5"/>`;
      avgLine  +=`<line x1="${px(i-1)}" y1="${py(pts[i-1].avg)}" x2="${px(i)}" y2="${py(p.avg)}" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2"/>`;
    }
    const vh=Math.max(1,(p.vol/vMax)*(VH-4));
    const vy=H-PB-vh;
    volBars+=`<rect x="${px(i)-1}" y="${vy}" width="2" height="${vh}" fill="rgba(78,142,247,.5)"/>`;
    if(i%Math.ceil(n/6)===0) xLabels+=`<text x="${px(i)}" y="${H-PB+12}" text-anchor="middle" fill="#7c8499" font-size="9">${p.time}</text>`;
  });

  // 昨收参考线
  const pcLine = prevClose ? (() => {
    const y = py(prevClose);
    return `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#7c8499" stroke-width="1" stroke-dasharray="4,3"/>
            <text x="${PL-4}" y="${y+3}" text-anchor="end" fill="#7c8499" font-size="9">${prevClose.toFixed(2)}</text>`;
  })() : '';

  wrap.innerHTML=`<svg width="${W}" height="${H}" style="display:block">
    ${grid}${pcLine}
    <line x1="${PL}" y1="${H-PB-VH-4}" x2="${W-PR}" y2="${H-PB-VH-4}" stroke="#2a2d3e" stroke-width="1"/>
    ${volBars}${priceLine}${avgLine}${xLabels}
    <circle cx="${px(pts.length-1)}" cy="${py(pts[pts.length-1].price)}" r="3" fill="#f04d4d"/>
    <text x="${W-PR-2}" y="${H-PB+12}" text-anchor="end" fill="#f5a623" font-size="9">均线</text>
    <line x1="${W-PR-30}" y1="${H-PB+8}" x2="${W-PR-18}" y2="${H-PB+8}" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2"/>
    <text x="${W-PR-36}" y="${H-PB+12}" text-anchor="end" fill="#7c8499" font-size="9">昨收</text>
    <line x1="${W-PR-66}" y1="${H-PB+8}" x2="${W-PR-54}" y2="${H-PB+8}" stroke="#7c8499" stroke-width="1" stroke-dasharray="4,3"/>
  </svg>`;
}

document.getElementById('chart-close').addEventListener('click', ()=>{
  document.getElementById('chart-overlay').style.display = 'none';
});
document.getElementById('chart-overlay').addEventListener('click', e=>{
  if(e.target===e.currentTarget) document.getElementById('chart-overlay').style.display='none';
});

// K线周期切换
document.getElementById('klt-tabs').addEventListener('click', async e => {
  const btn = e.target.closest('.klt-btn');
  if (!btn) return;
  const klt = +btn.dataset.klt;
  if (klt === currentKlt) return;
  currentKlt = klt;
  document.querySelectorAll('.klt-btn').forEach(b => b.classList.toggle('active', +b.dataset.klt === klt));
  // 使用缓存或重新拉取
  if (chartKltCache[klt]) {
    chartData.klines = chartKltCache[klt];
    renderKlineChart();
    return;
  }
  document.getElementById('chart-svg-wrap').innerHTML = '<div class="chart-loading"><div class="spinner"></div><div>加载中…</div></div>';
  try {
    const res = await fetch(`/api/chart/${chartCurrentCode}?klt=${klt}`);
    const json = await res.json();
    chartKltCache[klt] = json.klines;
    chartData.klines = json.klines;
    renderKlineChart();
  } catch(e) {
    document.getElementById('chart-svg-wrap').innerHTML = '<div class="chart-loading" style="color:var(--red)">加载失败</div>';
  }
});


/* === js/compare.js === */
function toggleCompare(stock) {
  const idx = compareList.findIndex(c => c.code === stock.code);
  if (idx !== -1) {
    compareList.splice(idx, 1);
  } else {
    if (compareList.length >= 2) { showToast('最多对比两只股票，请先移除一只'); return; }
    compareList.push(stock);
  }
  updateCompareBar();
  renderNormalTable();
}

function updateCompareBar() {
  const bar = document.getElementById('compare-bar');
  if (!compareList.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';

  [0, 1].forEach(i => {
    const slot = document.getElementById(`cmp-slot-${i}`);
    const s = compareList[i];
    slot.innerHTML = s
      ? `<div><div class="slot-name">${escapeHtml(s.name)}</div><div class="slot-code">${escapeHtml(s.code)}</div></div>
         <button onclick="removeCompare('${escapeHtml(s.code)}')">✕</button>`
      : `<span class="cmp-slot-empty">${i===0?'选择第一只':'选择第二只'}</span>`;
  });
  document.getElementById('do-compare-btn').disabled = compareList.length < 2;
}

function removeCompare(code) {
  compareList = compareList.filter(c => c.code !== code);
  updateCompareBar();
  renderNormalTable();
}

function openCompareModal() {
  if (compareList.length < 2) return;
  const [a, b] = compareList;
  const rows = [
    { label:'现价',       va: parseFloat(a.price),         vb: parseFloat(b.price),         fmt: v=>v.toFixed(2),              higher:'none' },
    { label:'涨跌幅',     va: parseFloat(a.change_pct),    vb: parseFloat(b.change_pct),    fmt: v=>(v>0?'+':'')+v.toFixed(2)+'%', higher:'a>b' },
    { label:'涨跌额',     va: parseFloat(a.change),        vb: parseFloat(b.change),        fmt: v=>(v>0?'+':'')+v.toFixed(2),  higher:'a>b' },
    { label:'今开',       va: parseFloat(a.open),          vb: parseFloat(b.open),          fmt: v=>v.toFixed(2),              higher:'none' },
    { label:'最高',       va: parseFloat(a.high),          vb: parseFloat(b.high),          fmt: v=>v.toFixed(2),              higher:'none' },
    { label:'最低',       va: parseFloat(a.low),           vb: parseFloat(b.low),           fmt: v=>v.toFixed(2),              higher:'none' },
    { label:'昨收',       va: parseFloat(a.prev_close),    vb: parseFloat(b.prev_close),    fmt: v=>v.toFixed(2),              higher:'none' },
    { label:'振幅',       va: a.prev_close>0?(a.high-a.low)/a.prev_close*100:0, vb: b.prev_close>0?(b.high-b.low)/b.prev_close*100:0, fmt: v=>v.toFixed(2)+'%', higher:'none' },
    { label:'量比',       va: parseFloat(a.volume_ratio),  vb: parseFloat(b.volume_ratio),  fmt: v=>v.toFixed(2),              higher:'a>b' },
    { label:'换手率',     va: parseFloat(a.turnover_rate), vb: parseFloat(b.turnover_rate), fmt: v=>v.toFixed(2)+'%',          higher:'a>b' },
    { label:'市值(亿)',   va: parseFloat(a.market_cap)/1e8,vb: parseFloat(b.market_cap)/1e8,fmt: v=>v.toFixed(2),              higher:'a<b' },
    { label:'市盈率',     va: parseFloat(a.pe),            vb: parseFloat(b.pe),            fmt: v=>v.toFixed(2),              higher:'a<b' },
    { label:'成交额',     va: parseFloat(a.turnover),      vb: parseFloat(b.turnover),      fmt: v=>fmtMoney(v),               higher:'a>b' },
  ];

  const mktBadge = s => s.market==='SH'
    ? '<span class="badge badge-sh">沪</span>'
    : '<span class="badge badge-sz">深</span>';

  const tableRows = rows.map(r => {
    let clsA = 'cmp-neutral', clsB = 'cmp-neutral';
    if (!isNaN(r.va) && !isNaN(r.vb) && r.higher !== 'none') {
      if (r.higher === 'a>b') { if(r.va > r.vb) clsA='cmp-win'; else if(r.vb > r.va) clsB='cmp-win'; }
      if (r.higher === 'a<b') { if(r.va < r.vb && r.va > 0) clsA='cmp-win'; else if(r.vb < r.va && r.vb > 0) clsB='cmp-win'; }
    }
    return `<tr>
      <td>${r.label}</td>
      <td class="${clsA}">${isNaN(r.va)?'--':r.fmt(r.va)}</td>
      <td class="${clsB}">${isNaN(r.vb)?'--':r.fmt(r.vb)}</td>
    </tr>`;
  }).join('');

  document.getElementById('compare-body').innerHTML = `
    <table class="cmp-table">
      <thead><tr>
        <th style="width:90px"></th>
        <th class="stock-col">${escapeHtml(a.name)}${mktBadge(a)}<br><span style="font-size:11px;font-weight:400;color:var(--muted)">${escapeHtml(a.code)}</span></th>
        <th class="stock-col">${escapeHtml(b.name)}${mktBadge(b)}<br><span style="font-size:11px;font-weight:400;color:var(--muted)">${escapeHtml(b.code)}</span></th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div style="margin-top:10px;font-size:11px;color:var(--muted);text-align:right"><span style="color:var(--red);font-weight:700">红色</span> = 该项数据更优</div>`;

  document.getElementById('compare-overlay').style.display = 'flex';
}

document.getElementById('do-compare-btn').addEventListener('click', openCompareModal);
document.getElementById('compare-modal-close').addEventListener('click', () => {
  document.getElementById('compare-overlay').style.display = 'none';
});
document.getElementById('compare-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('compare-overlay').style.display = 'none';
});
document.getElementById('close-compare-bar').addEventListener('click', () => {
  compareList = [];
  updateCompareBar();
  renderNormalTable();
});


/* === js/search.js === */
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.style.display = q ? 'block' : 'none';
  clearTimeout(searchTimer);
  if (!q) { clearSearch(); return; }
  searchTimer = setTimeout(() => doSearch(q), 300);
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') clearSearch();
});

searchClear.addEventListener('click', clearSearch);

async function doSearch(q) {
  if (isScreenMode) return;
  // 先在已加载数据中快速匹配
  const localHits = allData.filter(s =>
    s.code.includes(q) || s.name.includes(q)
  );
  if (localHits.length) {
    showSearchResults(localHits, q, '榜单内');
    return;
  }
  // 本地无结果 → 搜索全市场
  isSearchMode = true;
  showLoading();
  document.getElementById('search-badge').style.display = 'none';
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    if (json.success && json.data.length) {
      showSearchResults(json.data, q, '全市场');
    } else {
      showEmpty(`未找到与 "${q}" 匹配的股票`);
      isSearchMode = false;
    }
  } catch(e) {
    showEmpty('搜索失败，请重试');
    isSearchMode = false;
  }
}

function showSearchResults(data, q, scope) {
  isSearchMode = true;
  stopAuto();
  searchResults = data;
  document.getElementById('search-badge-text').textContent = `${scope}搜索 "${q}"，共 ${data.length} 条结果`;
  document.getElementById('search-badge').style.display = 'flex';
  page = 1;
  renderNormalTable();
  renderStats();
}

function clearSearch() {
  isSearchMode = false;
  searchResults = [];
  searchInput.value = '';
  searchClear.style.display = 'none';
  document.getElementById('search-badge').style.display = 'none';
  page = 1;
  if (!isScreenMode) {
    if (document.getElementById('auto-refresh').checked) startAuto();
    renderNormalTable();
    renderStats();
  }
}


/* === js/indicators.js === */
const indicatorInput = document.getElementById('indicator-input');
const indicatorBtn = document.getElementById('indicator-btn');
const indicatorResult = document.getElementById('indicator-result');

function indicatorCard(label, value, note = '', cls = '') {
  return `<div class="indicator-card">
    <div class="indicator-label">${label}</div>
    <div class="indicator-value ${cls}">${value}</div>
    ${note ? `<div class="indicator-note">${note}</div>` : ''}
  </div>`;
}

async function queryIndicators() {
  const q = indicatorInput.value.trim();
  if (!q) {
    indicatorResult.style.display = 'block';
    indicatorResult.innerHTML = '<div class="indicator-note">请输入股票代码或名称。</div>';
    return;
  }
  indicatorBtn.disabled = true;
  indicatorBtn.textContent = '查询中...';
  indicatorResult.style.display = 'block';
  indicatorResult.innerHTML = '<div class="chart-loading"><div class="spinner"></div><div>正在计算指标...</div></div>';

  try {
    const res = await fetch(`/api/indicators?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '查询失败');
    renderIndicatorResult(json.data);
  } catch (e) {
    indicatorResult.innerHTML = `<div class="indicator-note" style="color:var(--red)">查询失败：${e.message}</div>`;
  } finally {
    indicatorBtn.disabled = false;
    indicatorBtn.textContent = '查询指标';
  }
}

function renderIndicatorResult(data) {
  const q = data.quote;
  const ma = data.moving_average;
  const t = data.trend;
  const a = data.activity;
  const c = data.capital;
  const v = data.valuation;
  const s = data.strength;
  const risk = data.risk;
  const pctCls = parseFloat(q.change_pct) > 0 ? 'up' : parseFloat(q.change_pct) < 0 ? 'down' : 'flat';
  const riskTags = risk.items.length
    ? risk.items.map(x => `<span class="risk-tag">${x}</span>`).join('')
    : '<span class="risk-tag low">暂无明显风险提示</span>';

  indicatorResult.innerHTML = `
    <div class="indicator-head">
      <div>
        <div class="indicator-title">${escapeHtml(q.name)} <span style="color:var(--muted);font-size:13px">${escapeHtml(q.code)}</span></div>
        <div class="indicator-sub">更新时间：${data.updated_at}</div>
      </div>
      <button class="cmp-btn" onclick="openChart('${escapeHtml(q.code)}','${escapeHtml(q.name)}',${q.price},${q.change_pct})">打开K线</button>
    </div>
    <div class="indicator-grid">
      ${indicatorCard('趋势判断', `${t.label} / ${t.score}分`, `站上MA5：${t.above_ma5 ? '是' : '否'}，站上MA20：${t.above_ma20 ? '是' : '否'}`)}
      ${indicatorCard('今日强度', fmtPct(q.change_pct), `30日涨停 ${s.limit_count_30} 次，连续涨停 ${s.consecutive_limit} 天`, pctCls)}
      ${indicatorCard('现价 / 20日高点', `${fmt(q.price)} / ${fmt(t.high20)}`, `近5日涨幅 ${fmtPct(t.gain5)}`)}
      ${indicatorCard('均线 MA5 / MA10', `${fmt(ma.ma5)} / ${fmt(ma.ma10)}`, `MA20 ${fmt(ma.ma20)}，MA60 ${fmt(ma.ma60)}`)}
      ${indicatorCard('量比 / 换手率', `${fmt(a.volume_ratio)} / ${fmt(a.turnover_rate)}%`, `5日均量 ${Math.round(a.avg_volume_5 || 0).toLocaleString('zh-CN')}`)}
      ${indicatorCard('主力资金', fmtBigMoney(c.net_inflow), `流入占比 ${fmtPct(c.inflow_pct)}`, c.net_inflow > 0 ? 'up' : c.net_inflow < 0 ? 'down' : '')}
      ${indicatorCard('市值 / PE', `${fmtCap(v.market_cap)} / ${fmt(v.pe)}`, '市值过小或PE异常时需提高风险权重')}
      ${indicatorCard('风险等级', risk.level, `共 ${risk.items.length} 条提示`, risk.level === '偏高' ? 'down' : risk.level === '较低' ? 'up' : '')}
    </div>
    <div class="risk-list">${riskTags}</div>
  `;
}

indicatorBtn.addEventListener('click', queryIndicators);
indicatorInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') queryIndicators();
});


/* === js/filters.js === */
const NEAR_LIMIT_RANGE_KEY = 'nearLimitRange';
let nearLimitRange = loadNearLimitRange();

function loadNearLimitRange() {
  try {
    const saved = JSON.parse(localStorage.getItem(NEAR_LIMIT_RANGE_KEY));
    if (Number.isFinite(saved?.min) && Number.isFinite(saved?.max) && saved.min < saved.max) return saved;
  } catch {}
  return { min: 8, max: 9.9 };
}

function syncNearLimitInputs() {
  document.getElementById('near-limit-min').value = nearLimitRange.min;
  document.getElementById('near-limit-max').value = nearLimitRange.max;
}

function readNearLimitRange() {
  const minInput = document.getElementById('near-limit-min');
  const maxInput = document.getElementById('near-limit-max');
  let min = parseFloat(minInput.value);
  let max = parseFloat(maxInput.value);
  if (!Number.isFinite(min)) min = 8;
  if (!Number.isFinite(max)) max = 9.9;
  min = Math.max(0, Math.min(30, min));
  max = Math.max(0, Math.min(30, max));
  if (min >= max) max = Math.min(30, min + 0.1);
  nearLimitRange = { min: +min.toFixed(1), max: +max.toFixed(1) };
  localStorage.setItem(NEAR_LIMIT_RANGE_KEY, JSON.stringify(nearLimitRange));
  syncNearLimitInputs();
  syncProfileToCloud();
  return nearLimitRange;
}

const QUICK_FILTERS = {
  main10:   s => !/^(300|301|688|689)/.test(String(s.code || '')),
  twenty:   s => /^(300|301|688|689)/.test(String(s.code || '')),
  limitup:  s => parseFloat(s.change_pct) >= 9.9,
  nearLimit:s => { const v=parseFloat(s.change_pct); const r=nearLimitRange; return v >= r.min && v < r.max; },
  inflow:   s => parseFloat(s.net_inflow) > 0,
};

syncNearLimitInputs();
function activateNearLimitFilter() {
  activeQuickFilter = 'nearLimit';
  document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('near-limit-control').classList.add('active');
  page = 1;
  renderNormalTable();
  renderStats();
}
document.getElementById('near-limit-min').addEventListener('input', () => {
  readNearLimitRange();
  activateNearLimitFilter();
});
document.getElementById('near-limit-max').addEventListener('input', () => {
  readNearLimitRange();
  activateNearLimitFilter();
});

document.getElementById('quick-filters').addEventListener('click', e => {
  const btn = e.target.closest('.qf-btn');
  if (!btn) return;
  const filter = btn.dataset.filter;
  if (filter === 'clear' || filter === activeQuickFilter) {
    activeQuickFilter = null;
    document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('near-limit-control').classList.remove('active');
    page = 1;
    renderNormalTable(); renderStats();
    return;
  }
  activeQuickFilter = filter;
  document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('near-limit-control').classList.remove('active');
  btn.classList.add('active');
  page = 1;
  renderNormalTable(); renderStats();
});

// Hook into sortedData to apply quick filter
const _origSortedData = window.sortedData;
// We override filter logic in renderNormalTable by patching allData view
function getFilteredData() {
  if (!activeQuickFilter || !QUICK_FILTERS[activeQuickFilter]) return allData;
  return allData.filter(QUICK_FILTERS[activeQuickFilter]);
}


/* === js/sectors.js === */
async function fetchAndRenderSectors(type) {
  currentSectorType = type;
  const content = document.getElementById('sector-content');
  content.innerHTML = '<div class="sector-loading"><div class="spinner"></div><div style="margin-top:8px">加载中…</div></div>';

  try {
    const res = await fetch(`/api/sectors?type=${type}`);
    const json = await res.json();
    if (!json.success || !json.data.length) {
      content.innerHTML = '<div class="sector-loading">暂无数据</div>';
      return;
    }
    const data = json.data;
    const sorted = [...data].sort((a,b) => parseFloat(b.change_pct) - parseFloat(a.change_pct));
    const top = sorted.slice(0, 10);
    const bottom = sorted.slice(-10).reverse();

    function row(s) {
      const pct = parseFloat(s.change_pct);
      const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
      const sign = pct > 0 ? '+' : '';
      const leaderPct = parseFloat(s.leader_pct);
      const leaderStr = s.leader_name
        ? `${escapeHtml(s.leader_name)} ${leaderPct>0?'+':''}${leaderPct.toFixed(1)}%`
        : '';
      return `<div class="sector-row">
        <span class="sector-name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
        <span class="sector-pct ${cls}">${sign}${pct.toFixed(2)}%</span>
        <span class="sector-counts"><span class="up">${s.up_count}</span>/<span class="down">${s.down_count}</span></span>
        <span class="sector-leader">${leaderStr}</span>
      </div>`;
    }

    content.innerHTML = `<div class="sector-grid">
      <div class="sector-col">
        <div class="sector-col-title">涨幅领先 TOP10</div>
        ${top.map(row).join('')}
      </div>
      <div class="sector-col">
        <div class="sector-col-title">跌幅领先 TOP10</div>
        ${bottom.map(row).join('')}
      </div>
    </div>`;
    document.getElementById('sector-update-time').textContent = new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch(e) {
    content.innerHTML = `<div class="sector-loading" style="color:var(--red)">加载失败：${e.message}</div>`;
  }
}

function exitSectorMode() {
  isSectorMode = false;
  document.getElementById('sector-board').style.display = 'none';
  document.querySelector('.table-wrap').style.display = '';
  document.getElementById('dist-bar-wrap').style.display = '';
}

document.querySelectorAll('.sector-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sector-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    fetchAndRenderSectors(btn.dataset.type);
  });
});


/* === js/limitup.js === */
async function fetchLimitup() {
  isLimitupMode = true;
  const board = document.getElementById('limitup-board');
  const grid = document.getElementById('limitup-grid');
  const loading = document.getElementById('lu-loading');
  board.style.display = '';
  grid.style.display = 'none';
  loading.style.display = '';

  try {
    const res = await fetch('/api/limitup');
    const json = await res.json();
    loading.style.display = 'none';
    grid.style.display = '';
    if (!json.success || !json.data.length) {
      grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">暂无涨停股票</div>';
      return;
    }
    grid.innerHTML = json.data.map(s => {
      const c = s.consecutive;
      const boardClass = c>=4?'board4':c>=3?'board3':c>=2?'board2':'';
      const badgeClass = `b${Math.min(c,6)}`;
      const badgeText = c>=2?`${c}连板`:'首板';
      const mkt = s.market==='SH'?'<span class="badge badge-sh">沪</span>':'<span class="badge badge-sz">深</span>';
      return `<div class="lu-card ${boardClass}" onclick="openChart('${escapeHtml(s.code)}','${escapeHtml(s.name)}',${s.price},${s.change_pct})">
        <div class="lu-header">
          <div><div class="lu-name">${escapeHtml(s.name)}${mkt}</div><div class="lu-code">${escapeHtml(s.code)}</div></div>
          <span class="lu-board-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="lu-stats">
          <div class="lu-stat">涨幅 <span class="up">${parseFloat(s.change_pct).toFixed(2)}%</span></div>
          <div class="lu-stat">量比 <span>${parseFloat(s.volume_ratio).toFixed(2)}</span></div>
          <div class="lu-stat">换手 <span>${parseFloat(s.turnover_rate).toFixed(2)}%</span></div>
          <div class="lu-stat">市值 <span>${(parseFloat(s.market_cap)/1e8).toFixed(0)}亿</span></div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    loading.style.display = 'none';
    grid.style.display = '';
    grid.innerHTML = `<div style="color:var(--red);padding:20px">加载失败：${e.message}</div>`;
  }
}

function exitLimitupMode() {
  isLimitupMode = false;
  document.getElementById('limitup-board').style.display = 'none';
  document.querySelector('.table-wrap').style.display = '';
}


/* === js/export.js === */
document.getElementById('export-btn').addEventListener('click', ()=>{
  const data = isScreenMode ? screenCandidates : sortedData(currentListData());
  if (!data.length) return;
  const headers = isScreenMode
    ? ['序号','代码','名称','市场','涨跌幅%','现价','量比','换手率%','市值(亿)','30日涨停','通过','原因']
    : ['序号','代码','名称','市场','涨跌幅%','现价','涨跌额','量比','换手率%','市值(亿)','今开','最高','最低','振幅%','昨收','成交额','市盈率'];
  const rows = data.map((s,i)=>isScreenMode
    ? [i+1,s.code,s.name,s.market,fmt(s.change_pct),fmt(s.price),fmt(s.volume_ratio),fmt(s.turnover_rate),(parseFloat(s.market_cap)/1e8).toFixed(2),s.had_limit_up?'是':'否',s.pass?'是':'否',s.fail_reason||'']
    : [i+1,s.code,s.name,s.market,fmt(s.change_pct),fmt(s.price),fmt(s.change),fmt(s.volume_ratio),fmt(s.turnover_rate),(parseFloat(s.market_cap)/1e8).toFixed(2),fmt(s.open),fmt(s.high),fmt(s.low),fmtAmp(s),fmt(s.prev_close),fmtMoney(s.turnover),fmt(s.pe)]
  );
  const csv=[headers,...rows].map(r=>r.join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`${isScreenMode?'选股结果':'涨势榜'}_${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}).replace(/[/:]/g,'-')}.csv`;
  a.click();
});


/* === js/theme.js === */
const THEMES = {
  dark: {
    name:'清透', preview:['#e8edf6','#ffffff','#f04d4d','#4e8ef7'],
    '--bg':'#e8edf6','--surface':'#ffffff','--border':'#cbd5e1',
    '--text':'#050816','--muted':'#243044','--accent':'#1d4ed8',
    '--red':'#f04d4d','--green':'#12b86e','--gold':'#f5a623',
    '--hover-bg':'#eef4ff','--input-bg':'#f8fafc','--tab-hover':'#e2eaf8',
    '--badge-sh-bg':'#dbeafe','--badge-sh-text':'#1d63ad',
    '--badge-sz-bg':'#d7f5e8','--badge-sz-text':'#087a49',
    '--screen-btn-bg':'linear-gradient(135deg,#fff1cc,#e7f0ff)',
    '--screen-btn-border':'#d98a00','--screen-btn-text':'#653b00',
    '--screen-banner-bg':'linear-gradient(135deg,#fff7e6,#edf4ff)',
    '--screen-banner-border':'#f0bd62',
  },
  light: {
    name:'浅色', preview:['#f0f2f5','#ffffff','#e02020','#2563eb'],
    '--bg':'#f0f2f5','--surface':'#ffffff','--border':'#dde1ec',
    '--text':'#1a1d27','--muted':'#8892a4','--accent':'#2563eb',
    '--red':'#e02020','--green':'#0c9651','--gold':'#c47f00',
    '--hover-bg':'#eef1f8','--input-bg':'#f8f9fc','--tab-hover':'#e8ecf8',
    '--badge-sh-bg':'#dbeeff','--badge-sh-text':'#1a6bb5',
    '--badge-sz-bg':'#d5f5e8','--badge-sz-text':'#0a7a48',
    '--screen-btn-bg':'linear-gradient(135deg,#dbeeff,#e8e0ff)',
    '--screen-btn-border':'#2563eb','--screen-btn-text':'#1a4ab5',
    '--screen-banner-bg':'linear-gradient(135deg,#dbeeff,#e8e0ff)',
    '--screen-banner-border':'#6090e8',
  },
  navy: {
    name:'深蓝', preview:['#060d1f','#0c1630','#ff5555','#4080ff'],
    '--bg':'#060d1f','--surface':'#0c1630','--border':'#1a2a50',
    '--text':'#c8d8f0','--muted':'#5a7aaa','--accent':'#4080ff',
    '--red':'#ff5555','--green':'#00c878','--gold':'#ffc040',
    '--hover-bg':'#122040','--input-bg':'#060d1f','--tab-hover':'#182038',
    '--badge-sh-bg':'#0d2050','--badge-sh-text':'#60a0ff',
    '--badge-sz-bg':'#0a2a30','--badge-sz-text':'#30d890',
    '--screen-btn-bg':'linear-gradient(135deg,#0d2050,#100840)',
    '--screen-btn-border':'#4080ff','--screen-btn-text':'#80b0ff',
    '--screen-banner-bg':'linear-gradient(135deg,#0a1838,#080d28)',
    '--screen-banner-border':'#2050c0',
  },
  warm: {
    name:'护眼', preview:['#1a1e0e','#232811','#f06050','#80c840'],
    '--bg':'#1a1e0e','--surface':'#232811','--border':'#343d18',
    '--text':'#d8e8c0','--muted':'#7a9060','--accent':'#80c840',
    '--red':'#f06050','--green':'#40c890','--gold':'#e8c040',
    '--hover-bg':'#2a3218','--input-bg':'#1a1e0e','--tab-hover':'#2e3820',
    '--badge-sh-bg':'#1a2e10','--badge-sh-text':'#80c840',
    '--badge-sz-bg':'#102a18','--badge-sz-text':'#40c890',
    '--screen-btn-bg':'linear-gradient(135deg,#1e2e10,#181e08)',
    '--screen-btn-border':'#80c840','--screen-btn-text':'#b0e870',
    '--screen-banner-bg':'linear-gradient(135deg,#1a2a0a,#101808)',
    '--screen-banner-border':'#4a7020',
  },
};

function applyTheme(key) {
  const t = THEMES[key];
  if (!t) return;
  const root = document.documentElement;
  Object.entries(t).forEach(([k, v]) => {
    if (k.startsWith('--')) root.style.setProperty(k, v);
  });
  currentTheme = key;
  localStorage.setItem('theme', key);
  renderThemePicker();
  syncProfileToCloud();
}

function renderThemePicker() {
  document.getElementById('theme-grid').innerHTML = Object.entries(THEMES).map(([key, t]) => `
    <div class="theme-card ${key === currentTheme ? 'active' : ''}" onclick="applyTheme('${key}')">
      <div class="theme-card-preview">
        ${t.preview.map(c => `<span style="background:${c}"></span>`).join('')}
      </div>
      <div class="theme-card-name">${t.name}</div>
    </div>`).join('');
}

// 主题按钮 toggle
document.getElementById('theme-btn').addEventListener('click', e => {
  e.stopPropagation();
  const picker = document.getElementById('theme-picker');
  const isOpen = picker.classList.toggle('open');
  if (isOpen) renderThemePicker();
});
document.addEventListener('click', e => {
  if (!e.target.closest('#theme-picker') && !e.target.closest('#theme-btn')) {
    document.getElementById('theme-picker').classList.remove('open');
  }
});

// 启动时应用保存的主题
applyTheme(currentTheme);


/* === js/init.js === */
async function init() {
  loadSettings();
  loadWatchlist();
  await initAuth();
  applySettingsToUI();
  fetchData();
  fetchIndices();
  if (document.getElementById('auto-refresh').checked) startAuto();
  startClockAndAutoScreenCheck();
}

function startClockAndAutoScreenCheck() {
  setInterval(() => {
    const bj = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const hh = String(bj.getHours()).padStart(2,'0');
    const mm = String(bj.getMinutes()).padStart(2,'0');
    const ss = String(bj.getSeconds()).padStart(2,'0');
    document.getElementById('clock').textContent = `北京 ${hh}:${mm}:${ss}`;

    // 14:30 自动选股
    if (settings.auto_screen && bj.getHours() === 14 && bj.getMinutes() === 30 && bj.getSeconds() < 5) {
      const today = `${bj.getFullYear()}-${bj.getMonth()+1}-${bj.getDate()}`;
      if (autoScreenDone !== today) {
        autoScreenDone = today;
        runScreen();
      }
    }
  }, 1000);
}

/* Auto-refresh */
function startAuto() {
  countdown=30; clearInterval(autoInterval);
  autoInterval = setInterval(() => {
    countdown--;
    document.getElementById('countdown').textContent = `(${countdown}s)`;
    if (countdown<=0) { fetchData(); countdown=30; }
  }, 1000);
}
function stopAuto() { clearInterval(autoInterval); document.getElementById('countdown').textContent=''; }
document.getElementById('auto-refresh').addEventListener('change', function() {
  if (!isScreenMode) this.checked ? startAuto() : stopAuto();
});

/* Board tabs */
document.querySelectorAll('#board-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    if (isScreenMode) exitScreenMode();
    if (isLimitupMode) exitLimitupMode();
    if (isSectorMode) exitSectorMode();
    document.querySelectorAll('#board-tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const b = btn.dataset.board;
    activeQuickFilter = null;
    document.querySelectorAll('.qf-btn').forEach(qb => qb.classList.remove('active'));
    document.getElementById('near-limit-control')?.classList.remove('active');

    if (b === 'limitup') {
      stopAuto();
      document.querySelector('.table-wrap').style.display = 'none';
      document.getElementById('dist-bar-wrap').style.display = 'none';
      fetchLimitup();
      return;
    }

    if (b === 'sectors') {
      isSectorMode = true;
      stopAuto();
      document.querySelector('.table-wrap').style.display = 'none';
      document.getElementById('dist-bar-wrap').style.display = 'none';
      document.getElementById('sector-board').style.display = '';
      document.getElementById('limitup-board').style.display = 'none';
      fetchAndRenderSectors(currentSectorType);
      return;
    }

    isWatchlistMode = b === 'watchlist';
    board = isWatchlistMode ? 'all' : b;
    page = 1; sortCol = 'change_pct'; sortDir = 'desc';
    showLoading();
    fetchData();
    if (document.getElementById('auto-refresh').checked) startAuto();
  });
});

/* Sort */
document.querySelectorAll('#thead-normal th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    if (isScreenMode||isWatchlistMode) return;
    const col=th.dataset.col;
    if (col==='rank'||col==='name') return;
    sortDir = sortCol===col ? (sortDir==='desc'?'asc':'desc') : 'desc';
    sortCol = col;
    page = 1;
    renderNormalTable();
  });
});

/* Buttons */
document.getElementById('prev-btn').addEventListener('click', ()=>{ if(page>1){ page--; renderNormalTable(); } });
document.getElementById('next-btn').addEventListener('click', ()=>{ page++; renderNormalTable(); });
document.getElementById('refresh-btn').addEventListener('click', ()=>{
  if(isScreenMode) exitScreenMode();
  else if(isLimitupMode) fetchLimitup();
  else if(isSectorMode) fetchAndRenderSectors(currentSectorType);
  else fetchData();
});
document.getElementById('screen-btn').addEventListener('click', runScreen);
document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', closeSettings);
document.getElementById('settings-overlay').addEventListener('click', closeSettings);
document.getElementById('settings-save').addEventListener('click', saveSettings);
document.getElementById('settings-reset').addEventListener('click', resetSettings);
document.getElementById('history-btn').addEventListener('click', openHistory);
document.getElementById('history-close').addEventListener('click', closeHistory);
document.getElementById('history-overlay').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeHistory(); });
document.getElementById('notif-btn').addEventListener('click', ()=>{
  document.getElementById('notif-dot').style.display = 'none';
  openSettings();
  setTimeout(()=>document.getElementById('s-browser-notif').scrollIntoView({behavior:'smooth'}), 300);
});
auth.bindDefaultEvents({
  authButton() {
    currentUser ? logout() : openAuth();
  },
});

/* Start */
init();
