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
