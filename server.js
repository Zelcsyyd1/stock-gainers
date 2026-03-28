const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

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

// secid: 上海 1.6xxxxx, 深圳 0.0/3xxxxx
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
    // f8=换手率 f10=量比 f20=总市值
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
      turnover_rate: item.f8  ?? 0,   // 换手率 %
      pe:            item.f9  ?? 0,
      volume_ratio:  item.f10 ?? 0,   // 量比
      high:          item.f15 ?? 0,
      low:           item.f16 ?? 0,
      open:          item.f17 ?? 0,
      prev_close:    item.f18 ?? 0,
      market_cap:    item.f20 ?? 0,   // 总市值（元）
      market:        item.f13 === 1 ? 'SH' : 'SZ',
    }));
}

// 检查近30个交易日是否有涨停
async function checkLimitUpHistory(code) {
  const secid = getSecId(code);
  // 创业板/科创板 20% 限制
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

// 获取当天分时数据
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

// 分析分时图条件7：
//   1. 全天价格在黄色均价线上
//   2. 14:30后破新高
//   3. 破新高后回落不落均线
function analyzeIntraday(trends) {
  if (!trends || trends.length < 5) return { pass: false, reason: '分时数据不足' };

  const points = trends
    .map(t => {
      const p = t.split(',');
      return { time: p[0], price: parseFloat(p[2]), avg: parseFloat(p[7]) };
    })
    .filter(p => !isNaN(p.price) && !isNaN(p.avg) && p.avg > 0);

  if (points.length < 5) return { pass: false, reason: '有效数据点不足' };

  // 条件1：全天在均线上
  const below = points.find(p => p.price < p.avg);
  if (below) return { pass: false, reason: `${below.time} 价格跌破均线` };

  const before = points.filter(p => p.time < '14:30');
  const after  = points.filter(p => p.time >= '14:30');

  if (after.length === 0) return { pass: false, reason: '尚未到14:30，无法判断' };

  const maxBefore = before.length > 0 ? Math.max(...before.map(p => p.price)) : 0;

  // 条件2：14:30后破新高
  const newHighIdx = after.findIndex(p => p.price > maxBefore);
  if (newHighIdx === -1) return { pass: false, reason: '14:30后未破新高' };

  // 条件3：破新高后回落不落均线
  const afterHigh = after.slice(newHighIdx + 1);
  const failPoint = afterHigh.find(p => p.price < p.avg);
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

// ── Routes ───────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'index.html')));

app.get('/api/stocks', async (req, res) => {
  const board    = req.query.board || 'all';
  const page     = parseInt(req.query.page || '1');
  const pageSize = parseInt(req.query.size || '50');
  try {
    const data = await fetchTopGainers(page, pageSize, board);
    const bj = getBeijingDate();
    const { open, status } = getMarketStatus();
    const pad = n => String(n).padStart(2, '0');
    const timeStr = `${bj.getFullYear()}-${pad(bj.getMonth()+1)}-${pad(bj.getDate())} ` +
                    `${pad(bj.getHours())}:${pad(bj.getMinutes())}:${pad(bj.getSeconds())}`;
    res.json({ success: true, data, market_open: open, market_status: status, time: timeStr, total: data.length });
  } catch (e) {
    res.json({ success: false, error: e.message, data: [] });
  }
});

// 2:30 选股筛选接口
app.get('/api/screen', async (req, res) => {
  try {
    const { open } = getMarketStatus();

    // 取前400只涨幅股（4页×100）
    const pages = await Promise.all(
      [1, 2, 3, 4].map(p => fetchTopGainers(p, 100, 'all').catch(() => []))
    );
    const allStocks = pages.flat();

    // 快速过滤（条件1-5）
    // 1. 涨幅 3-5%
    // 2. 市值 < 200亿
    // 3. 量比 > 1
    // 4. 换手率 5-10%
    const candidates = allStocks.filter(s => {
      const pct = parseFloat(s.change_pct);
      const cap = parseFloat(s.market_cap);
      const vr  = parseFloat(s.volume_ratio);
      const tr  = parseFloat(s.turnover_rate);
      return pct >= 3 && pct <= 5 &&
             cap > 0 && cap < 20_000_000_000 &&
             vr > 1 &&
             tr >= 5 && tr <= 10;
    });

    // 慢速检查：30日涨停 + 分时条件
    const results = await batchProcess(candidates, async (stock) => {
      const [hadLimitUp, trends] = await Promise.all([
        checkLimitUpHistory(stock.code),
        open ? fetchIntradayTrends(stock.code) : Promise.resolve([]),
      ]);

      if (!hadLimitUp) {
        return { ...stock, pass: false, fail_reason: '近30交易日无涨停记录' };
      }

      const intraday = (open && trends.length > 0)
        ? analyzeIntraday(trends)
        : { pass: true, reason: '非交易时间，跳过分时检测' };

      return {
        ...stock,
        pass: intraday.pass,
        had_limit_up: true,
        intraday_reason: intraday.reason,
        fail_reason: intraday.pass ? null : intraday.reason,
      };
    }, 5);

    const bj = getBeijingDate();
    const pad = n => String(n).padStart(2, '0');
    const timeStr = `${bj.getFullYear()}-${pad(bj.getMonth()+1)}-${pad(bj.getDate())} ` +
                    `${pad(bj.getHours())}:${pad(bj.getMinutes())}:${pad(bj.getSeconds())}`;

    res.json({
      success: true,
      passed:         results.filter(s => s.pass),
      all_candidates: results,
      total_scanned:  allStocks.length,
      total_candidates: candidates.length,
      total_passed:   results.filter(s => s.pass).length,
      market_open:    open,
      time:           timeStr,
    });
  } catch (e) {
    res.json({ success: false, error: e.message, passed: [], all_candidates: [] });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ 股票涨幅榜已启动！`);
  console.log(`   打开浏览器访问: http://localhost:${PORT}\n`);
});
