const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline/promises');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const checkOnly = process.argv.includes('--check');

const fields = [
  { key: 'PORT', label: 'Local port', defaultValue: '5000', required: false, feature: 'server', validate: isPort },
  { key: 'SUPABASE_URL', label: 'Supabase URL', required: true, feature: 'supabase', validate: isUrl },
  { key: 'SUPABASE_KEY', label: 'Supabase key', required: true, feature: 'supabase', secret: true },
  { key: 'SESSION_SECRET', label: 'Session secret', required: true, feature: 'session', secret: true, generate: () => crypto.randomBytes(32).toString('hex') },
  { key: 'TURNSTILE_SITE_KEY', label: 'Turnstile site key', required: true, feature: 'turnstile', secret: true },
  { key: 'TURNSTILE_SECRET_KEY', label: 'Turnstile secret key', required: true, feature: 'turnstile', secret: true },
  { key: 'SMTP_HOST', label: 'SMTP host', required: true, feature: 'smtp' },
  { key: 'SMTP_PORT', label: 'SMTP port', defaultValue: '465', required: true, feature: 'smtp', validate: isPort },
  { key: 'SMTP_SECURE', label: 'SMTP secure true/false', defaultValue: 'true', required: true, feature: 'smtp', validate: isBoolean },
  { key: 'SMTP_USER', label: 'SMTP user', required: true, feature: 'smtp' },
  { key: 'SMTP_PASS', label: 'SMTP password/app password', required: true, feature: 'smtp', secret: true },
  { key: 'SMTP_FROM', label: 'SMTP from address', required: false, feature: 'smtp' },
];

const featureImpacts = {
  supabase: {
    title: 'Supabase storage',
    affects: [
      'login and registration account records',
      'profile and watchlist sync',
      'screening history storage',
      'persistent auth rate limits',
    ],
  },
  session: {
    title: 'Session signing',
    affects: [
      'login cookies',
      'signed session tokens',
      'verification-code hashes',
      'persistent identifier hashes',
    ],
  },
  turnstile: {
    title: 'Turnstile captcha',
    affects: [
      'registration email-code captcha checks',
      'frontend captcha site key exposure via /api/auth/me',
    ],
  },
  smtp: {
    title: 'SMTP email',
    affects: [
      'registration verification-code email delivery',
      '/api/auth/send-code availability',
    ],
  },
  server: {
    title: 'Server',
    affects: ['custom local port selection'],
  },
};

function isUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536;
}

function isBoolean(value) {
  return value === 'true' || value === 'false';
}

function parseEnv(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

function readEnv() {
  try {
    return { values: parseEnv(fs.readFileSync(envPath, 'utf8')), exists: true };
  } catch (e) {
    if (e.code === 'ENOENT') return { values: {}, exists: false };
    throw e;
  }
}

function serializeEnv(values) {
  return fields
    .map(field => `${field.key}=${escapeValue(values[field.key] || '')}`)
    .join('\n') + '\n';
}

function escapeValue(value) {
  const raw = String(value);
  if (!raw || /[\s#"'=]/.test(raw)) return JSON.stringify(raw);
  return raw;
}

function validate(values) {
  const issues = [];
  for (const field of fields) {
    const value = String(values[field.key] || '').trim();
    if (field.required && !value) {
      issues.push({ key: field.key, type: 'missing', message: `${field.key} is missing`, feature: field.feature });
      continue;
    }
    if (value && field.validate && !field.validate(value)) {
      issues.push({ key: field.key, type: 'invalid', message: `${field.key} is invalid`, feature: field.feature });
    }
  }
  return issues;
}

function printConfigReport(issues, envExists) {
  if (!issues.length) {
    console.log('Config check passed.');
    console.log('Account, registration email, captcha, and profile sync configuration are present.');
    return;
  }

  console.error('Config check failed.');
  if (!envExists) {
    console.error(`No .env file found at ${envPath}`);
    console.error('Create one by copying .env.example or by running: npm run setup');
  }

  console.error('\nMissing or invalid values:');
  for (const issue of issues) {
    console.error(`- ${issue.message}`);
  }

  const affectedFeatures = [...new Set(issues.map(issue => issue.feature).filter(Boolean))];
  console.error('\nFeature impact:');
  for (const feature of affectedFeatures) {
    const impact = featureImpacts[feature];
    if (!impact) continue;
    const keys = issues
      .filter(issue => issue.feature === feature)
      .map(issue => issue.key)
      .join(', ');
    console.error(`- ${impact.title} (${keys}): ${impact.affects.join('; ')}`);
  }

  console.error('\nUnaffected when these are missing:');
  console.error('- Public market data pages and APIs such as /market, /api/stocks, /api/indices, and /api/sectors can still run without account/email config.');
}

async function promptForValues(existing) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const values = { ...existing };
  try {
    for (const field of fields) {
      const current = values[field.key] || field.defaultValue || (field.generate ? field.generate() : '');
      const shown = field.secret && current ? 'keep existing value' : current;
      const suffix = shown ? ` [${shown}]` : '';
      const answer = await rl.question(`${field.label}${suffix}: `);
      values[field.key] = answer.trim() || current;
      if (field.key === 'SMTP_FROM' && !values[field.key]) values[field.key] = values.SMTP_USER || '';
    }
  } finally {
    rl.close();
  }
  return values;
}

async function main() {
  const env = readEnv();
  const existing = env.values;
  if (checkOnly) {
    const issues = validate(existing);
    if (issues.length) {
      printConfigReport(issues, env.exists);
      process.exit(1);
    }
    printConfigReport(issues, env.exists);
    return;
  }

  console.log(`This will create or update ${envPath}`);
  console.log('Press Enter to keep the value shown in brackets.');
  const values = await promptForValues(existing);
  const issues = validate(values);
  if (issues.length) {
    console.error('\nConfig was not saved because these values need attention:');
    for (const issue of issues) console.error(`- ${issue.message}`);
    process.exit(1);
  }
  fs.writeFileSync(envPath, serializeEnv(values), 'utf8');
  console.log(`\nSaved ${envPath}`);
  console.log('Next steps: run "npm run check-config", then "npm run dev".');
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
