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
