// Thorax service worker: de app werkt ook zonder wifi of mobiele data.
// Met internet: altijd de nieuwste versie, maar nooit langer dan 3 seconden wachten.
// Zonder internet (of met een zwak signaal): meteen de op je iPhone bewaarde versie.
// Je gegevens zelf staan altijd lokaal op je iPhone en hebben geen internet nodig.
const CACHE = 'thorax-v3';
const PAGE = './index.html';
const TIMEOUT = 3000;

// Safari weigert een "doorgestuurd" antwoord voor een pagina; maak er een gewoon antwoord van.
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await clean(await fetch(new Request('./', { cache: 'reload' })));
    if (res.ok) { await cache.put(PAGE, res.clone()); await cache.put('./', res); }
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Alles (ook het logo) zit in index.html; enkel de pagina zelf moet bewaard worden.
  if (req.mode !== 'navigate' && req.destination !== 'document') return;
  e.respondWith(page(e));
});

async function page(e) {
  const cache = await caches.open(CACHE);
  const network = fetch(new Request(e.request.url, { cache: 'no-store', credentials: 'same-origin' }))
    .then(async res => {
      if (!res.ok) return res;
      const r = await clean(res);
      await cache.put(PAGE, r.clone()); await cache.put('./', r.clone());
      return r;
    });
  const saved = (await cache.match(PAGE)) || (await cache.match('./'));
  if (!saved) {
    try { return await network; }
    catch (_) { return new Response('<meta name="viewport" content="width=device-width"><h2 style="font-family:-apple-system;padding:24px">Open Thorax één keer met internet, daarna werkt hij ook offline.</h2>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
  }
  const wait = new Promise(r => setTimeout(() => r(null), TIMEOUT));
  try { const res = await Promise.race([network, wait]); if (res && res.ok) return res; } catch (_) {}
  e.waitUntil(network.catch(() => {})); // op de achtergrond alsnog bijwerken voor de volgende keer
  return saved;
}
