/* IELTS Tracker — main app (Progress / Log / History). */
const { icon, showToast, escapeHtml, localISODate, parseISODate } = UI;

const SECTIONS = [
  { key: 'listening', label: 'Listening', short: 'L', icon: 'headphones' },
  { key: 'reading',   label: 'Reading',   short: 'R', icon: 'book-open' },
  { key: 'writing',   label: 'Writing',   short: 'W', icon: 'pen-tool' },
  { key: 'speaking',  label: 'Speaking',  short: 'S', icon: 'mic' },
];

const TIPS = {
  listening: [
    'Do one full listening mock a day and replay every question you missed until you hear the answer.',
    'Follow fast, natural speech: BBC podcasts or news at normal speed, no subtitles.',
    'Read the questions before each section starts and predict the type of word you need.',
    'Watch for distractors — speakers often correct themselves ("no, sorry, Thursday").',
    'Check spelling and plurals when you transfer answers; they cost easy marks.',
  ],
  reading: [
    'Skim headings and first sentences first, then scan for keywords from the questions.',
    'Practise True / False / Not Given separately — it is where most points are lost.',
    'Keep to 20 minutes per passage. Move on and come back rather than getting stuck.',
    'Underline synonyms: the passage rarely uses the same words as the question.',
    'Read one long article in English every day to build speed and stamina.',
  ],
  writing: [
    'Task 2: spend five minutes planning. A clear structure beats fancy vocabulary.',
    'Paraphrase the question in your introduction instead of copying it.',
    'Vary sentence structures — examiners notice when every sentence looks the same.',
    'Task 1: always write an overview of the main trends; it is required for band 6+.',
    'Write one essay a week and have it checked against the band descriptors.',
  ],
  speaking: [
    'Record yourself on Part 2 topics and listen back for pauses and repeated words.',
    'Do not memorise answers — examiners notice. Practise ideas, not scripts.',
    'Use phrases like "That\'s an interesting question" to buy a second of thinking time.',
    'Extend every answer with a reason and an example.',
    'Speak English for ten minutes a day, even alone — fluency is a habit.',
  ],
};

const DEFAULT_TARGETS = Object.fromEntries(SECTIONS.map(s => [s.key, 7.0]));

let entries = [];
let targets = { ...DEFAULT_TARGETS };
let overallEnabled = false;
let moodOpen = false;
let editingEntryDate = null;
let bootReady = false;
let currentTab = 'progress';
let historyFilter = 'all';
let periods = { main: 'all', modal: 'all' };
let hiddenSeries = new Set();
let tipSeed = 0;
let fp = null;
const charts = { line: null, modal: null, radar: null };

/* ---------- helpers ---------- */
function isValidDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function clampBand(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(9, Math.max(0, Math.round(num * 2) / 2));
}

function roundBand(avg) {
  return Math.round(avg * 2) / 2;
}

function normalizeEntry(raw) {
  if (!raw || !isValidDateString(raw.date)) return null;
  const entry = { date: raw.date, manualOverall: !!raw.manualOverall, mood: String(raw.mood || '').trim() };
  let sum = 0;
  for (const s of SECTIONS) {
    const safe = clampBand(raw[s.key]);
    if (safe === null) return null;
    entry[s.key] = safe;
    sum += safe;
  }
  const rawOverall = clampBand(raw.overall);
  entry.overall = rawOverall === null ? roundBand(sum / 4) : rawOverall;
  return entry;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function skillColor(key) {
  return cssVar('--c-' + key);
}

function withAlpha(hex, alpha) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function fmtDate(iso, opts) {
  return parseISODate(iso).toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysBetween(a, b) {
  return Math.round((parseISODate(b) - parseISODate(a)) / 86400000);
}

function relativeDay(iso) {
  const d = daysBetween(iso, localISODate());
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 31) return `${d} days ago`;
  const m = Math.round(d / 30);
  if (m < 12) return `${m} month${m > 1 ? 's' : ''} ago`;
  const y = Math.round(d / 365);
  return `${y} year${y > 1 ? 's' : ''} ago`;
}

function overallTarget() {
  return roundBand(SECTIONS.reduce((a, s) => a + targets[s.key], 0) / 4);
}

function deltaPill(diff, suffix) {
  const tone = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
  const ic = diff > 0 ? 'arrow-up-right' : diff < 0 ? 'arrow-down-right' : 'minus';
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  return `<span class="pill ${tone}">${icon(ic)}${sign}${Math.abs(diff).toFixed(1)}${suffix ? ' ' + suffix : ''}</span>`;
}

function countUp(el, value, decimals) {
  if (!el) return;
  const end = Number(value);
  const CU = window.countUp && window.countUp.CountUp;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prev = Number(el.dataset.value);
  el.dataset.value = String(end);
  if (!CU || reduce) { el.textContent = end.toFixed(decimals); return; }
  const start = Number.isFinite(prev) ? prev : Math.max(0, end - (decimals ? 2 : Math.min(end, 10)));
  const c = new CU(el, end, { startVal: start, decimalPlaces: decimals, duration: 0.9, useEasing: true, useGrouping: false });
  if (c.error) el.textContent = end.toFixed(decimals); else c.start();
}

/* ---------- boot ---------- */
async function boot() {
  const bootEl = document.getElementById('bootStatus');
  try {
    await IeltsDB.init();
    reloadEntriesFromDb();
    const storedTargets = IeltsDB.getTargets(DEFAULT_TARGETS);
    targets = { ...DEFAULT_TARGETS };
    SECTIONS.forEach(s => {
      const v = clampBand(storedTargets?.[s.key]);
      targets[s.key] = v === null ? DEFAULT_TARGETS[s.key] : v;
    });

    setupChartDefaults();
    initDatePicker();
    buildSliders();
    bindUi();
    renderTargets();
    renderHistory();
    switchTab(entries.length ? 'progress' : 'add', { instant: true });
    bootReady = true;
    if (bootEl) bootEl.hidden = true;
    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(() => { if (currentTab === 'progress' && entries.length) renderCharts(); });
    }
  } catch (err) {
    console.error(err);
    if (bootEl) { bootEl.textContent = 'Could not open local database. Try reloading.'; bootEl.hidden = false; }
    showToast('Database failed to open', 'info');
  }
}

function reloadEntriesFromDb() {
  entries = IeltsDB.listEntries().map(normalizeEntry).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

function persistEntries() {
  IeltsDB.replaceAllEntries(entries);
}

function bindUi() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.go)));

  document.getElementById('overallToggle').addEventListener('click', () => setOverallMode(!overallEnabled));
  document.getElementById('moodToggle').addEventListener('click', () => {
    setMoodOpen(!moodOpen);
    if (moodOpen) setTimeout(() => document.getElementById('moodNote').focus(), 200);
  });
  document.getElementById('saveEntryBtn').addEventListener('click', addEntry);
  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);

  document.querySelectorAll('[data-period-group]').forEach(group => {
    group.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      setPeriod(group.dataset.periodGroup, btn.dataset.period);
    }));
  });

  document.getElementById('expandChartBtn').addEventListener('click', openChartModal);
  const modal = document.getElementById('chartModal');
  document.getElementById('closeChartBtn').addEventListener('click', () => UI.closeDialog(modal));
  modal.addEventListener('close', () => { if (charts.modal) { charts.modal.destroy(); charts.modal = null; } });

  const sheet = document.getElementById('targetsSheet');
  UI.bindBackdropClose(sheet);
  document.getElementById('editTargetsBtn').addEventListener('click', () => UI.openDialog(sheet));
  document.getElementById('resetTargetsBtn').addEventListener('click', resetTargets);
  document.getElementById('shuffleTipsBtn').addEventListener('click', () => { tipSeed += 1; renderTips(true); });

  document.querySelectorAll('.history-filter').forEach(btn => btn.addEventListener('click', () => setHistoryFilter(btn.dataset.filter)));

  const list = document.getElementById('historyList');
  if (window.autoAnimate) window.autoAnimate(list, { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });

  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const date = btn.closest('[data-date]')?.dataset.date;
    if (!date) return;
    if (btn.dataset.action === 'edit') startEditEntry(date);
    if (btn.dataset.action === 'delete') deleteEntry(date);
  });

  // Chart.js handles resizing itself; only rebuild when point sizing changes (mobile <-> wide).
  let wasNarrow = window.innerWidth <= 540;
  window.addEventListener('resize', () => {
    const narrow = window.innerWidth <= 540;
    if (narrow !== wasNarrow && currentTab === 'progress' && entries.length) renderLineChart();
    wasNarrow = narrow;
  });
}

window.addEventListener('themechange', () => {
  if (bootReady && currentTab === 'progress') renderCharts();
  if (bootReady && charts.modal) renderModalChart();
});

// Returning from Settings via back/forward cache: data may have been imported there.
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });

/* ---------- tabs ---------- */
function switchTab(name, opts = {}) {
  currentTab = name;
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
  if (!opts.instant) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (name === 'progress') renderProgress();
  if (name === 'history') renderHistory();
}

/* ---------- date picker ---------- */
function initDatePicker() {
  const input = document.getElementById('entryDate');
  if (window.flatpickr) {
    fp = window.flatpickr(input, {
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'l, j F Y',
      altInputClass: 'input',
      defaultDate: localISODate(),
      maxDate: localISODate(),
      disableMobile: true,
      locale: { firstDayOfWeek: 1 },
      onDayCreate: (_d, _s, _fp, dayElem) => {
        const iso = localISODate(dayElem.dateObj);
        if (entries.some(e => e.date === iso)) dayElem.classList.add('has-entry');
      },
    });
  } else {
    input.removeAttribute('readonly');
    input.type = 'date';
    input.max = localISODate();
    input.value = localISODate();
  }
}

function getFormDate() {
  return document.getElementById('entryDate').value;
}

function setFormDate(iso) {
  if (fp) fp.setDate(iso, false);
  else document.getElementById('entryDate').value = iso;
}

/* ---------- sliders ---------- */
function skillRowHTML(prefix, key, label, iconName, value, extraLabel) {
  return `
  <div class="skill-row" style="--c:var(--c-${key}, var(--text))">
    <div class="skill-head">
      <span class="skill-chip">${icon(iconName)}</span>
      <span class="skill-name">${label}${extraLabel || ''}</span>
      <div class="stepper">
        <button class="step-btn" type="button" data-step="-0.5" data-for="${prefix}${key}" aria-label="Decrease ${label}">${icon('minus')}</button>
        <span class="skill-score num" id="${prefix === 'slider-' ? 'score-' : 'target-score-'}${key}">${value.toFixed(1)}</span>
        <button class="step-btn" type="button" data-step="0.5" data-for="${prefix}${key}" aria-label="Increase ${label}">${icon('plus')}</button>
      </div>
    </div>
    <input type="range" class="range" id="${prefix}${key}" data-key="${key}" min="0" max="9" step="0.5" value="${value}" aria-label="${label}${extraLabel || ''}"/>
  </div>`;
}

function bindRangeRow(root, onChange) {
  root.querySelectorAll('.range').forEach(el => {
    paintRange(el);
    el.addEventListener('input', () => { paintRange(el); onChange(el); });
  });
  root.querySelectorAll('.step-btn').forEach(btn => btn.addEventListener('click', () => {
    const el = document.getElementById(btn.dataset.for);
    const v = clampBand(Number(el.value) + Number(btn.dataset.step));
    if (v === Number(el.value)) return;
    el.value = v;
    paintRange(el);
    onChange(el);
    if (navigator.vibrate) try { navigator.vibrate(6); } catch {}
  }));
}

function paintRange(el) {
  el.style.setProperty('--pct', (Number(el.value) / 9 * 100).toFixed(2) + '%');
}

function buildSliders() {
  const wrap = document.getElementById('sliders');
  wrap.innerHTML = SECTIONS.map(s => skillRowHTML('slider-', s.key, s.label, s.icon, 6.0)).join('');
  bindRangeRow(wrap, el => { updateScoreLabel(el.dataset.key, el.value); updateOverallPreview(); });

  const owrap = document.getElementById('overallSliderWrap');
  owrap.innerHTML = skillRowHTML('slider-', 'overall', 'Official overall', 'badge-check', 6.0);
  bindRangeRow(owrap, el => { updateScoreLabel('overall', el.value); updateOverallPreview(); });

  const meter = document.getElementById('overallMeter');
  meter.innerHTML = Array.from({ length: 9 }, (_, i) => `<i style="height:${30 + i * 8.75}%"></i>`).join('');
  updateOverallPreview();
}

function updateScoreLabel(key, value) {
  const score = document.getElementById('score-' + key);
  if (score) score.textContent = Number(value).toFixed(1);
}

function calculatedOverall() {
  const sum = SECTIONS.reduce((a, s) => a + Number(document.getElementById('slider-' + s.key).value), 0);
  return roundBand(sum / 4);
}

function updateOverallPreview() {
  const v = overallEnabled ? Number(document.getElementById('slider-overall').value) : calculatedOverall();
  document.getElementById('overallPreview').textContent = v.toFixed(1);
  document.getElementById('overallLabel').textContent = overallEnabled ? 'Official overall' : 'Calculated overall';
  document.querySelectorAll('#overallMeter i').forEach((bar, i) => bar.classList.toggle('on', i < Math.round(v)));
}

function setSliderValue(key, value) {
  const slider = document.getElementById('slider-' + key);
  if (!slider) return;
  slider.value = value;
  paintRange(slider);
  updateScoreLabel(key, value);
}

function setOverallMode(enabled) {
  overallEnabled = !!enabled;
  document.getElementById('overallToggle').setAttribute('aria-checked', overallEnabled ? 'true' : 'false');
  document.getElementById('overallSliderWrap').hidden = !overallEnabled;
  if (overallEnabled && !editingEntryDate) setSliderValue('overall', calculatedOverall());
  updateOverallPreview();
}

function setMoodOpen(open) {
  moodOpen = !!open;
  document.getElementById('moodToggle').setAttribute('aria-checked', moodOpen ? 'true' : 'false');
  document.getElementById('moodExpand').classList.toggle('open', moodOpen);
}

/* ---------- save / edit / delete ---------- */
async function addEntry() {
  if (!bootReady) { showToast('Database still loading', 'clock'); return; }
  const date = getFormDate();
  if (!isValidDateString(date)) { showToast('Pick a date first', 'calendar'); return; }

  const mood = moodOpen ? document.getElementById('moodNote').value.trim() : '';
  const entry = { date, manualOverall: overallEnabled, mood };
  SECTIONS.forEach(s => { entry[s.key] = parseFloat(document.getElementById('slider-' + s.key).value); });
  const calc = calculatedOverall();

  if (overallEnabled) {
    entry.overall = parseFloat(document.getElementById('slider-overall').value);
    if (Math.abs(entry.overall - calc) > 0.001) {
      const ok = await UI.confirmAction({
        title: 'Keep the official band?',
        text: `Your official overall (${entry.overall.toFixed(1)}) differs from the calculated ${calc.toFixed(1)}. Save the official value?`,
        ok: 'Save official',
      });
      if (!ok) { showToast('Save cancelled', 'x'); return; }
    }
  } else {
    entry.overall = calc;
  }

  if (editingEntryDate) {
    const clash = entries.findIndex(e => e.date === date && e.date !== editingEntryDate);
    if (clash >= 0) {
      const ok = await UI.confirmAction({ title: 'Replace that day?', text: `There is already a result on ${fmtDate(date)}. Replace it with this one?`, ok: 'Replace', danger: true });
      if (!ok) { showToast('Update cancelled', 'x'); return; }
      entries.splice(clash, 1);
    }
    entries = entries.filter(e => e.date !== editingEntryDate);
    entries.push(entry);
  } else {
    const dup = entries.findIndex(e => e.date === date);
    if (dup >= 0) {
      const ok = await UI.confirmAction({ title: 'Replace that day?', text: `You already logged a result on ${fmtDate(date)}. Replace it?`, ok: 'Replace', danger: true });
      if (!ok) { showToast('Save cancelled', 'x'); return; }
      entries[dup] = entry;
    } else {
      entries.push(entry);
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  persistEntries();
  const wasEditing = Boolean(editingEntryDate);
  resetEntryForm();
  exitEditMode();
  if (fp) fp.redraw();
  showToast(wasEditing ? 'Result updated' : 'Result saved');
  switchTab('history');
  flashEntry(date);
}

function flashEntry(date) {
  requestAnimationFrame(() => {
    const card = document.querySelector(`.entry[data-date="${date}"]`);
    if (!card) return;
    card.animate?.([{ boxShadow: '0 0 0 3px ' + cssVar('--signal') }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1200, easing: 'ease-out' });
  });
}

function resetEntryForm() {
  setFormDate(localISODate());
  SECTIONS.forEach(s => setSliderValue(s.key, 6.0));
  setSliderValue('overall', 6.0);
  setOverallMode(false);
  document.getElementById('moodNote').value = '';
  setMoodOpen(false);
  updateOverallPreview();
}

function exitEditMode() {
  editingEntryDate = null;
  document.getElementById('cancelEditBtn').hidden = true;
  document.getElementById('page-add').classList.remove('editing');
  document.getElementById('entryFormTitle').innerHTML = 'Log a <em>result</em>';
  document.getElementById('entryFormEyebrow').textContent = 'New entry';
  document.querySelector('#saveEntryBtn span').textContent = 'Save result';
}

function startEditEntry(date) {
  const entry = entries.find(e => e.date === date);
  if (!entry) { showToast('Entry not found', 'info'); return; }
  editingEntryDate = entry.date;
  setFormDate(entry.date);
  SECTIONS.forEach(s => setSliderValue(s.key, entry[s.key]));
  setOverallMode(!!entry.manualOverall);
  setSliderValue('overall', entry.overall);
  document.getElementById('moodNote').value = entry.mood || '';
  setMoodOpen(Boolean((entry.mood || '').trim()));
  updateOverallPreview();

  document.getElementById('cancelEditBtn').hidden = false;
  document.getElementById('page-add').classList.add('editing');
  document.getElementById('entryFormTitle').innerHTML = 'Edit <em>result</em>';
  document.getElementById('entryFormEyebrow').textContent = 'Editing · ' + fmtDate(entry.date);
  document.querySelector('#saveEntryBtn span').textContent = 'Update result';
  switchTab('add');
}

function cancelEdit() {
  if (!editingEntryDate) return;
  resetEntryForm();
  exitEditMode();
  showToast('Edit cancelled', 'x');
}

async function deleteEntry(date) {
  if (!bootReady) return;
  const target = String(date).trim();
  const entry = entries.find(e => e.date === target);
  if (!entry) { showToast('Delete failed: entry not found', 'info'); return; }
  const ok = await UI.confirmAction({
    title: 'Delete this result?',
    text: `${fmtDate(target)} · overall ${entry.overall.toFixed(1)}. This can't be undone.`,
    ok: 'Delete', danger: true,
  });
  if (!ok) return;
  entries = entries.filter(e => e.date !== target);
  if (editingEntryDate === target) { resetEntryForm(); exitEditMode(); }
  persistEntries();
  if (fp) fp.redraw();
  renderHistory();
  showToast('Result deleted', 'trash-2');
}

/* ---------- history ---------- */
function getFilteredHistoryEntries() {
  if (historyFilter === 'official') return entries.filter(e => e.manualOverall);
  if (historyFilter === 'notes') return entries.filter(e => (e.mood || '').trim().length > 0);
  return entries;
}

function setHistoryFilter(mode) {
  historyFilter = mode;
  document.querySelectorAll('.history-filter').forEach(b => b.classList.toggle('active', b.dataset.filter === mode));
  renderHistory();
}

function renderHistory() {
  const counts = {
    all: entries.length,
    official: entries.filter(e => e.manualOverall).length,
    notes: entries.filter(e => (e.mood || '').trim()).length,
  };
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = v;
  });
  document.getElementById('historyCount').textContent = `${entries.length} result${entries.length === 1 ? '' : 's'}`;

  const list = document.getElementById('historyList');
  const filtered = getFilteredHistoryEntries();
  const sorted = [...filtered].reverse();

  // Previous entry (chronologically) across *all* entries for the delta.
  const prevOf = date => {
    const i = entries.findIndex(e => e.date === date);
    return i > 0 ? entries[i - 1] : null;
  };

  const wanted = sorted.map(e => ({ key: e.date, html: entryCardHTML(e, prevOf(e.date)) }));
  if (!wanted.length) {
    const msg = entries.length
      ? { t: 'Nothing here', s: 'No results match this filter yet.' }
      : { t: 'No results yet', s: 'Log your first test to start tracking.' };
    wanted.push({ key: '__empty', html: `<div class="card history-empty"><div class="serif">${msg.t}</div><p>${msg.s}</p></div>` });
  }

  // Keyed reconcile so auto-animate can animate only what actually changed.
  const existing = new Map([...list.children].map(el => [el.dataset.key, el]));
  const keep = new Set(wanted.map(w => w.key));
  existing.forEach((el, key) => { if (!keep.has(key)) el.remove(); });
  wanted.forEach((w, idx) => {
    let el = existing.get(w.key);
    if (!el) {
      const tmp = document.createElement('div');
      tmp.innerHTML = w.html.trim();
      el = tmp.firstElementChild;
      el.dataset.key = w.key;
      el.dataset.sig = w.html;
    } else if (el.dataset.sig !== w.html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = w.html.trim();
      const fresh = tmp.firstElementChild;
      el.className = fresh.className;
      el.innerHTML = fresh.innerHTML;
      el.dataset.sig = w.html;
    }
    if (list.children[idx] !== el) list.insertBefore(el, list.children[idx] || null);
  });
}

function entryCardHTML(e, prev) {
  const editing = editingEntryDate === e.date;
  const skills = SECTIONS.map(s => `
      <div class="es" style="--c:var(--c-${s.key})">
        <div class="es-top"><span>${s.label}</span><b>${e[s.key].toFixed(1)}</b></div>
        <div class="es-bar"><i style="width:${(e[s.key] / 9 * 100).toFixed(1)}%"></i></div>
      </div>`).join('');
  const meta = [
    prev ? deltaPill(e.overall - prev.overall, 'vs prev') : '<span class="pill">first test</span>',
    e.manualOverall ? `<span class="pill signal">${icon('badge-check')}Official</span>` : '',
  ].join('');
  const note = e.mood ? `<div class="entry-note">${icon('message-square-text', 'ico-sm')}<span>${escapeHtml(e.mood)}</span></div>` : '';
  return `
  <article class="card entry ${editing ? 'is-editing' : ''}" data-date="${e.date}">
    <div class="entry-top">
      <div>
        <div class="entry-date">${fmtDate(e.date)}</div>
        <div class="entry-meta">${meta}</div>
      </div>
      <div class="entry-overall">
        <div class="entry-overall-val num">${e.overall.toFixed(1)}</div>
        <div class="entry-overall-label">overall</div>
      </div>
    </div>
    <div class="entry-skills">${skills}</div>
    ${note}
    <div class="entry-actions">
      <button type="button" class="icon-btn sm ghost" data-action="edit" aria-label="Edit result">${icon('pencil', 'ico-sm')}</button>
      <button type="button" class="icon-btn sm ghost danger" data-action="delete" aria-label="Delete result">${icon('trash-2', 'ico-sm')}</button>
    </div>
  </article>`;
}

/* ---------- progress dashboard ---------- */
function renderProgress() {
  const has = entries.length > 0;
  document.getElementById('dashEmpty').hidden = has;
  document.getElementById('dash').hidden = !has;
  const hr = new Date().getHours();
  document.getElementById('greeting').textContent = hr < 5 ? 'Late study session' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  if (!has) { destroyCharts(); return; }
  renderHero();
  renderKpis();
  renderComparison();
  renderTips();
  renderCharts();
}

function renderHero() {
  const latest = entries[entries.length - 1];
  const prev = entries.length > 1 ? entries[entries.length - 2] : null;
  const goal = overallTarget();
  const gap = goal - latest.overall;
  const goalText = gap > 0
    ? `Target <b>${goal.toFixed(1)}</b> · <b>${gap.toFixed(1)}</b> to go`
    : `Target <b>${goal.toFixed(1)}</b> reached`;
  const el = document.getElementById('heroCard');
  el.innerHTML = `
    <div class="hero-top">
      <div>
        <div class="eyebrow">Latest overall</div>
        <div class="hero-date">${fmtDate(latest.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} · ${relativeDay(latest.date)}</div>
      </div>
      <span class="pill hero-badge ${latest.manualOverall ? 'official' : ''}" style="background:rgba(255,255,255,.08)">${latest.manualOverall ? icon('badge-check') + 'Official' : 'Calculated'}</span>
    </div>
    <div class="hero-main">
      <div class="hero-num num" id="heroNum">${latest.overall.toFixed(1)}</div>
      <div class="hero-side">
        ${prev ? deltaPill(latest.overall - prev.overall, 'vs last') : '<span class="pill">first result</span>'}
        <div class="hero-goal">${goalText}</div>
      </div>
    </div>
    <div class="hero-skills">
      ${SECTIONS.map(s => `<div class="hero-skill" style="--c:var(--c-${s.key})"><div class="hero-skill-label"><i></i>${s.label}</div><div class="hero-skill-val num">${latest[s.key].toFixed(1)}</div></div>`).join('')}
    </div>`;
  const num = document.getElementById('heroNum');
  const prevVal = Number(el.dataset.value);
  num.dataset.value = Number.isFinite(prevVal) ? String(prevVal) : String(Math.max(0, latest.overall - 1.5));
  el.dataset.value = String(latest.overall);
  countUp(num, latest.overall, 1);
}

function renderKpis() {
  const first = entries[0];
  const latest = entries[entries.length - 1];
  const best = entries.reduce((b, e) => (e.overall >= b.overall ? e : b), entries[0]);
  const avg = entries.reduce((a, e) => a + e.overall, 0) / entries.length;
  const gain = latest.overall - first.overall;
  const span = daysBetween(first.date, latest.date);
  const cards = [
    { id: 'kpiBest', label: 'Best overall', ic: 'trophy', val: best.overall, dec: 1, foot: fmtDate(best.date) },
    { id: 'kpiAvg', label: 'Average', ic: 'activity', val: avg, dec: 1, foot: `across ${entries.length} test${entries.length === 1 ? '' : 's'}` },
    { id: 'kpiGain', label: 'Total gain', ic: gain >= 0 ? 'arrow-up-right' : 'arrow-down-right', val: gain, dec: 1, prefix: gain > 0 ? '+' : '', foot: `since ${fmtDate(first.date, { day: 'numeric', month: 'short' })}` },
    { id: 'kpiCount', label: 'Tests logged', ic: 'hash', val: entries.length, dec: 0, foot: span > 0 ? `over ${span} day${span === 1 ? '' : 's'}` : 'keep going' },
  ];
  const grid = document.getElementById('kpiGrid');
  if (!grid.children.length) {
    grid.innerHTML = cards.map(c => `
      <div class="card kpi">
        <div class="kpi-top"><span>${c.label}</span><span class="kpi-ico" data-ic>${icon(c.ic)}</span></div>
        <div class="kpi-val num"><span class="kpi-prefix"></span><span id="${c.id}">0</span></div>
        <div class="kpi-foot"></div>
      </div>`).join('');
  }
  cards.forEach((c, i) => {
    const card = grid.children[i];
    card.querySelector('.kpi-prefix').textContent = c.prefix || '';
    card.querySelector('.kpi-foot').textContent = c.foot;
    card.querySelector('[data-ic]').innerHTML = icon(c.ic);
    countUp(document.getElementById(c.id), c.val, c.dec);
  });
}

function skillGaps() {
  const latest = entries[entries.length - 1];
  return SECTIONS.map(s => ({ ...s, score: latest[s.key], target: targets[s.key], gap: targets[s.key] - latest[s.key] }));
}

function weakestSkills(n) {
  return skillGaps().sort((a, b) => (b.gap - a.gap) || (a.score - b.score)).slice(0, n);
}

function renderComparison() {
  const rows = skillGaps();
  const weakest = weakestSkills(1)[0];
  const wrap = document.getElementById('comparison');
  wrap.innerHTML = `
    <div class="cmp-list">
      ${rows.map(r => `
        <div class="cmp-row ${r.key === weakest.key && weakest.gap > 0 ? 'weakest' : ''}" style="--c:var(--c-${r.key})">
          <div class="cmp-name"><span class="skill-chip">${icon(r.icon)}</span>${r.label}</div>
          <div class="cmp-bar" title="Target ${r.target.toFixed(1)}">
            <div class="cmp-fill" data-w="${(r.score / 9 * 100).toFixed(1)}"></div>
            <div class="cmp-target" style="left:${(r.target / 9 * 100).toFixed(1)}%"></div>
          </div>
          <div class="cmp-val num">${r.score.toFixed(1)}<small class="${r.gap > 0 ? 'gap' : 'met'}">${r.gap > 0 ? '−' + r.gap.toFixed(1) : r.gap < 0 ? '+' + Math.abs(r.gap).toFixed(1) : 'on target'}</small></div>
        </div>`).join('')}
    </div>
    <p class="cmp-summary">${weakest.gap > 0
      ? `<span class="focus-tag">focus</span> Weakest now is <strong>${weakest.label}</strong> at <strong>${weakest.score.toFixed(1)}</strong> — <strong>${weakest.gap.toFixed(1)}</strong> below your ${weakest.target.toFixed(1)} target.`
      : `Every skill is at or above target. <strong>Time to raise the bar.</strong>`}</p>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    wrap.querySelectorAll('.cmp-fill').forEach(f => { f.style.width = f.dataset.w + '%'; });
  }));
}

function renderTips(animate) {
  const picks = weakestSkills(2);
  const el = document.getElementById('tipsSection');
  el.innerHTML = `<div class="tip-list">${picks.map((s, i) => {
    const list = TIPS[s.key];
    const tip = list[(tipSeed + i + entries.length) % list.length];
    return `
      <div class="tip" style="--c:var(--c-${s.key})">
        <span class="skill-chip">${icon(s.icon)}</span>
        <div>
          <div class="tip-head"><b>${s.label}</b><span class="num">${s.score.toFixed(1)}${s.gap > 0 ? ` · ${s.gap.toFixed(1)} to target` : ''}</span></div>
          <div class="tip-text">${tip}</div>
        </div>
      </div>`;
  }).join('')}</div>`;
  if (animate) el.querySelectorAll('.tip').forEach((t, i) => t.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: i * 60, easing: 'ease-out', fill: 'backwards' }));
}

/* ---------- charts ---------- */
function setupChartDefaults() {
  if (!window.Chart) return;
  Chart.defaults.font.family = "'Geist', system-ui, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.animation.duration = 650;
}

function destroyCharts() {
  Object.keys(charts).forEach(k => { if (charts[k] && k !== 'modal') { charts[k].destroy(); charts[k] = null; } });
}

function renderCharts() {
  renderLineChart();
  renderRadarChart();
}

function filterByPeriod(list, period) {
  if (period === 'all' || !list.length) return list;
  const latestDate = list[list.length - 1].date;
  const days = period === 'month' ? 30 : 7;
  const cutoff = localISODate(new Date(parseISODate(latestDate).getTime() - days * 86400000));
  return list.filter(e => e.date >= cutoff);
}

function setPeriod(group, period) {
  periods[group] = period;
  document.querySelectorAll(`[data-period-group="${group}"] button`).forEach(b => b.classList.toggle('active', b.dataset.period === period));
  if (group === 'main') renderLineChart(); else renderModalChart();
}

function getPointRadius(count, big) {
  const mobile = window.innerWidth <= 540 && !big;
  if (mobile) return count >= 18 ? 1.5 : count >= 12 ? 2.5 : 3.5;
  return count >= 24 ? 2.5 : count >= 14 ? 3 : 4;
}

function chartTheme() {
  return {
    text: cssVar('--text'),
    muted: cssVar('--muted'),
    faint: cssVar('--faint'),
    grid: cssVar('--border'),
    surface: cssVar('--surface'),
    signal: cssVar('--signal'),
    border: cssVar('--border-strong'),
    dark: UI.currentTheme() === 'dark',
  };
}

function seriesDefs() {
  const t = chartTheme();
  return [
    ...SECTIONS.map(s => ({ id: s.key, label: s.label, color: skillColor(s.key) })),
    { id: 'overall', label: 'Overall', color: t.text },
    { id: 'target', label: 'Target', color: t.faint },
  ];
}

function renderLegend(containerId, onToggle) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = seriesDefs().map(s => `
    <button type="button" class="${s.id === 'overall' || s.id === 'target' ? 'overall' : ''} ${hiddenSeries.has(s.id) ? 'off' : ''}" data-series="${s.id}" style="--c:${s.color}" aria-pressed="${!hiddenSeries.has(s.id)}">
      <i ${s.id === 'target' ? 'style="background:repeating-linear-gradient(90deg,var(--c) 0 3px,transparent 3px 5px)"' : ''}></i>${s.label}
    </button>`).join('');
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.series;
    if (hiddenSeries.has(id)) hiddenSeries.delete(id); else hiddenSeries.add(id);
    onToggle();
  }));
}

function buildLineConfig(data, big) {
  const t = chartTheme();
  const labels = data.map(e => fmtDate(e.date, { day: 'numeric', month: 'short' }));
  const r = getPointRadius(labels.length, big);
  const goal = overallTarget();
  const overallColor = t.dark ? t.signal : t.text;
  const allVals = data.flatMap(e => [...SECTIONS.map(s => e[s.key]), e.overall]).concat(goal);
  const yMin = Math.max(0, Math.floor(Math.min(...allVals)) - 1);

  const datasets = [
    ...SECTIONS.map(s => {
      const c = skillColor(s.key);
      return {
        id: s.key, label: s.label, data: data.map(e => e[s.key]),
        borderColor: c, backgroundColor: c, borderWidth: 2,
        pointRadius: r, pointHoverRadius: r + 2, pointBackgroundColor: t.surface, pointBorderColor: c, pointBorderWidth: 2,
        tension: 0.35, fill: false, hidden: hiddenSeries.has(s.key),
      };
    }),
    {
      id: 'overall', label: 'Overall', data: data.map(e => e.overall),
      borderColor: overallColor, borderWidth: 3,
      pointRadius: r + 0.5, pointHoverRadius: r + 2.5, pointBackgroundColor: overallColor, pointBorderColor: t.surface, pointBorderWidth: 2,
      tension: 0.35, fill: 'origin', hidden: hiddenSeries.has('overall'),
      backgroundColor: ctx => {
        const { chart } = ctx;
        const area = chart.chartArea;
        if (!area) return 'transparent';
        const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        g.addColorStop(0, withAlpha(t.dark ? t.signal : '#15171C', t.dark ? 0.22 : 0.12));
        g.addColorStop(1, withAlpha(t.dark ? t.signal : '#15171C', 0));
        return g;
      },
      order: -1,
    },
    {
      id: 'target', label: 'Target', data: data.map(() => goal),
      borderColor: t.faint, borderWidth: 1.5, borderDash: [5, 5], pointRadius: 0, pointHoverRadius: 0,
      fill: false, hidden: hiddenSeries.has('target'),
    },
  ];

  return {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6, right: 6 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.dark ? '#1E2026' : '#15171C',
          titleColor: '#F4F3EE', bodyColor: 'rgba(244,243,238,.85)',
          borderColor: t.dark ? '#31353D' : 'transparent', borderWidth: 1,
          padding: 12, cornerRadius: 12, boxPadding: 4, usePointStyle: true,
          titleFont: { family: "'Geist Mono', monospace", size: 11, weight: '500' },
          bodyFont: { family: "'Geist Mono', monospace", size: 12 },
          filter: item => item.dataset.id !== 'target',
          callbacks: { label: ctx => ` ${ctx.dataset.label.padEnd(9, ' ')} ${Number(ctx.raw).toFixed(1)}` },
        },
      },
      scales: {
        y: {
          min: yMin, max: 9,
          ticks: { stepSize: (9 - yMin) <= 5 ? (big ? 0.5 : 1) : (big ? 1 : 1.5), color: t.faint, font: { family: "'Geist Mono', monospace", size: 10 }, padding: 6 },
          grid: { color: withAlpha(t.dark ? '#ffffff' : '#15171C', t.dark ? 0.06 : 0.06), drawTicks: false },
          border: { display: false },
        },
        x: {
          ticks: { color: t.faint, font: { family: "'Geist Mono', monospace", size: 10 }, maxRotation: 0, autoSkipPadding: 14, padding: 6 },
          grid: { display: false },
          border: { display: false },
        },
      },
    },
  };
}

function renderLineChart() {
  const canvas = document.getElementById('lineChart');
  if (!canvas || !window.Chart || !entries.length) return;
  renderLegend('chartLegend', () => { renderLineChart(); if (charts.modal) renderModalChart(); });
  if (charts.line) charts.line.destroy();
  charts.line = new Chart(canvas.getContext('2d'), buildLineConfig(filterByPeriod(entries, periods.main), false));
}

function openChartModal() {
  const modal = document.getElementById('chartModal');
  periods.modal = periods.main;
  document.querySelectorAll('[data-period-group="modal"] button').forEach(b => b.classList.toggle('active', b.dataset.period === periods.modal));
  UI.openDialog(modal);
  requestAnimationFrame(renderModalChart);
}

function renderModalChart() {
  const canvas = document.getElementById('modalChart');
  if (!canvas || !window.Chart) return;
  renderLegend('modalLegend', () => { renderModalChart(); renderLineChart(); });
  if (charts.modal) charts.modal.destroy();
  charts.modal = new Chart(canvas.getContext('2d'), buildLineConfig(filterByPeriod(entries, periods.modal), true));
}

function renderRadarChart() {
  const canvas = document.getElementById('radarChart');
  if (!canvas || !window.Chart || !entries.length) return;
  const t = chartTheme();
  const latest = entries[entries.length - 1];
  const colors = SECTIONS.map(s => skillColor(s.key));
  const line = t.dark ? t.signal : '#15171C';
  if (charts.radar) charts.radar.destroy();
  charts.radar = new Chart(canvas.getContext('2d'), {
    type: 'radar',
    data: {
      labels: SECTIONS.map(s => s.label),
      datasets: [
        {
          label: 'Latest', data: SECTIONS.map(s => latest[s.key]),
          backgroundColor: withAlpha(t.dark ? t.signal : '#D4F45A', t.dark ? 0.16 : 0.55),
          borderColor: line, borderWidth: 2,
          pointBackgroundColor: colors, pointBorderColor: t.surface, pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7,
          fill: true,
        },
        {
          label: 'Target', data: SECTIONS.map(s => targets[s.key]),
          backgroundColor: 'transparent', borderColor: t.muted, borderWidth: 1.5, borderDash: [4, 4],
          pointRadius: 0, pointHoverRadius: 3, fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.dark ? '#1E2026' : '#15171C', titleColor: '#F4F3EE', bodyColor: 'rgba(244,243,238,.85)',
          padding: 10, cornerRadius: 10,
          bodyFont: { family: "'Geist Mono', monospace", size: 12 },
          callbacks: { label: ctx => ` ${ctx.dataset.label} ${Number(ctx.raw).toFixed(1)}` },
        },
      },
      scales: {
        r: {
          min: 0, max: 9,
          ticks: { stepSize: 3, display: true, color: t.faint, backdropColor: 'transparent', font: { family: "'Geist Mono', monospace", size: 9 } },
          grid: { color: withAlpha(t.dark ? '#ffffff' : '#15171C', 0.08) },
          angleLines: { color: withAlpha(t.dark ? '#ffffff' : '#15171C', 0.08) },
          pointLabels: { color: colors, font: { size: 12, weight: '600' }, padding: 10 },
        },
      },
    },
  });
}

/* ---------- targets ---------- */
let targetsChartTimer = null;
function renderTargets() {
  const wrap = document.getElementById('targets');
  wrap.innerHTML = SECTIONS.map(s => skillRowHTML('target-', s.key, s.label, s.icon, targets[s.key])).join('');
  bindRangeRow(wrap, el => {
    const key = el.dataset.key;
    const val = clampBand(el.value);
    targets[key] = val;
    document.getElementById('target-score-' + key).textContent = val.toFixed(1);
    IeltsDB.saveTargets(targets);
    if (entries.length && currentTab === 'progress') {
      renderComparison();
      renderTips();
      renderHero();
      clearTimeout(targetsChartTimer);
      targetsChartTimer = setTimeout(renderCharts, 250);
    }
  });
}

function resetTargets() {
  targets = { ...DEFAULT_TARGETS };
  IeltsDB.saveTargets(targets);
  renderTargets();
  if (currentTab === 'progress') renderProgress();
  showToast('Targets reset', 'rotate-ccw');
}

boot();
