function toggleCompare(stock) {
  const idx = compareList.findIndex(c => c.code === stock.code);
  if (idx !== -1) {
    compareList.splice(idx, 1);
  } else {
    if (compareList.length >= 2) { showToast('最多对比两只股票，请先移除一只'); return; }
    compareList.push(stock);
  }
  updateCompareBar();
  renderNormalTable();
}

function updateCompareBar() {
  const bar = document.getElementById('compare-bar');
  if (!compareList.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';

  [0, 1].forEach(i => {
    const slot = document.getElementById(`cmp-slot-${i}`);
    const s = compareList[i];
    slot.innerHTML = s
      ? `<div><div class="slot-name">${escapeHtml(s.name)}</div><div class="slot-code">${escapeHtml(s.code)}</div></div>
         <button onclick="removeCompare('${escapeHtml(s.code)}')">✕</button>`
      : `<span class="cmp-slot-empty">${i===0?'选择第一只':'选择第二只'}</span>`;
  });
  document.getElementById('do-compare-btn').disabled = compareList.length < 2;
}

function removeCompare(code) {
  compareList = compareList.filter(c => c.code !== code);
  updateCompareBar();
  renderNormalTable();
}

function openCompareModal() {
  if (compareList.length < 2) return;
  const [a, b] = compareList;
  const rows = [
    { label:'现价',       va: parseFloat(a.price),         vb: parseFloat(b.price),         fmt: v=>v.toFixed(2),              higher:'none' },
    { label:'涨跌幅',     va: parseFloat(a.change_pct),    vb: parseFloat(b.change_pct),    fmt: v=>(v>0?'+':'')+v.toFixed(2)+'%', higher:'a>b' },
    { label:'涨跌额',     va: parseFloat(a.change),        vb: parseFloat(b.change),        fmt: v=>(v>0?'+':'')+v.toFixed(2),  higher:'a>b' },
    { label:'今开',       va: parseFloat(a.open),          vb: parseFloat(b.open),          fmt: v=>v.toFixed(2),              higher:'none' },
    { label:'最高',       va: parseFloat(a.high),          vb: parseFloat(b.high),          fmt: v=>v.toFixed(2),              higher:'none' },
    { label:'最低',       va: parseFloat(a.low),           vb: parseFloat(b.low),           fmt: v=>v.toFixed(2),              higher:'none' },
    { label:'昨收',       va: parseFloat(a.prev_close),    vb: parseFloat(b.prev_close),    fmt: v=>v.toFixed(2),              higher:'none' },
    { label:'振幅',       va: a.prev_close>0?(a.high-a.low)/a.prev_close*100:0, vb: b.prev_close>0?(b.high-b.low)/b.prev_close*100:0, fmt: v=>v.toFixed(2)+'%', higher:'none' },
    { label:'量比',       va: parseFloat(a.volume_ratio),  vb: parseFloat(b.volume_ratio),  fmt: v=>v.toFixed(2),              higher:'a>b' },
    { label:'换手率',     va: parseFloat(a.turnover_rate), vb: parseFloat(b.turnover_rate), fmt: v=>v.toFixed(2)+'%',          higher:'a>b' },
    { label:'市值(亿)',   va: parseFloat(a.market_cap)/1e8,vb: parseFloat(b.market_cap)/1e8,fmt: v=>v.toFixed(2),              higher:'a<b' },
    { label:'市盈率',     va: parseFloat(a.pe),            vb: parseFloat(b.pe),            fmt: v=>v.toFixed(2),              higher:'a<b' },
    { label:'成交额',     va: parseFloat(a.turnover),      vb: parseFloat(b.turnover),      fmt: v=>fmtMoney(v),               higher:'a>b' },
  ];

  const mktBadge = s => s.market==='SH'
    ? '<span class="badge badge-sh">沪</span>'
    : '<span class="badge badge-sz">深</span>';

  const tableRows = rows.map(r => {
    let clsA = 'cmp-neutral', clsB = 'cmp-neutral';
    if (!isNaN(r.va) && !isNaN(r.vb) && r.higher !== 'none') {
      if (r.higher === 'a>b') { if(r.va > r.vb) clsA='cmp-win'; else if(r.vb > r.va) clsB='cmp-win'; }
      if (r.higher === 'a<b') { if(r.va < r.vb && r.va > 0) clsA='cmp-win'; else if(r.vb < r.va && r.vb > 0) clsB='cmp-win'; }
    }
    return `<tr>
      <td>${r.label}</td>
      <td class="${clsA}">${isNaN(r.va)?'--':r.fmt(r.va)}</td>
      <td class="${clsB}">${isNaN(r.vb)?'--':r.fmt(r.vb)}</td>
    </tr>`;
  }).join('');

  document.getElementById('compare-body').innerHTML = `
    <table class="cmp-table">
      <thead><tr>
        <th style="width:90px"></th>
        <th class="stock-col">${escapeHtml(a.name)}${mktBadge(a)}<br><span style="font-size:11px;font-weight:400;color:var(--muted)">${escapeHtml(a.code)}</span></th>
        <th class="stock-col">${escapeHtml(b.name)}${mktBadge(b)}<br><span style="font-size:11px;font-weight:400;color:var(--muted)">${escapeHtml(b.code)}</span></th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div style="margin-top:10px;font-size:11px;color:var(--muted);text-align:right"><span style="color:var(--red);font-weight:700">红色</span> = 该项数据更优</div>`;

  document.getElementById('compare-overlay').style.display = 'flex';
}

document.getElementById('do-compare-btn').addEventListener('click', openCompareModal);
document.getElementById('compare-modal-close').addEventListener('click', () => {
  document.getElementById('compare-overlay').style.display = 'none';
});
document.getElementById('compare-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('compare-overlay').style.display = 'none';
});
document.getElementById('close-compare-bar').addEventListener('click', () => {
  compareList = [];
  updateCompareBar();
  renderNormalTable();
});
