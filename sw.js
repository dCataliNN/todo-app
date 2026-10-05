// ponytail: network-first for HTML, cache-first for assets; bump CACHE on changes.
const CACHE = 'todo-v4';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icon.svg'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(function (res) {
    const copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(event.request, copy); });
    return res;
  }).catch(function () {
    return caches.match(event.request).then(function (hit) { return hit || caches.match('./index.html'); });
  }));
});
