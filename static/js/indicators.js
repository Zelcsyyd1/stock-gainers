const indicatorInput = document.getElementById('indicator-input');
const indicatorBtn = document.getElementById('indicator-btn');
const indicatorResult = document.getElementById('indicator-result');

function indicatorCard(label, value, note = '', cls = '') {
  return `<div class="indicator-card">
    <div class="indicator-label">${label}</div>
    <div class="indicator-value ${cls}">${value}</div>
    ${note ? `<div class="indicator-note">${note}</div>` : ''}
  </div>`;
}

async function queryIndicators() {
  const q = indicatorInput.value.trim();
  if (!q) {
    indicatorResult.style.display = 'block';
    indicatorResult.innerHTML = '<div class="indicator-note">请输入股票代码或名称。</div>';
    return;
  }
  indicatorBtn.disabled = true;
  indicatorBtn.textContent = '查询中...';
  indicatorResult.style.display = 'block';
  indicatorResult.innerHTML = '<div class="chart-loading"><div class="spinner"></div><div>正在计算指标...</div></div>';

  try {
    const res = await fetch(`/api/indicators?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '查询失败');
    renderIndicatorResult(json.data);
  } catch (e) {
    indicatorResult.innerHTML = `<div class="indicator-note" style="color:var(--red)">查询失败：${e.message}</div>`;
  } finally {
    indicatorBtn.disabled = false;
    indicatorBtn.textContent = '查询指标';
  }
}

function renderIndicatorResult(data) {
  const q = data.quote;
  const ma = data.moving_average;
  const t = data.trend;
  const a = data.activity;
  const c = data.capital;
  const v = data.valuation;
  const s = data.strength;
  const risk = data.risk;
  const pctCls = parseFloat(q.change_pct) > 0 ? 'up' : parseFloat(q.change_pct) < 0 ? 'down' : 'flat';
  const riskTags = risk.items.length
    ? risk.items.map(x => `<span class="risk-tag">${x}</span>`).join('')
    : '<span class="risk-tag low">暂无明显风险提示</span>';

  indicatorResult.innerHTML = `
    <div class="indicator-head">
      <div>
        <div class="indicator-title">${escapeHtml(q.name)} <span style="color:var(--muted);font-size:13px">${escapeHtml(q.code)}</span></div>
        <div class="indicator-sub">更新时间：${data.updated_at}</div>
      </div>
      <button class="cmp-btn" onclick="openChart('${escapeHtml(q.code)}','${escapeHtml(q.name)}',${q.price},${q.change_pct})">打开K线</button>
    </div>
    <div class="indicator-grid">
      ${indicatorCard('趋势判断', `${t.label} / ${t.score}分`, `站上MA5：${t.above_ma5 ? '是' : '否'}，站上MA20：${t.above_ma20 ? '是' : '否'}`)}
      ${indicatorCard('今日强度', fmtPct(q.change_pct), `30日涨停 ${s.limit_count_30} 次，连续涨停 ${s.consecutive_limit} 天`, pctCls)}
      ${indicatorCard('现价 / 20日高点', `${fmt(q.price)} / ${fmt(t.high20)}`, `近5日涨幅 ${fmtPct(t.gain5)}`)}
      ${indicatorCard('均线 MA5 / MA10', `${fmt(ma.ma5)} / ${fmt(ma.ma10)}`, `MA20 ${fmt(ma.ma20)}，MA60 ${fmt(ma.ma60)}`)}
      ${indicatorCard('量比 / 换手率', `${fmt(a.volume_ratio)} / ${fmt(a.turnover_rate)}%`, `5日均量 ${Math.round(a.avg_volume_5 || 0).toLocaleString('zh-CN')}`)}
      ${indicatorCard('主力资金', fmtBigMoney(c.net_inflow), `流入占比 ${fmtPct(c.inflow_pct)}`, c.net_inflow > 0 ? 'up' : c.net_inflow < 0 ? 'down' : '')}
      ${indicatorCard('市值 / PE', `${fmtCap(v.market_cap)} / ${fmt(v.pe)}`, '市值过小或PE异常时需提高风险权重')}
      ${indicatorCard('风险等级', risk.level, `共 ${risk.items.length} 条提示`, risk.level === '偏高' ? 'down' : risk.level === '较低' ? 'up' : '')}
    </div>
    <div class="risk-list">${riskTags}</div>
  `;
}

indicatorBtn.addEventListener('click', queryIndicators);
indicatorInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') queryIndicators();
});
