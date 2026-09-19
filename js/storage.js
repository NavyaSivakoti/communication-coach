/* ==========================================================================
   storage.js  —  everything stays on this device
   --------------------------------------------------------------------------
   Scores, transcripts, patterns and notes go in localStorage (small, sync).
   Audio recordings go in IndexedDB, because localStorage caps out around
   5MB and cannot hold blobs.

   Nothing is ever uploaded. There is no server and no account.
   ========================================================================== */

import { SETTINGS } from './settings.js';
import { PHRASE_LIBRARY_SEED } from './patterns.js';

const NS = 'cc.v1.';
const KEYS = {
  sessions: NS + 'sessions',
  phrases: NS + 'phrases',
  notes: NS + 'notes',
  reports: NS + 'reports',
  profile: NS + 'profile',
  device: NS + 'device',
  meta: NS + 'meta',
};

/* ------------------------------------------------------------ localStorage */

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (err) {
    console.warn('storage read failed', key, err);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    // Almost always a quota error. Prune and retry once.
    console.warn('storage write failed, pruning', err);
    pruneSessions(Math.floor(SETTINGS.storage.maxSessionsKept / 2));
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err2) {
      console.error('storage write failed after pruning', err2);
      return false;
    }
  }
}

/* ---------------------------------------------------------------- SESSIONS
   One record per recorded answer, including re-records. */

export function getSessions() {
  return read(KEYS.sessions, []);
}

export function saveSession(session) {
  const all = getSessions();
  all.push(session);
  // Newest last. Trim from the front.
  const max = SETTINGS.storage.maxSessionsKept;
  const trimmed = all.length > max ? all.slice(all.length - max) : all;
  write(KEYS.sessions, trimmed);
  return session;
}

export function updateSession(id, patch) {
  const all = getSessions();
  const i = all.findIndex((s) => s.id === id);
  if (i === -1) return null;
  all[i] = { ...all[i], ...patch };
  write(KEYS.sessions, all);
  return all[i];
}

function pruneSessions(keep) {
  const all = getSessions();
  if (all.length <= keep) return;
  write(KEYS.sessions, all.slice(all.length - keep));
}

export function sessionsBetween(startISO, endISO) {
  return getSessions().filter((s) => s.at >= startISO && s.at < endISO);
}

/* ----------------------------------------------------------- PHRASE LIBRARY
   Seeded from Section 5/9. Anything you add is also fed to the detector. */

export function getPhrases() {
  const stored = read(KEYS.phrases, null);
  if (stored) return stored;
  const seeded = PHRASE_LIBRARY_SEED.map((p, i) => ({ ...p, id: 'seed-' + i, addedAt: null }));
  write(KEYS.phrases, seeded);
  return seeded;
}

export function addPhrase({ category, from, to }) {
  const all = getPhrases();
  all.push({
    id: 'p-' + Date.now().toString(36),
    category: category || 'My phrases',
    from: from.trim(),
    to: (to || '').trim(),
    addedAt: new Date().toISOString(),
  });
  write(KEYS.phrases, all);
  return all;
}

export function removePhrase(id) {
  write(KEYS.phrases, getPhrases().filter((p) => p.id !== id));
}

/** Phrases you added yourself, fed into the pattern detector. */
export function customPhraseStrings() {
  return getPhrases()
    .filter((p) => p.addedAt)
    .map((p) => p.from)
    .filter(Boolean);
}

/* ------------------------------------------------------------------- NOTES
   Section 16 items 9 and 10. Keyed by week so the report can pick them up. */

export function getNotes(weekKey) {
  const all = read(KEYS.notes, {});
  return all[weekKey] || { self: '', app: '' };
}

export function saveNotes(weekKey, notes) {
  const all = read(KEYS.notes, {});
  all[weekKey] = notes;
  write(KEYS.notes, all);
}

/* ----------------------------------------------------------------- REPORTS */

export function getReports() {
  return read(KEYS.reports, []);
}

export function saveReport(report) {
  const all = getReports();
  // One stored report per week; regenerating replaces it.
  const i = all.findIndex((r) => r.weekKey === report.weekKey);
  if (i >= 0) all[i] = report;
  else all.push(report);
  write(KEYS.reports, all);
}

/* ----------------------------------------------------------------- PROFILE */

export function getProfile() {
  return { ...SETTINGS.profile, ...read(KEYS.profile, {}) };
}

export function saveProfile(patch) {
  write(KEYS.profile, { ...read(KEYS.profile, {}), ...patch });
}

/* --------------------------------------------------------- DEVICE CAPABILITY
   Results of Settings > Check my phone, so the app stops trying things your
   phone cannot do. */

export function getDeviceReport() {
  return read(KEYS.device, null);
}

export function saveDeviceReport(report) {
  write(KEYS.device, report);
}

/* ------------------------------------------------------------------ STREAK */

export function getMeta() {
  return read(KEYS.meta, { streak: 0, lastSessionDay: null, longestStreak: 0 });
}

export function saveMeta(patch) {
  write(KEYS.meta, { ...getMeta(), ...patch });
}

/** Called when a daily session completes. Returns the new streak. */
export function touchStreak(todayKey, yesterdayKey) {
  const meta = getMeta();
  if (meta.lastSessionDay === todayKey) return meta.streak;
  const streak = meta.lastSessionDay === yesterdayKey ? meta.streak + 1 : 1;
  saveMeta({
    streak,
    lastSessionDay: todayKey,
    longestStreak: Math.max(streak, meta.longestStreak || 0),
  });
  return streak;
}

/* --------------------------------------------------------------- INDEXEDDB
   Audio only. Everything else is small enough for localStorage. */

const DB_NAME = 'cc-audio';
const DB_STORE = 'clips';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function saveAudio(id, blob) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put({ id, blob, at: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (err) {
    console.warn('could not store audio', err);
    return false;
  }
}

export async function loadAudio(id) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('could not load audio', err);
    return null;
  }
}

/** Drop recordings older than settings.storage.keepRecordingsDays. */
export async function pruneAudio() {
  const cutoff = Date.now() - SETTINGS.storage.keepRecordingsDays * 86400000;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (cursor.value.at < cutoff) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('audio prune failed', err);
  }
}

/* ------------------------------------------------------------------ EXPORT
   A full backup you can email yourself. Audio is not included; it is large
   and only useful on the device that recorded it. */

export function exportAllData() {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    settingsVersion: SETTINGS.settingsVersion,
    sessions: getSessions(),
    phrases: getPhrases(),
    notes: read(KEYS.notes, {}),
    reports: getReports(),
    profile: read(KEYS.profile, {}),
    meta: getMeta(),
  }, null, 2);
}

export function importAllData(json) {
  const data = JSON.parse(json);
  if (data.sessions) write(KEYS.sessions, data.sessions);
  if (data.phrases) write(KEYS.phrases, data.phrases);
  if (data.notes) write(KEYS.notes, data.notes);
  if (data.reports) write(KEYS.reports, data.reports);
  if (data.profile) write(KEYS.profile, data.profile);
  if (data.meta) write(KEYS.meta, data.meta);
}

export function clearAllData() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  indexedDB.deleteDatabase(DB_NAME);
  dbPromise = null;
}
