const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.style.display = q ? 'block' : 'none';
  clearTimeout(searchTimer);
  if (!q) { clearSearch(); return; }
  searchTimer = setTimeout(() => doSearch(q), 300);
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') clearSearch();
});

searchClear.addEventListener('click', clearSearch);

async function doSearch(q) {
  if (isScreenMode) return;
  // 先在已加载数据中快速匹配
  const localHits = allData.filter(s =>
    s.code.includes(q) || s.name.includes(q)
  );
  if (localHits.length) {
    showSearchResults(localHits, q, '榜单内');
    return;
  }
  // 本地无结果 → 搜索全市场
  isSearchMode = true;
  showLoading();
  document.getElementById('search-badge').style.display = 'none';
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    if (json.success && json.data.length) {
      showSearchResults(json.data, q, '全市场');
    } else {
      showEmpty(`未找到与 "${q}" 匹配的股票`);
      isSearchMode = false;
    }
  } catch(e) {
    showEmpty('搜索失败，请重试');
    isSearchMode = false;
  }
}

function showSearchResults(data, q, scope) {
  isSearchMode = true;
  stopAuto();
  searchResults = data;
  document.getElementById('search-badge-text').textContent = `${scope}搜索 "${q}"，共 ${data.length} 条结果`;
  document.getElementById('search-badge').style.display = 'flex';
  page = 1;
  renderNormalTable();
  renderStats();
}

function clearSearch() {
  isSearchMode = false;
  searchResults = [];
  searchInput.value = '';
  searchClear.style.display = 'none';
  document.getElementById('search-badge').style.display = 'none';
  page = 1;
  if (!isScreenMode) {
    if (document.getElementById('auto-refresh').checked) startAuto();
    renderNormalTable();
    renderStats();
  }
}
