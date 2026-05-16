function currentListData() {
  if (isScreenMode) return screenCandidates;
  if (isSearchMode) return searchResults;
  return getFilteredData();
}

function renderNormalTable() {
  document.getElementById('thead-normal').style.display = '';
  document.getElementById('thead-screen').style.display = 'none';
  const baseData = currentListData();
  const sorted = sortedData(baseData);
  hideAll();
  if (!sorted.length) { showEmpty(isWatchlistMode ? '自选股为空，从涨势榜点 ☆ 添加' : '暂无数据'); return; }
  showTable();

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (page > totalPages) page = totalPages;
  const pageData = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  document.getElementById('tbody').innerHTML = pageData.map((s,i) => {
    const pc = pctClass(s.change_pct);
    const pctCls = isLimitUp(s.change_pct, s.code) ? 'change-pct limit-up' : `change-pct ${pc}`;
    const mkt = s.market==='SH' ? '<span class="badge badge-sh">沪</span>' : '<span class="badge badge-sz">深</span>';
    const starred = isStarred(s.code);
    const capV = parseFloat(s.market_cap), vrV = parseFloat(s.volume_ratio), trV = parseFloat(s.turnover_rate);
    const capC = capV>0&&capV<20e9 ? 'style="color:var(--green)"' : '';
    const vrC  = vrV>1             ? 'style="color:var(--gold)"'  : '';
    const trC  = trV>=5&&trV<=10   ? 'style="color:var(--gold)"'  : '';
    const globalIdx = (page-1)*PAGE_SIZE + i + 1;
    const inCmp = compareList.some(c=>c.code===s.code);
    const inflowV = parseFloat(s.net_inflow)||0;
    const inflowC = inflowV>0?'style="color:var(--red)"':inflowV<0?'style="color:var(--green)"':'style="color:var(--muted)"';
    return `<tr class="${classifyHeatRow(s)}">
      <td><button class="star-btn ${starred?'starred':''}" data-code="${escapeHtml(s.code)}" data-name="${escapeHtml(s.name)}" onclick="toggleStar('${escapeHtml(s.code)}','${escapeHtml(s.name)}')">${starred?'★':'☆'}</button></td>
      <td><button class="cmp-btn ${inCmp?'in-compare':''}" onclick="toggleCompare(${JSON.stringify(s).replace(/"/g,'&quot;')})" title="加入对比">${inCmp?'✓比':'+ 比'}</button></td>
      <td style="color:var(--muted);font-size:11px">${globalIdx}</td>
      <td style="cursor:pointer" onclick="openStockDrawer(${JSON.stringify(s).replace(/"/g,'&quot;')})"><div class="stock-name">${escapeHtml(s.name)}${mkt}</div><div class="stock-code">${escapeHtml(s.code)}</div></td>
      <td><span class="${pctCls}">${isLimitUp(s.change_pct, s.code)?'涨停 ':''}${fmt(s.change_pct)}%</span></td>
      <td class="${pc}">${fmt(s.price)}</td>
      <td class="${pc}">${parseFloat(s.change)>0?'+':''}${fmt(s.change)}</td>
      <td ${vrC}>${fmt(s.volume_ratio)}</td>
      <td ${trC}>${fmt(s.turnover_rate)}%</td>
      <td ${capC}>${fmtCap(s.market_cap)}</td>
      <td>${fmt(s.open)}</td>
      <td class="up">${fmt(s.high)}</td>
      <td class="down">${fmt(s.low)}</td>
      <td style="color:var(--muted)">${fmtAmp(s)}</td>
      <td style="color:var(--muted)">${fmtMoney(s.turnover)}</td>
      <td ${inflowC}>${fmtMoney(s.net_inflow)}</td>
      <td style="color:var(--muted)">${fmt(s.pe)}</td>
    </tr>`;
  }).join('');

  document.querySelectorAll('#thead-normal th[data-col]').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    if (th.dataset.col===sortCol) th.classList.add(sortDir==='asc'?'sort-asc':'sort-desc');
  });
  document.getElementById('page-num').textContent = `${page} / ${totalPages}`;
  document.getElementById('prev-btn').disabled = page <= 1;
  document.getElementById('next-btn').disabled = page >= totalPages;
  document.getElementById('pagination').style.display = 'flex';
}

function renderScreenTable(candidates) {
  document.getElementById('thead-normal').style.display = 'none';
  document.getElementById('thead-screen').style.display = '';
  hideAll();
  if (!candidates||!candidates.length) { showEmpty('无符合条件的股票'); return; }
  showTable();
  document.getElementById('pagination').style.display = 'none';

  const sorted = [...candidates].sort((a,b) => {
    if (a.pass!==b.pass) return a.pass?-1:1;
    return (parseFloat(b.change_pct)||0)-(parseFloat(a.change_pct)||0);
  });

  document.getElementById('tbody').innerHTML = sorted.map((s,i) => {
    const pc = pctClass(s.change_pct);
    const pctCls = isLimitUp(s.change_pct, s.code)?'change-pct limit-up':`change-pct ${pc}`;
    const mkt = s.market==='SH'?'<span class="badge badge-sh">沪</span>':'<span class="badge badge-sz">深</span>';
    const starred = isStarred(s.code);
    const limitCell = s.had_limit_up===false ? '<span class="check-fail">✗</span>' : s.had_limit_up ? '<span class="check-pass">✓</span>' : '<span class="check-skip">-</span>';
    const intradayCell = (s.fail_reason && s.had_limit_up!==false)
      ? `<span class="check-fail" style="font-size:11px">✗ ${s.fail_reason}</span>`
      : s.pass ? '<span class="check-pass">✓</span>' : '<span class="check-skip">-</span>';
    const result = s.pass
      ? '<b class="check-pass" style="font-size:14px">✓ 通过</b>'
      : `<span class="check-fail" style="font-size:11px">${s.fail_reason||'✗'}</span>`;
    return `<tr class="${s.pass?'pass-row':'fail-row'}">
      <td><button class="star-btn ${starred?'starred':''}" data-code="${escapeHtml(s.code)}" data-name="${escapeHtml(s.name)}" onclick="toggleStar('${escapeHtml(s.code)}','${escapeHtml(s.name)}')">${starred?'★':'☆'}</button></td>
      <td style="color:var(--muted);font-size:11px">${i+1}</td>
      <td><div class="stock-name">${escapeHtml(s.name)}${mkt}</div><div class="stock-code">${escapeHtml(s.code)}</div></td>
      <td><span class="${pctCls}">${fmt(s.change_pct)}%</span></td>
      <td class="${pc}">${fmt(s.price)}</td>
      <td style="color:var(--gold)">${fmt(s.volume_ratio)}</td>
      <td style="color:var(--gold)">${fmt(s.turnover_rate)}%</td>
      <td style="color:var(--green)">${fmtCap(s.market_cap)}</td>
      <td style="text-align:center">${limitCell}</td>
      <td style="text-align:left">${intradayCell}</td>
      <td>${result}</td>
    </tr>`;
  }).join('');
}

function classifyHeatRow(s) {
  const pct = parseFloat(s.change_pct) || 0;
  const vr = parseFloat(s.volume_ratio) || 0;
  const tr = parseFloat(s.turnover_rate) || 0;
  if (isLimitUp(pct, s.code)) return 'row-limit';
  if (pct >= 7 || vr >= 2.5 || tr >= 8) return 'row-heat';
  return '';
}

function pressureEventClass(type, pct) {
  if (['limit_up','rapid_rise','money_inflow','sector_heat'].includes(type)) return 'hot';
  if (['broken_limit','volume_spike'].includes(type)) return 'warn';
  if (['rapid_fall','money_outflow'].includes(type) || pct < 0) return 'down';
  return '';
}

function pressureEventLabel(e) {
  if (e.message) return e.message;
  const labels = {
    limit_up: '封板',
    broken_limit: '炸板',
    rapid_rise: '急拉',
    rapid_fall: '跳水',
    volume_spike: '放量',
    money_inflow: '流入',
    money_outflow: '流出',
    sector_heat: '板块热',
  };
  return labels[e.type] || '异动';
}

function eventTimeText(ts, offset = 0) {
  const d = ts ? new Date(ts) : new Date(Date.now() - offset * 46000);
  if (isNaN(d.getTime())) return '--:--:--';
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(v => String(v).padStart(2, '0'))
    .join(':');
}

function renderPressureTape(valid) {
  const tapeEl = document.getElementById('tape-list');
  const tapeCountEl = document.getElementById('tape-count');
  if (!tapeEl || !tapeCountEl) return;

  if (marketEvents.length) {
    const filtered = activeEventFilter === 'all'
      ? marketEvents
      : marketEvents.filter(e => e.type === activeEventFilter);
    const events = filtered.slice(0, 8);
    tapeCountEl.textContent = `${events.length}条`;
    if (!events.length) {
      tapeEl.innerHTML = '<div class="tape-empty">当前类型暂无异动</div>';
      return;
    }
    tapeEl.innerHTML = events.map((e, i) => {
      const pct = parseFloat(e.change_pct) || 0;
      const cls = pressureEventClass(e.type, pct);
      const signal = pressureEventLabel(e);
      return `<div class="tape-item ${cls}">
        <span class="tape-time">${eventTimeText(e.ts, i)}</span>
        <span class="tape-name">${escapeHtml(e.name || '--')} <small>${escapeHtml(e.code || '')}</small></span>
        <span class="tape-signal">${escapeHtml(signal)} ${fmtPct(pct)}</span>
      </div>`;
    }).join('');
    return;
  }

  let top = [...valid]
    .sort((a,b) => {
      const aScore = (parseFloat(a.change_pct)||0) * 10 + (parseFloat(a.volume_ratio)||0) * 4 + (parseFloat(a.turnover_rate)||0);
      const bScore = (parseFloat(b.change_pct)||0) * 10 + (parseFloat(b.volume_ratio)||0) * 4 + (parseFloat(b.turnover_rate)||0);
      return bScore - aScore;
    });
  if (activeEventFilter === 'limit_up') top = top.filter(s => isLimitUp(s.change_pct, s.code));
  if (activeEventFilter === 'rapid_rise') top = top.filter(s => (parseFloat(s.change_pct)||0) >= 7);
  if (activeEventFilter === 'rapid_fall') top = top.filter(s => (parseFloat(s.change_pct)||0) <= -2);
  if (activeEventFilter === 'volume_spike') top = top.filter(s => (parseFloat(s.volume_ratio)||0) >= 2);
  if (activeEventFilter === 'broken_limit') top = [];
  top = top.slice(0, 8);
  tapeCountEl.textContent = `${top.length}条`;
  if (!top.length) {
    tapeEl.innerHTML = '<div class="tape-empty">当前类型暂无异动</div>';
    return;
  }
  tapeEl.innerHTML = top.map((s, i) => {
    const pct = parseFloat(s.change_pct) || 0;
    const vr = parseFloat(s.volume_ratio) || 0;
    const tr = parseFloat(s.turnover_rate) || 0;
    const lu = isLimitUp(pct, s.code);
    const type = lu ? 'hot' : pct >= 7 ? 'warn' : pct < 0 ? 'down' : '';
    const signal = lu ? '封板' : pct >= 7 ? '冲板' : vr >= 2 ? '放量' : tr >= 8 ? '换手' : '异动';
    return `<div class="tape-item ${type}">
      <span class="tape-time">${eventTimeText(null, i)}</span>
      <span class="tape-name">${escapeHtml(s.name)} <small>${escapeHtml(s.code)}</small></span>
      <span class="tape-signal">${signal} ${fmtPct(pct)}</span>
    </div>`;
  }).join('');
}

function renderLimitupLadder(valid) {
  const panel = document.getElementById('ladder-panel');
  const grid = document.getElementById('ladder-grid');
  const summary = document.getElementById('ladder-summary');
  if (!panel || !grid || !summary) return;
  const limits = valid
    .filter(s => isLimitUp(s.change_pct, s.code))
    .sort((a,b) => (parseFloat(b.turnover)||0) - (parseFloat(a.turnover)||0));
  summary.textContent = limits.length ? `前端候选 ${limits.length} 只，等待后端连板层级` : '暂无涨停候选';
  const hot = limits.slice(0, 12);
  const near = valid
    .filter(s => !isLimitUp(s.change_pct, s.code) && (parseFloat(s.change_pct)||0) >= 8)
    .sort((a,b) => (parseFloat(b.change_pct)||0) - (parseFloat(a.change_pct)||0))
    .slice(0, 8);
  const strong = valid
    .filter(s => (parseFloat(s.change_pct)||0) >= 5 && (parseFloat(s.volume_ratio)||0) >= 2)
    .sort((a,b) => (parseFloat(b.volume_ratio)||0) - (parseFloat(a.volume_ratio)||0))
    .slice(0, 8);
  const cols = [
    { title:'涨停候选', data:hot },
    { title:'冲板区间', data:near },
    { title:'放量强势', data:strong },
  ];
  grid.innerHTML = cols.map(col => `<div class="ladder-col">
    <div class="ladder-col-title"><span>${col.title}</span><b>${col.data.length}</b></div>
    ${col.data.length ? col.data.map(s => `<div class="ladder-stock" onclick="openStockDrawer(${JSON.stringify(s).replace(/"/g,'&quot;')})">
      <span class="ladder-name">${escapeHtml(s.name)} <small>${escapeHtml(s.code)}</small></span>
      <span class="ladder-pct">${fmtPct(s.change_pct)}</span>
    </div>`).join('') : '<div class="tape-empty" style="padding:12px 0">暂无</div>'}
  </div>`).join('');
}

function metricCard(label, value, cls = '') {
  return `<div class="drawer-metric"><span>${label}</span><strong class="${cls}">${value}</strong></div>`;
}

function stockRiskTags(s) {
  const tags = [];
  const pct = parseFloat(s.change_pct) || 0;
  const vr = parseFloat(s.volume_ratio) || 0;
  const tr = parseFloat(s.turnover_rate) || 0;
  const amp = parseFloat(fmtAmp(s)) || 0;
  if (isLimitUp(pct, s.code)) tags.push('涨停');
  else if (pct >= 8) tags.push('冲板');
  if (vr >= 2.5) tags.push('明显放量');
  if (tr >= 10) tags.push('高换手');
  if (amp >= 8) tags.push('大振幅');
  if (pct < 0) tags.push('弱势回落');
  if ((parseFloat(s.net_inflow)||0) > 0) tags.push('主力流入');
  if (!tags.length) tags.push('观察中');
  return tags;
}

function openStockDrawer(s) {
  const drawer = document.getElementById('stock-drawer');
  const mask = document.getElementById('stock-drawer-mask');
  if (!drawer || !mask) return;
  const pct = parseFloat(s.change_pct) || 0;
  const pc = pctClass(pct);
  document.getElementById('drawer-name').textContent = s.name || '--';
  document.getElementById('drawer-code').textContent = s.code || '--';
  document.getElementById('stock-drawer-grid').innerHTML = [
    metricCard('涨跌幅', fmtPct(pct), pc),
    metricCard('现价', fmt(s.price), pc),
    metricCard('量比', fmt(s.volume_ratio), (parseFloat(s.volume_ratio)||0) >= 2 ? 'up' : ''),
    metricCard('换手', `${fmt(s.turnover_rate)}%`, (parseFloat(s.turnover_rate)||0) >= 8 ? 'up' : ''),
    metricCard('市值', fmtCap(s.market_cap)),
    metricCard('主力净流入', fmtBigMoney(s.net_inflow), (parseFloat(s.net_inflow)||0) > 0 ? 'up' : (parseFloat(s.net_inflow)||0) < 0 ? 'down' : ''),
    metricCard('振幅', fmtAmp(s)),
    metricCard('市盈率', fmt(s.pe)),
  ].join('');
  document.getElementById('drawer-tags').innerHTML = stockRiskTags(s).map(t => `<span class="drawer-tag">${escapeHtml(t)}</span>`).join('');
  document.getElementById('drawer-sector-note').textContent =
    `当前前端使用榜单数据生成观察项。后端 /api/stock-detail/${s.code} 接入后，这里会展示板块、30日涨停史、同板块龙头和更完整风险标签。`;
  document.getElementById('drawer-chart-btn').onclick = () => openChart(s.code, s.name, s.price, s.change_pct);
  document.getElementById('drawer-watch-btn').onclick = () => toggleStar(s.code, s.name);
  mask.classList.add('open');
  drawer.classList.add('open');
}

function closeStockDrawer() {
  document.getElementById('stock-drawer')?.classList.remove('open');
  document.getElementById('stock-drawer-mask')?.classList.remove('open');
}

function renderPressureHotspots() {
  const el = document.getElementById('hotspot-strip');
  if (!el) return;
  if (!marketHotspots.length) {
    el.innerHTML = '<div class="hotspot-empty">等待板块热区</div>';
    return;
  }
  el.innerHTML = marketHotspots.slice(0, 6).map(h => {
    const pct = parseFloat(h.change_pct) || 0;
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    const leaderPct = h.leader_change_pct !== undefined ? ` ${fmtPct(h.leader_change_pct)}` : '';
    const leader = h.leader_name ? `龙头 ${h.leader_name}${leaderPct}` : `${h.up_count || 0}涨 / ${h.down_count || 0}跌`;
    return `<div class="hotspot-chip">
      <span class="hotspot-name" title="${escapeHtml(h.name || '')}">${escapeHtml(h.name || '--')}</span>
      <span class="hotspot-pct ${cls}">${fmtPct(pct)}</span>
      <span class="hotspot-leader">${escapeHtml(leader)}</span>
    </div>`;
  }).join('');
}

function updatePressureDeck(valid, metrics) {
  const deck = document.getElementById('pressure-deck');
  if (!deck) return;
  const stateEl = document.getElementById('pressure-state');
  const fillEl = document.getElementById('pressure-meter-fill');
  const textEl = document.getElementById('pressure-meter-text');
  const limitEl = document.getElementById('pressure-limit');
  const strongEl = document.getElementById('pressure-strong');
  const riskEl = document.getElementById('pressure-risk');
  const tapeEl = document.getElementById('tape-list');
  const tapeCountEl = document.getElementById('tape-count');

  if (!valid.length) {
    stateEl.textContent = '等待行情';
    fillEl.style.width = '50%';
    textEl.textContent = '--';
    limitEl.textContent = '--';
    strongEl.textContent = '--';
    riskEl.textContent = '--';
    tapeCountEl.textContent = '--';
    tapeEl.innerHTML = '<div class="tape-empty">等待行情刷新</div>';
    renderPressureHotspots();
    return;
  }

  const hasOverviewScore = marketOverview.sentiment_score !== undefined;
  const score = hasOverviewScore ? Math.max(0, Math.min(100, Math.round(parseFloat(marketOverview.sentiment_score) || 0))) : Math.max(0, Math.min(100, Math.round(
    45 + metrics.avg * 5 + metrics.limitCount * 1.8 + metrics.strongCount * .7 - metrics.riskCount * 1.1
  )));
  const state = marketOverview.market_sentiment || (score >= 76 ? '抢筹升温' : score >= 58 ? '多头压制' : score >= 42 ? '分歧震荡' : '风险释放');
  const limitCount = marketOverview.limit_up_count ?? metrics.limitCount;
  const upCount = marketOverview.up_count ?? metrics.upCount;
  const dnCount = marketOverview.down_count ?? metrics.dnCount;
  const riskCount = marketOverview.broken_limit_count ?? marketOverview.limit_down_count ?? metrics.riskCount;
  stateEl.textContent = state;
  stateEl.className = 'pressure-state ' + (score >= 70 ? 'hot' : score < 42 ? 'calm' : '');
  fillEl.style.width = score + '%';
  textEl.textContent = `${score}/100  ${upCount}涨 / ${dnCount}跌`;
  limitEl.textContent = limitCount;
  strongEl.textContent = metrics.strongCount;
  riskEl.textContent = riskCount;
  limitEl.closest('.pressure-tile').className = 'pressure-tile ' + (limitCount >= 10 ? 'hot' : '');
  strongEl.closest('.pressure-tile').className = 'pressure-tile ' + (metrics.strongCount >= 20 ? 'hot' : '');
  riskEl.closest('.pressure-tile').className = 'pressure-tile ' + (riskCount >= 20 ? 'warn' : 'calm');
  renderPressureTape(valid);
  renderPressureHotspots();
}

function renderStats() {
  const data = currentListData();
  const valid = data.filter(s=>!isNaN(parseFloat(s.change_pct)));
  document.getElementById('stat-total').textContent = isScreenMode ? `${screenCandidates.filter(s=>s.pass).length}/${screenCandidates.length}` : valid.length;
  if (!valid.length) {
    document.getElementById('dist-bar-wrap').style.display='none';
    document.getElementById('stat-turnover').textContent = '--';
    document.getElementById('stat-inflow').textContent = '--';
    document.getElementById('stat-inflow').className = 'value';
    updatePressureDeck([], {});
    return;
  }
  const maxPct  = Math.max(...valid.map(s=>parseFloat(s.change_pct)||0));
  const limits  = valid.filter(s=>parseFloat(s.change_pct)>=9.9).length;
  const upCount = valid.filter(s=>parseFloat(s.change_pct)>0).length;
  const dnCount = valid.filter(s=>parseFloat(s.change_pct)<0).length;
  const strongCount = valid.filter(s=>(parseFloat(s.change_pct)||0)>=5).length;
  const riskCount = valid.filter(s=>(parseFloat(s.change_pct)||0)<=-2).length;
  const avg = valid.reduce((a,s)=>a+(parseFloat(s.change_pct)||0),0)/valid.length;
  const turnover = valid.reduce((a,s)=>a+(parseFloat(s.turnover)||0),0);
  const netInflow = valid.reduce((a,s)=>a+(parseFloat(s.net_inflow)||0),0);
  updatePressureDeck(valid, { avg, limitCount: limits, strongCount, riskCount, upCount, dnCount });
  renderLimitupLadder(valid);
  document.getElementById('stat-max').textContent = maxPct.toFixed(2)+'%';
  document.getElementById('stat-limit').textContent = limits;
  const ratioEl = document.getElementById('stat-ratio');
  ratioEl.innerHTML = `<span class="up">${upCount}</span><span style="color:var(--muted)"> / </span><span class="down">${dnCount}</span>`;
  ratioEl.className = 'value';
  const el = document.getElementById('stat-avg');
  el.textContent = (avg>=0?'+':'')+avg.toFixed(2)+'%';
  el.className = 'value '+(avg>0?'up':avg<0?'down':'flat');
  document.getElementById('stat-turnover').textContent = fmtMoney(turnover);
  const inflowEl = document.getElementById('stat-inflow');
  inflowEl.textContent = fmtBigMoney(netInflow);
  inflowEl.className = 'value '+(netInflow>0?'up':netInflow<0?'down':'flat');

  // 涨幅分布条
  if (!isScreenMode) {
    const buckets = [
      { label:'跌停',  color:'#05a662', min:-99, max:-9.9 },
      { label:'大跌',  color:'#12b86e', min:-9.9,max:-5   },
      { label:'下跌',  color:'#3fcf93', min:-5,  max:-2   },
      { label:'微跌',  color:'#6be0b8', min:-2,  max:0    },
      { label:'微涨',  color:'#f08080', min:0,   max:2    },
      { label:'上涨',  color:'#f04d4d', min:2,   max:5    },
      { label:'大涨',  color:'#e02020', min:5,   max:9.9  },
      { label:'涨停',  color:'#cc0000', min:9.9, max:99   },
    ];
    const counts = buckets.map(b => valid.filter(s=>{ const v=parseFloat(s.change_pct); return v>b.min && v<=b.max; }).length);
    const total = counts.reduce((a,b)=>a+b,0)||1;
    const barEl = document.getElementById('dist-bar');
    const detailEl = document.getElementById('dist-detail');
    barEl.innerHTML = buckets.map((b,i)=>counts[i]>0
      ? `<div class="dist-seg" style="flex:${counts[i]};background:${b.color}" title="${b.label} ${counts[i]}只"></div>`
      : ''
    ).join('');
    detailEl.innerHTML = buckets.map((b,i)=>counts[i]>0
      ? `<div class="dist-item"><div class="dist-dot" style="background:${b.color}"></div><span style="color:var(--muted)">${b.label}</span> <b style="color:${b.color}">${counts[i]}</b></div>`
      : ''
    ).join('');
    const flatCount = valid.filter(s=>parseFloat(s.change_pct)===0).length;
    document.getElementById('dist-summary').innerHTML =
      `<span class="up">${upCount}涨</span> <span style="color:var(--muted)">${flatCount}平</span> <span class="down">${dnCount}跌</span>`;
    document.getElementById('dist-bar-wrap').style.display = '';
  } else {
    document.getElementById('dist-bar-wrap').style.display = 'none';
  }
}

function hideAll() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('screen-progress').style.display = 'none';
  document.getElementById('empty').style.display = 'none';
  document.getElementById('stock-table').style.display = 'none';
  document.getElementById('pagination').style.display = 'none';
}
function showLoading() {
  hideAll(); document.getElementById('loading').style.display = '';
}
function showEmpty(msg) {
  hideAll();
  const el = document.getElementById('empty');
  el.textContent = msg; el.style.display = '';
}
function showScreenProgress() {
  hideAll(); document.getElementById('screen-progress').style.display = '';
}
function showTable() {
  document.getElementById('stock-table').style.display = '';
}
