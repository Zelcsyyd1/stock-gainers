async function fetchAndRenderMoneyFlow(code) {
  const container = document.getElementById('money-flow-section');
  if (!container) return;
  container.style.display = '';
  container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--muted);font-size:12px">加载资金流向...</div>';

  try {
    const res = await fetch(`/api/money-flow/${code}`);
    const json = await res.json();
    if (!json.success || !json.data) {
      container.innerHTML = '<div style="text-align:center;padding:8px;color:var(--muted);font-size:12px">暂无资金流向数据</div>';
      return;
    }
    const d = json.data;
    const items = [
      { label: '超大单', net: d.super_large_net, pct: d.super_large_pct },
      { label: '大单', net: d.large_net, pct: d.large_pct },
      { label: '中单', net: d.medium_net, pct: d.medium_pct },
      { label: '小单', net: d.small_net, pct: d.small_pct },
    ];

    // Calculate total absolute for stacked bar
    const totalAbs = items.reduce((s, i) => s + Math.abs(i.net), 0) || 1;

    let barHtml = '<div style="display:flex;height:18px;border-radius:4px;overflow:hidden;gap:1px">';
    items.forEach(item => {
      const width = (Math.abs(item.net) / totalAbs * 100).toFixed(1);
      const color = item.net >= 0 ? 'var(--red)' : 'var(--green)';
      const opacity = item.net >= 0 ? '0.7' : '0.7';
      barHtml += `<div style="width:${width}%;background:${color};opacity:${opacity}" title="${item.label}: ${fmtBigMoney(item.net)}"></div>`;
    });
    barHtml += '</div>';

    let detailHtml = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px">';
    items.forEach(item => {
      const cls = item.net > 0 ? 'up' : item.net < 0 ? 'down' : 'flat';
      detailHtml += `<div style="text-align:center">
        <div style="font-size:11px;color:var(--muted)">${item.label}</div>
        <div style="font-size:13px;font-weight:700" class="${cls}">${fmtBigMoney(item.net)}</div>
        <div style="font-size:10px;color:var(--muted)">${parseFloat(item.pct).toFixed(1)}%</div>
      </div>`;
    });
    detailHtml += '</div>';

    const mainCls = d.main_net > 0 ? 'up' : d.main_net < 0 ? 'down' : 'flat';
    container.innerHTML = `
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:8px">
        资金流向
        <span class="${mainCls}" style="font-size:13px;font-weight:700">主力净流入 ${fmtBigMoney(d.main_net)}</span>
      </div>
      ${barHtml}
      ${detailHtml}
    `;
  } catch (e) {
    container.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px">资金流向加载失败</div>';
  }
}
