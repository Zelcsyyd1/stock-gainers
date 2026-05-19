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
      marketOverview = extractMarketOverview(json);
      await fetchPressureDeckFeeds();
      updateMarketBadge(json.market_open, json.market_status);
      updateDataMeta(json.source, json.time);
      renderNormalTable();
      renderStats();
      document.body.classList.remove('data-flash');
      void document.body.offsetWidth;
      document.body.classList.add('data-flash');
      setTimeout(()=>document.body.classList.remove('data-flash'), 800);
    } else {
      updateDataMeta(json.source || '\u6570\u636e\u63a5\u53e3', json.time);
      showEmpty(json.error ? `\u6570\u636e\u6682\u4e0d\u53ef\u7528\uff1a${json.error}` : '\u6570\u636e\u6682\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u5237\u65b0');
    }
  } catch(e) {
    console.error(e);
    updateDataMeta('\u6570\u636e\u63a5\u53e3', null);
    showEmpty('\u7f51\u7edc\u5f02\u5e38\uff0c\u6570\u636e\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u5237\u65b0');
  }
  finally { btn.classList.remove('spinning'); }
}

function extractMarketOverview(json) {
  const keys = [
    'limit_up_count',
    'limit_down_count',
    'broken_limit_count',
    'broken_limit_rate',
    'highest_board',
    'up_count',
    'down_count',
    'flat_count',
    'avg_change_pct',
    'median_change_pct',
    'sentiment_score',
    'market_sentiment',
    'last_update_ts',
  ];
  return keys.reduce((acc, key) => {
    if (json[key] !== undefined && json[key] !== null) acc[key] = json[key];
    return acc;
  }, {});
}

async function fetchPressureDeckFeeds() {
  const [eventsResult, hotspotsResult] = await Promise.allSettled([
    fetch('/api/market-events?limit=30').then(res => res.ok ? res.json() : null),
    fetch('/api/market-hotspots').then(res => res.ok ? res.json() : null),
  ]);

  const eventsJson = eventsResult.status === 'fulfilled' ? eventsResult.value : null;
  marketEvents = eventsJson?.success && Array.isArray(eventsJson.events) ? eventsJson.events : [];

  const hotspotsJson = hotspotsResult.status === 'fulfilled' ? hotspotsResult.value : null;
  marketHotspots = hotspotsJson?.success && Array.isArray(hotspotsJson.hotspots) ? hotspotsJson.hotspots : [];
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
      el.querySelector('.idx-extra').textContent = `\u632f\u5e45 ${amp}%  \u989d ${fmtMoney(idx.turnover)}`;
      el.className = 'index-card ' + (isUp ? 'up-card' : isDown ? 'down-card' : '');
    });
  } catch(e) { console.error(e); }
}
setInterval(fetchIndices, 10000);
