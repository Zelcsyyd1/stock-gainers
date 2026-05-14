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
