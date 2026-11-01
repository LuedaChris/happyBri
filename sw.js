// Service Worker: legt die App-Dateien im Cache ab, damit die App auch im Flugmodus startet.
// Bei Änderungen an App-Dateien die Versionsnummer erhöhen, sonst bleibt die alte Version im Cache.
const CACHE = 'happybri-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'db.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
