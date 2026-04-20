// NutriTrack Service Worker
// Version wird bei jedem Release hochgezählt - löst automatisches Update aus
var VERSION = '0.083';
var CACHE = 'nt-' + VERSION;
var SKIP = ['anthropic.com','corsproxy.io','openfoodfacts.org','fonts.googleapis.com','fonts.gstatic.com','unpkg.com'];

self.addEventListener('install', function(e) {
  // Sofort aktivieren ohne auf alte Tabs zu warten
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  // Alle alten Caches löschen
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) {
              console.log('[NutriTrack SW] Alter Cache gelöscht:', k);
              return caches.delete(k);
            })
      );
    }).then(function() {
      // Alle offenen Tabs sofort aktualisieren
      return self.clients.claim();
    }).then(function() {
      // Alle Clients benachrichtigen dass ein Update verfügbar ist
      return self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', version: VERSION });
        });
      });
    })
  );
});

self.addEventListener('fetch', function(e) {
  var u = e.request.url;
  for (var i = 0; i < SKIP.length; i++) {
    if (u.includes(SKIP[i])) {
      e.respondWith(fetch(e.request).catch(function() {
        return new Response('', { status: 503 });
      }));
      return;
    }
  }
  // Network-first für HTML (index.html immer frisch laden)
  if (u.includes('index.html') || u.endsWith('/nutritrack/') || u.endsWith('/nutritrack')) {
    e.respondWith(
      fetch(e.request).then(function(r) {
        if (r.ok) {
          var cl = r.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, cl); });
        }
        return r;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }
  // Cache-first für alle anderen Assets
  e.respondWith(
    caches.match(e.request).then(function(c) {
      if (c) return c;
      return fetch(e.request).then(function(r) {
        if (r.ok) {
          var cl = r.clone();
          caches.open(CACHE).then(function(ca) { ca.put(e.request, cl); });
        }
        return r;
      }).catch(function() {
        return caches.match('/nutritrack/') || caches.match('/nutritrack/index.html');
      });
    })
  );
});
