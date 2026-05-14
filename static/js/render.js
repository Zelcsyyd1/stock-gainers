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
    const pctCls = isLimitUp(s.change_pct) ? 'change-pct limit-up' : `change-pct ${pc}`;
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
    return `<tr>
      <td><button class="star-btn ${starred?'starred':''}" data-code="${escapeHtml(s.code)}" data-name="${escapeHtml(s.name)}" onclick="toggleStar('${escapeHtml(s.code)}','${escapeHtml(s.name)}')">${starred?'★':'☆'}</button></td>
      <td><button class="cmp-btn ${inCmp?'in-compare':''}" onclick="toggleCompare(${JSON.stringify(s).replace(/"/g,'&quot;')})" title="加入对比">${inCmp?'✓比':'+ 比'}</button></td>
      <td style="color:var(--muted);font-size:11px">${globalIdx}</td>
      <td style="cursor:pointer" onclick="openChart('${escapeHtml(s.code)}','${escapeHtml(s.name)}',${s.price},${s.change_pct})"><div class="stock-name">${escapeHtml(s.name)}${mkt}</div><div class="stock-code">${escapeHtml(s.code)}</div></td>
      <td><span class="${pctCls}">${isLimitUp(s.change_pct)?'涨停 ':''}${fmt(s.change_pct)}%</span></td>
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
    const pctCls = isLimitUp(s.change_pct)?'change-pct limit-up':`change-pct ${pc}`;
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

function renderStats() {
  const data = currentListData();
  const valid = data.filter(s=>!isNaN(parseFloat(s.change_pct)));
  document.getElementById('stat-total').textContent = isScreenMode ? `${screenCandidates.filter(s=>s.pass).length}/${screenCandidates.length}` : valid.length;
  if (!valid.length) {
    document.getElementById('dist-bar-wrap').style.display='none';
    document.getElementById('stat-turnover').textContent = '--';
    document.getElementById('stat-inflow').textContent = '--';
    document.getElementById('stat-inflow').className = 'value';
    return;
  }
  const maxPct  = Math.max(...valid.map(s=>parseFloat(s.change_pct)||0));
  const limits  = valid.filter(s=>parseFloat(s.change_pct)>=9.9).length;
  const upCount = valid.filter(s=>parseFloat(s.change_pct)>0).length;
  const dnCount = valid.filter(s=>parseFloat(s.change_pct)<0).length;
  const avg = valid.reduce((a,s)=>a+(parseFloat(s.change_pct)||0),0)/valid.length;
  const turnover = valid.reduce((a,s)=>a+(parseFloat(s.turnover)||0),0);
  const netInflow = valid.reduce((a,s)=>a+(parseFloat(s.net_inflow)||0),0);
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
