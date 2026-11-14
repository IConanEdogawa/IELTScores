const SETTINGS_KEY = 'nylc_ielts_settings';
const DEFAULT_SETTINGS = { theme: 'light' };
const SECTIONS = [
  { key: 'listening' },
  { key: 'reading' },
  { key: 'writing' },
  { key: 'speaking' },
];

const SUPPORT_HANDLE = '@Bro_Zuck';
const SUPPORT_URL = 'https://t.me/Bro_Zuck';
let deferredInstallPrompt = null;
let settings = loadLocalThemeSettings();
let dbReady = false;

bindThemeSelect();
initSupportHint();
initUpdateStatus();
initInstallStatus();
bootDb();

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  initInstallStatus();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  initInstallStatus();
  showToast('App installed');
});

async function bootDb() {
  try {
    await IeltsDB.init();
    dbReady = true;
    setDataHint('SQLite ready on this device.');
  } catch {
    setDataHint('Could not open SQLite database.');
    showToast('Database failed to open');
  }
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = 'main.html';
}

function loadLocalThemeSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const theme = parsed?.theme === 'light' || parsed?.theme === 'dark' || parsed?.theme === 'system'
      ? parsed.theme
      : 'light';
    return { theme };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveLocalThemeSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
  if (dbReady) {
    try { IeltsDB.saveSettings(settings); } catch {}
  }
}

function bindThemeSelect() {
  const select = document.getElementById('themeSelect');
  if (!select) return;
  select.value = settings.theme;
  select.addEventListener('change', function () {
    settings.theme = this.value;
    saveLocalThemeSettings();
    if (typeof window.__applyThemeFromSettings === 'function') {
      window.__applyThemeFromSettings();
    }
    showToast('Theme saved');
  });
}

function initSupportHint() {
  const hint = document.getElementById('supportHint');
  if (!hint) return;
  hint.textContent = `Support contact: ${SUPPORT_HANDLE}`;
}

function buildDiagnostics() {
  const mode = isStandalonePwa() ? 'installed-pwa' : 'browser-tab';
  return [
    'IELTS Tracker diagnostics',
    `time=${new Date().toISOString()}`,
    `user_agent=${navigator.userAgent}`,
    `online=${navigator.onLine}`,
    `mode=${mode}`,
    `service_worker_supported=${'serviceWorker' in navigator}`,
    `theme_pref=${settings.theme}`,
    `sqlite_ready=${dbReady}`
  ].join('\n');
}

async function copyDiagnostics() {
  const text = buildDiagnostics();
  try {
    await navigator.clipboard.writeText(text);
    showToast('Diagnostics copied');
  } catch {
    showToast('Could not copy diagnostics');
  }
}

async function contactSupport() {
  window.location.href = SUPPORT_URL;
}

function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function initUpdateStatus() {
  const btn = document.getElementById('checkUpdatesBtn');
  if (!btn) return;

  if (!isStandalonePwa()) {
    btn.disabled = true;
    setUpdateStatus('Install the app to use manual update checks.');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    btn.disabled = true;
    setUpdateStatus('Service worker is not supported on this device.');
    return;
  }

  setUpdateStatus('Ready to check for updates.');
}

function isIosLike() {
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function initInstallStatus() {
  const btn = document.getElementById('installAppBtn');
  const status = document.getElementById('installStatus');
  if (!btn || !status) return;

  if (isStandalonePwa()) {
    btn.disabled = true;
    status.textContent = 'App is already installed on this device.';
    return;
  }

  btn.disabled = false;

  if (deferredInstallPrompt) {
    status.textContent = 'Install is available. Tap the button to continue.';
    return;
  }

  if (isIosLike()) {
    status.textContent = 'On iPhone/iPad: Share → Add to Home Screen.';
    return;
  }

  status.textContent = 'If install is not shown, open browser menu and choose Install app.';
}

async function installApp() {
  if (isStandalonePwa()) {
    showToast('Already installed');
    initInstallStatus();
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === 'accepted') {
      showToast('Install started');
    } else {
      showToast('Install cancelled');
    }
    deferredInstallPrompt = null;
    initInstallStatus();
    return;
  }

  if (isIosLike()) {
    showToast('Use Share → Add to Home Screen');
  } else {
    showToast('Use browser menu → Install app');
  }
}

function setUpdateStatus(message) {
  const status = document.getElementById('updateStatus');
  if (status) status.textContent = message;
}

function setDataHint(message) {
  const hint = document.getElementById('dataHint');
  if (hint) hint.textContent = message;
}

async function checkForUpdates() {
  const btn = document.getElementById('checkUpdatesBtn');
  if (!btn) return;

  if (!isStandalonePwa()) {
    setUpdateStatus('Update checks are available only in the installed app.');
    return;
  }

  if (!navigator.onLine) {
    setUpdateStatus('No internet connection. Connect and try again.');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    setUpdateStatus('Service worker is not available on this device.');
    return;
  }

  btn.disabled = true;
  setUpdateStatus('Checking for updates...');

  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js')
      || await navigator.serviceWorker.getRegistration();

    if (!registration) {
      setUpdateStatus('No service worker registration found yet. Open Tracker once, then retry.');
      return;
    }

    await registration.update();

    if (registration.waiting) {
      setUpdateStatus('Update downloaded. Reload the app to apply it.');
      showToast('Update available');
      return;
    }

    if (registration.installing) {
      setUpdateStatus('Update is being installed in the background.');
      registration.installing.addEventListener('statechange', () => {
        if (registration.waiting || registration.installing?.state === 'installed') {
          setUpdateStatus('Update downloaded. Reload the app to apply it.');
          showToast('Update available');
        }
      });
      return;
    }

    setUpdateStatus('No new update found right now.');
  } catch {
    setUpdateStatus('Update check failed. Try again in a moment.');
  } finally {
    btn.disabled = false;
  }
}

function isValidDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function clampBand(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(9, Math.max(0, Math.round(num * 2) / 2));
}

function normalizeEntry(raw) {
  if (!raw || !isValidDateString(raw.date)) return null;

  const entry = {
    date: raw.date,
    manualOverall: !!raw.manualOverall,
    mood: String(raw.mood || '').trim(),
  };

  let sum = 0;
  for (const section of SECTIONS) {
    const safe = clampBand(raw[section.key]);
    if (safe === null) return null;
    entry[section.key] = safe;
    sum += safe;
  }

  const rawOverall = clampBand(raw.overall);
  entry.overall = rawOverall === null ? Math.round((sum / 4) * 2) / 2 : rawOverall;
  return entry;
}

function exportEntries() {
  if (!dbReady) {
    setDataHint('Database is still opening.');
    showToast('Database not ready');
    return;
  }

  const entries = IeltsDB.listEntries();
  if (!entries.length) {
    setDataHint('No entries to export yet.');
    showToast('No entries to export');
    return;
  }

  const content = JSON.stringify(entries, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ielts-tracker-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setDataHint(`Exported ${entries.length} entries from SQLite.`);
  showToast('Export complete');
}

async function importEntries(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!dbReady) {
    setDataHint('Database is still opening.');
    showToast('Database not ready');
    event.target.value = '';
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('Invalid JSON structure');

    const dedup = new Map();
    let skipped = 0;

    for (const rawItem of data) {
      const normalized = normalizeEntry(rawItem);
      if (!normalized) {
        skipped += 1;
        continue;
      }
      dedup.set(normalized.date, normalized);
    }

    const normalized = Array.from(dedup.values()).sort((a, b) => a.date.localeCompare(b.date));
    if (!normalized.length) throw new Error('No valid entries found');

    IeltsDB.replaceAllEntries(normalized);
    await IeltsDB.persistNow();
    setDataHint(`Imported ${normalized.length} entries${skipped ? `, skipped ${skipped}` : ''}.`);
    showToast('Import complete');
  } catch {
    setDataHint('Import failed. Use a valid JSON export.');
    showToast('Import failed');
  } finally {
    event.target.value = '';
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}
