const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

// ── Load .env ────────────────────────────────────────────────────────────
function loadEnvFile(filePath = path.join(__dirname, '.env')) {
  try {
    const raw = require('fs').readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`Failed to load .env: ${e.message}`);
  }
}

loadEnvFile();

// ── Constants & env ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wcjkpexotnxkwjryflfp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const SESSION_SECRET = process.env.SESSION_SECRET || SUPABASE_KEY || 'dev-session-secret-change-me';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true') === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

// ── Supabase ─────────────────────────────────────────────────────────────
const supabase = SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const missingConfig = [];
if (!SUPABASE_KEY) missingConfig.push('SUPABASE_KEY');
if (!process.env.SESSION_SECRET || SESSION_SECRET === 'dev-session-secret-change-me') missingConfig.push('SESSION_SECRET');
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) missingConfig.push('SMTP_HOST/SMTP_USER/SMTP_PASS');
if (!TURNSTILE_SECRET_KEY || !TURNSTILE_SITE_KEY) missingConfig.push('TURNSTILE_SECRET_KEY/TURNSTILE_SITE_KEY');
if (missingConfig.length) {
  console.warn(`Missing optional config: ${missingConfig.join(', ')}. Run "npm run setup" to create .env.`);
}
if (!supabase) console.warn('SUPABASE_KEY is not set; auth, profile sync, and history storage are disabled.');
if (!TURNSTILE_SECRET_KEY) console.warn('TURNSTILE_SECRET_KEY is not set; registration captcha checks are disabled.');

// ── Mailer ───────────────────────────────────────────────────────────────
const mailer = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    })
  : null;

// ── Shared caches ────────────────────────────────────────────────────────
const responseCache = new Map();
const authAttempts = new Map();
const scryptAsync = promisify(crypto.scrypt);

// ── Cache helpers ────────────────────────────────────────────────────────
function cacheGet(key, ttlMs) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > ttlMs) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  responseCache.set(key, { time: Date.now(), value });
  return value;
}

function cacheTtl({ open }, openMs = 15000, closedMs = 60000) {
  return open ? openMs : closedMs;
}

// ── Time helpers ─────────────────────────────────────────────────────────
function getBeijingDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
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

function nowStr() {
  const bj = getBeijingDate();
  const pad = n => String(n).padStart(2, '0');
  return `${bj.getFullYear()}-${pad(bj.getMonth()+1)}-${pad(bj.getDate())} ` +
         `${pad(bj.getHours())}:${pad(bj.getMinutes())}:${pad(bj.getSeconds())}`;
}

// ── Memory cleanup (every 10 min) ────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of authAttempts) {
    if (now > entry.resetAt) authAttempts.delete(key);
  }
  for (const [key, entry] of responseCache) {
    if (now - entry.time > 300000) responseCache.delete(key);
  }
}, 10 * 60 * 1000);

module.exports = {
  PORT,
  SUPABASE_URL, SUPABASE_KEY, SESSION_SECRET, SESSION_MAX_AGE_SECONDS,
  TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY,
  SMTP_FROM,
  supabase, mailer, scryptAsync,
  responseCache, authAttempts,
  cacheGet, cacheSet, cacheTtl,
  getBeijingDate, getMarketStatus, nowStr,
};
