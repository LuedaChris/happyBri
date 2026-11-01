// Service Worker: legt die App-Dateien im Cache ab, damit die App auch im Flugmodus startet.
// Bei Änderungen an App-Dateien die Versionsnummer erhöhen, sonst bleibt die alte Version im Cache.
const CACHE = 'happybri-v12';
const FILES = ['./', 'index.html', 'style.css', 'predict.js', 'overview.js', 'app.js', 'meds.js', 'handover.js', 'db.js', 'import.js', 'export.js', 'growth.js', 'stats.js', 'sync.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
// Firebase-Bibliothek (von Google geladen) ebenfalls ablegen, damit Login und Sync auch offline starten.
const FIREBASE = ['app', 'auth', 'firestore'].map(n => `https://www.gstatic.com/firebasejs/11.10.0/firebase-${n}.js`);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))); // frisch vom Server, nicht aus dem Browser-Cache
    await Promise.all(FIREBASE.map(u => c.add(u).catch(() => {}))); // klappt es nicht, wird beim ersten Abruf nachgeholt
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const mine = url.origin === location.origin || url.hostname === 'www.gstatic.com';
  if (!mine) return; // Firestore/Auth-Verbindungen nie anfassen
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (url.hostname === 'www.gstatic.com' && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
