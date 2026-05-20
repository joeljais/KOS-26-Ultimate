/* KOS — Service Worker  (cache-first, full asset cache) */
const CACHE_NAME = 'kos-v2';
const ASSETS = [
  '/',
  'index.html',
  'manifest.json',
  /* Core JS */
  'kos-manifest.js',
  'kos-kernel.js',
  'kos-wm.js',
  'kos-init.js',
  'kos-contextmenu.js',
  /* App JS */
  'apps/browser.js',
  'apps/ui-manager.js',
  'apps/task-mgr.js',
  'apps/photos.js',
  'apps/calculator.js',
  'apps/studio.js',
  'apps/about.js',
  'apps/release-notes.js',
  'apps/files.js',
  'apps/notes.js',
  'apps/dock.js',
  'apps/spotlight.js',
  /* Core CSS */
  'css/core-vars.css',
  'css/shell.css',
  'css/wm.css',
  'css/kos-contextmenu.css',
  /* App CSS */
  'css/apps/browser.css',
  'css/apps/task-mgr.css',
  'css/apps/calculator.css',
  'css/apps/release-notes.css',
  'css/apps/files.css',
  'css/apps/notes.css',
  'css/apps/photos.css',
  'css/apps/about.css',
  'css/apps/studio.css',
  'css/apps/ui-manager.css',
  /* Documents / media */
  'documents/img_avatar.png',
  'documents/img_avatar2.png',
  'documents/dfw.jpg',
  'documents/load1.gif',
  'documents/startupsong.mp3',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())   /* activate immediately */
  );
});

self.addEventListener('activate', e => {
  /* Delete all old caches */
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  /* Cache-first: serve from cache, fall back to network, then cache the response */
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        /* Only cache successful same-origin responses */
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => cached);   /* offline: serve stale if available */
    })
  );
});
