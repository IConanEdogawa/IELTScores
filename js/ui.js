/* Shared UI helpers: icons, toast, confirm sheet, theme toggle, appbar. */
(function (global) {
  const SETTINGS_KEY = 'nylc_ielts_settings';

  function icon(name, cls) {
    return `<svg class="ico${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="icons/sprite.svg#i-${name}"/></svg>`;
  }

  let toastTimer = null;
  function showToast(msg, iconName) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerHTML = `${icon(iconName || 'check', 'ico-sm')}<span></span>`;
    t.querySelector('span').textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2300);
  }

  function openDialog(dlg) {
    if (!dlg) return;
    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
  }

  function closeDialog(dlg) {
    if (!dlg) return;
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  // Close a dialog when clicking on its backdrop.
  function bindBackdropClose(dlg) {
    if (!dlg) return;
    dlg.addEventListener('click', e => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeDialog(dlg);
    });
    dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeDialog(dlg)));
  }

  /** Promise-based confirm using the #confirmDialog sheet (falls back to window.confirm). */
  function confirmAction({ title, text, ok = 'Confirm', cancel = 'Cancel', danger = false }) {
    const dlg = document.getElementById('confirmDialog');
    if (!dlg || typeof dlg.showModal !== 'function') {
      return Promise.resolve(window.confirm(`${title}\n\n${text || ''}`));
    }
    dlg.querySelector('#confirmTitle').textContent = title;
    dlg.querySelector('#confirmText').textContent = text || '';
    const okBtn = dlg.querySelector('#confirmOk');
    const cancelBtn = dlg.querySelector('#confirmCancel');
    okBtn.textContent = ok;
    cancelBtn.textContent = cancel;
    okBtn.classList.toggle('btn-danger', danger);
    okBtn.classList.toggle('btn-primary', !danger);

    return new Promise(resolve => {
      let done = false;
      const finish = val => {
        if (done) return;
        done = true;
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        dlg.removeEventListener('close', onClose);
        dlg.removeEventListener('click', onBackdrop);
        if (dlg.open) dlg.close();
        resolve(val);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onClose = () => finish(false);
      const onBackdrop = e => { if (e.target === dlg) finish(false); };
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      dlg.addEventListener('close', onClose);
      dlg.addEventListener('click', onBackdrop);
      dlg.showModal();
      okBtn.focus();
    });
  }

  function readSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  function setThemePreference(theme) {
    const s = readSettings();
    s.theme = theme;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
    try { if (global.IeltsDB && global.IeltsDB.isReady && global.IeltsDB.isReady()) global.IeltsDB.saveSettings({ theme }); } catch {}
    if (typeof global.__applyThemeFromSettings === 'function') global.__applyThemeFromSettings();
    syncThemeToggles();
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function syncThemeToggles() {
    const dark = currentTheme() === 'dark';
    document.querySelectorAll('.theme-toggle-label').forEach(el => { el.textContent = dark ? 'Light mode' : 'Dark mode'; });
  }

  function bindThemeToggles() {
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.addEventListener('click', () => setThemePreference(currentTheme() === 'dark' ? 'light' : 'dark'));
    });
    window.addEventListener('themechange', syncThemeToggles);
    syncThemeToggles();
  }

  function bindAppbar() {
    const bar = document.getElementById('appbar');
    if (!bar) return;
    const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function localISODate(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseISODate(s) {
    return new Date(s + 'T00:00:00');
  }

  global.UI = {
    icon, showToast, openDialog, closeDialog, bindBackdropClose, confirmAction,
    setThemePreference, currentTheme, bindThemeToggles, bindAppbar, escapeHtml,
    localISODate, parseISODate, readSettings,
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindThemeToggles();
    bindAppbar();
  });
})(window);
