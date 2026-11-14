/* Settings page: theme, backup, updates, install, about. */
const { showToast } = UI;
const SETTINGS_KEY = 'nylc_ielts_settings';
const SECTIONS = ['listening', 'reading', 'writing', 'speaking'];
const SUPPORT_HANDLE = '@Bro_Zuck';

let deferredInstallPrompt = null;
let dbReady = false;
let reloadReady = false;

function loadThemePref() {
  const t = UI.readSettings().theme;
  return t === 'light' || t === 'dark' || t === 'system' ? t : 'light';
}

function init() {
  document.getElementById('backBtn').addEventListener('click', goBack);
  bindThemeSeg();
  document.getElementById('exportBtn').addEventListener('click', exportEntries);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importEntries);
  document.getElementById('checkUpdatesBtn').addEventListener('click', checkForUpdates);
  document.getElementById('installAppBtn').addEventListener('click', installApp);
  document.getElementById('copyDiagBtn').addEventListener('click', copyDiagnostics);
  initUpdateStatus();
  initInstallStatus();
  showVersion();
  bootDb();
}

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
    refreshDataCount();
    document.getElementById('dbState').textContent = 'SQLite ready';
  } catch {
    document.getElementById('dbState').textContent = 'SQLite error';
    setDataHint('Could not open the local database.');
    showToast('Database failed to open', 'info');
  }
}

function refreshDataCount() {
  if (!dbReady) return;
  document.getElementById('dataCount').textContent = String(IeltsDB.listEntries().length);
}

function goBack() {
  if (document.referrer && new URL(document.referrer).origin === location.origin && window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = 'main.html';
}

function bindThemeSeg() {
  const seg = document.getElementById('themeSeg');
  const sync = () => {
    const pref = loadThemePref();
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.themeValue === pref ? 'true' : 'false'));
  };
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    UI.setThemePreference(b.dataset.themeValue);
    sync();
    showToast(`Theme: ${b.textContent.trim()}`, b.dataset.themeValue === 'dark' ? 'moon' : b.dataset.themeValue === 'system' ? 'monitor' : 'sun');
  }));
  sync();
}

async function showVersion() {
  const el = document.getElementById('versionLabel');
  try {
    const keys = 'caches' in window ? await caches.keys() : [];
    const k = keys.find(n => n.startsWith('ielts-tracker-'));
    el.textContent = k ? `build ${k.replace('ielts-tracker-', '')}` : 'IELTS Tracker';
  } catch {
    el.textContent = 'IELTS Tracker';
  }
}

function buildDiagnostics() {
  return [
    'IELTS Tracker diagnostics',
    `time=${new Date().toISOString()}`,
    `user_agent=${navigator.userAgent}`,
    `online=${navigator.onLine}`,
    `mode=${isStandalonePwa() ? 'installed-pwa' : 'browser-tab'}`,
    `service_worker_supported=${'serviceWorker' in navigator}`,
    `theme_pref=${loadThemePref()}`,
    `sqlite_ready=${dbReady}`,
    `entries=${dbReady ? IeltsDB.listEntries().length : 'n/a'}`,
  ].join('\n');
}

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(buildDiagnostics());
    showToast('Diagnostics copied', 'copy');
    document.getElementById('supportHint').textContent = `Paste it into a message to Zack (${SUPPORT_HANDLE}) if something looks wrong.`;
  } catch {
    showToast('Could not copy diagnostics', 'info');
  }
}

function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIosLike() {
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
}

/* ---------- updates ---------- */
function setUpdateStatus(message) {
  const s = document.getElementById('updateStatus');
  if (s) s.textContent = message;
}

function markReloadReady() {
  reloadReady = true;
  const btn = document.getElementById('checkUpdatesBtn');
  btn.disabled = false;
  btn.textContent = 'Reload';
  btn.classList.add('btn-primary');
  setUpdateStatus('Update downloaded. Reload to apply it.');
  showToast('Update available', 'download');
}

function initUpdateStatus() {
  const btn = document.getElementById('checkUpdatesBtn');
  if (!('serviceWorker' in navigator)) {
    btn.disabled = true;
    setUpdateStatus('Not supported on this browser.');
    return;
  }
  setUpdateStatus(isStandalonePwa() ? 'Check for a newer version of the app.' : 'Check for a newer version (works best in the installed app).');
}

async function checkForUpdates() {
  const btn = document.getElementById('checkUpdatesBtn');
  if (reloadReady) { window.location.reload(); return; }
  if (!navigator.onLine) { setUpdateStatus('No internet connection. Connect and try again.'); return; }
  if (!('serviceWorker' in navigator)) { setUpdateStatus('Service worker is not available on this device.'); return; }

  btn.disabled = true;
  setUpdateStatus('Checking for updates…');
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js') || await navigator.serviceWorker.getRegistration();
    if (!registration) { setUpdateStatus('Open the tracker once online, then retry.'); return; }
    await registration.update();
    if (registration.waiting) { markReloadReady(); return; }
    if (registration.installing) {
      setUpdateStatus('Downloading update…');
      const worker = registration.installing;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' || worker.state === 'activated') markReloadReady();
      });
      return;
    }
    setUpdateStatus('You have the latest version.');
    showToast('Up to date');
  } catch {
    setUpdateStatus('Update check failed. Try again in a moment.');
  } finally {
    if (!reloadReady) btn.disabled = false;
  }
}

/* ---------- install ---------- */
function initInstallStatus() {
  const btn = document.getElementById('installAppBtn');
  const status = document.getElementById('installStatus');
  if (isStandalonePwa()) {
    btn.disabled = true;
    btn.textContent = 'Installed';
    status.textContent = 'Already on this device.';
    return;
  }
  btn.disabled = false;
  if (deferredInstallPrompt) status.textContent = 'Add it to your home screen.';
  else if (isIosLike()) status.textContent = 'iPhone/iPad: Share → Add to Home Screen.';
  else status.textContent = 'Or use the browser menu → Install app.';
}

async function installApp() {
  if (isStandalonePwa()) { showToast('Already installed'); initInstallStatus(); return; }
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    showToast(choice?.outcome === 'accepted' ? 'Install started' : 'Install cancelled', choice?.outcome === 'accepted' ? 'check' : 'x');
    deferredInstallPrompt = null;
    initInstallStatus();
    return;
  }
  showToast(isIosLike() ? 'Use Share → Add to Home Screen' : 'Use browser menu → Install app', 'info');
}

/* ---------- data ---------- */
function setDataHint(message) {
  const hint = document.getElementById('dataHint');
  if (hint) hint.textContent = message;
}

function clampBand(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(9, Math.max(0, Math.round(num * 2) / 2));
}

function normalizeEntry(raw) {
  if (!raw || typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return null;
  const entry = { date: raw.date, manualOverall: !!raw.manualOverall, mood: String(raw.mood || '').trim() };
  let sum = 0;
  for (const key of SECTIONS) {
    const safe = clampBand(raw[key]);
    if (safe === null) return null;
    entry[key] = safe;
    sum += safe;
  }
  const rawOverall = clampBand(raw.overall);
  entry.overall = rawOverall === null ? Math.round((sum / 4) * 2) / 2 : rawOverall;
  return entry;
}

function exportEntries() {
  if (!dbReady) { setDataHint('Database is still opening.'); showToast('Database not ready', 'clock'); return; }
  const entries = IeltsDB.listEntries();
  if (!entries.length) { setDataHint('No results to export yet.'); showToast('Nothing to export', 'info'); return; }
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ielts-tracker-export-${UI.localISODate()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setDataHint(`Exported ${entries.length} result${entries.length === 1 ? '' : 's'}.`);
  showToast('Export complete', 'download');
}

async function importEntries(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!dbReady) { setDataHint('Database is still opening.'); showToast('Database not ready', 'clock'); event.target.value = ''; return; }
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : null;
    if (!list) throw new Error('Invalid JSON structure');
    const dedup = new Map();
    let skipped = 0;
    for (const raw of list) {
      const n = normalizeEntry(raw);
      if (!n) { skipped += 1; continue; }
      dedup.set(n.date, n);
    }
    const normalized = [...dedup.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (!normalized.length) throw new Error('No valid entries found');
    const existing = IeltsDB.listEntries().length;
    if (existing) {
      const ok = await UI.confirmAction({
        title: 'Replace your results?',
        text: `Your ${existing} saved result${existing === 1 ? '' : 's'} will be replaced with ${normalized.length} from the file. Export first if you want a copy.`,
        ok: 'Replace', danger: true,
      });
      if (!ok) { setDataHint('Import cancelled.'); return; }
    }
    IeltsDB.replaceAllEntries(normalized);
    await IeltsDB.persistNow();
    refreshDataCount();
    setDataHint(`Imported ${normalized.length} result${normalized.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}.`);
    showToast('Import complete', 'upload');
  } catch {
    setDataHint('Import failed. Use a valid JSON export.');
    showToast('Import failed', 'info');
  } finally {
    event.target.value = '';
  }
}

init();
