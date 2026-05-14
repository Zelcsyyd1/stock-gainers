async function fetchData() {
  if (isScreenMode) return;
  if (isWatchlistMode) { fetchWatchlist(); return; }
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  try {
    const res = await fetch(`/api/stocks?board=${board}&size=${FETCH_SIZE}`);
    const json = await res.json();
    if (json.success) {
      allData = json.data;
      updateMarketBadge(json.market_open, json.market_status);
      updateDataMeta(json.source, json.time);
      renderNormalTable();
      renderStats();
    } else {
      updateDataMeta(json.source || '数据接口', json.time);
      showEmpty(json.error ? `数据暂不可用：${json.error}` : '数据暂不可用，请稍后刷新');
    }
  } catch(e) {
    console.error(e);
    updateDataMeta('数据接口', null);
    showEmpty('网络异常，数据加载失败，请稍后刷新');
  }
  finally { btn.classList.remove('spinning'); }
}

function updateMarketBadge(open, status) {
  const badge = document.getElementById('market-badge');
  document.getElementById('market-status-text').textContent = status;
  badge.className = open ? 'open' : 'closed';
}

async function fetchIndices() {
  try {
    const res = await fetch('/api/indices');
    const json = await res.json();
    if (!json.success) return;
    json.data.forEach(idx => {
      const el = document.getElementById('idx-' + idx.code);
      if (!el) return;
      const pct = parseFloat(idx.change_pct);
      const isUp = pct > 0, isDown = pct < 0;
      const cls = isUp ? 'up' : isDown ? 'down' : 'flat';
      const sign = pct > 0 ? '+' : '';
      const amp = idx.prev_close > 0
        ? ((parseFloat(idx.high) - parseFloat(idx.low)) / parseFloat(idx.prev_close) * 100).toFixed(2)
        : '--';
      el.querySelector('.idx-price').textContent = parseFloat(idx.price).toFixed(2);
      el.querySelector('.idx-price').className = 'idx-price ' + cls;
      el.querySelector('.idx-change').innerHTML = `<span class="${cls}">${sign}${pct.toFixed(2)}%&nbsp;&nbsp;${sign}${parseFloat(idx.change).toFixed(2)}</span>`;
      el.querySelector('.idx-extra').textContent = `振幅 ${amp}%  量 ${fmtMoney(idx.turnover)}`;
      el.className = 'index-card ' + (isUp ? 'up-card' : isDown ? 'down-card' : '');
    });
  } catch(e) { console.error(e); }
}
setInterval(fetchIndices, 10000);
