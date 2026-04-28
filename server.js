const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ── 选股历史（持久化到文件）────────────────────────────────────────────
const HISTORY_FILE = path.join(__dirname, 'screen_history.json');

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      return Array.isArray(data) ? data : [];
    }
  } catch {}
  return [];
}

function saveHistory(history) {
  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8'); } catch {}
}

const screenHistory = loadHistory();

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
  all:      'm:0+t:6,m:1+t:2,m:0+t:23,m:1+t:23',
  shanghai: 'm:1+t:2',    // 沪市主板 600/601/603
  shenzhen: 'm:0+t:6',    // 深市主板 000/001/002/003
  chinext:  'm:0+t:23',   // 创业板 300/301
  star:     'm:1+t:23',   // 科创板 688
};

async function fetchTopGainers(page = 1, pageSize = 50, board = 'all') {
  const fs = FS_MAP[board] || FS_MAP.all;
  const params = new URLSearchParams({
    pn: page, pz: pageSize, po: 1, np: 1,
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: 2, invt: 2, fid: 'f3', fs,
    fields: 'f2,f3,f4,f5,f6,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f62,f184',
    _: Date.now(),
  });
  const resp = await fetch(`https://push2delay.eastmoney.com/api/qt/clist/get?${params}`, {
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
      net_inflow:    item.f62  ?? 0,   // 主力净流入（元）
      inflow_pct:    item.f184 ?? 0,   // 主力净流入占比（%）
      market:        item.f13 === 1 ? 'SH' : 'SZ',
    }));
}

// 批量获取自选股行情
async function fetchQuotesBySecids(secids) {
  if (!secids || secids.length === 0) return [];
  const params = new URLSearchParams({
    secids: secids.join(','),
    fields: 'f2,f3,f4,f5,f6,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f62,f184',
    fltt: 2, invt: 2, _: Date.now(),
  });
  try {
    const resp = await fetch(`https://push2delay.eastmoney.com/api/qt/ulist.np/get?${params}`, {
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
      net_inflow:    item.f62  ?? 0,
      inflow_pct:    item.f184 ?? 0,
      market:        item.f13 === 1 ? 'SH' : 'SZ',
    }));
  } catch { return []; }
}

async function fetchDailyKlines(code, lmt = 80) {
  const secid = getSecId(code);
  try {
    const resp = await fetch(
      `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
      `&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
      `&klt=101&fqt=0&end=20991231&lmt=${lmt}`,
      { headers: EM_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    const raw = await resp.json();
    const klines = (raw?.data?.klines ?? []).map(k => {
      const p = k.split(',');
      return {
        date: p[0],
        open: +p[1],
        close: +p[2],
        high: +p[3],
        low: +p[4],
        volume: +p[5],
        turnover: +p[6],
        amplitude: +p[7],
        change_pct: +p[8],
        change: +p[9],
        turnover_rate: +p[10],
      };
    });
    if (klines.length) return klines;
  } catch {}

  const txCode = `${code.startsWith('6') ? 'sh' : 'sz'}${code}`;
  const resp = await fetch(
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${txCode},day,,,${lmt},qfq`,
    { headers: { 'User-Agent': EM_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(8000) }
  );
  const raw = await resp.json();
  const rows = raw?.data?.[txCode]?.qfqday || raw?.data?.[txCode]?.day || [];
  return rows.map((p, i) => {
    const prevClose = i > 0 ? +rows[i - 1][2] : +p[1];
    const close = +p[2];
    const change = close - prevClose;
    return {
      date: p[0],
      open: +p[1],
      close,
      high: +p[3],
      low: +p[4],
      volume: +p[5],
      turnover: 0,
      amplitude: prevClose ? ((+p[3] - +p[4]) / prevClose) * 100 : 0,
      change_pct: prevClose ? (change / prevClose) * 100 : 0,
      change,
      turnover_rate: 0,
    };
  });
}

async function resolveStockQuery(q) {
  if (/^\d{6}$/.test(q)) {
    const quotes = await fetchQuotesBySecids([getSecId(q)]);
    return quotes[0] || null;
  }
  const suggestResp = await fetch(
    `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(q)}&type=14&token=D43BF722C8E33BDC906FB84D85E326EC&count=5`,
    { headers: EM_HEADERS, signal: AbortSignal.timeout(6000) }
  );
  const suggestRaw = await suggestResp.json();
  const hit = (suggestRaw?.QuotationCodeTable?.Data ?? []).find(h => h.MktNum === '0' || h.MktNum === '1');
  if (!hit) return null;
  const quotes = await fetchQuotesBySecids([`${hit.MktNum === '1' ? 1 : 0}.${hit.Code}`]);
  return quotes[0] || null;
}

function avg(nums) {
  const list = nums.filter(n => Number.isFinite(n));
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
}

function analyzeStockIndicators(quote, klines) {
  const closes = klines.map(k => k.close);
  const latest = klines[klines.length - 1] || {};
  const price = Number(quote.price || latest.close || 0);
  const ma = n => closes.length >= n ? avg(closes.slice(-n)) : 0;
  const ma5 = ma(5), ma10 = ma(10), ma20 = ma(20), ma60 = ma(60);
  const high20 = klines.length ? Math.max(...klines.slice(-20).map(k => k.high)) : 0;
  const low20 = klines.length ? Math.min(...klines.slice(-20).map(k => k.low)) : 0;
  const vol5 = avg(klines.slice(-5).map(k => k.volume));
  const first5 = klines.length >= 5 ? klines[klines.length - 5].close : 0;
  const gain5 = first5 ? (price / first5 - 1) * 100 : 0;
  const threshold = (quote.code.startsWith('3') || quote.code.startsWith('688')) ? 19.5 : 9.9;
  const recent30 = klines.slice(-30);
  const limitCount30 = recent30.filter(k => k.change_pct >= threshold).length;
  let consecutiveLimit = 0;
  for (let i = klines.length - 1; i >= 0; i--) {
    if (klines[i].change_pct >= threshold) consecutiveLimit++;
    else break;
  }

  const trendSignals = [
    price > ma5,
    price > ma10,
    price > ma20,
    ma5 > ma10,
    ma10 > ma20,
    ma20 > ma60,
  ];
  const trendScore = trendSignals.filter(Boolean).length;
  const trend =
    trendScore >= 5 ? '强势上升' :
    trendScore >= 3 ? '偏强震荡' :
    trendScore >= 2 ? '弱势修复' : '趋势偏弱';

  const risks = [];
  if (ma20 && price < ma20) risks.push('价格低于20日均线');
  if (Number(quote.volume_ratio) >= 5) risks.push('量比过高，短线分歧可能较大');
  if (Number(quote.turnover_rate) >= 20) risks.push('换手率过高，追高风险增加');
  if (Number(quote.market_cap) > 0 && Number(quote.market_cap) < 30e8) risks.push('小市值股票波动较大');
  if (gain5 >= 25) risks.push('近5日涨幅较大，注意回撤');
  if (Number(quote.pe) < 0) risks.push('市盈率为负，可能处于亏损状态');

  return {
    quote,
    trend: {
      label: trend,
      score: trendScore,
      above_ma5: price > ma5,
      above_ma10: price > ma10,
      above_ma20: price > ma20,
      near_high20: high20 ? price >= high20 * 0.98 : false,
      gain5,
      high20,
      low20,
    },
    moving_average: { ma5, ma10, ma20, ma60 },
    activity: {
      volume_ratio: Number(quote.volume_ratio || 0),
      turnover_rate: Number(quote.turnover_rate || latest.turnover_rate || 0),
      volume: Number(quote.volume || latest.volume || 0),
      avg_volume_5: vol5,
    },
    capital: {
      net_inflow: Number(quote.net_inflow || 0),
      inflow_pct: Number(quote.inflow_pct || 0),
    },
    valuation: {
      market_cap: Number(quote.market_cap || 0),
      pe: Number(quote.pe || 0),
    },
    strength: {
      change_pct: Number(quote.change_pct || 0),
      limit_threshold: threshold,
      limit_count_30: limitCount30,
      consecutive_limit: consecutiveLimit,
    },
    risk: {
      level: risks.length >= 3 ? '偏高' : risks.length >= 1 ? '中等' : '较低',
      items: risks,
    },
    updated_at: nowStr(),
  };
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
      `https://push2delay.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}` +
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

// K线 + 分时图 + 连板数
// klt: 5=5分钟, 15=15分钟, 30=30分钟, 60=60分钟, 101=日线, 102=周线, 103=月线
app.get('/api/chart/:code', async (req, res) => {
  const code = req.params.code;
  const secid = getSecId(code);
  const klt = parseInt(req.query.klt) || 101;
  const lmt = klt <= 60 ? 240 : (klt === 102 ? 104 : 60); // 分钟线多取数据点
  const threshold = (code.startsWith('3') || code.startsWith('688')) ? 19.5 : 9.9;
  try {
    // 仅日线需要同时获取分时图数据（用于 trend 标签页）
    const [klineResp, trends] = await Promise.all([
      fetch(
        `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
        `&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
        `&klt=${klt}&fqt=0&end=20991231&lmt=${lmt}`,
        { headers: EM_HEADERS, signal: AbortSignal.timeout(8000) }
      ),
      klt === 101 ? fetchIntradayTrends(code) : Promise.resolve([]),
    ]);
    const klineRaw = await klineResp.json();
    const klines = (klineRaw?.data?.klines ?? []).map(k => {
      const p = k.split(',');
      return { date: p[0], open: +p[1], close: +p[2], high: +p[3], low: +p[4], volume: +p[5], change_pct: +p[8], prev_close: +p[2] - +p[9] };
    });
    // 连板数：从最新一天往前数连续涨停天数
    let consecutive = 0;
    for (let i = klines.length - 1; i >= 0; i--) {
      if (klines[i].change_pct >= threshold) consecutive++;
      else break;
    }
    res.json({ success: true, klines, trends, consecutive });
  } catch (e) {
    res.json({ success: false, error: e.message, klines: [], trends: [], consecutive: 0 });
  }
});

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
    const resp = await fetch(`https://push2delay.eastmoney.com/api/qt/ulist.np/get?${params}`, {
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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'home.html')));
app.get('/market', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'index.html')));

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

// 全市场股票搜索
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ success: true, data: [] });
  try {
    // 1. 用东方财富 suggest 接口搜索股票代码/名称
    const suggestResp = await fetch(
      `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(q)}&type=14&token=D43BF722C8E33BDC906FB84D85E326EC&count=10`,
      { headers: EM_HEADERS, signal: AbortSignal.timeout(6000) }
    );
    const suggestRaw = await suggestResp.json();
    const hits = suggestRaw?.QuotationCodeTable?.Data ?? [];
    // 只保留 A 股（MktNum 0=深 1=沪）
    const stocks = hits.filter(h => h.MktNum === '0' || h.MktNum === '1');
    if (!stocks.length) return res.json({ success: true, data: [] });
    // 2. 批量拉行情
    const secids = stocks.map(h => `${h.MktNum === '1' ? 1 : 0}.${h.Code}`);
    const quotes = await fetchQuotesBySecids(secids);
    res.json({ success: true, data: quotes });
  } catch (e) {
    res.json({ success: false, error: e.message, data: [] });
  }
});

app.get('/api/indicators', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ success: false, error: '请输入股票代码或名称' });
  try {
    const quote = await resolveStockQuery(q);
    if (!quote || !quote.code) return res.json({ success: false, error: '未找到匹配的A股股票' });
    const klines = await fetchDailyKlines(quote.code, 80);
    if (!klines.length) return res.json({ success: false, error: '未获取到K线数据' });
    res.json({ success: true, data: analyzeStockIndicators(quote, klines) });
  } catch (e) {
    res.json({ success: false, error: e.message });
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
    saveHistory(screenHistory);

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

// 板块/概念涨幅
async function fetchSectors(type) {
  const fsParam = type === 'concept' ? 'm:90+t:3+f:!50' : 'm:90+t:2+f:!50';
  const params = new URLSearchParams({
    pn: 1, pz: 30, po: 1, np: 1,
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: 2, invt: 2, fid: 'f3', fs: fsParam,
    fields: 'f3,f4,f12,f14,f104,f105,f106,f128,f136',
    _: Date.now(),
  });
  const resp = await fetch(`https://push2delay.eastmoney.com/api/qt/clist/get?${params}`, {
    headers: EM_HEADERS, signal: AbortSignal.timeout(8000),
  });
  const raw = await resp.json();
  return (raw?.data?.diff ?? []).map(item => ({
    code:         item.f12 ?? '',
    name:         item.f14 ?? '',
    change_pct:   item.f3  ?? 0,
    change:       item.f4  ?? 0,
    up_count:     item.f104 ?? 0,
    down_count:   item.f105 ?? 0,
    flat_count:   item.f106 ?? 0,
    leader_name:  item.f128 ?? '',
    leader_pct:   item.f136 ?? 0,
  }));
}

app.get('/api/sectors', async (req, res) => {
  const type = req.query.type || 'industry';
  try {
    const data = await fetchSectors(type);
    res.json({ success: true, data });
  } catch (e) {
    res.json({ success: false, error: e.message, data: [] });
  }
});

// 连板梯队：返回当前涨停股及其连续涨停天数
app.get('/api/limitup', async (req, res) => {
  try {
    const pages = await Promise.all(
      [1, 2, 3].map(p => fetchTopGainers(p, 100, 'all').catch(() => []))
    );
    const seen = new Set();
    const allStocks = pages.flat().filter(s => {
      if (seen.has(s.code)) return false;
      seen.add(s.code); return true;
    });
    const limitUpStocks = allStocks.filter(s => parseFloat(s.change_pct) >= 9.9);

    const results = await batchProcess(limitUpStocks, async (stock) => {
      const secid = getSecId(stock.code);
      const threshold = (stock.code.startsWith('3') || stock.code.startsWith('688')) ? 19.5 : 9.9;
      try {
        const resp = await fetch(
          `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
          `&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
          `&klt=101&fqt=0&end=20991231&lmt=10`,
          { headers: EM_HEADERS, signal: AbortSignal.timeout(6000) }
        );
        const raw = await resp.json();
        const klines = raw?.data?.klines ?? [];
        let consecutive = 0;
        for (let i = klines.length - 1; i >= 0; i--) {
          if (parseFloat(klines[i].split(',')[8]) >= threshold) consecutive++;
          else break;
        }
        return { ...stock, consecutive };
      } catch {
        return { ...stock, consecutive: 1 };
      }
    }, 8);

    results.sort((a, b) => (b.consecutive - a.consecutive) || (parseFloat(b.change_pct) - parseFloat(a.change_pct)));
    res.json({ success: true, data: results, total: results.length, time: nowStr() });
  } catch (e) {
    res.json({ success: false, error: e.message, data: [] });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ 股票涨幅榜已启动！`);
  console.log(`   打开浏览器访问: http://localhost:${PORT}\n`);
});
