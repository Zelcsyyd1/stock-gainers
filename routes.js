const path = require('path');
const crypto = require('crypto');
const { supabase, mailer, cacheGet, cacheSet, cacheTtl, getMarketStatus, nowStr } = require('./config');
const auth = require('./authService');
const stock = require('./stockService');

module.exports = function (app) {

  // ── Helpers ─────────────────────────────────────────────────────────────
  function computeMarketStats(data) {
    if (!data || !data.length) return { limit_up_count: 0, limit_down_count: 0, up_count: 0, down_count: 0, flat_count: 0, avg_change_pct: 0, median_change_pct: 0, sentiment_score: 50, market_sentiment: '观望' };
    let limitUp = 0, limitDown = 0, up = 0, down = 0, flat = 0;
    const pcts = [];
    for (const s of data) {
      const pct = parseFloat(s.change_pct) || 0;
      pcts.push(pct);
      const threshold = (s.code.startsWith('3') || s.code.startsWith('688')) ? 19.5 : 9.9;
      const downThreshold = (s.code.startsWith('3') || s.code.startsWith('688')) ? -19.5 : -9.9;
      if (pct >= threshold) limitUp++;
      else if (pct <= downThreshold) limitDown++;
      if (pct > 0) up++; else if (pct < 0) down++; else flat++;
    }
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    pcts.sort((a, b) => a - b);
    const median = pcts.length % 2 === 0 ? (pcts[pcts.length / 2 - 1] + pcts[pcts.length / 2]) / 2 : pcts[Math.floor(pcts.length / 2)];
    // Sentiment: 0-100 based on up/down ratio + limit counts
    const upRatio = data.length > 0 ? up / data.length : 0.5;
    const limitBonus = Math.min(30, limitUp * 2);
    const limitPenalty = Math.min(30, limitDown * 3);
    const score = Math.max(0, Math.min(100, Math.round(upRatio * 60 + limitBonus - limitPenalty + 20)));
    const sentiment = score >= 80 ? '抢筹升温' : score >= 60 ? '偏多活跃' : score >= 40 ? '观望' : score >= 20 ? '偏空谨慎' : '恐慌杀跌';
    return {
      limit_up_count: limitUp, limit_down_count: limitDown,
      up_count: up, down_count: down, flat_count: flat,
      avg_change_pct: parseFloat(avg.toFixed(2)),
      median_change_pct: parseFloat(median.toFixed(2)),
      sentiment_score: score, market_sentiment: sentiment,
    };
  }

  function generateMarketEvents(data, limit = 30) {
    if (!data || !data.length) return [];
    const events = [];
    const ts = new Date().toISOString();
    for (const s of data) {
      const pct = parseFloat(s.change_pct) || 0;
      const vr = parseFloat(s.volume_ratio) || 0;
      const tr = parseFloat(s.turnover_rate) || 0;
      const threshold = (s.code.startsWith('3') || s.code.startsWith('688')) ? 19.5 : 9.9;
      const base = { ts, code: s.code, name: s.name, price: s.price, change_pct: pct, volume_ratio: vr, turnover_rate: tr };
      if (pct >= threshold) {
        events.push({ ...base, type: 'limit_up', message: '封住涨停', strength: Math.min(100, Math.round(80 + vr * 4)) });
      } else if (pct >= threshold * 0.95 && pct < threshold) {
        events.push({ ...base, type: 'broken_limit', message: '涨停打开', strength: Math.min(100, Math.round(50 + vr * 5)) });
      } else if (pct >= 7) {
        events.push({ ...base, type: 'rapid_rise', message: '快速拉升', strength: Math.min(100, Math.round(pct * 8 + vr * 3)) });
      } else if (pct <= -7) {
        events.push({ ...base, type: 'rapid_fall', message: '急速下跌', strength: Math.min(100, Math.round(Math.abs(pct) * 8 + vr * 3)) });
      }
      if (vr >= 5 && Math.abs(pct) >= 3) {
        events.push({ ...base, type: 'volume_spike', message: `量比${vr.toFixed(1)}异动`, strength: Math.min(100, Math.round(vr * 12)) });
      }
    }
    events.sort((a, b) => b.strength - a.strength);
    return events.slice(0, limit);
  }

  // ── Pages ────────────────────────────────────────────────────────────────
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'home.html')));
  app.get('/market', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'index.html')));

  // ── Auth ─────────────────────────────────────────────────────────────────
  app.get('/api/auth/me', async (req, res) => {
    const user = await auth.currentUser(req);
    res.json({ success: true, user: auth.publicUser(user), profile: user?.profile || null, turnstile_site_key: auth.TURNSTILE_SITE_KEY || null });
  });

  app.post('/api/auth/send-code', async (req, res) => {
    if (!supabase || !mailer) {
      return res.status(503).json({ success: false, error: '账号验证服务暂不可用，行情可免登录查看' });
    }
    const email = auth.normalizeEmail(req.body.email);
    const turnstileToken = String(req.body.turnstileToken || '');
    if (!auth.isValidEmail(email)) {
      return res.status(400).json({ success: false, error: '请输入有效的邮箱地址' });
    }
    if (!auth.checkAuthRateLimit(req, 'send-code', 6)) {
      return res.status(429).json({ success: false, error: '验证码发送过于频繁，请稍后再试' });
    }
    if (!(await auth.verifyTurnstile(req, turnstileToken))) {
      return res.status(400).json({ success: false, error: '人机验证失败，请刷新后重试' });
    }
    const allowed = await auth.checkPersistentLimit(req, 'send_code', email, [
      { scope: 'email', max: 2, windowMs: 10 * 60 * 1000 },
      { scope: 'ip', max: 5, windowMs: 60 * 60 * 1000 },
    ]);
    if (!allowed) {
      return res.status(429).json({ success: false, error: '验证码发送过于频繁，请稍后再试' });
    }
    await auth.recordAuthEvent(req, 'send_code', email);
    const generic = { success: true, message: '如果邮箱可用，验证码已发送，请查收' };
    const { data: existing } = await supabase.from('users').select('username').eq('username', email).single();
    if (existing) return res.json(generic);

    const code = String(crypto.randomInt(100000, 1000000));
    const emailHash = auth.hashIdentifier(email);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from('email_codes').delete().eq('email_hash', emailHash);
    const { error } = await supabase.from('email_codes').insert({
      email_hash: emailHash,
      code_hash: auth.hashEmailCode(email, code),
      expires_at: expiresAt,
      attempts: 0,
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error('Failed to save email code:', error);
      return res.status(500).json({ success: false, error: '验证码保存失败，请检查数据库表配置' });
    }
    try {
      await auth.sendVerificationEmail(email, code);
    } catch (e) {
      console.error('Failed to send verification email:', e);
      return res.status(500).json({ success: false, error: '验证码邮件发送失败，请稍后重试' });
    }
    res.json(generic);
  });

  app.post('/api/auth/register', async (req, res) => {
    if (!supabase) return res.status(503).json({ success: false, error: '账号服务暂不可用，行情可免登录查看' });
    if (!auth.checkAuthRateLimit(req, 'register', 8)) {
      return res.status(429).json({ success: false, error: '注册尝试过于频繁，请稍后再试' });
    }
    const username = auth.normalizeEmail(req.body.username);
    const password = String(req.body.password || '');
    const code = String(req.body.code || '').trim();
    if (!auth.isValidEmail(username)) {
      return res.status(400).json({ success: false, error: '请输入有效的邮箱地址' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: '密码至少8位' });
    }
    if (password.length > 128) {
      return res.status(400).json({ success: false, error: '密码不能超过128位' });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, error: '请输入6位邮箱验证码' });
    }
    const allowed = await auth.checkPersistentLimit(req, 'register_success', username, [
      { scope: 'email', max: 1, windowMs: 24 * 60 * 60 * 1000 },
      { scope: 'ip', max: 10, windowMs: 24 * 60 * 60 * 1000 },
    ]);
    if (!allowed) {
      return res.status(429).json({ success: false, error: '注册过于频繁，请明天再试' });
    }
    const { data: existing } = await supabase.from('users').select('username').eq('username', username).single();
    if (existing) {
      return res.status(409).json({ success: false, error: '该邮箱已被注册' });
    }
    const emailHash = auth.hashIdentifier(username);
    const { data: savedCode, error: codeError } = await supabase
      .from('email_codes').select('*').eq('email_hash', emailHash).single();
    if (codeError || !savedCode) {
      return res.status(400).json({ success: false, error: '验证码无效或已过期，请重新发送' });
    }
    if (new Date(savedCode.expires_at).getTime() < Date.now()) {
      await supabase.from('email_codes').delete().eq('email_hash', emailHash);
      return res.status(400).json({ success: false, error: '验证码已过期，请重新发送' });
    }
    if ((savedCode.attempts || 0) >= 5) {
      await supabase.from('email_codes').delete().eq('email_hash', emailHash);
      return res.status(400).json({ success: false, error: '验证码错误次数过多，请重新发送' });
    }
    if (!auth.timingSafeHexEqual(auth.hashEmailCode(username, code), savedCode.code_hash)) {
      await supabase.from('email_codes').update({ attempts: (savedCode.attempts || 0) + 1 }).eq('email_hash', emailHash);
      return res.status(400).json({ success: false, error: '验证码错误' });
    }
    const profile = { watchlist: [], settings: null, near_limit_range: null, theme: null };
    const nextUser = {
      username,
      password_hash: await auth.hashPassword(password),
      created_at: auth.nowStr(),
      profile,
    };
    const { error } = await supabase.from('users').insert(nextUser);
    if (error) {
      console.error('Failed to save registered user:', error);
      return res.status(500).json({ success: false, error: '账号保存失败，请稍后重试' });
    }
    await supabase.from('email_codes').delete().eq('email_hash', emailHash);
    await auth.recordAuthEvent(req, 'register_success', username);
    const sid = auth.createSessionToken(username);
    auth.setSessionCookie(req, res, sid);
    res.json({ success: true, user: auth.publicUser(nextUser), profile });
  });

  app.post('/api/auth/login', async (req, res) => {
    if (!supabase) return res.status(503).json({ success: false, error: '账号服务暂不可用，行情可免登录查看' });
    if (!auth.checkAuthRateLimit(req, 'login', 20)) {
      return res.status(429).json({ success: false, error: '登录尝试过于频繁，请稍后再试' });
    }
    const username = auth.normalizeEmail(req.body.username);
    const password = String(req.body.password || '');
    if (!auth.isValidEmail(username) || !password) {
      return res.status(400).json({ success: false, error: '请输入邮箱和密码' });
    }
    const { data: user } = await supabase.from('users').select('*').eq('username', username).single();
    if (!user || !(await auth.verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ success: false, error: '邮箱或密码错误' });
    }
    const sid = auth.createSessionToken(username);
    auth.setSessionCookie(req, res, sid);
    res.json({ success: true, user: auth.publicUser(user), profile: user.profile || {} });
  });

  app.post('/api/auth/logout', (req, res) => {
    auth.clearSessionCookie(res);
    res.json({ success: true });
  });

  // ── Profile ──────────────────────────────────────────────────────────────
  app.get('/api/profile', async (req, res) => {
    if (!supabase) return res.status(503).json({ success: false, error: '账号服务暂不可用' });
    const user = await auth.requireUser(req, res);
    if (!user) return;
    res.json({ success: true, profile: user.profile || {} });
  });

  app.put('/api/profile', async (req, res) => {
    if (!supabase) return res.status(503).json({ success: false, error: '账号服务暂不可用' });
    const user = await auth.requireUser(req, res);
    if (!user) return;
    const body = req.body || {};
    const watchlist = Array.isArray(body.watchlist)
      ? body.watchlist.slice(0, 200).filter(w => /^\d{6}$/.test(String(w.code || ''))).map(w => ({ code: String(w.code), name: String(w.name || '') }))
      : user.profile?.watchlist || [];
    const newProfile = {
      watchlist,
      settings: body.settings && typeof body.settings === 'object' ? body.settings : user.profile?.settings || null,
      near_limit_range: body.near_limit_range && typeof body.near_limit_range === 'object' ? body.near_limit_range : user.profile?.near_limit_range || null,
      theme: typeof body.theme === 'string' ? body.theme : user.profile?.theme || null,
      updated_at: nowStr(),
    };
    const { error } = await supabase.from('users').update({ profile: newProfile }).eq('username', user.username);
    if (error) {
      console.error('Failed to save user profile:', error);
      return res.status(500).json({ success: false, error: '账号信息保存失败，请稍后再试' });
    }
    res.json({ success: true, profile: newProfile });
  });

  // ── Stock data ───────────────────────────────────────────────────────────
  app.get('/api/stocks', async (req, res) => {
    const board = stock.FS_MAP[req.query.board] ? req.query.board : 'all';
    const requestedSize = parseInt(req.query.size || '300', 10);
    const pageSize = Math.max(1, Math.min(Number.isFinite(requestedSize) ? requestedSize : 300, 500));
    const marketStatus = getMarketStatus();
    const requestedPage = parseInt(req.query.page || '1', 10);
    const page = Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1);
    const cacheKey = `stocks:${board}:${pageSize}:${page}`;
    const cached = cacheGet(cacheKey, cacheTtl(marketStatus));
    if (cached) {
      return res.json({ ...cached, cached: true, market_open: marketStatus.open, market_status: marketStatus.status, time: nowStr() });
    }
    try {
      let data;
      if (pageSize <= 100) {
        data = await stock.fetchTopGainers(page, pageSize, board);
      } else {
        const pagesNeeded = Math.ceil(pageSize / 100);
        const pages = await Promise.all(
          Array.from({ length: pagesNeeded }, (_, i) => stock.fetchTopGainers(i + 1, 100, board).catch(() => []))
        );
        const seen = new Set();
        data = pages.flat().filter(s => {
          if (seen.has(s.code)) return false;
          seen.add(s.code); return true;
        }).slice(0, pageSize);
      }
      // Compute market overview stats
      const stats = computeMarketStats(data);
      const payload = {
        success: true, data,
        ...stats,
        market_open: marketStatus.open, market_status: marketStatus.status,
        time: nowStr(), last_update_ts: new Date().toISOString(),
        total: data.length, source: stock.lastDataSource,
      };
      cacheSet(cacheKey, payload);
      res.json(payload);
    } catch (e) {
      res.json({ success: false, error: e.message, data: [], source: stock.lastDataSource, time: nowStr() });
    }
  });

  app.get('/api/search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });
    try {
      const suggestResp = await fetch(
        `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(q)}&type=14&token=D43BF722C8E33BDC906FB84D85E326EC&count=10`,
        { headers: stock.EM_HEADERS, signal: AbortSignal.timeout(6000) }
      );
      const suggestRaw = await suggestResp.json();
      const hits = suggestRaw?.QuotationCodeTable?.Data ?? [];
      const stocks = hits.filter(h => h.MktNum === '0' || h.MktNum === '1');
      if (!stocks.length) return res.json({ success: true, data: [] });
      const secids = stocks.map(h => `${h.MktNum === '1' ? 1 : 0}.${h.Code}`);
      const quotes = await stock.fetchQuotesBySecids(secids);
      res.json({ success: true, data: quotes });
    } catch (e) {
      res.json({ success: false, error: e.message, data: [] });
    }
  });

  app.get('/api/indicators', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: false, error: '请输入股票代码或名称' });
    try {
      const quote = await stock.resolveStockQuery(q);
      if (!quote || !quote.code) return res.json({ success: false, error: '未找到匹配的A股股票' });
      const klines = await stock.fetchDailyKlines(quote.code, 80);
      if (!klines.length) return res.json({ success: false, error: '未获取到K线数据' });
      res.json({ success: true, data: stock.analyzeStockIndicators(quote, klines) });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });

  app.get('/api/indices', async (req, res) => {
    const cached = cacheGet('indices', cacheTtl(getMarketStatus(), 20000, 120000));
    if (cached) return res.json({ ...cached, cached: true });
    try {
      const data = await stock.fetchIndices();
      res.json(cacheSet('indices', { success: true, data }));
    } catch (e) {
      res.json({ success: false, error: e.message, data: [] });
    }
  });

  app.post('/api/quotes', async (req, res) => {
    const codes = req.body.codes || [];
    try {
      const secids = codes.map(c => stock.getSecId(c));
      const data = await stock.fetchQuotesBySecids(secids);
      res.json({ success: true, data });
    } catch (e) {
      res.json({ success: false, error: e.message, data: [] });
    }
  });

  app.get('/api/chart/:code', async (req, res) => {
    const code = req.params.code;
    const klt = parseInt(req.query.klt) || 101;
    const lmt = klt <= 60 ? 240 : (klt === 102 ? 104 : 60);
    const threshold = (code.startsWith('3') || code.startsWith('688')) ? 19.5 : 9.9;
    try {
      const [klines, trends] = await Promise.all([
        stock.fetchChartKlines(code, klt, lmt),
        klt === 101 ? stock.fetchIntradayTrends(code).catch(() => []) : Promise.resolve([]),
      ]);
      let consecutive = 0;
      for (let i = klines.length - 1; i >= 0; i--) {
        if (klines[i].change_pct >= threshold) consecutive++;
        else break;
      }
      const technicals = (klt === 101 && klines.length > 0) ? stock.calculateTechnicals(klines) : null;
      res.json({
        success: klines.length > 0, klines, trends, consecutive, technicals,
        source: klines.length ? 'kline' : 'none',
        error: klines.length ? null : '未获取到K线数据',
      });
    } catch (e) {
      res.json({ success: false, error: e.message, klines: [], trends: [], consecutive: 0 });
    }
  });

  // ── Screen ───────────────────────────────────────────────────────────────
  let screenLock = false;
  app.get('/api/screen', async (req, res) => {
    const boolParam = (name, defaultValue = true) => {
      if (req.query[name] === undefined) return defaultValue;
      return String(req.query[name]) !== 'false';
    };
    const screenTime = String(req.query.screen_time || '14:30').match(/^\d{1,2}:\d{2}$/)
      ? String(req.query.screen_time)
      : '14:30';
    const params = {
      min_pct: parseFloat(req.query.min_pct ?? 3),
      max_pct: parseFloat(req.query.max_pct ?? 5),
      max_cap: parseFloat(req.query.max_cap ?? 200) * 1e8,
      min_vr:  parseFloat(req.query.min_vr  ?? 1),
      min_tr:  parseFloat(req.query.min_tr  ?? 5),
      max_tr:  parseFloat(req.query.max_tr  ?? 10),
      require_limit_up_history: boolParam('require_limit_up_history'),
      require_intraday_above_avg: boolParam('require_intraday_above_avg'),
      require_after_time_new_high: boolParam('require_after_time_new_high'),
      require_after_new_high_above_avg: boolParam('require_after_new_high_above_avg'),
      screen_time: screenTime,
    };
    // Cache by params hash, 30s TTL
    const screenCacheKey = `screen:${JSON.stringify(params)}`;
    const cachedScreen = cacheGet(screenCacheKey, 30000);
    if (cachedScreen) return res.json({ ...cachedScreen, cached: true });
    // Prevent concurrent heavy requests
    if (screenLock) return res.status(429).json({ success: false, error: '选股正在进行中，请稍后再试' });
    screenLock = true;
    try {
      const { open } = getMarketStatus();
      const pages = await Promise.all(
        [1, 2, 3, 4].map(p => stock.fetchTopGainers(p, 100, 'all').catch(() => []))
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
      const results = await stock.batchProcess(candidates, async (s) => {
        const [hadLimitUp, trends] = await Promise.all([
          params.require_limit_up_history ? stock.checkLimitUpHistory(s.code) : Promise.resolve(true),
          open ? stock.fetchIntradayTrends(s.code) : Promise.resolve([]),
        ]);
        if (!hadLimitUp) return { ...s, pass: false, had_limit_up: false, fail_reason: '近30交易日无涨停记录' };
        const intraday = (open && trends.length > 0)
          ? stock.analyzeIntraday(trends, {
              require_above_avg: params.require_intraday_above_avg,
              require_after_time_new_high: params.require_after_time_new_high,
              require_after_new_high_above_avg: params.require_after_new_high_above_avg,
              screen_time: params.screen_time,
            })
          : { pass: true, reason: '非交易时间，跳过分时检测' };
        return {
          ...s, had_limit_up: true,
          intraday_reason: intraday.reason,
          pass: intraday.pass,
          fail_reason: intraday.pass ? null : intraday.reason,
        };
      }, 5);
      const passed = results.filter(s => s.pass);
      const time = nowStr();
      if (supabase) {
        await supabase.from('screen_history').insert({
          id: Date.now(), time,
          params: { ...params, max_cap: params.max_cap / 1e8 },
          total_scanned: allStocks.length,
          total_candidates: candidates.length,
          total_passed: passed.length,
          passed: passed.map(s => ({ code: s.code, name: s.name, change_pct: s.change_pct, price: s.price })),
        }).catch(e => console.error('Failed to save history:', e));
      }
      const payload = {
        success: true, passed, all_candidates: results,
        total_scanned: allStocks.length, total_candidates: candidates.length,
        total_passed: passed.length, market_open: open, time, source: stock.lastDataSource,
      };
      cacheSet(screenCacheKey, payload);
      res.json(payload);
    } catch (e) {
      res.json({ success: false, error: e.message, passed: [], all_candidates: [] });
    } finally {
      screenLock = false;
    }
  });

  app.get('/api/history', async (req, res) => {
    if (!supabase) return res.json({ success: true, history: [], storage: 'disabled' });
    const { data, error } = await supabase.from('screen_history').select('*').order('id', { ascending: false }).limit(100);
    if (error) return res.json({ success: false, error: error.message, history: [] });
    res.json({ success: true, history: data || [] });
  });

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

  app.get('/api/sectors', async (req, res) => {
    const type = req.query.type === 'concept' ? 'concept' : 'industry';
    const cacheKey = `sectors:${type}`;
    const cached = cacheGet(cacheKey, cacheTtl(getMarketStatus(), 30000, 180000));
    if (cached) return res.json({ ...cached, cached: true });
    try {
      const data = await stock.fetchSectors(type);
      res.json(cacheSet(cacheKey, { success: true, data }));
    } catch (e) {
      res.json({ success: false, error: e.message, data: [] });
    }
  });

  // ── Dragon Tiger ─────────────────────────────────────────────────────────
  app.get('/api/dragon-tiger', async (req, res) => {
    const cached = cacheGet('dragon-tiger', cacheTtl(getMarketStatus(), 30000, 180000));
    if (cached) return res.json({ ...cached, cached: true });
    try {
      const data = await stock.fetchDragonTiger();
      res.json(cacheSet('dragon-tiger', { success: true, data, time: nowStr() }));
    } catch (e) {
      res.json({ success: false, error: e.message, data: [] });
    }
  });

  // ── Dragon Tiger Detail ──────────────────────────────────────────────────
  app.get('/api/dragon-tiger-detail/:code', async (req, res) => {
    const { code } = req.params;
    const date = (req.query.date || '').trim();
    if (!date) return res.json({ success: false, error: '缺少日期参数' });
    const cacheKey = `dt-detail:${code}:${date}`;
    const cached = cacheGet(cacheKey, 300000);
    if (cached) return res.json({ ...cached, cached: true });
    try {
      const data = await stock.fetchDragonTigerDetail(code, date);
      res.json(cacheSet(cacheKey, { success: true, data }));
    } catch (e) {
      res.json({ success: false, error: e.message, data: null });
    }
  });

  // ── Money Flow ──────────────────────────────────────────────────────────
  app.get('/api/money-flow/:code', async (req, res) => {
    const code = req.params.code;
    try {
      const data = await stock.fetchMoneyFlow(code);
      res.json({ success: true, data });
    } catch (e) {
      res.json({ success: false, error: e.message, data: null });
    }
  });

  // ── Auction Data ────────────────────────────────────────────────────────
  app.get('/api/auction/:code', async (req, res) => {
    const code = req.params.code;
    try {
      const data = await stock.fetchAuctionData(code);
      res.json({ success: true, data });
    } catch (e) {
      res.json({ success: false, error: e.message, data: null });
    }
  });

  // ── Stock Sectors (板块联动) ────────────────────────────────────────────
  app.get('/api/stock-sectors/:code', async (req, res) => {
    const code = req.params.code;
    const cacheKey = `stock-sectors:${code}`;
    const cached = cacheGet(cacheKey, cacheTtl(getMarketStatus(), 30000, 180000));
    if (cached) return res.json({ ...cached, cached: true });
    try {
      const data = await stock.fetchStockSectors(code);
      res.json(cacheSet(cacheKey, { success: true, data }));
    } catch (e) {
      res.json({ success: false, error: e.message, data: [] });
    }
  });

  // ── Sector Stocks (板块内个股列表) ──────────────────────────────────────
  app.get('/api/sector-stocks/:code', async (req, res) => {
    const boardCode = req.params.code;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.size) || 30));
    const cacheKey = `sector-stocks:${boardCode}:${page}:${pageSize}`;
    const cached = cacheGet(cacheKey, cacheTtl(getMarketStatus(), 15000, 120000));
    if (cached) return res.json({ ...cached, cached: true });
    try {
      const data = await stock.fetchSectorStocks(boardCode, page, pageSize);
      res.json(cacheSet(cacheKey, { success: true, data, total: data.length }));
    } catch (e) {
      res.json({ success: false, error: e.message, data: [] });
    }
  });

  // ── Market Events (盘中异动) ─────────────────────────────────────────────
  app.get('/api/market-events', async (req, res) => {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 30));
    const marketStatus = getMarketStatus();
    const cached = cacheGet('market-events', cacheTtl(marketStatus, 15000, 120000));
    if (cached) return res.json({ ...cached, cached: true });
    try {
      const pages = await Promise.all(
        [1, 2, 3].map(p => stock.fetchTopGainers(p, 100, 'all').catch(() => []))
      );
      const seen = new Set();
      const allStocks = pages.flat().filter(s => {
        if (seen.has(s.code)) return false;
        seen.add(s.code); return true;
      });
      const events = generateMarketEvents(allStocks, limit);
      res.json(cacheSet('market-events', { success: true, time: nowStr(), events }));
    } catch (e) {
      res.json({ success: false, error: e.message, events: [] });
    }
  });

  // ── Market Hotspots (板块热点) ──────────────────────────────────────────
  app.get('/api/market-hotspots', async (req, res) => {
    const marketStatus = getMarketStatus();
    const cached = cacheGet('market-hotspots', cacheTtl(marketStatus, 30000, 180000));
    if (cached) return res.json({ ...cached, cached: true });
    try {
      const sectors = await stock.fetchSectors('industry');
      const hotspots = sectors.slice(0, 10).map(s => ({
        name: s.name,
        code: s.code,
        change_pct: s.change_pct,
        up_count: s.up_count,
        down_count: s.down_count,
        leader_name: s.leader_name,
        leader_code: '',
        leader_change_pct: s.leader_pct,
      }));
      res.json(cacheSet('market-hotspots', { success: true, time: nowStr(), hotspots }));
    } catch (e) {
      res.json({ success: false, error: e.message, hotspots: [] });
    }
  });

  app.get('/api/limitup', async (req, res) => {
    const cached = cacheGet('limitup', cacheTtl(getMarketStatus(), 30000, 180000));
    if (cached) return res.json({ ...cached, cached: true });
    try {
      const pages = await Promise.all(
        [1, 2, 3].map(p => stock.fetchTopGainers(p, 100, 'all').catch(() => []))
      );
      const seen = new Set();
      const allStocks = pages.flat().filter(s => {
        if (seen.has(s.code)) return false;
        seen.add(s.code); return true;
      });
      const limitUpStocks = allStocks.filter(s => {
        const pct = parseFloat(s.change_pct);
        const t = (s.code.startsWith('3') || s.code.startsWith('688')) ? 19.5 : 9.9;
        return pct >= t;
      });
      const results = await stock.batchProcess(limitUpStocks, async (s) => {
        const secid = stock.getSecId(s.code);
        const threshold = (s.code.startsWith('3') || s.code.startsWith('688')) ? 19.5 : 9.9;
        try {
          const resp = await fetch(
            `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
            `&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
            `&klt=101&fqt=0&end=20991231&lmt=10`,
            { headers: stock.EM_HEADERS, signal: AbortSignal.timeout(6000) }
          );
          const raw = await resp.json();
          const klines = raw?.data?.klines ?? [];
          let consecutive = 0;
          for (let i = klines.length - 1; i >= 0; i--) {
            if (parseFloat(klines[i].split(',')[8]) >= threshold) consecutive++;
            else break;
          }
          return { ...s, consecutive };
        } catch {
          return { ...s, consecutive: 1 };
        }
      }, 8);
      results.sort((a, b) => (b.consecutive - a.consecutive) || (parseFloat(b.change_pct) - parseFloat(a.change_pct)));
      res.json(cacheSet('limitup', { success: true, data: results, total: results.length, time: nowStr() }));
    } catch (e) {
      res.json({ success: false, error: e.message, data: [] });
    }
  });

};
