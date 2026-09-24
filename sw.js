// App-shell cache. Bump VERSION when shipping changes so clients pick them up.
const VERSION = 'v1';
const CACHE = `job-tracker-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/app.js',
  'src/db.js',
  'src/jobs.js',
  'src/url.js',
  'icons/icon.svg',
  'icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for same-origin GETs. Navigations ignore the query
// string so share-target URLs (./?url=...) are served from the cached shell.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const isNav = req.mode === 'navigate';
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(isNav ? './' : req, { ignoreSearch: isNav });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(isNav ? './' : req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
