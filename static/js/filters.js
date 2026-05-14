const NEAR_LIMIT_RANGE_KEY = 'nearLimitRange';
let nearLimitRange = loadNearLimitRange();

function loadNearLimitRange() {
  try {
    const saved = JSON.parse(localStorage.getItem(NEAR_LIMIT_RANGE_KEY));
    if (Number.isFinite(saved?.min) && Number.isFinite(saved?.max) && saved.min < saved.max) return saved;
  } catch {}
  return { min: 8, max: 9.9 };
}

function syncNearLimitInputs() {
  document.getElementById('near-limit-min').value = nearLimitRange.min;
  document.getElementById('near-limit-max').value = nearLimitRange.max;
}

function readNearLimitRange() {
  const minInput = document.getElementById('near-limit-min');
  const maxInput = document.getElementById('near-limit-max');
  let min = parseFloat(minInput.value);
  let max = parseFloat(maxInput.value);
  if (!Number.isFinite(min)) min = 8;
  if (!Number.isFinite(max)) max = 9.9;
  min = Math.max(0, Math.min(30, min));
  max = Math.max(0, Math.min(30, max));
  if (min >= max) max = Math.min(30, min + 0.1);
  nearLimitRange = { min: +min.toFixed(1), max: +max.toFixed(1) };
  localStorage.setItem(NEAR_LIMIT_RANGE_KEY, JSON.stringify(nearLimitRange));
  syncNearLimitInputs();
  syncProfileToCloud();
  return nearLimitRange;
}

const QUICK_FILTERS = {
  main10:   s => !/^(300|301|688|689)/.test(String(s.code || '')),
  twenty:   s => /^(300|301|688|689)/.test(String(s.code || '')),
  limitup:  s => parseFloat(s.change_pct) >= 9.9,
  nearLimit:s => { const v=parseFloat(s.change_pct); const r=nearLimitRange; return v >= r.min && v < r.max; },
  inflow:   s => parseFloat(s.net_inflow) > 0,
};

syncNearLimitInputs();
function activateNearLimitFilter() {
  activeQuickFilter = 'nearLimit';
  document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('near-limit-control').classList.add('active');
  page = 1;
  renderNormalTable();
  renderStats();
}
document.getElementById('near-limit-min').addEventListener('input', () => {
  readNearLimitRange();
  activateNearLimitFilter();
});
document.getElementById('near-limit-max').addEventListener('input', () => {
  readNearLimitRange();
  activateNearLimitFilter();
});

document.getElementById('quick-filters').addEventListener('click', e => {
  const btn = e.target.closest('.qf-btn');
  if (!btn) return;
  const filter = btn.dataset.filter;
  if (filter === 'clear' || filter === activeQuickFilter) {
    activeQuickFilter = null;
    document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('near-limit-control').classList.remove('active');
    page = 1;
    renderNormalTable(); renderStats();
    return;
  }
  activeQuickFilter = filter;
  document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('near-limit-control').classList.remove('active');
  btn.classList.add('active');
  page = 1;
  renderNormalTable(); renderStats();
});

// Hook into sortedData to apply quick filter
const _origSortedData = window.sortedData;
// We override filter logic in renderNormalTable by patching allData view
function getFilteredData() {
  if (!activeQuickFilter || !QUICK_FILTERS[activeQuickFilter]) return allData;
  return allData.filter(QUICK_FILTERS[activeQuickFilter]);
}
