const THEMES = {
  dark: {
    name:'盯盘', preview:['#07090d','#111827','#ff3b30','#00c853'],
    '--bg':'#07090d','--surface':'#111827','--border':'#273244',
    '--text':'#f8fafc','--muted':'#94a3b8','--accent':'#ffb020',
    '--red':'#ff3b30','--green':'#00c853','--gold':'#ffb020',
    '--hover-bg':'#1f2937','--input-bg':'#030712','--tab-hover':'#1f2937',
    '--badge-sh-bg':'rgba(148,163,184,.14)','--badge-sh-text':'#cbd5e1',
    '--badge-sz-bg':'rgba(148,163,184,.14)','--badge-sz-text':'#cbd5e1',
    '--screen-btn-bg':'linear-gradient(135deg,rgba(255,59,48,.22),rgba(255,176,32,.22))',
    '--screen-btn-border':'#ffb020','--screen-btn-text':'#ffdf8a',
    '--screen-banner-bg':'linear-gradient(180deg,rgba(17,24,39,.92),rgba(9,12,18,.96))',
    '--screen-banner-border':'rgba(255,176,32,.32)',
  },
  light: {
    name:'浅色', preview:['#f0f2f5','#ffffff','#e02020','#2563eb'],
    '--bg':'#f0f2f5','--surface':'#ffffff','--border':'#dde1ec',
    '--text':'#1a1d27','--muted':'#8892a4','--accent':'#2563eb',
    '--red':'#e02020','--green':'#0c9651','--gold':'#c47f00',
    '--hover-bg':'#eef1f8','--input-bg':'#f8f9fc','--tab-hover':'#e8ecf8',
    '--badge-sh-bg':'#dbeeff','--badge-sh-text':'#1a6bb5',
    '--badge-sz-bg':'#d5f5e8','--badge-sz-text':'#0a7a48',
    '--screen-btn-bg':'linear-gradient(135deg,#dbeeff,#e8e0ff)',
    '--screen-btn-border':'#2563eb','--screen-btn-text':'#1a4ab5',
    '--screen-banner-bg':'linear-gradient(135deg,#dbeeff,#e8e0ff)',
    '--screen-banner-border':'#6090e8',
  },
  navy: {
    name:'深蓝', preview:['#060d1f','#0c1630','#ff5555','#4080ff'],
    '--bg':'#060d1f','--surface':'#0c1630','--border':'#1a2a50',
    '--text':'#c8d8f0','--muted':'#5a7aaa','--accent':'#4080ff',
    '--red':'#ff5555','--green':'#00c878','--gold':'#ffc040',
    '--hover-bg':'#122040','--input-bg':'#060d1f','--tab-hover':'#182038',
    '--badge-sh-bg':'#0d2050','--badge-sh-text':'#60a0ff',
    '--badge-sz-bg':'#0a2a30','--badge-sz-text':'#30d890',
    '--screen-btn-bg':'linear-gradient(135deg,#0d2050,#100840)',
    '--screen-btn-border':'#4080ff','--screen-btn-text':'#80b0ff',
    '--screen-banner-bg':'linear-gradient(135deg,#0a1838,#080d28)',
    '--screen-banner-border':'#2050c0',
  },
  warm: {
    name:'护眼', preview:['#1a1e0e','#232811','#f06050','#80c840'],
    '--bg':'#1a1e0e','--surface':'#232811','--border':'#343d18',
    '--text':'#d8e8c0','--muted':'#7a9060','--accent':'#80c840',
    '--red':'#f06050','--green':'#40c890','--gold':'#e8c040',
    '--hover-bg':'#2a3218','--input-bg':'#1a1e0e','--tab-hover':'#2e3820',
    '--badge-sh-bg':'#1a2e10','--badge-sh-text':'#80c840',
    '--badge-sz-bg':'#102a18','--badge-sz-text':'#40c890',
    '--screen-btn-bg':'linear-gradient(135deg,#1e2e10,#181e08)',
    '--screen-btn-border':'#80c840','--screen-btn-text':'#b0e870',
    '--screen-banner-bg':'linear-gradient(135deg,#1a2a0a,#101808)',
    '--screen-banner-border':'#4a7020',
  },
};

function applyTheme(key) {
  const t = THEMES[key];
  if (!t) return;
  const root = document.documentElement;
  Object.entries(t).forEach(([k, v]) => {
    if (k.startsWith('--')) root.style.setProperty(k, v);
  });
  currentTheme = key;
  localStorage.setItem('theme', key);
  renderThemePicker();
  syncProfileToCloud();
}

function renderThemePicker() {
  document.getElementById('theme-grid').innerHTML = Object.entries(THEMES).map(([key, t]) => `
    <div class="theme-card ${key === currentTheme ? 'active' : ''}" onclick="applyTheme('${key}')">
      <div class="theme-card-preview">
        ${t.preview.map(c => `<span style="background:${c}"></span>`).join('')}
      </div>
      <div class="theme-card-name">${t.name}</div>
    </div>`).join('');
}

// 主题按钮 toggle
document.getElementById('theme-btn').addEventListener('click', e => {
  e.stopPropagation();
  const picker = document.getElementById('theme-picker');
  const isOpen = picker.classList.toggle('open');
  if (isOpen) renderThemePicker();
});
document.addEventListener('click', e => {
  if (!e.target.closest('#theme-picker') && !e.target.closest('#theme-btn')) {
    document.getElementById('theme-picker').classList.remove('open');
  }
});

// 启动时应用保存的主题
applyTheme(currentTheme);
