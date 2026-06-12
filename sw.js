/* MonEcole Service Worker — coquille hors-ligne + démarrage instantané
   v5 : ne met en cache / ne sert un index.html QUE s'il est COMPLET (anti-fichier tronqué) */
const CACHE = 'monecole-v5';
const SHELL = ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];
const CDN = ['cdnjs.cloudflare.com','unpkg.com','cdn.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com'];

function estComplet(txt){ return typeof txt === 'string' && txt.indexOf('</html>') !== -1; }
function htmlResponse(txt){ return new Response(txt, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }

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

  if (url.hostname.endsWith('supabase.co')) return;

  const sameOrigin = url.origin === self.location.origin;
  const isCDN = CDN.indexOf(url.hostname) !== -1;

  // Navigation : réseau d'abord, on ne garde/sert l'app QUE si complète
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r && r.ok) {
          const body = await r.clone().text();
          if (estComplet(body)) {
            try { (await caches.open(CACHE)).put('/index.html', htmlResponse(body)); } catch (_) {}
            return htmlResponse(body);
          }
          const ok = await caches.match('/index.html');
          if (ok) return ok;
          return htmlResponse(body);
        }
      } catch (_) {}
      const cached = await caches.match('/index.html');
      if (cached) return cached;
      try { return await fetch(req); } catch (_) { return new Response('Hors ligne', { status: 503 }); }
    })());
    return;
  }

  // Fichiers du même domaine (icônes, manifest) : cache d'abord
  if (sameOrigin) {
    e.respondWith(
      caches.match(req).then(c => c || fetch(req).then(r => { const cp = r.clone(); if (r.ok) caches.open(CACHE).then(ca => ca.put(req, cp)).catch(() => {}); return r; }))
                       .catch(() => caches.match('/index.html'))
    );
    return;
  }
  // CDN : cache + rafraîchissement en arrière-plan
  if (isCDN) {
    e.respondWith(
      caches.match(req).then(c => {
        const f = fetch(req).then(r => { const cp = r.clone(); if (r.ok || r.status === 0) caches.open(CACHE).then(ca => ca.put(req, cp)).catch(() => {}); return r; }).catch(() => c);
        return c || f;
      })
    );
    return;
  }
});
