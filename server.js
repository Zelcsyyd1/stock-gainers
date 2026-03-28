const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ── 选股历史（内存，最多保留100条）────────────────────────────────────
const screenHistory = [];

function getBeijingDate() {
  const now = new Date();
  const offset = 8 * 60;
  return new Date(now.getTime() + (offset - now.getTimezoneOffset()) * 60000);
}

function getMarketStatus() {
  const bj = getBeijingDate();
  const day = bj.getDay();
  if (day === 0 || day === 6) return { open: false, status: '休市（周末）' };
  const h = bj.getHours(), m = bj.getMinutes();
  const mins = h * 60 + m;
  if (mins < 570)  return { open: false, status: '盘前' };
  if (mins <= 690) return { open: true,  status: '上午交易中' };
  if (mins < 780)  return { open: false, status: '午间休市' };
  if (mins <= 900) return { open: true,  status: '下午交易中' };
  return { open: false, status: '已收盘' };
}

function getSecId(code) {
  return code.startsWith('6') ? `1.${code}` : `0.${code}`;
}

const EM_HEADERS = {
  'Referer': 'https://www.eastmoney.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

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
    pn: page, pz: pageSize, po: 1, np: 1,
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: 2, invt: 2, fid: 'f3', fs,
    fields: 'f2,f3,f4,f5,f6,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20',
    _: Date.now(),
  });
  const resp = await fetch(`https://push2.eastmoney.com/api/qt/clist/get?${params}`, {
    headers: EM_HEADERS, signal: AbortSignal.timeout(10000),
  });
  const raw = await resp.json();
  return (raw?.data?.diff ?? [])
    .filter(item => item.f3 !== undefined && item.f3 !== '-')
    .map(item => ({
      code:          item.f12 ?? '',
      name:          item.f14 ?? '',
      price:         item.f2  ?? 0,
      change_pct:    item.f3  ?? 0,
      change:        item.f4  ?? 0,
      volume:        item.f5  ?? 0,
      turnover:      item.f6  ?? 0,
      turnover_rate: item.f8  ?? 0,
      pe:            item.f9  ?? 0,
      volume_ratio:  item.f10 ?? 0,
      high:          item.f15 ?? 0,
      low:           item.f16 ?? 0,
      open:          item.f17 ?? 0,
      prev_close:    item.f18 ?? 0,
      market_cap:    item.f20 ?? 0,
      market:        item.f13 === 1 ? 'SH' : 'SZ',
    }));
}

// 批量获取自选股行情
async function fetchQuotesBySecids(secids) {
  if (!secids || secids.length === 0) return [];
  const params = new URLSearchParams({
    secids: secids.join(','),
    fields: 'f2,f3,f4,f5,f6,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20',
    fltt: 2, invt: 2, _: Date.now(),
  });
  try {
    const resp = await fetch(`https://push2.eastmoney.com/api/qt/ulist.np/get?${params}`, {
      headers: EM_HEADERS, signal: AbortSignal.timeout(8000),
    });
    const raw = await resp.json();
    return (raw?.data?.diff ?? []).map(item => ({
      code:          item.f12 ?? '',
      name:          item.f14 ?? '',
      price:         item.f2  ?? 0,
      change_pct:    item.f3  ?? 0,
      change:        item.f4  ?? 0,
      volume:        item.f5  ?? 0,
      turnover:      item.f6  ?? 0,
      turnover_rate: item.f8  ?? 0,
      pe:            item.f9  ?? 0,
      volume_ratio:  item.f10 ?? 0,
      high:          item.f15 ?? 0,
      low:           item.f16 ?? 0,
      open:          item.f17 ?? 0,
      prev_close:    item.f18 ?? 0,
      market_cap:    item.f20 ?? 0,
      market:        item.f13 === 1 ? 'SH' : 'SZ',
    }));
  } catch { return []; }
}

async function checkLimitUpHistory(code) {
  const secid = getSecId(code);
  const threshold = (code.startsWith('3') || code.startsWith('688')) ? 19.5 : 9.9;
  try {
    const resp = await fetch(
      `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
      `&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
      `&klt=101&fqt=0&end=20991231&lmt=30`,
      { headers: EM_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    const raw = await resp.json();
    return (raw?.data?.klines ?? []).some(k => parseFloat(k.split(',')[8]) >= threshold);
  } catch { return false; }
}

async function fetchIntradayTrends(code) {
  const secid = getSecId(code);
  try {
    const resp = await fetch(
      `https://push2.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}` +
      `&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11&fields2=f51,f52,f53,f54,f55,f56,f57,f58` +
      `&iscr=0&ndays=1`,
      { headers: EM_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    const raw = await resp.json();
    return raw?.data?.trends ?? [];
  } catch { return []; }
}

function analyzeIntraday(trends) {
  if (!trends || trends.length < 5) return { pass: false, reason: '分时数据不足' };
  const points = trends
    .map(t => { const p = t.split(','); return { time: p[0], price: parseFloat(p[2]), avg: parseFloat(p[7]) }; })
    .filter(p => !isNaN(p.price) && !isNaN(p.avg) && p.avg > 0);
  if (points.length < 5) return { pass: false, reason: '有效数据点不足' };
  const below = points.find(p => p.price < p.avg);
  if (below) return { pass: false, reason: `${below.time} 价格跌破均线` };
  const before = points.filter(p => p.time < '14:30');
  const after  = points.filter(p => p.time >= '14:30');
  if (after.length === 0) return { pass: false, reason: '尚未到14:30' };
  const maxBefore = before.length > 0 ? Math.max(...before.map(p => p.price)) : 0;
  const newHighIdx = after.findIndex(p => p.price > maxBefore);
  if (newHighIdx === -1) return { pass: false, reason: '14:30后未破新高' };
  const failPoint = after.slice(newHighIdx + 1).find(p => p.price < p.avg);
  if (failPoint) return { pass: false, reason: `${failPoint.time} 破新高后回落至均线下方` };
  return { pass: true, reason: '全部条件通过' };
}

async function batchProcess(items, fn, concurrency = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = await Promise.all(items.slice(i, i + concurrency).map(fn));
    results.push(...batch);
    if (i + concurrency < items.length) await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

function nowStr() {
  const bj = getBeijingDate();
  const pad = n => String(n).padStart(2, '0');
  return `${bj.getFullYear()}-${pad(bj.getMonth()+1)}-${pad(bj.getDate())} ` +
         `${pad(bj.getHours())}:${pad(bj.getMinutes())}:${pad(bj.getSeconds())}`;
}

// 大盘指数行情
const INDEX_SECIDS = ['1.000001', '0.399001', '0.399006', '0.000688'];
const INDEX_NAMES  = { '000001':'上证指数', '399001':'深证成指', '399006':'创业板指', '000688':'科创50' };

async function fetchIndices() {
  const params = new URLSearchParams({
    secids: INDEX_SECIDS.join(','),
    fields: 'f2,f3,f4,f5,f6,f12,f13,f14,f15,f16,f17,f18',
    fltt: 2, invt: 2, _: Date.now(),
  });
  try {
    const resp = await fetch(`https://push2.eastmoney.com/api/qt/ulist.np/get?${params}`, {
      headers: EM_HEADERS, signal: AbortSignal.timeout(6000),
    });
    const raw = await resp.json();
    return (raw?.data?.diff ?? []).map(item => ({
      code:       item.f12 ?? '',
      name:       INDEX_NAMES[item.f12] ?? item.f14 ?? '',
      price:      item.f2  ?? 0,
      change_pct: item.f3  ?? 0,
      change:     item.f4  ?? 0,
      volume:     item.f5  ?? 0,
      turnover:   item.f6  ?? 0,
      high:       item.f15 ?? 0,
      low:        item.f16 ?? 0,
      open:       item.f17 ?? 0,
      prev_close: item.f18 ?? 0,
    }));
  } catch { return []; }
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'index.html')));

app.get('/api/stocks', async (req, res) => {
  const board    = req.query.board || 'all';
  const pageSize = Math.min(parseInt(req.query.size || '300'), 500);
  try {
    let data;
    if (pageSize <= 100) {
      const page = parseInt(req.query.page || '1');
      data = await fetchTopGainers(page, pageSize, board);
    } else {
      // 并发拉多页（每页100条）再合并去重
      const pagesNeeded = Math.ceil(pageSize / 100);
      const pages = await Promise.all(
        Array.from({ length: pagesNeeded }, (_, i) => fetchTopGainers(i + 1, 100, board).catch(() => []))
      );
      const seen = new Set();
      data = pages.flat().filter(s => {
        if (seen.has(s.code)) return false;
        seen.add(s.code); return true;
      }).slice(0, pageSize);
    }
    const { open, status } = getMarketStatus();
    res.json({ success: true, data, market_open: open, market_status: status, time: nowStr(), total: data.length });
  } catch (e) {
    res.json({ success: false, error: e.message, data: [] });
  }
});

// 大盘指数
app.get('/api/indices', async (req, res) => {
  try {
    const data = await fetchIndices();
    res.json({ success: true, data });
  } catch (e) {
    res.json({ success: false, error: e.message, data: [] });
  }
});

// 自选股实时行情
app.post('/api/quotes', async (req, res) => {
  const codes = req.body.codes || [];
  try {
    const secids = codes.map(c => getSecId(c));
    const data = await fetchQuotesBySecids(secids);
    res.json({ success: true, data });
  } catch (e) {
    res.json({ success: false, error: e.message, data: [] });
  }
});

// 2:30 选股（支持自定义条件）
app.get('/api/screen', async (req, res) => {
  const params = {
    min_pct: parseFloat(req.query.min_pct ?? 3),
    max_pct: parseFloat(req.query.max_pct ?? 5),
    max_cap: parseFloat(req.query.max_cap ?? 200) * 1e8,  // 亿→元
    min_vr:  parseFloat(req.query.min_vr  ?? 1),
    min_tr:  parseFloat(req.query.min_tr  ?? 5),
    max_tr:  parseFloat(req.query.max_tr  ?? 10),
  };

  try {
    const { open } = getMarketStatus();
    const pages = await Promise.all(
      [1, 2, 3, 4].map(p => fetchTopGainers(p, 100, 'all').catch(() => []))
    );
    const allStocks = pages.flat();

    const candidates = allStocks.filter(s => {
      const pct = parseFloat(s.change_pct);
      const cap = parseFloat(s.market_cap);
      const vr  = parseFloat(s.volume_ratio);
      const tr  = parseFloat(s.turnover_rate);
      return pct >= params.min_pct && pct <= params.max_pct &&
             cap > 0 && cap < params.max_cap &&
             vr > params.min_vr &&
             tr >= params.min_tr && tr <= params.max_tr;
    });

    const results = await batchProcess(candidates, async (stock) => {
      const [hadLimitUp, trends] = await Promise.all([
        checkLimitUpHistory(stock.code),
        open ? fetchIntradayTrends(stock.code) : Promise.resolve([]),
      ]);
      if (!hadLimitUp) return { ...stock, pass: false, had_limit_up: false, fail_reason: '近30交易日无涨停记录' };
      const intraday = (open && trends.length > 0)
        ? analyzeIntraday(trends)
        : { pass: true, reason: '非交易时间，跳过分时检测' };
      return {
        ...stock, had_limit_up: true,
        intraday_reason: intraday.reason,
        pass: intraday.pass,
        fail_reason: intraday.pass ? null : intraday.reason,
      };
    }, 5);

    const passed = results.filter(s => s.pass);
    const time   = nowStr();

    // 保存历史
    screenHistory.unshift({
      id:               Date.now(),
      time,
      params:           { ...params, max_cap: params.max_cap / 1e8 },
      total_scanned:    allStocks.length,
      total_candidates: candidates.length,
      total_passed:     passed.length,
      passed:           passed.map(s => ({ code: s.code, name: s.name, change_pct: s.change_pct, price: s.price })),
    });
    if (screenHistory.length > 100) screenHistory.length = 100;

    res.json({
      success: true, passed, all_candidates: results,
      total_scanned: allStocks.length,
      total_candidates: candidates.length,
      total_passed: passed.length,
      market_open: open, time,
    });
  } catch (e) {
    res.json({ success: false, error: e.message, passed: [], all_candidates: [] });
  }
});

// 历史记录
app.get('/api/history', (req, res) => {
  res.json({ success: true, history: screenHistory });
});

// Webhook 推送代理（避免前端跨域）
app.post('/api/notify', async (req, res) => {
  const { url, payload } = req.body;
  if (!url) return res.json({ success: false, error: '缺少 url' });
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    res.json({ success: resp.ok, status: resp.status });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ 股票涨幅榜已启动！`);
  console.log(`   打开浏览器访问: http://localhost:${PORT}\n`);
});
