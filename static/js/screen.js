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
