/* Silva Cleaning Team — offline shell.
 *
 * A cleaner opening this at a door in Corrandulla may have no signal at all.
 * The service worker keeps the last good copy of the app so it still opens,
 * and the app itself holds any sign-in until coverage returns.
 *
 * Rules that matter, learned the hard way when an earlier service worker
 * pinned a stale copy of the app on people's phones:
 *   - the app document is ALWAYS fetched from the network first; the cache is
 *     only a fallback for when the network is not there.
 *   - Supabase and every other cross-origin request is left completely alone.
 *   - bumping VERSION drops every older cache on activation.
 */
const VERSION = 'silva-2026-09-07a';
const SHELL = [
  'app.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // One bad URL must not fail the whole install.
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase, fonts: not ours

  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('.html');

  if (isDoc) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(VERSION);
        c.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const hit = await caches.match(req, { ignoreSearch: true });
        return hit || caches.match('app.html', { ignoreSearch: true })
                   || new Response('Offline and nothing saved yet.', { status: 503 });
      }
    })());
    return;
  }

  // Icons, manifest: from the cache if we have it, and refresh it quietly.
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => {
      caches.open(VERSION).then(c => c.put(req, r.clone())).catch(() => {});
      return r;
    }).catch(() => hit);
    return hit || net;
  })());
});
