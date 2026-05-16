async function fetchAndRenderSectorLink(code) {
  const container = document.getElementById('sector-link-section');
  if (!container) return;
  container.style.display = '';
  container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--muted);font-size:12px">加载板块联动...</div>';

  try {
    const res = await fetch(`/api/stock-sectors/${code}`);
    const json = await res.json();
    if (!json.success || !json.data || !json.data.length) {
      container.innerHTML = '<div style="text-align:center;padding:8px;color:var(--muted);font-size:12px">暂无板块数据</div>';
      return;
    }

    let html = '<div style="font-size:12px;font-weight:600;margin-bottom:8px">板块联动</div>';

    json.data.forEach(sector => {
      html += `<div style="margin-bottom:10px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px">`;
      html += `<div style="font-size:12px;font-weight:600;margin-bottom:6px">${escapeHtml(sector.board_name)}</div>`;

      if (sector.stocks && sector.stocks.length > 0) {
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:4px">';
        sector.stocks.slice(0, 5).forEach(s => {
          const pct = parseFloat(s.change_pct);
          const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
          const sign = pct > 0 ? '+' : '';
          html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:11px;background:var(--surface)" onclick="openChart('${escapeHtml(s.code)}','${escapeHtml(s.name)}',${s.price},${s.change_pct})">`;
          html += `<span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(s.name)}</span>`;
          html += `<span class="${cls}" style="font-weight:700;white-space:nowrap">${sign}${pct.toFixed(2)}%</span>`;
          html += '</div>';
        });
        html += '</div>';
      } else {
        html += '<div style="font-size:11px;color:var(--muted)">暂无同板块股票数据</div>';
      }
      html += '</div>';
    });

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px">板块联动加载失败</div>';
  }
}
