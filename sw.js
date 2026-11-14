// Service worker: la programmazione deve restare leggibile anche senza rete.
// La shell viene precaricata, i dati sono serviti prima dalla rete e poi dalla cache.
const VERSION = 'fp-20261114-1';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;

const SHELL_ASSETS = [
  './',
  './styles.css?v=20261113i',
  './app.js?v=20261113i',
  './icon.svg',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];
// Un index.html fisico esiste sul sito storico e su /legacy/, non sulla home
// SvelteKit: se manca non deve far fallire l'installazione.
const OPTIONAL_ASSETS = ['./index.html'];

const DATA_ASSETS = ['./data/schedule.json', './data/venues-info.json'];

const DATA_PATH = /\/data\/(schedule|venues-info)\.json$/;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    // Una shell incompleta o recuperata dalla cache HTTP non deve sostituire
    // la versione funzionante già installata.
    await Promise.all(SHELL_ASSETS.map((asset) => shell.add(new Request(asset, { cache: 'reload' }))));
    await Promise.allSettled(OPTIONAL_ASSETS.map((asset) => shell.add(new Request(asset, { cache: 'reload' }))));
    const data = await caches.open(DATA);
    await Promise.allSettled(DATA_ASSETS.map((asset) => data.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith('fp-') && !key.startsWith(VERSION)).map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const key = new Request(new URL(request.url).pathname, { method: 'GET' });
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(key, response.clone());
    return response;
  } catch {
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error('offline');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // I feed non sono asset immutabili: mai bloccarne gli aggiornamenti in cache.
  if (/\/calendars\/[^/]+\.ics$/.test(url.pathname)) {
    event.respondWith(networkFirst(request, DATA));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const shell = await caches.open(SHELL);
        return (await shell.match('./index.html', { ignoreSearch: true }))
          || (await shell.match('./', { ignoreSearch: true }))
          || Response.error();
      }
    })());
    return;
  }

  if (DATA_PATH.test(url.pathname)) {
    event.respondWith(networkFirst(request, DATA));
    return;
  }

  event.respondWith(cacheFirst(request));
});
