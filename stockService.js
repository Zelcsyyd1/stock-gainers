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

function normalizeTradeTime(value) {
  const text = String(value || '');
  const match = text.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : text.slice(-5);
}

function normalizeScreenTime(value) {
  const match = String(value || '14:30').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '14:30';
  const hh = Math.max(9, Math.min(15, parseInt(match[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(match[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function analyzeIntraday(trends, options = {}) {
  const rules = {
    require_above_avg: options.require_above_avg !== false,
    require_after_time_new_high: options.require_after_time_new_high !== false,
    require_after_new_high_above_avg: options.require_after_new_high_above_avg !== false,
    screen_time: normalizeScreenTime(options.screen_time),
  };
  if (!trends || trends.length < 5) return { pass: false, reason: '分时数据不足' };
  const points = trends
    .map(t => { const p = t.split(','); return { raw_time: p[0], time: normalizeTradeTime(p[0]), price: parseFloat(p[2]), avg: parseFloat(p[7]) }; })
    .filter(p => !isNaN(p.price) && !isNaN(p.avg) && p.avg > 0);
  if (points.length < 5) return { pass: false, reason: '有效数据点不足' };
  const below = rules.require_above_avg ? points.find(p => p.price < p.avg) : null;
  if (below) return { pass: false, reason: `${below.time} 价格跌破均线` };
  if (rules.require_after_time_new_high) {
    const before = points.filter(p => p.time < rules.screen_time);
    const after  = points.filter(p => p.time >= rules.screen_time);
    if (after.length === 0) return { pass: false, reason: `尚未到${rules.screen_time}` };
    const maxBefore = before.length > 0 ? Math.max(...before.map(p => p.price)) : 0;
    const newHighIdx = after.findIndex(p => p.price > maxBefore);
    if (newHighIdx === -1) return { pass: false, reason: `${rules.screen_time}后未破新高` };
    const failPoint = rules.require_after_new_high_above_avg
      ? after.slice(newHighIdx + 1).find(p => p.price < p.avg)
      : null;
    if (failPoint) return { pass: false, reason: `${failPoint.time} 破新高后回落至均线下方` };
  }
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

// ── 龙虎榜 ─────────────────────────────────────────────────────────────
async function fetchDragonTiger() {
  const resp = await fetch(
    `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=ALL&source=WEB&client=GENERAL&sortColumns=TRADE_DATE,SECURITY_CODE&sortTypes=-1,1&pageSize=50&pageNumber=1`,
    { headers: EM_HEADERS, signal: AbortSignal.timeout(10000) }
  );
  const raw = await resp.json();
  const items = raw?.result?.data ?? [];
  return items.map(item => ({
    date: item.TRADE_DATE ? item.TRADE_DATE.slice(0, 10) : '',
    code: item.SECURITY_CODE ?? '',
    name: item.SECURITY_NAME_ABBR ?? '',
    close: item.CLOSE_PRICE ?? 0,
    change_pct: item.CHANGE_RATE ?? 0,
    net_amount: item.BILLBOARD_NET_AMT ?? 0,
    buy_amount: item.BILLBOARD_BUY_AMT ?? 0,
    sell_amount: item.BILLBOARD_SELL_AMT ?? 0,
    deal_amount: item.BILLBOARD_DEAL_AMT ?? 0,
    total_turnover: item.ACCUM_AMOUNT ?? 0,
    net_ratio: item.DEAL_NET_RATIO ?? 0,
    deal_ratio: item.DEAL_AMOUNT_RATIO ?? 0,
    turnover_rate: item.TURNOVERRATE ?? 0,
    free_cap: item.FREE_MARKET_CAP ?? 0,
    reason: item.EXPLANATION ?? '',
  }));
}

// ── 资金流向细分 ─────────────────────────────────────────────────────────
async function fetchMoneyFlow(code) {
  const secid = getSecId(code);
  // Real-time breakdown
  const params = new URLSearchParams({
    secids: secid,
    fields: 'f62,f66,f69,f72,f75,f78,f81,f84,f87',
    fltt: 2, invt: 2, _: Date.now(),
  });
  const resp = await fetch(`https://push2delay.eastmoney.com/api/qt/ulist.np/get?${params}`, {
    headers: EM_HEADERS, signal: AbortSignal.timeout(8000),
  });
  const raw = await resp.json();
  const item = (raw?.data?.diff ?? [])[0];
  if (!item) return null;
  return {
    main_net: item.f62 ?? 0,
    super_large_net: item.f66 ?? 0,
    super_large_pct: item.f69 ?? 0,
    large_net: item.f72 ?? 0,
    large_pct: item.f75 ?? 0,
    medium_net: item.f78 ?? 0,
    medium_pct: item.f81 ?? 0,
    small_net: item.f84 ?? 0,
    small_pct: item.f87 ?? 0,
  };
}

// ── 集合竞价数据 ─────────────────────────────────────────────────────────
async function fetchAuctionData(code) {
  const secid = getSecId(code);
  // Get quote for open/prev_close
  const quotes = await fetchQuotesBySecids([secid]);
  const quote = quotes[0];
  if (!quote) return null;
  const openPrice = parseFloat(quote.open) || 0;
  const prevClose = parseFloat(quote.prev_close) || 0;
  const gapPct = prevClose > 0 ? ((openPrice - prevClose) / prevClose * 100) : 0;

  // Get intraday trends for auction/first-5-min data
  const trends = await fetchIntradayTrends(code);
  let auctionVolume = 0;
  const first5Min = [];
  if (trends && trends.length > 0) {
    for (const t of trends) {
      const p = t.split(',');
      const timeStr = p[0] || '';
      const price = parseFloat(p[2]) || 0;
      const vol = parseInt(p[5]) || 0;
      const m = timeStr.match(/(\d{2}):(\d{2})/);
      if (!m) continue;
      const hh = parseInt(m[1]), mm = parseInt(m[2]);
      const mins = hh * 60 + mm;
      // Auction data: before 9:30
      if (mins < 570) {
        auctionVolume = vol; // cumulative vol at that point
      }
      // First 5 minutes: 9:30 ~ 9:35
      if (mins >= 570 && mins <= 575) {
        first5Min.push({ time: timeStr.slice(-5), price, volume: vol });
      }
    }
    // If no pre-9:30 data, use the first data point volume as auction estimate
    if (auctionVolume === 0 && trends.length > 0) {
      const first = trends[0].split(',');
      auctionVolume = parseInt(first[5]) || 0;
    }
  }
  return {
    open: openPrice,
    prev_close: prevClose,
    gap_pct: gapPct,
    auction_volume: auctionVolume,
    first_5_min: first5Min,
  };
}

// ── 技术指标计算 ─────────────────────────────────────────────────────────
function calculateTechnicals(klines) {
  if (!klines || klines.length < 2) return null;
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const n = closes.length;

  // EMA helper
  function ema(data, period) {
    const result = new Array(data.length).fill(null);
    const k = 2 / (period + 1);
    result[0] = data[0];
    for (let i = 1; i < data.length; i++) {
      result[i] = data[i] * k + result[i - 1] * (1 - k);
    }
    return result;
  }

  // MACD
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif = closes.map((_, i) => ema12[i] - ema26[i]);
  const dea = ema(dif, 9);
  const macdHist = dif.map((d, i) => 2 * (d - dea[i]));

  // KDJ
  const kdjK = new Array(n).fill(50);
  const kdjD = new Array(n).fill(50);
  const kdjJ = new Array(n).fill(50);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - 8);
    const hh = Math.max(...highs.slice(start, i + 1));
    const ll = Math.min(...lows.slice(start, i + 1));
    const rsv = hh !== ll ? ((closes[i] - ll) / (hh - ll)) * 100 : 50;
    kdjK[i] = i === 0 ? rsv : (2 / 3) * kdjK[i - 1] + (1 / 3) * rsv;
    kdjD[i] = i === 0 ? kdjK[i] : (2 / 3) * kdjD[i - 1] + (1 / 3) * kdjK[i];
    kdjJ[i] = 3 * kdjK[i] - 2 * kdjD[i];
  }

  // RSI
  function calcRSI(data, period) {
    const result = new Array(data.length).fill(null);
    let gainSum = 0, lossSum = 0;
    for (let i = 1; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      if (i <= period) {
        if (diff > 0) gainSum += diff; else lossSum -= diff;
        if (i === period) {
          const avgGain = gainSum / period;
          const avgLoss = lossSum / period;
          result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        }
      } else {
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        gainSum = (gainSum * (period - 1) + gain) / period;
        lossSum = (lossSum * (period - 1) + loss) / period;
        result[i] = lossSum === 0 ? 100 : 100 - 100 / (1 + gainSum / lossSum);
      }
    }
    return result;
  }
  const rsi6 = calcRSI(closes, 6);
  const rsi12 = calcRSI(closes, 12);

  // Bollinger Bands (20-day)
  const bollMid = new Array(n).fill(null);
  const bollUpper = new Array(n).fill(null);
  const bollLower = new Array(n).fill(null);
  for (let i = 19; i < n; i++) {
    const slice = closes.slice(i - 19, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / 20;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / 20;
    const std = Math.sqrt(variance);
    bollMid[i] = mean;
    bollUpper[i] = mean + 2 * std;
    bollLower[i] = mean - 2 * std;
  }

  return {
    macd: { dif, dea, histogram: macdHist },
    kdj: { k: kdjK, d: kdjD, j: kdjJ },
    rsi: { rsi6, rsi12 },
    bollinger: { mid: bollMid, upper: bollUpper, lower: bollLower },
  };
}

// ── 龙虎榜席位明细 ─────────────────────────────────────────────────────
async function fetchDragonTigerDetail(code, date) {
  const filter = `(SECURITY_CODE%3D%22${code}%22)(TRADE_DATE%3D%27${date}%27)`;
  const base = `https://datacenter-web.eastmoney.com/api/data/v1/get?columns=ALL&source=WEB&client=GENERAL&pageSize=5`;

  const [buyResp, sellResp] = await Promise.all([
    fetch(`${base}&reportName=RPT_BILLBOARD_DAILYDETAILSBUY&filter=${filter}&sortColumns=BUY_AMT&sortTypes=-1`,
      { headers: EM_HEADERS, signal: AbortSignal.timeout(10000) }),
    fetch(`${base}&reportName=RPT_BILLBOARD_DAILYDETAILSSELL&filter=${filter}&sortColumns=SELL_AMT&sortTypes=-1`,
      { headers: EM_HEADERS, signal: AbortSignal.timeout(10000) }),
  ]);

  const [buyRaw, sellRaw] = await Promise.all([buyResp.json(), sellResp.json()]);

  const mapSeat = item => ({
    rank: item.RANK ?? 0,
    dept_name: item.OPERATEDEPT_NAME ?? '',
    buy_amt: item.BUY_AMT ?? 0,
    sell_amt: item.SELL_AMT ?? 0,
    net_amt: (item.BUY_AMT ?? 0) - (item.SELL_AMT ?? 0),
    is_institution: /机构专用/.test(item.OPERATEDEPT_NAME ?? ''),
  });

  return {
    buys: (buyRaw?.result?.data ?? []).map(mapSeat),
    sells: (sellRaw?.result?.data ?? []).map(mapSeat),
  };
}

// ── 板块联动 ─────────────────────────────────────────────────────────────
async function fetchStockSectors(code) {
  try {
    const resp = await fetch(
      `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_CORETHEME_BOARDTYPE&columns=SECURITY_CODE,BOARD_NAME,BOARD_CODE,IS_PRECISE,BOARD_RANK&filter=(SECURITY_CODE%3D%22${code}%22)&source=SECURITIES&client=APP`,
      { headers: EM_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    const raw = await resp.json();
    const boards = raw?.result?.data ?? [];
    // Get sector quotes for change% (parallel)
    const sectorResults = await Promise.all(
      boards.slice(0, 8).map(async b => {
        const boardCode = b.BOARD_CODE || '';
        const boardName = b.BOARD_NAME || '';
        let stocks = [];
        try {
          stocks = await fetchSectorStocks(boardCode);
        } catch {}
        return { board_code: boardCode, board_name: boardName, stocks };
      })
    );
    return sectorResults;
  } catch {
    return [];
  }
}

async function fetchSectorStocks(boardCode, page = 1, pageSize = 10) {
  const params = new URLSearchParams({
    fs: `b:${boardCode}+f:!50`,
    fields: 'f2,f3,f4,f5,f6,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f62,f184',
    fltt: 2, invt: 2, fid: 'f3', po: 1, pn: page, pz: pageSize,
    _: Date.now(),
  });
  const resp = await fetch(`https://push2delay.eastmoney.com/api/qt/clist/get?${params}`, {
    headers: EM_HEADERS, signal: AbortSignal.timeout(8000),
  });
  const raw = await resp.json();
  const diff = raw?.data?.diff;
  const items = Array.isArray(diff) ? diff : Object.values(diff ?? {});
  return items.map(item => ({
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
  fetchDragonTiger, fetchDragonTigerDetail, fetchMoneyFlow, fetchAuctionData,
  calculateTechnicals, fetchStockSectors, fetchSectorStocks,
  batchProcess,
};
