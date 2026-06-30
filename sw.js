// NutriTrack Service Worker
// Version wird bei jedem Release hochgezählt - löst automatisches Update aus
var VERSION = '0.196';
var CACHE = 'nt-' + VERSION;
var SKIP = ['workers.dev','corsproxy.io','openfoodfacts.org','fonts.googleapis.com','fonts.gstatic.com','unpkg.com','esm.sh','jsdelivr.net','is.gd','v.gd'];
// Kern-Assets, die für den Offline-Betrieb vorab gecacht werden. Relativ zur
// SW-Position (/nutritrack/), damit der GitHub-Pages-Pfad korrekt aufgelöst wird.
var CORE_ASSETS = ['./','index.html','picker.js','js/health-sync.js','js/zxing/zxing-reader.iife.js','js/zxing/zxing_reader.wasm','manifest.json','icon.svg'];

self.addEventListener('install', function(e) {
  // Sofort aktivieren ohne auf alte Tabs zu warten
  self.skipWaiting();
  // Kern-Assets vorab cachen, damit die PWA auch bei Erst-Nutzung offline läuft.
  // WICHTIG: {cache:'reload'} erzwingt frische Netzwerk-Kopien. Sonst kann der
  // Browser-HTTP-Cache (GitHub Pages liefert max-age) eine ALTE Asset-Version —
  // z.B. picker.js — in den neuen, versionierten SW-Cache schreiben, obwohl das
  // network-first geladene index.html bereits aktuell ist. Das führte dazu, dass
  // index.html (neu) und picker.js (alt) auseinanderliefen. cache.add() nutzt den
  // HTTP-Cache und ist daher hier ungeeignet → manueller fetch+put mit reload.
  // Best-effort pro Asset (allSettled) — ein einzelner Fehlschlag bricht die
  // Installation nicht ab.
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return Promise.allSettled(CORE_ASSETS.map(function(u) {
        return fetch(new Request(u, { cache: 'reload' })).then(function(r) {
          if (r && r.ok) return c.put(u, r);
        });
      }));
    }).catch(function() {})
  );
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
        // Offline: erst den exakten Request, sonst die vorab gecachte Start-Seite.
        return caches.match(e.request).then(function(m) {
          return m || caches.match('/nutritrack/');
        });
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
        // caches.match liefert immer ein (truthy) Promise – daher den ersten
        // Treffer awaiten und erst bei Miss auf index.html zurückfallen.
        return caches.match('/nutritrack/').then(function(m) {
          return m || caches.match('/nutritrack/index.html');
        });
      });
    })
  );
});
