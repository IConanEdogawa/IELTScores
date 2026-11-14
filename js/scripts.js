const SECTIONS = [
  { key: 'listening', label: 'Listening', short: 'L', color: '#0F766E' },
  { key: 'reading',   label: 'Reading',   short: 'R', color: '#2563EB' },
  { key: 'writing',   label: 'Writing',   short: 'W', color: '#B45309' },
  { key: 'speaking',  label: 'Speaking',  short: 'S', color: '#BE123C' },
];

const DEFAULT_TARGETS = Object.fromEntries(SECTIONS.map(s => [s.key, 7.0]));

let entries = [];
let overallEnabled = false;
let moodOpen = false;
let currentPeriod = 'all';
let lineChart = null;
let targets = { ...DEFAULT_TARGETS };
let editingEntryDate = null;
let bootReady = false;

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

function persistEntries() {
  IeltsDB.replaceAllEntries(entries);
}

function reloadEntriesFromDb() {
  entries = IeltsDB.listEntries()
    .map(normalizeEntry)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function boot() {
  const bootEl = document.getElementById('bootStatus');
  try {
    await IeltsDB.init();
    reloadEntriesFromDb();
    const storedTargets = IeltsDB.getTargets(DEFAULT_TARGETS);
    targets = { ...DEFAULT_TARGETS };
    SECTIONS.forEach(s => {
      const v = Number(storedTargets?.[s.key]);
      targets[s.key] = Number.isFinite(v) ? Math.min(9, Math.max(0, v)) : DEFAULT_TARGETS[s.key];
    });

    document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
    buildSliders();
    renderTargets();
    renderHistory();
    renderProgress();
    switchTab(entries.length ? 'progress' : 'add');
    bootReady = true;
    if (bootEl) bootEl.hidden = true;
  } catch (err) {
    console.error(err);
    if (bootEl) {
      bootEl.textContent = 'Could not open local database. Try reloading.';
      bootEl.hidden = false;
    }
    showToast('Database failed to open');
  }
}

window.addEventListener('themechange', () => {
  if (bootReady) renderProgress();
});

function buildSliders() {
  const wrap = document.getElementById('sliders');
  wrap.innerHTML = SECTIONS.map(s => sliderHTML(s.key, s.label, s.short, s.color, 6.0)).join('');

  const owrap = document.getElementById('overallSliderWrap');
  owrap.innerHTML = sliderHTML('overall', 'Overall', 'O', '#0F766E', 6.0);

  document.querySelectorAll('.ielts-slider').forEach(el => {
    updateSliderFill(el);
    el.addEventListener('input', function () {
      updateSliderFill(this);
      const key = this.dataset.key;
      const val = parseFloat(this.value);
      const score = document.getElementById('score-' + key);
      score.textContent = val.toFixed(1);
      score.style.color = scoreColor(val);
    });
  });
}

function sliderHTML(key, label, short, color, def) {
  return `
  <div class="section-row">
    <div class="section-head">
      <div class="section-name">
        <span class="section-mark" style="--mark:${color}">${short}</span>
        ${label}
      </div>
      <div class="section-score" id="score-${key}" style="color:${scoreColor(def)}">${def.toFixed(1)}</div>
    </div>
    <div class="slider-wrap">
      <input type="range" class="ielts-slider" id="slider-${key}" data-key="${key}"
             min="0" max="9" step="0.5" value="${def}" style="--c:${color}"/>
    </div>
  </div>`;
}

function updateSliderFill(el) {
  const pct = (el.value / 9) * 100;
  const color = el.style.getPropertyValue('--c') || '#0F766E';
  el.style.background = `linear-gradient(to right, ${color} ${pct}%, var(--track) ${pct}%)`;
}

function scoreColor(v) {
  if (v >= 7.5) return 'var(--good)';
  if (v >= 6.5) return 'var(--accent)';
  if (v >= 5.5) return 'var(--warn)';
  return 'var(--bad)';
}

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function getChartTheme() {
  if (isLightTheme()) {
    return {
      overallLine: '#1C2430',
      overallBg: 'rgba(28,36,48,.08)',
      legend: 'rgba(28,36,48,.72)',
      tick: 'rgba(91,101,115,.9)',
      grid: 'rgba(28,36,48,.08)',
      tooltipBg: '#ffffff',
      tooltipBorder: 'rgba(28,36,48,.12)',
      tooltipTitle: '#1C2430',
      tooltipBody: 'rgba(28,36,48,.75)',
    };
  }

  return {
    overallLine: '#F0F4F8',
    overallBg: 'rgba(240,244,248,.06)',
    legend: 'rgba(240,244,248,.7)',
    tick: 'rgba(240,244,248,.45)',
    grid: 'rgba(255,255,255,.06)',
    tooltipBg: '#1A2330',
    tooltipBorder: 'rgba(255,255,255,.1)',
    tooltipTitle: '#F0F4F8',
    tooltipBody: 'rgba(240,244,248,.75)',
  };
}

function toggleOverall() {
  setOverallMode(!overallEnabled);
}

function toggleMood() {
  setMoodOpen(!moodOpen);
}

function addEntry() {
  if (!bootReady) { showToast('Database still loading'); return; }

  const date = document.getElementById('entryDate').value;
  if (!date) { showToast('Pick a date first'); return; }

  const mood = document.getElementById('moodNote').value.trim();
  const entry = { date, manualOverall: overallEnabled, mood };
  let sum = 0;
  SECTIONS.forEach(s => {
    const v = parseFloat(document.getElementById('slider-' + s.key).value);
    entry[s.key] = v;
    sum += v;
  });

  const calculatedOverall = Math.round((sum / 4) * 2) / 2;
  if (overallEnabled) {
    entry.overall = parseFloat(document.getElementById('slider-overall').value);
    if (Math.abs(entry.overall - calculatedOverall) > 0.001) {
      const ok = window.confirm(
        `Manual overall (${entry.overall.toFixed(1)}) differs from calculated (${calculatedOverall.toFixed(1)}). Save manual value?`
      );
      if (!ok) {
        showToast('Save cancelled');
        return;
      }
    }
  } else {
    entry.overall = calculatedOverall;
  }

  if (editingEntryDate) {
    const sameDateOther = entries.findIndex(e => e.date === date && e.date !== editingEntryDate);
    if (sameDateOther >= 0) {
      const shouldReplace = window.confirm('Another entry with this date exists. Replace it?');
      if (!shouldReplace) {
        showToast('Update cancelled');
        return;
      }
      entries.splice(sameDateOther, 1);
    }
    entries = entries.filter(e => e.date !== editingEntryDate);
    entries.push(entry);
  } else {
    const duplicateIndex = entries.findIndex(e => e.date === date);
    if (duplicateIndex >= 0) {
      const shouldReplace = window.confirm('Entry for this date already exists. Replace it?');
      if (!shouldReplace) {
        showToast('Save cancelled');
        return;
      }
      entries[duplicateIndex] = entry;
    } else {
      entries.push(entry);
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  persistEntries();

  const wasEditing = Boolean(editingEntryDate);
  resetEntryForm();
  exitEditMode();

  renderHistory();
  renderProgress();
  showToast(wasEditing ? 'Entry updated' : 'Entry saved');
  switchTab('history');
}

function renderHistory() {
  const el = document.getElementById('historyList');
  if (!entries.length) {
    el.innerHTML = `<div class="empty"><p>No results yet.<br/>Log your first test to start tracking.</p></div>`;
    return;
  }

  const sorted = [...entries].reverse();
  el.innerHTML = sorted.map((e, i) => entryCardHTML(e, sorted[i + 1])).join('');
}

function entryCardHTML(e, prev) {
  const isEditing = editingEntryDate === e.date;
  const d = new Date(e.date);
  const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const bars = SECTIONS.map(s => `
    <div class="entry-bar-item">
      <div class="entry-bar-label">${s.label}</div>
      <div class="entry-bar-track">
        <div class="entry-bar-fill" style="width:${(e[s.key] / 9 * 100).toFixed(1)}%;background:${s.color}"></div>
      </div>
      <div class="entry-bar-val" style="color:${s.color}">${e[s.key].toFixed(1)}</div>
    </div>`).join('');

  const moodHTML = e.mood ? `<div class="entry-mood">${escapeHtml(e.mood)}</div>` : '';

  let deltaHTML = '';
  if (prev) {
    const diff = e.overall - prev.overall;
    const sign = diff > 0 ? '+' : '';
    const tone = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const arrow = diff > 0 ? '\u2191' : diff < 0 ? '\u2193' : '\u2192';
    deltaHTML = `<div class="entry-delta ${tone}">${arrow} ${sign}${diff.toFixed(1)}</div>`;
  }

  return `
  <article class="entry-card ${isEditing ? 'is-editing' : ''}" data-date="${e.date}">
    <div class="entry-top">
      <div>
        <div class="entry-date">${dateStr}</div>
        ${deltaHTML}
      </div>
      <div class="entry-overall">${e.overall.toFixed(1)}<span>overall</span></div>
    </div>
    <div class="entry-bars">${bars}</div>
    ${moodHTML}
    <div class="entry-actions">
      <button type="button" class="btn-text" onclick="startEditEntry('${e.date}')">Edit</button>
      <button type="button" class="btn-text danger" onclick="deleteEntry('${e.date}')">Delete</button>
    </div>
  </article>`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deleteEntry(date) {
  if (!bootReady) return;
  const targetDate = String(date).trim();
  const removeAndRefresh = () => {
    const before = entries.length;
    entries = entries.filter(e => String(e.date).trim() !== targetDate);
    if (entries.length === before) {
      showToast('Delete failed: entry not found');
      return;
    }
    persistEntries();
    renderHistory();
    renderProgress();
    showToast('Entry deleted');
  };

  const card = document.querySelector(`.entry-card[data-date="${targetDate}"]`);
  if (!card) {
    removeAndRefresh();
    return;
  }

  card.classList.add('deleting');
  setTimeout(removeAndRefresh, 280);
}

function filteredEntries() {
  return filterByPeriod(entries, currentPeriod);
}

function renderProgress() {
  renderProgressSummary();
  renderLineChart();
}

function renderProgressSummary() {
  const wrap = document.getElementById('progressSummary');
  if (!wrap) return;

  if (!entries.length) {
    wrap.innerHTML = `<p class="empty-inline">Add a test result to see your progress.</p>`;
    return;
  }

  const latest = entries[entries.length - 1];
  const first = entries[0];
  const delta = latest.overall - first.overall;
  const deltaSign = delta > 0 ? '+' : '';
  const weakest = SECTIONS
    .map(s => ({ ...s, score: latest[s.key], gap: targets[s.key] - latest[s.key] }))
    .sort((a, b) => a.score - b.score)[0];

  wrap.innerHTML = `
    <div class="summary-grid">
      <div class="summary-stat">
        <div class="summary-label">Latest</div>
        <div class="summary-value">${latest.overall.toFixed(1)}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Trend</div>
        <div class="summary-value">${deltaSign}${delta.toFixed(1)}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Focus</div>
        <div class="summary-value focus" style="color:${weakest.color}">${weakest.short}</div>
      </div>
    </div>
    <p class="summary-copy">
      Weakest now is <strong>${weakest.label}</strong> at
      <strong>${weakest.score.toFixed(1)}</strong>
      — <strong>${weakest.gap.toFixed(1)}</strong> from your target.
    </p>
  `;
}

function renderLineChart() {
  const canvas = document.getElementById('lineChart');
  if (!canvas) return;

  const chartTheme = getChartTheme();
  const data = filteredEntries();
  const labels = data.map(e => {
    const d = new Date(e.date);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  });
  const point = getPointRadius(labels.length);

  const datasets = [
    ...SECTIONS.map(s => ({
      label: s.label,
      data: data.map(e => e[s.key]),
      borderColor: s.color,
      backgroundColor: s.color + '18',
      borderWidth: 2,
      pointRadius: point,
      pointHoverRadius: point + 1,
      pointBackgroundColor: s.color,
      tension: 0.35,
      fill: false,
    })),
    {
      label: 'Overall',
      data: data.map(e => e.overall),
      borderColor: chartTheme.overallLine,
      backgroundColor: chartTheme.overallBg,
      borderWidth: 2.5,
      borderDash: [5, 3],
      pointRadius: point + 1,
      pointHoverRadius: point + 2,
      pointBackgroundColor: chartTheme.overallLine,
      tension: 0.35,
      fill: false,
    }
  ];

  if (lineChart) lineChart.destroy();
  lineChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color: chartTheme.legend,
            font: { family: 'DM Mono', size: 10 },
            boxWidth: 12,
            padding: 12,
          }
        },
        tooltip: {
          backgroundColor: chartTheme.tooltipBg,
          borderColor: chartTheme.tooltipBorder,
          borderWidth: 1,
          titleColor: chartTheme.tooltipTitle,
          bodyColor: chartTheme.tooltipBody,
          titleFont: { family: 'DM Mono', size: 11 },
          bodyFont: { family: 'DM Mono', size: 11 },
          padding: 12,
        }
      },
      scales: {
        y: {
          min: 0,
          max: 9,
          ticks: {
            stepSize: 1.5,
            color: chartTheme.tick,
            font: { family: 'DM Mono', size: 10 },
          },
          grid: { color: chartTheme.grid },
          border: { display: false },
        },
        x: {
          ticks: {
            color: chartTheme.tick,
            font: { family: 'DM Mono', size: 10 },
            maxRotation: 0,
          },
          grid: { display: false },
          border: { display: false },
        }
      }
    }
  });
}

function setPeriod(p, btn) {
  currentPeriod = p;
  document.querySelectorAll('#page-progress .chart-period .period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLineChart();
}

function filterByPeriod(list, period) {
  if (period === 'all') return list;
  if (!list.length) return [];

  const latestDate = list.reduce((max, e) => (e.date > max ? e.date : max), list[0].date);
  const latest = new Date(latestDate + 'T00:00:00');
  const days = period === 'month' ? 30 : 7;
  const cutoffDate = new Date(latest.getTime() - days * 86400000).toISOString().split('T')[0];
  return list.filter(e => e.date >= cutoffDate);
}

function getPointRadius(pointCount) {
  const mobile = window.innerWidth <= 540;
  if (mobile) {
    if (pointCount >= 18) return 1;
    if (pointCount >= 12) return 2;
    return 3;
  }
  if (pointCount >= 24) return 2;
  if (pointCount >= 14) return 3;
  return 4;
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    const isActive = t.dataset.tab === name;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    t.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === 'page-' + name);
  });
  if (name === 'progress') renderProgress();
  if (name === 'history') renderHistory();
}

function renderTargets() {
  const wrap = document.getElementById('targets');
  if (!wrap) return;

  wrap.innerHTML = SECTIONS.map(s => `
    <div class="section-row">
      <div class="section-head">
        <div class="section-name">
          <span class="section-mark" style="--mark:${s.color}">${s.short}</span>
          ${s.label} target
        </div>
        <div class="section-score" id="target-score-${s.key}" style="color:${scoreColor(targets[s.key])}">${targets[s.key].toFixed(1)}</div>
      </div>
      <div class="slider-wrap">
        <input type="range" class="target-slider" data-key="${s.key}"
               min="0" max="9" step="0.5" value="${targets[s.key]}" style="--c:${s.color}"/>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.target-slider').forEach(el => {
    updateSliderFill(el);
    el.addEventListener('input', function () {
      updateSliderFill(this);
      const key = this.dataset.key;
      const val = parseFloat(this.value);
      targets[key] = val;
      const score = document.getElementById('target-score-' + key);
      score.textContent = val.toFixed(1);
      score.style.color = scoreColor(val);
      IeltsDB.saveTargets(targets);
      renderProgressSummary();
    });
  });
}

function resetTargets() {
  targets = { ...DEFAULT_TARGETS };
  IeltsDB.saveTargets(targets);
  renderTargets();
  renderProgressSummary();
  showToast('Targets reset');
}

function cancelEdit() {
  if (!editingEntryDate) return;
  resetEntryForm();
  exitEditMode();
  renderHistory();
  showToast('Edit cancelled');
}

function setOverallMode(enabled) {
  overallEnabled = !!enabled;
  const tog = document.getElementById('overallToggle');
  if (tog) tog.classList.toggle('on', overallEnabled);
  const wrap = document.getElementById('overallSliderWrap');
  if (wrap) wrap.hidden = !overallEnabled;
}

function setMoodOpen(open) {
  moodOpen = !!open;
  const expand = document.getElementById('moodExpand');
  if (expand) expand.classList.toggle('open', moodOpen);
  const arrow = document.getElementById('moodArrow');
  if (arrow) arrow.textContent = moodOpen ? '\u2212' : '+';
}

function setSliderValue(key, value) {
  const slider = document.getElementById('slider-' + key);
  if (!slider) return;
  slider.value = value;
  updateSliderFill(slider);
  const score = document.getElementById('score-' + key);
  if (score) {
    score.textContent = Number(value).toFixed(1);
    score.style.color = scoreColor(Number(value));
  }
}

function resetEntryForm() {
  document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
  SECTIONS.forEach(s => setSliderValue(s.key, 6.0));
  setSliderValue('overall', 6.0);
  setOverallMode(false);
  document.getElementById('moodNote').value = '';
  setMoodOpen(false);
}

function exitEditMode() {
  editingEntryDate = null;
  const btn = document.getElementById('cancelEditBtn');
  if (btn) btn.hidden = true;
  const title = document.getElementById('entryFormTitle');
  if (title) title.textContent = 'New test result';
  const saveBtn = document.getElementById('saveEntryBtn');
  if (saveBtn) saveBtn.textContent = 'Save result';
}

function startEditEntry(date) {
  const entry = entries.find(e => e.date === date);
  if (!entry) {
    showToast('Entry not found');
    return;
  }

  editingEntryDate = entry.date;
  document.getElementById('entryDate').value = entry.date;
  SECTIONS.forEach(s => setSliderValue(s.key, entry[s.key]));

  setOverallMode(!!entry.manualOverall);
  setSliderValue('overall', entry.overall);

  document.getElementById('moodNote').value = entry.mood || '';
  setMoodOpen(Boolean((entry.mood || '').trim()));

  const btn = document.getElementById('cancelEditBtn');
  if (btn) btn.hidden = false;
  const title = document.getElementById('entryFormTitle');
  if (title) title.textContent = 'Edit test result';
  const saveBtn = document.getElementById('saveEntryBtn');
  if (saveBtn) saveBtn.textContent = 'Update result';

  switchTab('add');
  renderHistory();
  showToast('Editing entry');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

boot();
