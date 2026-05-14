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
  settings.browser_notif = document.getElementById('s-browser-notif').checked;
  settings.auto_screen   = document.getElementById('s-auto-screen').checked;
  settings.webhook       = document.getElementById('s-webhook').value.trim();
  localStorage.setItem('screenSettings', JSON.stringify(settings));
  syncProfileToCloud();

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
  document.getElementById('s-browser-notif').checked = settings.browser_notif;
  document.getElementById('s-auto-screen').checked   = settings.auto_screen;
  document.getElementById('s-webhook').value         = settings.webhook;
}
function resetSettings() {
  settings = { ...DEFAULT_SETTINGS };
  applySettingsToUI();
  localStorage.removeItem('screenSettings');
  syncProfileToCloud();
  showToast('已恢复默认');
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
