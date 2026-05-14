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
