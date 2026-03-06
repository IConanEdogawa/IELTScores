const SETTINGS_KEY = 'nylc_ielts_settings';
const DEFAULT_SETTINGS = {
  theme: 'system',
  insights: {
    showKpis: true,
    showComparison: true,
    showTargets: true,
    showProgress: true,
    showRadar: true,
    showTips: true,
    showAiCoach: false,
  }
};

const INSIGHT_OPTIONS = [
  { key: 'showKpis', title: 'KPI Cards', desc: 'Latest, average, and trend cards' },
  { key: 'showComparison', title: 'Latest Comparison', desc: 'Weakest area and gap to target' },
  { key: 'showTargets', title: 'Target Scores', desc: 'Target sliders for each IELTS skill' },
  { key: 'showProgress', title: 'Progress Chart', desc: 'Timeline chart with period filters' },
  { key: 'showRadar', title: 'Skills Radar', desc: 'Average profile radar chart' },
  { key: 'showTips', title: 'Tips Section', desc: 'Tips based on weakest skills' },
  { key: 'showAiCoach', title: 'AI Coach', desc: 'Coming soon', locked: true },
];

const SUPPORT_HANDLE = '@Bro_Zuck';
const SUPPORT_URL = 'https://t.me/Bro_Zuck';

let settings = loadSettings();

renderInsightToggles();
bindThemeSelect();
initThemeBrowserHint();
initSupportHint();
initUpdateStatus();

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = 'main.html';
}

function normalizeSettings(raw) {
  const safe = {
    theme: raw?.theme === 'light' || raw?.theme === 'dark' ? raw.theme : 'system',
    insights: {}
  };

  for (const option of INSIGHT_OPTIONS) {
    if (option.locked) {
      safe.insights[option.key] = false;
      continue;
    }
    safe.insights[option.key] = raw?.insights?.[option.key] !== false;
  }
  return safe;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return normalizeSettings(DEFAULT_SETTINGS);
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return normalizeSettings(DEFAULT_SETTINGS);
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

function renderInsightToggles() {
  const wrap = document.getElementById('insightsToggles');
  if (!wrap) return;

  wrap.innerHTML = INSIGHT_OPTIONS.map(option => {
    const isOn = settings.insights[option.key];
    const isLocked = option.locked === true;
    return `
      <div class="toggle-row">
        <div class="toggle-meta">
          <div class="toggle-title">${option.title}</div>
          <div class="toggle-desc">${option.desc}</div>
        </div>
        <button
          class="toggle-switch ${isOn ? 'on' : ''}"
          type="button"
          aria-label="Toggle ${option.title}"
          aria-pressed="${isOn ? 'true' : 'false'}"
          ${isLocked ? 'disabled title="Coming soon"' : ''}
          onclick="toggleInsight('${option.key}')"></button>
      </div>
    `;
  }).join('');
}

function toggleInsight(key) {
  const option = INSIGHT_OPTIONS.find(item => item.key === key);
  if (option?.locked) {
    showToast('AI Coach coming soon');
    return;
  }
  settings.insights[key] = !settings.insights[key];
  saveSettings();
  renderInsightToggles();
  showToast('Insights setting saved');
}

function bindThemeSelect() {
  const select = document.getElementById('themeSelect');
  if (!select) return;
  select.value = settings.theme;
  select.addEventListener('change', function() {
    settings.theme = this.value;
    saveSettings();
    if (typeof window.__applyThemeFromSettings === 'function') {
      window.__applyThemeFromSettings();
    }
    showToast('Theme preference saved');
  });
}

function initThemeBrowserHint() {
  const hint = document.getElementById('themeHint');
  if (!hint) return;
  if (!isStandalonePwa()) {
    hint.textContent = 'Theme Browser is available in the installed app only.';
    return;
  }
  if (!navigator.onLine) {
    hint.textContent = 'Connect to internet to browse theme samples.';
    return;
  }
  hint.textContent = 'Changes apply immediately. Theme Browser is ready.';
}

function openThemeBrowser() {
  if (!isStandalonePwa()) {
    showToast('Theme Browser is available in the installed app');
    return;
  }
  if (!navigator.onLine) {
    showToast('Connect to internet to browse themes');
    return;
  }
  window.location.href = 'theme-browser.html';
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
    `theme_pref=${settings.theme}`
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
  // Use direct navigation so the action works reliably on mobile and in-app browsers.
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

function setUpdateStatus(message) {
  const status = document.getElementById('updateStatus');
  if (status) status.textContent = message;
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

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}
