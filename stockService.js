const { supabase, cacheGet, cacheSet, cacheTtl, getMarketStatus, nowStr } = require('./config');

const EM_HEADERS = {
  'Referer': 'https://www.eastmoney.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const FS_MAP = {
  all:      'm:0+t:6,m:1+t:2,m:0+t:23,m:1+t:23',
  shanghai: 'm:1+t:2',
  shenzhen: 'm:0+t:6',
  chinext:  'm:0+t:23',
  star:     'm:1+t:23',
};

const SINA_NODE_MAP = {
  all:      'hs_a',
  shanghai: 'sh_a',
  shenzhen: 'sz_a',
  chinext:  'cyb',
  star:     'kcb',
};

const INDEX_SECIDS = ['1.000001', '0.399001', '0.399006', '0.000688'];
const INDEX_NAMES  = { '000001':'上证指数', '399001':'深证成指', '399006':'创业板指', '000688':'科创50' };

let lastDataSource = '东方财富';

// ── Helpers ──────────────────────────────────────────────────────────────
function getSecId(code) {
  return code.startsWith('6') ? `1.${code}` : `0.${code}`;
}

function getTencentCode(code) {
  return `${code.startsWith('6') ? 'sh' : 'sz'}${code}`;
}

function avg(nums) {
  const list = nums.filter(n => Number.isFinite(n));
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
}

// ── 数据源1: 东方财富 ────────────────────────────────────────────────────
async function fetchTopGainers_eastmoney(page = 1, pageSize = 50, board = 'all') {
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
      net_inflow:    item.f62  ?? 0,
      inflow_pct:    item.f184 ?? 0,
      market:        item.f13 === 1 ? 'SH' : 'SZ',
    }));
}

// ── 数据源2: 新浪财经 ────────────────────────────────────────────────────
async function fetchTopGainers_sina(page = 1, pageSize = 50, board = 'all') {
  const node = SINA_NODE_MAP[board] || SINA_NODE_MAP.all;
  const resp = await fetch(
    `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData` +
    `?page=${page}&num=${pageSize}&sort=changepercent&asc=0&node=${node}&symbol=&_s_r_a=init`,
    { headers: { 'Referer': 'https://finance.sina.com.cn/', 'User-Agent': EM_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(10000) }
  );
  const text = await resp.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) return [];
  return data
    .filter(item => item.changepercent !== undefined)
    .map(item => ({
      code:          item.code ?? item.symbol?.replace(/^s[hz]/, '') ?? '',
      name:          item.name ?? '',
      price:         parseFloat(item.trade) || 0,
      change_pct:    parseFloat(item.changepercent) || 0,
      change:        parseFloat(item.pricechange) || 0,
      volume:        parseFloat(item.volume) || 0,
      turnover:      parseFloat(item.amount) || 0,
      turnover_rate: parseFloat(item.turnoverratio) || 0,
      pe:            parseFloat(item.per) || 0,
      volume_ratio:  0,
      high:          parseFloat(item.high) || 0,
      low:           parseFloat(item.low) || 0,
      open:          parseFloat(item.open) || 0,
      prev_close:    parseFloat(item.settlement) || 0,
      market_cap:    parseFloat(item.mktcap) || 0,
      net_inflow:    0,
      inflow_pct:    0,
      market:        (item.code ?? '').startsWith('6') ? 'SH' : 'SZ',
    }));
}

// ── 数据源3: 腾讯财经 ────────────────────────────────────────────────────
async function fetchTopGainers_tencent(page = 1, pageSize = 50, board = 'all') {
  const marketMap = { all: '', shanghai: 'sh', shenzhen: 'sz', chinext: 'sz', star: 'sh' };
  const market = marketMap[board] ?? '';
  const offset = (page - 1) * pageSize;
  const resp = await fetch(
    `https://proxy.finance.qq.com/ifzqgtimg/appstock/app/JsonRankInfo/getStockRankInfo` +
    `?market=${market}&type=pctChg&asc=0&start=${offset}&num=${pageSize}`,
    { headers: { 'Referer': 'https://stockapp.finance.qq.com/', 'User-Agent': EM_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(10000) }
  );
  const raw = await resp.json();
  const list = raw?.data?.rank_data ?? [];
  return list
    .map(line => {
      const p = String(line).split('~');
      if (p.length < 10) return null;
      const code = p[2] ?? '';
      if (board === 'chinext' && !code.startsWith('3')) return null;
      if (board === 'star' && !code.startsWith('688')) return null;
      return {
        code,
        name:          p[1] ?? '',
        price:         parseFloat(p[3]) || 0,
        change_pct:    parseFloat(p[5]) || 0,
        change:        parseFloat(p[4]) || 0,
        volume:        parseFloat(p[6]) || 0,
        turnover:      parseFloat(p[7]) || 0,
        turnover_rate: parseFloat(p[9]) || 0,
        pe:            parseFloat(p[39]) || 0,
        volume_ratio:  0,
        high:          parseFloat(p[33]) || 0,
        low:           parseFloat(p[34]) || 0,
        open:          parseFloat(p[32]) || 0,
        prev_close:    parseFloat(p[4]) ? (parseFloat(p[3]) || 0) - (parseFloat(p[4]) || 0) : 0,
        market_cap:    parseFloat(p[45]) || 0,
        net_inflow:    0,
        inflow_pct:    0,
        market:        code.startsWith('6') ? 'SH' : 'SZ',
      };
    })
    .filter(Boolean);
}

// ── 自动切换：依次尝试 东方财富 → 新浪 → 腾讯 ──────────────────────────
async function fetchTopGainers(page = 1, pageSize = 50, board = 'all') {
  const sources = [
    { name: '东方财富', fn: fetchTopGainers_eastmoney },
    { name: '新浪财经', fn: fetchTopGainers_sina },
    { name: '腾讯财经', fn: fetchTopGainers_tencent },
  ];
  for (const src of sources) {
    try {
      const data = await src.fn(page, pageSize, board);
      if (data && data.length > 0) {
        if (lastDataSource !== src.name) {
          console.log(`📡 数据源切换: ${lastDataSource} → ${src.name}`);
          lastDataSource = src.name;
        }
        return data;
      }
    } catch (e) {
      console.log(`⚠️ ${src.name}请求失败: ${e.message}`);
    }
  }
  return [];
}

// ── 批量获取行情 ─────────────────────────────────────────────────────────
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

// ── K线数据 ──────────────────────────────────────────────────────────────
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
        date: p[0], open: +p[1], close: +p[2], high: +p[3], low: +p[4],
        volume: +p[5], turnover: +p[6], amplitude: +p[7],
        change_pct: +p[8], change: +p[9], turnover_rate: +p[10],
      };
    });
    if (klines.length) return klines;
  } catch {}
  return fetchTencentKlines(code, 101, lmt);
}

async function fetchTencentKlines(code, klt = 101, lmt = 80) {
  const txCode = getTencentCode(code);
  const periodMap = { 101: 'day', 102: 'week', 103: 'month' };
  const period = periodMap[klt];
  if (!period) return [];
  const resp = await fetch(
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${txCode},${period},,,${lmt},qfq`,
    { headers: { 'User-Agent': EM_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(8000) }
  );
  const raw = await resp.json();
  const rows = raw?.data?.[txCode]?.[`qfq${period}`] || raw?.data?.[txCode]?.[period] || [];
  return rows.map((p, i) => {
    const prevClose = i > 0 ? +rows[i - 1][2] : +p[1];
    const close = +p[2];
    const change = close - prevClose;
    return {
      date: p[0], open: +p[1], close, high: +p[3], low: +p[4],
      volume: +p[5], turnover: 0,
      amplitude: prevClose ? ((+p[3] - +p[4]) / prevClose) * 100 : 0,
      change_pct: prevClose ? (change / prevClose) * 100 : 0,
      change, prev_close: prevClose, turnover_rate: 0,
    };
  });
}

async function fetchChartKlines(code, klt, lmt) {
  const secid = getSecId(code);
  try {
    const resp = await fetch(
      `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
      `&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
      `&klt=${klt}&fqt=0&end=20991231&lmt=${lmt}`,
      { headers: EM_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    const raw = await resp.json();
    const klines = (raw?.data?.klines ?? []).map(k => {
      const p = k.split(',');
      return {
        date: p[0], open: +p[1], close: +p[2], high: +p[3], low: +p[4],
        volume: +p[5], change_pct: +p[8], prev_close: +p[2] - +p[9],
      };
    });
    if (klines.length) return klines;
  } catch {}
  const txKlines = await fetchTencentKlines(code, klt, lmt);
  if (txKlines.length) return txKlines;
  if ([5, 10, 15, 30, 60].includes(klt)) {
    const trends = await fetchIntradayTrends(code).catch(() => []);
    return aggregateTrendsToKlines(trends, klt);
  }
  return [];
}

function aggregateTrendsToKlines(trends, minutes) {
  if (!Array.isArray(trends) || !trends.length) return [];
  const buckets = new Map();
  for (const row of trends) {
    const p = String(row).split(',');
    if (p.length < 6) continue;
    const timeText = p[0];
    const price = Number(p[2]);
    const high = Number(p[3]);
    const low = Number(p[4]);
    const volume = Number(p[5]);
    if (!Number.isFinite(price) || price <= 0) continue;
    const m = timeText.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) continue;
    const total = Number(m[2]) * 60 + Number(m[3]);
    const bucketTotal = Math.floor(total / minutes) * minutes;
    const hh = String(Math.floor(bucketTotal / 60)).padStart(2, '0');
    const mm = String(bucketTotal % 60).padStart(2, '0');
    const key = `${m[1]} ${hh}:${mm}`;
    const item = buckets.get(key);
    if (!item) {
      buckets.set(key, {
        date: key, open: price, close: price,
        high: Number.isFinite(high) && high > 0 ? high : price,
        low: Number.isFinite(low) && low > 0 ? low : price,
        volume: Number.isFinite(volume) ? volume : 0, change_pct: 0,
      });
    } else {
      item.close = price;
      item.high = Math.max(item.high, Number.isFinite(high) && high > 0 ? high : price);
      item.low = Math.min(item.low, Number.isFinite(low) && low > 0 ? low : price);
      item.volume += Number.isFinite(volume) ? volume : 0;
    }
  }
  const list = [...buckets.values()];
  for (let i = 0; i < list.length; i++) {
    const prev = i > 0 ? list[i - 1].close : list[i].open;
    list[i].prev_close = prev;
    list[i].change_pct = prev ? ((list[i].close - prev) / prev) * 100 : 0;
  }
  return list;
}

// ── 分时数据 ─────────────────────────────────────────────────────────────
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

// ── 搜索 ─────────────────────────────────────────────────────────────────
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

// ── 指标分析 ─────────────────────────────────────────────────────────────
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
  const trendSignals = [price > ma5, price > ma10, price > ma20, ma5 > ma10, ma10 > ma20, ma20 > ma60];
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
    trend: { label: trend, score: trendScore, above_ma5: price > ma5, above_ma10: price > ma10, above_ma20: price > ma20, near_high20: high20 ? price >= high20 * 0.98 : false, gain5, high20, low20 },
    moving_average: { ma5, ma10, ma20, ma60 },
    activity: { volume_ratio: Number(quote.volume_ratio || 0), turnover_rate: Number(quote.turnover_rate || latest.turnover_rate || 0), volume: Number(quote.volume || latest.volume || 0), avg_volume_5: vol5 },
    capital: { net_inflow: Number(quote.net_inflow || 0), inflow_pct: Number(quote.inflow_pct || 0) },
    valuation: { market_cap: Number(quote.market_cap || 0), pe: Number(quote.pe || 0) },
    strength: { change_pct: Number(quote.change_pct || 0), limit_threshold: threshold, limit_count_30: limitCount30, consecutive_limit: consecutiveLimit },
    risk: { level: risks.length >= 3 ? '偏高' : risks.length >= 1 ? '中等' : '较低', items: risks },
    updated_at: nowStr(),
  };
}

// ── 涨停历史检测 ─────────────────────────────────────────────────────────
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

// ── 大盘指数 ─────────────────────────────────────────────────────────────
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

// ── 板块/概念 ────────────────────────────────────────────────────────────
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

// ── 批处理 ───────────────────────────────────────────────────────────────
async function batchProcess(items, fn, concurrency = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = await Promise.all(items.slice(i, i + concurrency).map(fn));
    results.push(...batch);
    if (i + concurrency < items.length) await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

module.exports = {
  FS_MAP, EM_HEADERS,
  getSecId, getTencentCode,
  get lastDataSource() { return lastDataSource; },
  fetchTopGainers, fetchQuotesBySecids,
  fetchDailyKlines, fetchTencentKlines, fetchChartKlines,
  fetchIntradayTrends, analyzeIntraday,
  resolveStockQuery, analyzeStockIndicators,
  checkLimitUpHistory,
  fetchIndices, fetchSectors,
  batchProcess,
};
