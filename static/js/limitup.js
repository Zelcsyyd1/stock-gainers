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
