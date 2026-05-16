async function openChart(code, name, price, pct) {
  chartData = null; chartTab = 'kline';
  currentKlt = 101; chartKltCache = {}; chartCurrentCode = code;
  document.getElementById('chart-overlay').style.display = 'flex';
  document.getElementById('klt-tabs').style.display = 'flex';
  document.querySelectorAll('.klt-btn').forEach(b => b.classList.toggle('active', +b.dataset.klt === 101));
  document.getElementById('chart-name').textContent = name;
  document.getElementById('chart-code').textContent = code;
  document.getElementById('chart-consecutive').innerHTML = '';
  const priceEl = document.getElementById('chart-price');
  const pctEl   = document.getElementById('chart-pct');
  const pc = parseFloat(pct);
  priceEl.textContent = parseFloat(price).toFixed(2);
  priceEl.className = 'chart-price ' + (pc>0?'up':pc<0?'down':'flat');
  pctEl.textContent  = (pc>0?'+':'')+pc.toFixed(2)+'%';
  pctEl.className    = 'chart-pct change-pct ' + (pc>=9.9?'limit-up':pc>0?'up':pc<0?'down':'flat');
  document.getElementById('chart-meta').innerHTML = '';
  // Ensure extra sections exist
  let mfSection = document.getElementById('money-flow-section');
  if (!mfSection) {
    mfSection = document.createElement('div');
    mfSection.id = 'money-flow-section';
    mfSection.style.cssText = 'margin-bottom:10px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px';
    document.getElementById('chart-meta').parentNode.insertBefore(mfSection, document.getElementById('chart-svg-wrap'));
  }
  mfSection.style.display = 'none';
  mfSection.innerHTML = '';

  let auctionSection = document.getElementById('auction-section');
  if (!auctionSection) {
    auctionSection = document.createElement('div');
    auctionSection.id = 'auction-section';
    auctionSection.style.cssText = 'margin-bottom:10px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px';
    document.getElementById('chart-meta').parentNode.insertBefore(auctionSection, mfSection);
  }
  auctionSection.style.display = 'none';
  auctionSection.innerHTML = '';

  let slSection = document.getElementById('sector-link-section');
  if (!slSection) {
    slSection = document.createElement('div');
    slSection.id = 'sector-link-section';
    slSection.style.cssText = 'margin-top:10px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px';
    const chartBody = document.querySelector('#chart-modal .chart-body');
    chartBody.appendChild(slSection);
  }
  slSection.style.display = 'none';
  slSection.innerHTML = '';

  // Ensure tech indicator toggles container
  let techToggles = document.getElementById('tech-toggles');
  if (!techToggles) {
    techToggles = document.createElement('div');
    techToggles.id = 'tech-toggles';
    techToggles.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';
    const kltTabs = document.getElementById('klt-tabs');
    kltTabs.parentNode.insertBefore(techToggles, kltTabs.nextSibling);
  }
  techToggles.innerHTML = '';
  techToggles.style.display = 'none';

  document.getElementById('chart-svg-wrap').innerHTML = '<div class="chart-loading"><div class="spinner"></div><div>加载中…</div></div>';
  document.getElementById('tab-kline').classList.add('active');
  document.getElementById('tab-trend').classList.remove('active');

  try {
    const res = await fetch(`/api/chart/${code}`);
    chartData = await res.json();
    if (chartData.consecutive >= 2) {
      document.getElementById('chart-consecutive').innerHTML =
        `<span class="consecutive-badge">${chartData.consecutive}连板</span>`;
    }
    renderChartMeta(code, price, pct);
    renderKlineChart();
    // Load extra data asynchronously
    if (typeof fetchAndRenderMoneyFlow === 'function') fetchAndRenderMoneyFlow(code);
    if (typeof fetchAndRenderAuction === 'function') fetchAndRenderAuction(code);
    if (typeof fetchAndRenderSectorLink === 'function') fetchAndRenderSectorLink(code);
  } catch(e) {
    document.getElementById('chart-svg-wrap').innerHTML = `<div class="chart-loading" style="color:var(--red)">加载失败</div>`;
  }
}

function switchChartTab(tab) {
  chartTab = tab;
  document.getElementById('tab-kline').classList.toggle('active', tab==='kline');
  document.getElementById('tab-trend').classList.toggle('active', tab==='trend');
  document.getElementById('klt-tabs').style.display = tab === 'kline' ? 'flex' : 'none';
  if (!chartData) return;
  tab === 'kline' ? renderKlineChart() : renderTrendChart();
}

// Track which technical overlays are visible
let showBollinger = false, showMACD = true;

function renderChartMeta(code, price, pct) {
  if (!chartData?.klines?.length) return;
  const k = chartData.klines[chartData.klines.length - 1];
  const amp = k.prev_close > 0 ? ((k.high-k.low)/k.prev_close*100).toFixed(2)+'%'
            : k.close > 0 ? ((k.high-k.low)/k.close*100).toFixed(2)+'%' : '--';
  const metaItems = [
    { l:'今开', v: k.open.toFixed(2) },
    { l:'最高', v: k.high.toFixed(2), c:'up' },
    { l:'最低', v: k.low.toFixed(2),  c:'down' },
    { l:'成交量', v: fmtVol(k.volume) },
    { l:'连板数', v: chartData.consecutive > 0 ? chartData.consecutive+'天' : '无' },
  ];

  // Add KDJ/RSI if technicals available
  const tech = chartData?.technicals;
  if (tech) {
    const n = chartData.klines.length - 1;
    if (tech.kdj) {
      metaItems.push({ l:'KDJ', v: `K:${tech.kdj.k[n].toFixed(1)} D:${tech.kdj.d[n].toFixed(1)} J:${tech.kdj.j[n].toFixed(1)}` });
    }
    if (tech.rsi && tech.rsi.rsi6[n] !== null) {
      metaItems.push({ l:'RSI', v: `6:${tech.rsi.rsi6[n].toFixed(1)} 12:${(tech.rsi.rsi12[n]||0).toFixed(1)}` });
    }
  }

  document.getElementById('chart-meta').innerHTML = metaItems
    .map(m=>`<div class="meta-item"><div class="ml">${m.l}</div><div class="mv ${m.c||''}">${m.v}</div></div>`).join('');

  // Show tech toggles only for daily kline
  const techToggles = document.getElementById('tech-toggles');
  if (techToggles && tech && currentKlt === 101) {
    techToggles.style.display = 'flex';
    techToggles.innerHTML = `
      <button class="qf-btn${showBollinger?' active':''}" onclick="showBollinger=!showBollinger;this.classList.toggle('active');renderKlineChart()" style="font-size:11px;padding:3px 10px">BOLL</button>
      <button class="qf-btn${showMACD?' active':''}" onclick="showMACD=!showMACD;this.classList.toggle('active');renderKlineChart()" style="font-size:11px;padding:3px 10px">MACD</button>
    `;
  } else if (techToggles) {
    techToggles.style.display = 'none';
  }
}

function renderKlineChart() {
  const wrap = document.getElementById('chart-svg-wrap');
  const klines = chartData?.klines;
  if (!klines || klines.length < 2) { wrap.innerHTML='<div class="chart-loading">数据不足</div>'; return; }
  const tech = chartData?.technicals;
  const hasMacd = showMACD && tech && tech.macd && currentKlt === 101;
  const MACD_H = hasMacd ? 80 : 0;
  const W=wrap.clientWidth||800, H=300+MACD_H, PL=50, PR=10, PT=10, PB=40, VH=55;
  const cW=W-PL-PR, cH=H-PT-PB-VH-8-MACD_H;
  const n=Math.min(klines.length,60), data=klines.slice(-n);
  const prices=[...data.map(k=>k.high),...data.map(k=>k.low)];
  const pMax=Math.max(...prices), pMin=Math.min(...prices);
  const pRange=pMax-pMin||1;
  const vols=data.map(k=>k.volume), vMax=Math.max(...vols)||1;
  const py=v=>PT+cH-(v-pMin)/pRange*cH;
  const bw=Math.max(2,(cW/n)*0.7), gap=cW/n;

  // 计算均线（基于完整klines，避免头部数据不足）
  function calcMA(arr, period) {
    return arr.map((_, i) => {
      if (i < period - 1) return null;
      return arr.slice(i - period + 1, i + 1).reduce((s, k) => s + k.close, 0) / period;
    });
  }
  const offset = klines.length - n;
  const ma5  = calcMA(klines, 5).slice(offset);
  const ma10 = calcMA(klines, 10).slice(offset);
  const ma20 = calcMA(klines, 20).slice(offset);

  function buildMAPath(maArr) {
    let d = '';
    maArr.forEach((v, i) => {
      if (v === null) return;
      const x = PL + i * gap + gap / 2, y = py(v);
      d += d === '' ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }

  let lines='', candles='', volumes='', xLabels='';
  for(let i=0;i<=4;i++){
    const y=PT+cH*i/4;
    const price=pMax-pRange*i/4;
    lines+=`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#2a2d3e" stroke-width="1"/>`;
    lines+=`<text x="${PL-4}" y="${y+4}" text-anchor="end" fill="#7c8499" font-size="10">${price.toFixed(2)}</text>`;
  }
  data.forEach((k,i)=>{
    const x=PL+i*gap+gap/2;
    const isUp=k.close>=k.open;
    const color=isUp?'#f04d4d':'#12b86e';
    const top=py(Math.max(k.open,k.close)), bot=py(Math.min(k.open,k.close));
    const bodyH=Math.max(1,bot-top);
    candles+=`<line x1="${x}" y1="${py(k.high)}" x2="${x}" y2="${py(k.low)}" stroke="${color}" stroke-width="1"/>`;
    candles+=`<rect x="${x-bw/2}" y="${top}" width="${bw}" height="${bodyH}" fill="${color}"/>`;
    const vh=Math.max(1,(k.volume/vMax)*(VH-4));
    const vy=H-PB-MACD_H-vh;
    volumes+=`<rect x="${x-bw/2}" y="${vy}" width="${bw}" height="${vh}" fill="${isUp?'rgba(240,77,77,.5)':'rgba(18,184,110,.5)'}"/>`;
    if(i%Math.ceil(n/6)===0){
      xLabels+=`<text x="${x}" y="${H-PB+14}" text-anchor="middle" fill="#7c8499" font-size="9">${k.date.slice(5)}</text>`;
    }
  });

  const d5=buildMAPath(ma5), d10=buildMAPath(ma10), d20=buildMAPath(ma20);
  const maLines =
    (d5  ? `<path d="${d5}"  stroke="#4e8ef7" stroke-width="1.2" fill="none"/>` : '') +
    (d10 ? `<path d="${d10}" stroke="#f5a623" stroke-width="1.2" fill="none"/>` : '') +
    (d20 ? `<path d="${d20}" stroke="#a06ee1" stroke-width="1.2" fill="none"/>` : '');

  // Bollinger Bands
  let bollLines = '';
  if (showBollinger && tech && tech.bollinger && currentKlt === 101) {
    const boll = tech.bollinger;
    const offset2 = klines.length - n;
    const bMid = boll.mid.slice(offset2);
    const bUp = boll.upper.slice(offset2);
    const bLow = boll.lower.slice(offset2);
    function buildBollPath(arr) {
      let d = '';
      arr.forEach((v, i) => {
        if (v === null) return;
        const x = PL + i * gap + gap / 2, y = py(v);
        d += d === '' ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      return d;
    }
    const dMid = buildBollPath(bMid);
    const dUp = buildBollPath(bUp);
    const dLow = buildBollPath(bLow);
    if (dMid) bollLines += `<path d="${dMid}" stroke="#e8a838" stroke-width="1" stroke-dasharray="4,3" fill="none"/>`;
    if (dUp) bollLines += `<path d="${dUp}" stroke="#e85858" stroke-width="1" stroke-dasharray="4,3" fill="none"/>`;
    if (dLow) bollLines += `<path d="${dLow}" stroke="#38b8e8" stroke-width="1" stroke-dasharray="4,3" fill="none"/>`;
  }

  // MACD sub-chart
  let macdSvg = '';
  if (hasMacd) {
    const offset2 = klines.length - n;
    const macdDif = tech.macd.dif.slice(offset2);
    const macdDea = tech.macd.dea.slice(offset2);
    const macdHist = tech.macd.histogram.slice(offset2);
    const macdVals = [...macdDif, ...macdDea, ...macdHist];
    const mMax = Math.max(...macdVals.map(Math.abs)) || 1;
    const mBaseY = H - PB - 4;
    const mTopY = mBaseY - MACD_H + 10;
    const mCenterY = (mBaseY + mTopY) / 2;
    const mScale = (MACD_H / 2 - 10) / mMax;

    macdSvg += `<line x1="${PL}" y1="${mTopY}" x2="${W-PR}" y2="${mTopY}" stroke="#2a2d3e" stroke-width="1"/>`;
    macdSvg += `<line x1="${PL}" y1="${mCenterY}" x2="${W-PR}" y2="${mCenterY}" stroke="#2a2d3e" stroke-width="0.5" stroke-dasharray="3,3"/>`;
    macdSvg += `<text x="${PL-4}" y="${mTopY+8}" text-anchor="end" fill="#7c8499" font-size="9">MACD</text>`;

    // Histogram bars
    macdHist.forEach((v, i) => {
      const x = PL + i * gap + gap / 2;
      const barH = Math.abs(v) * mScale;
      const y = v >= 0 ? mCenterY - barH : mCenterY;
      const color = v >= 0 ? 'rgba(240,77,77,.6)' : 'rgba(18,184,110,.6)';
      macdSvg += `<rect x="${x - bw/2}" y="${y}" width="${bw}" height="${Math.max(1, barH)}" fill="${color}"/>`;
    });

    // DIF line
    let difPath = '';
    macdDif.forEach((v, i) => {
      const x = PL + i * gap + gap / 2;
      const y = mCenterY - v * mScale;
      difPath += difPath === '' ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    if (difPath) macdSvg += `<path d="${difPath}" stroke="#4e8ef7" stroke-width="1" fill="none"/>`;

    // DEA line
    let deaPath = '';
    macdDea.forEach((v, i) => {
      const x = PL + i * gap + gap / 2;
      const y = mCenterY - v * mScale;
      deaPath += deaPath === '' ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    if (deaPath) macdSvg += `<path d="${deaPath}" stroke="#f5a623" stroke-width="1" fill="none"/>`;
  }

  const legendY = hasMacd ? H - PB + 20 : H - 5;
  const legend = `
    <circle cx="${PL+6}" cy="${legendY}" r="3" fill="#4e8ef7"/>
    <text x="${PL+12}" y="${legendY+3}" fill="#4e8ef7" font-size="9">MA5</text>
    <circle cx="${PL+38}" cy="${legendY}" r="3" fill="#f5a623"/>
    <text x="${PL+44}" y="${legendY+3}" fill="#f5a623" font-size="9">MA10</text>
    <circle cx="${PL+74}" cy="${legendY}" r="3" fill="#a06ee1"/>
    <text x="${PL+80}" y="${legendY+3}" fill="#a06ee1" font-size="9">MA20</text>`;

  wrap.innerHTML=`<svg width="${W}" height="${H}" style="display:block">
    ${lines}
    <line x1="${PL}" y1="${H-PB-VH-4-MACD_H}" x2="${W-PR}" y2="${H-PB-VH-4-MACD_H}" stroke="#2a2d3e" stroke-width="1"/>
    ${volumes}${candles}${maLines}${bollLines}${xLabels}${macdSvg}${legend}
    <line id="kline-hover-line" x1="${PL}" y1="${PT}" x2="${PL}" y2="${H-PB}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" style="display:none"/>
  </svg>
  <div class="chart-tooltip" id="kline-tooltip"></div>`;

  const svg = wrap.querySelector('svg');
  const tooltip = wrap.querySelector('#kline-tooltip');
  const hoverLine = wrap.querySelector('#kline-hover-line');
  const hideTooltip = () => {
    tooltip.style.display = 'none';
    hoverLine.style.display = 'none';
  };
  svg.addEventListener('mouseleave', hideTooltip);
  svg.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < PL || x > W - PR) { hideTooltip(); return; }
    const idx = Math.max(0, Math.min(data.length - 1, Math.floor((x - PL) / gap)));
    const k = data[idx];
    const cx = PL + idx * gap + gap / 2;
    const pct = Number.isFinite(k.change_pct)
      ? k.change_pct
      : (k.prev_close ? ((k.close - k.prev_close) / k.prev_close) * 100 : 0);
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    const sign = pct > 0 ? '+' : '';
    hoverLine.setAttribute('x1', cx);
    hoverLine.setAttribute('x2', cx);
    hoverLine.style.display = '';
    tooltip.innerHTML = `
      <div class="tt-date">${k.date}</div>
      <div class="tt-row"><span>涨跌幅</span><b class="${cls}">${sign}${pct.toFixed(2)}%</b></div>
      <div class="tt-row"><span>开盘</span><b>${fmt(k.open)}</b></div>
      <div class="tt-row"><span>最高</span><b class="up">${fmt(k.high)}</b></div>
      <div class="tt-row"><span>最低</span><b class="down">${fmt(k.low)}</b></div>
      <div class="tt-row"><span>收盘</span><b>${fmt(k.close)}</b></div>
      <div class="tt-row"><span>成交量</span><b>${fmtVol(k.volume)}</b></div>`;
    tooltip.style.display = 'block';
    const tooltipW = tooltip.offsetWidth || 160;
    const tooltipH = tooltip.offsetHeight || 130;
    let left = cx + 18;
    if (left + tooltipW > W - 8) left = cx - tooltipW - 18;
    const top = Math.max(8, Math.min(H - tooltipH - 8, e.clientY - rect.top - tooltipH / 2));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  });
}

function renderTrendChart() {
  const wrap = document.getElementById('chart-svg-wrap');
  const trends = chartData?.trends;
  if (!trends || trends.length < 5) {
    wrap.innerHTML='<div class="chart-loading">分时数据不足（非交易时间）</div>'; return;
  }
  const pts = trends.map(t=>{const p=t.split(',');return{time:p[0].slice(-5),price:+p[2],avg:+p[7],vol:+p[5]};}).filter(p=>p.price>0&&p.avg>0);
  if (pts.length<2){wrap.innerHTML='<div class="chart-loading">数据不足</div>';return;}

  // 从K线数据获取昨日收盘价
  const prevClose = (() => {
    const ks = chartData?.klines;
    if (!ks || ks.length < 2) return null;
    return ks[ks.length - 1].prev_close || null;
  })();

  const W=wrap.clientWidth||800, H=260, PL=50, PR=10, PT=10, PB=30, VH=45;
  const cW=W-PL-PR, cH=H-PT-PB-VH-8;
  const n=pts.length;
  const allPrices=[...pts.map(p=>p.price),...pts.map(p=>p.avg)];
  if (prevClose) allPrices.push(prevClose);
  const pMax=Math.max(...allPrices), pMin=Math.min(...allPrices);
  const pRange=pMax-pMin||1;
  const vols=pts.map(p=>p.vol), vMax=Math.max(...vols)||1;
  const px=i=>PL+i*(cW/(n-1));
  const py=v=>PT+cH-(v-pMin)/pRange*cH;
  let grid='', priceLine='', avgLine='', volBars='', xLabels='';
  for(let i=0;i<=4;i++){
    const y=PT+cH*i/4;
    grid+=`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#2a2d3e" stroke-width="1"/>`;
    grid+=`<text x="${PL-4}" y="${y+4}" text-anchor="end" fill="#7c8499" font-size="10">${(pMax-pRange*i/4).toFixed(2)}</text>`;
  }
  pts.forEach((p,i)=>{
    if(i>0){
      priceLine+=`<line x1="${px(i-1)}" y1="${py(pts[i-1].price)}" x2="${px(i)}" y2="${py(p.price)}" stroke="#f04d4d" stroke-width="1.5"/>`;
      avgLine  +=`<line x1="${px(i-1)}" y1="${py(pts[i-1].avg)}" x2="${px(i)}" y2="${py(p.avg)}" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2"/>`;
    }
    const vh=Math.max(1,(p.vol/vMax)*(VH-4));
    const vy=H-PB-vh;
    volBars+=`<rect x="${px(i)-1}" y="${vy}" width="2" height="${vh}" fill="rgba(78,142,247,.5)"/>`;
    if(i%Math.ceil(n/6)===0) xLabels+=`<text x="${px(i)}" y="${H-PB+12}" text-anchor="middle" fill="#7c8499" font-size="9">${p.time}</text>`;
  });

  // 昨收参考线
  const pcLine = prevClose ? (() => {
    const y = py(prevClose);
    return `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#7c8499" stroke-width="1" stroke-dasharray="4,3"/>
            <text x="${PL-4}" y="${y+3}" text-anchor="end" fill="#7c8499" font-size="9">${prevClose.toFixed(2)}</text>`;
  })() : '';

  wrap.innerHTML=`<svg width="${W}" height="${H}" style="display:block">
    ${grid}${pcLine}
    <line x1="${PL}" y1="${H-PB-VH-4}" x2="${W-PR}" y2="${H-PB-VH-4}" stroke="#2a2d3e" stroke-width="1"/>
    ${volBars}${priceLine}${avgLine}${xLabels}
    <circle cx="${px(pts.length-1)}" cy="${py(pts[pts.length-1].price)}" r="3" fill="#f04d4d"/>
    <text x="${W-PR-2}" y="${H-PB+12}" text-anchor="end" fill="#f5a623" font-size="9">均线</text>
    <line x1="${W-PR-30}" y1="${H-PB+8}" x2="${W-PR-18}" y2="${H-PB+8}" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2"/>
    <text x="${W-PR-36}" y="${H-PB+12}" text-anchor="end" fill="#7c8499" font-size="9">昨收</text>
    <line x1="${W-PR-66}" y1="${H-PB+8}" x2="${W-PR-54}" y2="${H-PB+8}" stroke="#7c8499" stroke-width="1" stroke-dasharray="4,3"/>
  </svg>`;
}

document.getElementById('chart-close').addEventListener('click', ()=>{
  document.getElementById('chart-overlay').style.display = 'none';
});
document.getElementById('chart-overlay').addEventListener('click', e=>{
  if(e.target===e.currentTarget) document.getElementById('chart-overlay').style.display='none';
});

// K线周期切换
document.getElementById('klt-tabs').addEventListener('click', async e => {
  const btn = e.target.closest('.klt-btn');
  if (!btn) return;
  const klt = +btn.dataset.klt;
  if (klt === currentKlt) return;
  currentKlt = klt;
  document.querySelectorAll('.klt-btn').forEach(b => b.classList.toggle('active', +b.dataset.klt === klt));
  // 使用缓存或重新拉取
  if (chartKltCache[klt]) {
    chartData.klines = chartKltCache[klt];
    renderKlineChart();
    return;
  }
  document.getElementById('chart-svg-wrap').innerHTML = '<div class="chart-loading"><div class="spinner"></div><div>加载中…</div></div>';
  try {
    const res = await fetch(`/api/chart/${chartCurrentCode}?klt=${klt}`);
    const json = await res.json();
    chartKltCache[klt] = json.klines;
    chartData.klines = json.klines;
    renderKlineChart();
  } catch(e) {
    document.getElementById('chart-svg-wrap').innerHTML = '<div class="chart-loading" style="color:var(--red)">加载失败</div>';
  }
});
