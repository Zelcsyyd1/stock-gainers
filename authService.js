const crypto = require('crypto');
const {
  SESSION_SECRET, SESSION_MAX_AGE_SECONDS,
  TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY,
  SMTP_FROM,
  supabase, mailer, scryptAsync,
  authAttempts, nowStr,
} = require('./config');

// ── Helpers ──────────────────────────────────────────────────────────────
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 120;
}

function publicUser(user) {
  return user ? { username: user.username, created_at: user.created_at } : null;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signSessionPayload(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function createSessionToken(username) {
  const payload = base64url(JSON.stringify({ username, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 }));
  return `${payload}.${signSessionPayload(payload)}`;
}

function verifySessionToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = signSessionPayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.username || Date.now() > data.exp) return null;
    return normalizeEmail(data.username);
  } catch {
    return null;
  }
}

function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function hashIdentifier(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(String(value || '')).digest('hex');
}

function hashEmailCode(email, code) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`${normalizeEmail(email)}:${code}`).digest('hex');
}

function timingSafeHexEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function checkAuthRateLimit(req, key, maxAttempts = 12, windowMs = 10 * 60 * 1000) {
  const id = `${key}:${getClientIp(req)}`;
  const now = Date.now();
  const entry = authAttempts.get(id) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  authAttempts.set(id, entry);
  return entry.count <= maxAttempts;
}

async function countAuthEvents(action, field, value, sinceMs) {
  if (!supabase) return 0;
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { count, error } = await supabase
    .from('auth_events')
    .select('id', { count: 'exact', head: true })
    .eq('action', action)
    .eq(field, value)
    .gte('created_at', since);
  if (error) {
    console.warn('auth_events count failed:', error.message);
    return 0;
  }
  return count || 0;
}

async function recordAuthEvent(req, action, email = '') {
  if (!supabase) return;
  const payload = {
    action,
    email_hash: email ? hashIdentifier(normalizeEmail(email)) : null,
    ip_hash: hashIdentifier(getClientIp(req)),
    user_agent_hash: hashIdentifier(req.headers['user-agent'] || ''),
    created_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('auth_events').insert(payload);
  if (error) console.warn('auth_events insert failed:', error.message);
}

async function checkPersistentLimit(req, action, email, rules) {
  if (!supabase) return true;
  const emailHash = email ? hashIdentifier(normalizeEmail(email)) : null;
  const ipHash = hashIdentifier(getClientIp(req));
  for (const rule of rules) {
    const field = rule.scope === 'email' ? 'email_hash' : 'ip_hash';
    const value = rule.scope === 'email' ? emailHash : ipHash;
    if (!value) continue;
    const count = await countAuthEvents(action, field, value, rule.windowMs);
    if (count >= rule.max) return false;
  }
  return true;
}

async function verifyTurnstile(req, token) {
  if (!TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  const body = new URLSearchParams({
    secret: TURNSTILE_SECRET_KEY,
    response: token,
    remoteip: getClientIp(req),
  });
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8000),
    });
    const json = await resp.json();
    return !!json.success;
  } catch (e) {
    console.warn('Turnstile verification failed:', e.message);
    return false;
  }
}

async function sendVerificationEmail(email, code) {
  if (!mailer) throw new Error('邮件服务未配置');
  await mailer.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: '涨势通注册验证码',
    text: `你的注册验证码是 ${code}，10分钟内有效。若不是你本人操作，请忽略这封邮件。`,
    html: `<p>你的注册验证码是 <strong style="font-size:20px">${code}</strong></p><p>10分钟内有效。若不是你本人操作，请忽略这封邮件。</p>`,
  });
}

async function sendResetEmail(email, code) {
  if (!mailer) throw new Error('邮件服务未配置');
  await mailer.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: '涨势通密码重置验证码',
    text: `你的密码重置验证码是 ${code}，10分钟内有效。若不是你本人操作，请忽略这封邮件。`,
    html: `<p>你的密码重置验证码是 <strong style="font-size:20px">${code}</strong></p><p>10分钟内有效。若不是你本人操作，请忽略这封邮件。</p>`,
  });
}

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((acc, item) => {
    const idx = item.indexOf('=');
    if (idx === -1) return acc;
    try {
      acc[item.slice(0, idx).trim()] = decodeURIComponent(item.slice(idx + 1).trim());
    } catch {
      acc[item.slice(0, idx).trim()] = '';
    }
    return acc;
  }, {});
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [salt, hashHex] = String(stored || '').split(':');
  if (!salt || !hashHex) return false;
  const candidate = await hashPassword(password, salt);
  const a = Buffer.from(candidate.split(':')[1], 'hex');
  const b = Buffer.from(hashHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setSessionCookie(req, res, sid) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', [
    `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}; Priority=High${secure ? '; Secure' : ''}`,
  ]);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

async function currentUser(req) {
  if (!supabase) return null;
  const sid = parseCookies(req).sid;
  const username = sid ? verifySessionToken(sid) : null;
  if (!username) return null;
  const { data } = await supabase.from('users').select('*').eq('username', username).single();
  return data || null;
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ success: false, error: '请先登录' });
    return null;
  }
  return user;
}

async function sendVerificationEmail(email, code) {
  if (!mailer) throw new Error('\u90ae\u4ef6\u670d\u52a1\u672a\u914d\u7f6e');
  await mailer.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: '\u6da8\u52bf\u901a\u6ce8\u518c\u9a8c\u8bc1\u7801',
    text: `\u4f60\u7684\u6ce8\u518c\u9a8c\u8bc1\u7801\u662f ${code}\uff0c10\u5206\u949f\u5185\u6709\u6548\u3002\u82e5\u4e0d\u662f\u4f60\u672c\u4eba\u64cd\u4f5c\uff0c\u8bf7\u5ffd\u7565\u8fd9\u5c01\u90ae\u4ef6\u3002`,
    html: `<p>\u4f60\u7684\u6ce8\u518c\u9a8c\u8bc1\u7801\u662f <strong style="font-size:20px">${code}</strong></p><p>10\u5206\u949f\u5185\u6709\u6548\u3002\u82e5\u4e0d\u662f\u4f60\u672c\u4eba\u64cd\u4f5c\uff0c\u8bf7\u5ffd\u7565\u8fd9\u5c01\u90ae\u4ef6\u3002</p>`,
  });
}

async function sendResetEmail(email, code) {
  if (!mailer) throw new Error('\u90ae\u4ef6\u670d\u52a1\u672a\u914d\u7f6e');
  await mailer.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: '\u6da8\u52bf\u901a\u5bc6\u7801\u91cd\u7f6e\u9a8c\u8bc1\u7801',
    text: `\u4f60\u7684\u5bc6\u7801\u91cd\u7f6e\u9a8c\u8bc1\u7801\u662f ${code}\uff0c10\u5206\u949f\u5185\u6709\u6548\u3002\u82e5\u4e0d\u662f\u4f60\u672c\u4eba\u64cd\u4f5c\uff0c\u8bf7\u5ffd\u7565\u8fd9\u5c01\u90ae\u4ef6\u3002`,
    html: `<p>\u4f60\u7684\u5bc6\u7801\u91cd\u7f6e\u9a8c\u8bc1\u7801\u662f <strong style="font-size:20px">${code}</strong></p><p>10\u5206\u949f\u5185\u6709\u6548\u3002\u82e5\u4e0d\u662f\u4f60\u672c\u4eba\u64cd\u4f5c\uff0c\u8bf7\u5ffd\u7565\u8fd9\u5c01\u90ae\u4ef6\u3002</p>`,
  });
}

module.exports = {
  supabase,
  normalizeEmail, isValidEmail, publicUser,
  createSessionToken, verifySessionToken,
  hashIdentifier, hashEmailCode, timingSafeHexEqual,
  checkAuthRateLimit, recordAuthEvent, checkPersistentLimit,
  verifyTurnstile, sendVerificationEmail, sendResetEmail,
  parseCookies, hashPassword, verifyPassword,
  setSessionCookie, clearSessionCookie,
  currentUser, requireUser,
  TURNSTILE_SITE_KEY,
  nowStr,
};
