async function fetchDragonTiger() {
  isDragonTigerMode = true;
  const board = document.getElementById('dragon-tiger-board');
  const grid = document.getElementById('dt-grid');
  const loading = document.getElementById('dt-loading');
  board.style.display = '';
  grid.style.display = 'none';
  loading.style.display = '';

  try {
    const res = await fetch('/api/dragon-tiger');
    const json = await res.json();
    loading.style.display = 'none';
    grid.style.display = '';
    if (!json.success || !json.data || !json.data.length) {
      grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">暂无龙虎榜数据</div>';
      return;
    }
    let html = '<table style="width:100%;border-collapse:collapse;font-size:13px">';
    html += '<thead><tr>';
    html += '<th style="text-align:left;padding:10px 11px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border)">日期</th>';
    html += '<th style="text-align:left;padding:10px 11px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border)">股票</th>';
    html += '<th style="text-align:right;padding:10px 11px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border)">收盘价</th>';
    html += '<th style="text-align:right;padding:10px 11px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border)">涨跌幅</th>';
    html += '<th style="text-align:right;padding:10px 11px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border)">买入额</th>';
    html += '<th style="text-align:right;padding:10px 11px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border)">卖出额</th>';
    html += '<th style="text-align:right;padding:10px 11px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border)">净买入</th>';
    html += '<th style="text-align:left;padding:10px 11px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border)">上榜原因</th>';
    html += '</tr></thead><tbody>';

    json.data.forEach(s => {
      const pct = parseFloat(s.change_pct);
      const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
      const sign = pct > 0 ? '+' : '';
      const net = parseFloat(s.net_amount);
      const netCls = net > 0 ? 'up' : net < 0 ? 'down' : 'flat';
      html += `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="openChart('${escapeHtml(s.code)}','${escapeHtml(s.name)}',${s.close},${s.change_pct})">`;
      html += `<td style="padding:9px 11px;text-align:left;font-size:12px;color:var(--muted)">${escapeHtml(s.date)}</td>`;
      html += `<td style="padding:9px 11px;text-align:left"><div class="stock-name">${escapeHtml(s.name)}</div><div class="stock-code">${escapeHtml(s.code)}</div></td>`;
      html += `<td style="padding:9px 11px;text-align:right">${parseFloat(s.close).toFixed(2)}</td>`;
      html += `<td style="padding:9px 11px;text-align:right"><span class="change-pct ${cls}">${sign}${pct.toFixed(2)}%</span></td>`;
      html += `<td style="padding:9px 11px;text-align:right">${fmtMoney(s.buy_amount)}</td>`;
      html += `<td style="padding:9px 11px;text-align:right">${fmtMoney(s.sell_amount)}</td>`;
      html += `<td style="padding:9px 11px;text-align:right;font-weight:600" class="${netCls}">${fmtBigMoney(s.net_amount)}</td>`;
      html += `<td style="padding:9px 11px;text-align:left;font-size:11px;color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(s.reason)}">${escapeHtml(s.reason)}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    grid.innerHTML = html;
  } catch (e) {
    loading.style.display = 'none';
    grid.style.display = '';
    grid.innerHTML = `<div style="color:var(--red);padding:20px">加载失败: ${e.message}</div>`;
  }
}

function exitDragonTigerMode() {
  isDragonTigerMode = false;
  document.getElementById('dragon-tiger-board').style.display = 'none';
  document.querySelector('.table-wrap').style.display = '';
  const distBar = document.getElementById('dist-bar-wrap');
  if (distBar) distBar.style.display = '';
}
