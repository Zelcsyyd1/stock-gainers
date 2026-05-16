function escapeHtml(s) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(s ?? '')));
  return d.innerHTML;
}

function fmt(n, dec=2) {
  if (n===undefined||n===null||n===''||n==='-') return '--';
  const v=parseFloat(n); return isNaN(v)?'--':v.toFixed(dec);
}
function fmtVol(n) {
  if (!n||n==='-') return '--';
  const v=parseInt(n); if(isNaN(v)) return '--';
  return v>=100000000?(v/100000000).toFixed(2)+'亿':v>=10000?(v/10000).toFixed(2)+'万':v.toString();
}
function fmtMoney(n) {
  if (!n||n==='-') return '--';
  const v=parseFloat(n); if(isNaN(v)||v<=0) return '--';
  return v>=1e12?(v/1e12).toFixed(2)+'万亿':v>=1e8?(v/1e8).toFixed(2)+'亿':v>=1e4?(v/1e4).toFixed(0)+'万':'--';
}
function fmtCap(n) {
  if (!n||n==='-') return '--';
  const v=parseFloat(n); return isNaN(v)?'--':(v/1e8).toFixed(2)+'亿';
}
function fmtAmp(s) {
  const h=parseFloat(s.high), l=parseFloat(s.low), pc=parseFloat(s.prev_close);
  if(!h||!l||!pc||pc<=0) return '--';
  return ((h-l)/pc*100).toFixed(2)+'%';
}
function fmtPct(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '--';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}
function fmtBigMoney(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '--';
  if (n === 0) return '0';
  const sign = n > 0 ? '+' : '';
  const abs = Math.abs(n);
  if (abs >= 1e8) return sign + (n / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return sign + (n / 1e4).toFixed(0) + '万';
  return sign + n.toFixed(0);
}
function pctClass(v) { const n=parseFloat(v); if(isNaN(n)||n===0) return 'flat'; return n>0?'up':'down'; }
function isLimitUp(v, code) {
  const threshold = (code && (/^3\d{5}$/.test(code) || /^688\d{3}$/.test(code))) ? 19.5 : 9.9;
  return parseFloat(v) >= threshold;
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, { position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)', background:'#2a2d3e', color:'#e2e8f0', padding:'8px 20px', borderRadius:'8px', fontSize:'13px', zIndex:'9999', border:'1px solid #4e8ef7', transition:'opacity .3s' });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 2000);
}

function sortedData(data) {
  return [...data].sort((a,b) => {
    let va=parseFloat(a[sortCol])||0, vb=parseFloat(b[sortCol])||0;
    return sortDir==='asc'?va-vb:vb-va;
  });
}
