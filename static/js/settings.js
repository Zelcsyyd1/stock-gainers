function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem('screenSettings')); if (s) settings = { ...DEFAULT_SETTINGS, ...s }; } catch {}
}
function saveSettings() {
  settings.min_pct   = parseFloat(document.getElementById('s-min-pct').value) || 3;
  settings.max_pct   = parseFloat(document.getElementById('s-max-pct').value) || 5;
  settings.max_cap   = parseFloat(document.getElementById('s-max-cap').value) || 200;
  settings.min_vr    = parseFloat(document.getElementById('s-min-vr').value)  || 1;
  settings.min_tr    = parseFloat(document.getElementById('s-min-tr').value)  || 5;
  settings.max_tr    = parseFloat(document.getElementById('s-max-tr').value)  || 10;
  settings.require_limit_up_history = document.getElementById('s-require-limit-history').checked;
  settings.require_intraday_above_avg = document.getElementById('s-require-intraday-avg').checked;
  settings.require_after_time_new_high = document.getElementById('s-require-new-high').checked;
  settings.require_after_new_high_above_avg = document.getElementById('s-require-new-high-hold').checked;
  settings.screen_time = normalizeScreenTime(document.getElementById('s-screen-time').value);
  settings.browser_notif = document.getElementById('s-browser-notif').checked;
  settings.auto_screen   = document.getElementById('s-auto-screen').checked;
  settings.webhook       = document.getElementById('s-webhook').value.trim();
  localStorage.setItem('screenSettings', JSON.stringify(settings));
  syncProfileToCloud();
  syncScreenRuleControls();

  if (settings.browser_notif && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  closeSettings();
  showToast('设置已保存');
}
function applySettingsToUI() {
  document.getElementById('s-min-pct').value = settings.min_pct;
  document.getElementById('s-max-pct').value = settings.max_pct;
  document.getElementById('s-max-cap').value = settings.max_cap;
  document.getElementById('s-min-vr').value  = settings.min_vr;
  document.getElementById('s-min-tr').value  = settings.min_tr;
  document.getElementById('s-max-tr').value  = settings.max_tr;
  document.getElementById('s-require-limit-history').checked = settings.require_limit_up_history !== false;
  document.getElementById('s-require-intraday-avg').checked = settings.require_intraday_above_avg !== false;
  document.getElementById('s-require-new-high').checked = settings.require_after_time_new_high !== false;
  document.getElementById('s-require-new-high-hold').checked = settings.require_after_new_high_above_avg !== false;
  document.getElementById('s-screen-time').value = normalizeScreenTime(settings.screen_time);
  document.getElementById('s-browser-notif').checked = settings.browser_notif;
  document.getElementById('s-auto-screen').checked   = settings.auto_screen;
  document.getElementById('s-webhook').value         = settings.webhook;
  syncScreenRuleControls();
}
function normalizeScreenTime(value) {
  const text = String(value || '14:30').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '14:30';
  const hh = Math.max(9, Math.min(15, parseInt(match[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(match[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function resetSettings() {
  settings = { ...DEFAULT_SETTINGS };
  applySettingsToUI();
  localStorage.removeItem('screenSettings');
  syncProfileToCloud();
  showToast('已恢复默认');
}
function saveSettingsState() {
  localStorage.setItem('screenSettings', JSON.stringify(settings));
  syncProfileToCloud();
  syncScreenRuleControls();
  if (document.getElementById('screen-banner').style.display !== 'none') updateBannerConditions();
}
function syncScreenRuleControls() {
  document.querySelectorAll('.screen-rule-btn[data-setting]').forEach(btn => {
    const active = settings[btn.dataset.setting] !== false;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    const baseLabel = btn.dataset.label || btn.textContent.replace(/\s*(开|关)$/, '');
    btn.dataset.label = baseLabel;
    btn.textContent = `${baseLabel} ${active ? '开' : '关'}`;
  });
  const holdBtn = document.querySelector('.screen-rule-btn[data-setting="require_after_new_high_above_avg"]');
  const needsNewHigh = settings.require_after_time_new_high !== false;
  if (holdBtn) {
    holdBtn.disabled = !needsNewHigh;
    holdBtn.classList.toggle('disabled', !needsNewHigh);
    holdBtn.title = needsNewHigh ? '' : '先开启“破新高”，这个条件才会生效';
  }
  const timeInput = document.getElementById('screen-rule-time');
  if (timeInput) {
    timeInput.value = normalizeScreenTime(settings.screen_time);
    timeInput.disabled = !needsNewHigh;
    timeInput.title = needsNewHigh ? '' : '先开启“破新高”，时间条件才会生效';
  }
}
function bindScreenRuleControls() {
  document.querySelectorAll('.screen-rule-btn[data-setting]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const key = btn.dataset.setting;
      settings[key] = settings[key] === false;
      saveSettingsState();
      applySettingsToUI();
    });
  });
  const timeInput = document.getElementById('screen-rule-time');
  if (timeInput) {
    timeInput.addEventListener('change', () => {
      settings.screen_time = normalizeScreenTime(timeInput.value);
      saveSettingsState();
      applySettingsToUI();
    });
  }
}
function openSettings() {
  applySettingsToUI();
  document.getElementById('settings-drawer').classList.add('open');
  document.getElementById('settings-overlay').style.display = 'block';
}
function closeSettings() {
  document.getElementById('settings-drawer').classList.remove('open');
  document.getElementById('settings-overlay').style.display = 'none';
}
