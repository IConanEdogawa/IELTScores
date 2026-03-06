(function () {
  const SETTINGS_KEY = 'nylc_ielts_settings';

  function getStoredTheme() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return 'system';
      const parsed = JSON.parse(raw);
      const theme = parsed?.theme;
      if (theme === 'light' || theme === 'dark') return theme;
      return 'system';
    } catch {
      return 'system';
    }
  }

  function resolveTheme(theme) {
    if (theme === 'light' || theme === 'dark') return theme;
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  }

  function applyTheme() {
    const previous = document.documentElement.getAttribute('data-theme');
    const stored = getStoredTheme();
    const resolved = resolveTheme(stored);
    document.documentElement.setAttribute('data-theme', resolved);
    if (previous && previous !== resolved) {
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: resolved } }));
    }
  }

  window.__applyThemeFromSettings = applyTheme;
  applyTheme();

  if (window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', () => {
      if (getStoredTheme() === 'system') applyTheme();
    });
  }
})();
