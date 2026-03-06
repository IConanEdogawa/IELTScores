const SETTINGS_KEY = 'nylc_ielts_settings';

initThemeBrowser();

function initThemeBrowser() {
  if (!isStandalonePwa()) {
    window.location.href = 'settings.html';
    return;
  }

  const status = document.getElementById('browserStatus');
  if (!status) return;

  if (!navigator.onLine) {
    status.textContent = 'You are offline. Connect to internet to browse and apply themes.';
    document.querySelectorAll('.btn-apply').forEach(btn => btn.disabled = true);
    return;
  }

  status.textContent = 'Online and ready. Pick a theme to apply now.';
  highlightActiveTheme();
}

function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function readSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { theme: 'system' };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { theme: 'system' };
  } catch {
    return { theme: 'system' };
  }
}

function writeTheme(theme) {
  const current = readSettings();
  const next = { ...current, theme };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}

function highlightActiveTheme() {
  const current = readSettings().theme || 'system';
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.themeOption === current);
  });
}

function applyThemeChoice(theme) {
  if (!navigator.onLine) {
    showToast('Internet required to browse themes');
    return;
  }
  writeTheme(theme);
  if (typeof window.__applyThemeFromSettings === 'function') {
    window.__applyThemeFromSettings();
  }
  highlightActiveTheme();
  showToast('Theme applied');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}
