/* MonEcole Service Worker — coquille hors-ligne + démarrage instantané */
const CACHE = 'monecole-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];
const CDN = ['cdnjs.cloudflare.com','unpkg.com','cdn.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch (_) { return; }

  // Ne JAMAIS intercepter Supabase (auth / base / realtime) — toujours réseau direct
  if (url.hostname.endsWith('supabase.co')) return;

  const sameOrigin = url.origin === self.location.origin;
  const isCDN = CDN.indexOf(url.hostname) !== -1;

  // Navigation : réseau d'abord (pour avoir les mises à jour), repli sur le cache hors-ligne
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('/index.html', cp)).catch(() => {}); return r; })
                .catch(() => caches.match('/index.html').then(r => r || caches.match('/')))
    );
    return;
  }
  // Fichiers du même domaine : cache d'abord
  if (sameOrigin) {
    e.respondWith(
      caches.match(req).then(c => c || fetch(req).then(r => { const cp = r.clone(); if (r.ok) caches.open(CACHE).then(ca => ca.put(req, cp)).catch(() => {}); return r; }))
                       .catch(() => caches.match('/index.html'))
    );
    return;
  }
  // Librairies / polices CDN : sert le cache et rafraîchit en arrière-plan
  if (isCDN) {
    e.respondWith(
      caches.match(req).then(c => {
        const f = fetch(req).then(r => { const cp = r.clone(); if (r.ok || r.status === 0) caches.open(CACHE).then(ca => ca.put(req, cp)).catch(() => {}); return r; }).catch(() => c);
        return c || f;
      })
    );
    return;
  }
  // Reste : réseau normal
});
