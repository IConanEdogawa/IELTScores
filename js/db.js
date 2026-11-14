(function (global) {
  const IDB_NAME = 'ielts-tracker-sqlite';
  const IDB_STORE = 'files';
  const IDB_KEY = 'main';
  const LEGACY_ENTRIES_KEY = 'nylc_ielts_entries';
  const LEGACY_SETTINGS_KEY = 'nylc_ielts_settings';
  const LEGACY_TARGETS_KEY = 'nylc_ielts_targets';

  let SQL = null;
  let db = null;
  let readyPromise = null;
  let saveTimer = null;

  function openIdb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const idb = req.result;
        if (!idb.objectStoreNames.contains(IDB_STORE)) {
          idb.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
  }

  async function idbGet() {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    });
  }

  async function idbSet(data) {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(data, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('IndexedDB write failed'));
    });
  }

  function ensureSchema() {
    db.run(`
      CREATE TABLE IF NOT EXISTS entries (
        date TEXT PRIMARY KEY NOT NULL,
        listening REAL NOT NULL,
        reading REAL NOT NULL,
        writing REAL NOT NULL,
        speaking REAL NOT NULL,
        overall REAL NOT NULL,
        manual_overall INTEGER NOT NULL DEFAULT 0,
        mood TEXT NOT NULL DEFAULT ''
      );
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
  }

  function schedulePersist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persistNow().catch(() => {});
    }, 80);
  }

  async function persistNow() {
    if (!db) return;
    const exported = db.export();
    await idbSet(exported);
  }

  function readLegacyJson(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function migrateFromLocalStorage() {
    const existing = db.exec('SELECT COUNT(*) AS c FROM entries');
    const count = existing?.[0]?.values?.[0]?.[0] || 0;
    if (count > 0) return;

    const legacyEntries = readLegacyJson(LEGACY_ENTRIES_KEY);
    const list = Array.isArray(legacyEntries)
      ? legacyEntries
      : Array.isArray(legacyEntries?.entries)
        ? legacyEntries.entries
        : [];

    const insert = db.prepare(`
      INSERT OR REPLACE INTO entries
      (date, listening, reading, writing, speaking, overall, manual_overall, mood)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const raw of list) {
      if (!raw || typeof raw.date !== 'string') continue;
      insert.run([
        raw.date,
        Number(raw.listening),
        Number(raw.reading),
        Number(raw.writing),
        Number(raw.speaking),
        Number(raw.overall),
        raw.manualOverall ? 1 : 0,
        String(raw.mood || ''),
      ]);
    }
    insert.free();

    const legacySettings = readLegacyJson(LEGACY_SETTINGS_KEY);
    if (legacySettings && typeof legacySettings === 'object') {
      const theme = legacySettings.theme === 'dark' || legacySettings.theme === 'system' || legacySettings.theme === 'light'
        ? legacySettings.theme
        : 'light';
      setMeta('settings', JSON.stringify({ theme }));
    }

    const legacyTargets = readLegacyJson(LEGACY_TARGETS_KEY);
    if (legacyTargets && typeof legacyTargets === 'object') {
      setMeta('targets', JSON.stringify(legacyTargets));
    }
  }

  function getMeta(key, fallback) {
    const stmt = db.prepare('SELECT value FROM meta WHERE key = ?');
    stmt.bind([key]);
    let value = null;
    if (stmt.step()) {
      value = stmt.getAsObject().value;
    }
    stmt.free();
    if (value == null) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function setMeta(key, valueObj) {
    const value = typeof valueObj === 'string' ? valueObj : JSON.stringify(valueObj);
    db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
    schedulePersist();
  }

  async function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      SQL = await initSqlJs({
        locateFile: (file) => `vendor/sqljs/${file}`,
      });

      const saved = await idbGet();
      db = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();
      ensureSchema();
      migrateFromLocalStorage();
      await persistNow();
      return true;
    })();
    return readyPromise;
  }

  function listEntries() {
    const rows = [];
    const stmt = db.prepare(`
      SELECT date, listening, reading, writing, speaking, overall, manual_overall, mood
      FROM entries
      ORDER BY date ASC
    `);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        date: row.date,
        listening: row.listening,
        reading: row.reading,
        writing: row.writing,
        speaking: row.speaking,
        overall: row.overall,
        manualOverall: !!row.manual_overall,
        mood: row.mood || '',
      });
    }
    stmt.free();
    return rows;
  }

  function replaceAllEntries(entries) {
    db.run('DELETE FROM entries');
    const insert = db.prepare(`
      INSERT INTO entries
      (date, listening, reading, writing, speaking, overall, manual_overall, mood)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of entries) {
      insert.run([
        e.date,
        e.listening,
        e.reading,
        e.writing,
        e.speaking,
        e.overall,
        e.manualOverall ? 1 : 0,
        e.mood || '',
      ]);
    }
    insert.free();
    schedulePersist();
  }

  function upsertEntry(entry) {
    db.run(`
      INSERT OR REPLACE INTO entries
      (date, listening, reading, writing, speaking, overall, manual_overall, mood)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      entry.date,
      entry.listening,
      entry.reading,
      entry.writing,
      entry.speaking,
      entry.overall,
      entry.manualOverall ? 1 : 0,
      entry.mood || '',
    ]);
    schedulePersist();
  }

  function deleteEntry(date) {
    db.run('DELETE FROM entries WHERE date = ?', [date]);
    schedulePersist();
  }

  function getSettings() {
    return getMeta('settings', { theme: 'light' });
  }

  function saveSettings(settings) {
    setMeta('settings', settings);
  }

  function getTargets(fallback) {
    return getMeta('targets', fallback);
  }

  function saveTargets(targets) {
    setMeta('targets', targets);
  }

  function isReady() {
    return !!db;
  }

  global.IeltsDB = {
    init,
    isReady,
    listEntries,
    replaceAllEntries,
    upsertEntry,
    deleteEntry,
    getSettings,
    saveSettings,
    getTargets,
    saveTargets,
    persistNow,
  };
})(window);
