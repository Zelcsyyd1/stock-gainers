const fs = require('fs');
const path = require('path');

const staticDir = path.join(__dirname, '..', 'static');
const files = [
  'auth.js',
  'js/utils.js',
  'js/state.js',
  'js/settings.js',
  'js/profile.js',
  'js/data.js',
  'js/screen.js',
  'js/history.js',
  'js/render.js',
  'js/chart.js',
  'js/compare.js',
  'js/search.js',
  'js/indicators.js',
  'js/filters.js',
  'js/sectors.js',
  'js/limitup.js',
  'js/export.js',
  'js/theme.js',
  'js/init.js',
];

const parts = files.map(f => {
  const content = fs.readFileSync(path.join(staticDir, f), 'utf8');
  return `/* === ${f} === */\n${content}`;
});

const bundle = parts.join('\n\n');
const outPath = path.join(staticDir, 'bundle.js');
fs.writeFileSync(outPath, bundle, 'utf8');
console.log(`Bundled ${files.length} files → static/bundle.js (${(Buffer.byteLength(bundle) / 1024).toFixed(1)} KB)`);
