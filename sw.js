/* MonEcole — Service Worker (niveau 1 hors ligne)
   - Squelette de l'app (index.html) + scripts CDN mis en cache -> l'app s'ouvre sans reseau
   - Navigation : reseau d'abord (derniere version si en ligne), repli sur le cache si hors ligne
   - Appels Supabase (API/temps reel) : toujours reseau (jamais mis en cache)
   Pense a incrementer la version a chaque mise a jour importante. */
const CACHE = "monecole-offline-v2";
const SHELL = ["/", "/index.html"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  if (url.hostname.indexOf("supabase") >= 0) return;

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        try { const c = await caches.open(CACHE); c.put("/index.html", fresh.clone()); } catch (_) {}
        return fresh;
      } catch (_) {
        const cached = (await caches.match("/index.html")) || (await caches.match(req));
        return cached || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && (fresh.ok || fresh.type === "opaque")) {
        try { const c = await caches.open(CACHE); c.put(req, fresh.clone()); } catch (_) {}
      }
      return fresh;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
