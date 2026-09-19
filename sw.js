/* ==========================================================================
   sw.js  —  offline shell
   --------------------------------------------------------------------------
   Caches the app itself so it opens without a connection. Note that speech
   recognition still needs a connection, because the phone sends the audio to
   Apple or Google to transcribe it. Everything else (your scores, the
   transcripts you already have, Quick Check on typed text, the weekly
   report) works offline.

   Bump CACHE_VERSION whenever you change any file, so phones pick it up.
   ========================================================================== */

const CACHE_VERSION = 'cc-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/settings.js',
  './js/patterns.js',
  './js/questions.js',
  './js/storage.js',
  './js/speech.js',
  './js/scoring.js',
  './js/report.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Network first, so editing settings.js on GitHub shows up quickly, with
  // the cache as the offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
  );
});
