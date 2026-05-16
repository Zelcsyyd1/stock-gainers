async function fetchAndRenderAuction(code) {
  const container = document.getElementById('auction-section');
  if (!container) return;
  container.style.display = '';
  container.innerHTML = '<div style="text-align:center;padding:8px;color:var(--muted);font-size:12px">加载竞价数据...</div>';

  try {
    const res = await fetch(`/api/auction/${code}`);
    const json = await res.json();
    if (!json.success || !json.data) {
      container.innerHTML = '<div style="text-align:center;padding:8px;color:var(--muted);font-size:12px">暂无竞价数据</div>';
      return;
    }
    const d = json.data;
    const gapCls = d.gap_pct > 0 ? 'up' : d.gap_pct < 0 ? 'down' : 'flat';
    const sign = d.gap_pct > 0 ? '+' : '';

    let html = `<div style="font-size:12px;font-weight:600;margin-bottom:6px">集合竞价</div>`;
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    html += `<div class="meta-item"><div class="ml">开盘价</div><div class="mv">${parseFloat(d.open).toFixed(2)}</div></div>`;
    html += `<div class="meta-item"><div class="ml">昨收</div><div class="mv">${parseFloat(d.prev_close).toFixed(2)}</div></div>`;
    html += `<div class="meta-item"><div class="ml">跳空幅度</div><div class="mv ${gapCls}">${sign}${parseFloat(d.gap_pct).toFixed(2)}%</div></div>`;
    html += `<div class="meta-item"><div class="ml">竞价量</div><div class="mv">${fmtVol(d.auction_volume)}</div></div>`;
    html += '</div>';

    if (d.first_5_min && d.first_5_min.length > 0) {
      html += '<div style="margin-top:6px;font-size:11px;color:var(--muted)">开盘5分钟: ';
      d.first_5_min.forEach((p, i) => {
        if (i > 0) html += ' | ';
        html += `${p.time} ${parseFloat(p.price).toFixed(2)}`;
      });
      html += '</div>';
    }

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px">竞价数据加载失败</div>';
  }
}
