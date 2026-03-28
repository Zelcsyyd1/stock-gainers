const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5000;

// ── Beijing time helpers ──────────────────────────────────────────────
function getBeijingDate() {
  // UTC+8
  const now = new Date();
  const offset = 8 * 60; // minutes
  return new Date(now.getTime() + (offset - now.getTimezoneOffset()) * 60000);
}

function getMarketStatus() {
  const bj = getBeijingDate();
  const day = bj.getDay(); // 0=Sun 6=Sat
  if (day === 0 || day === 6) return { open: false, status: '休市（周末）' };

  const h = bj.getHours(), m = bj.getMinutes();
  const mins = h * 60 + m;
  if (mins < 9 * 60 + 30)                         return { open: false, status: '盘前' };
  if (mins <= 11 * 60 + 30)                        return { open: true,  status: '上午交易中' };
  if (mins < 13 * 60)                              return { open: false, status: '午间休市' };
  if (mins <= 15 * 60)                             return { open: true,  status: '下午交易中' };
  return                                                  { open: false, status: '已收盘' };
}

// ── Fetch from Eastmoney ──────────────────────────────────────────────
const FS_MAP = {
  all:      'm:0+t:6,m:0+t:13,m:1+t:2,m:1+t:23',
  shanghai: 'm:0+t:6',
  shenzhen: 'm:1+t:2',
  chinext:  'm:1+t:23',
  star:     'm:0+t:13',
};

async function fetchTopGainers(page = 1, pageSize = 50, board = 'all') {
  const fs = FS_MAP[board] || FS_MAP.all;
  const params = new URLSearchParams({
    pn: page,
    pz: pageSize,
    po: 1,
    np: 1,
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: 2,
    invt: 2,
    fid: 'f3',
    fs,
    fields: 'f2,f3,f4,f5,f6,f9,f12,f13,f14,f15,f16,f17,f18',
    _: Date.now(),
  });

  const url = `https://push2.eastmoney.com/api/qt/clist/get?${params}`;
  const resp = await fetch(url, {
    headers: {
      'Referer': 'https://www.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(10000),
  });

  const raw = await resp.json();
  const diff = raw?.data?.diff ?? [];

  return diff
    .filter(item => item.f3 !== undefined && item.f3 !== '-')
    .map(item => ({
      code:       item.f12 ?? '',
      name:       item.f14 ?? '',
      price:      item.f2  ?? 0,
      change_pct: item.f3  ?? 0,
      change:     item.f4  ?? 0,
      volume:     item.f5  ?? 0,
      turnover:   item.f6  ?? 0,
      high:       item.f15 ?? 0,
      low:        item.f16 ?? 0,
      open:       item.f17 ?? 0,
      prev_close: item.f18 ?? 0,
      pe:         item.f9  ?? 0,
      market:     item.f13 === 1 ? 'SH' : 'SZ',
    }));
}

// ── Routes ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

app.get('/api/stocks', async (req, res) => {
  const board    = req.query.board    || 'all';
  const page     = parseInt(req.query.page || '1');
  const pageSize = parseInt(req.query.size || '50');

  try {
    const data = await fetchTopGainers(page, pageSize, board);
    const bj   = getBeijingDate();
    const { open, status } = getMarketStatus();

    const pad = n => String(n).padStart(2, '0');
    const timeStr = `${bj.getFullYear()}-${pad(bj.getMonth()+1)}-${pad(bj.getDate())} ` +
                    `${pad(bj.getHours())}:${pad(bj.getMinutes())}:${pad(bj.getSeconds())}`;

    res.json({ success: true, data, market_open: open, market_status: status, time: timeStr, total: data.length });
  } catch (e) {
    res.json({ success: false, error: e.message, data: [] });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ 股票涨幅榜已启动！`);
  console.log(`   打开浏览器访问: http://localhost:${PORT}\n`);
});
