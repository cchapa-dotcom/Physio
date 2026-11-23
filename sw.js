// Offline support: cache the app shell, and cache the pose model and its
// runtime the first time they are fetched so the app works without signal
// (on a plane, in a hotel with bad wifi, or at home with patchy internet).
const CACHE = 'kine-v2';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg',
  'src/app.js', 'src/clinician.js', 'src/coach.js', 'src/demo.js', 'src/draw.js', 'src/engine.js',
  'src/exercises.js', 'src/geometry.js', 'src/landmarks.js', 'src/pose.js', 'src/presets.js',
  'src/program.js', 'src/session.js', 'src/storage.js', 'src/ui.js', 'src/lib/qrcode.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isModel = /mediapipe|tasks-vision|\.task$|\.wasm$/.test(url.href);
  if (isModel) {
    // Large, versioned files: cache first.
    e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
      return res;
    })));
  } else if (url.origin === location.origin) {
    // App files: network first so updates arrive, cache as fallback.
    e.respondWith(fetch(request).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
      return res;
    }).catch(() => caches.match(request)));
  }
});
