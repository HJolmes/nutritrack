// NutriTrack Service Worker
// Version wird bei jedem Release hochgezählt - löst automatisches Update aus
var VERSION = '0.304';
var CACHE = 'nt-' + VERSION;
var SKIP = ['workers.dev','corsproxy.io','openfoodfacts.org','fonts.googleapis.com','fonts.gstatic.com','unpkg.com','esm.sh','jsdelivr.net','is.gd','v.gd'];
// Kern-Assets, die für den Offline-Betrieb vorab gecacht werden. Relativ zur
// SW-Position (/nutritrack/), damit der GitHub-Pages-Pfad korrekt aufgelöst wird.
var CORE_ASSETS = ['./','index.html','picker.js','js/health-sync.js','js/baby.js','js/baby-meds.js','js/baby-growth-data.js','js/baby-growth.js','js/baby-week.js','js/baby-milestones.js','js/baby-midwife.js','js/shopping.js','js/partner.js','js/alexa-sync.js','js/sync-core.js','js/dashboard.js','js/features.js','js/mealplan.js','js/onedrive.js','js/autosave.js','js/recurring.js','js/stats.js','js/reminders.js','js/templates.js','js/offline-queue.js','js/actions.js','js/single-tab.js','tab.html','js/fooddb.js','js/fooddb-usda.js','js/metdb.js','js/ampel.js','js/changelog.js','js/calc.js','js/idb-photos.js','js/zxing/zxing-reader.iife.js','js/zxing/zxing_reader.wasm','js/zxing/zxing-js.umd.min.js','manifest.json','icon.svg'];

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
  // Nur eigene GET-Anfragen gehen durch den Cache. Fremde Server (OneDrive,
  // eigene Worker-URL …) liefern unter gleicher URL wechselnde Daten — ein
  // Cache-Treffer dort hiess: alter Backup-Stand ueberschreibt den neuen.
  if (e.request.method !== 'GET' || new URL(u).origin !== self.location.origin) return;
  for (var i = 0; i < SKIP.length; i++) {
    if (u.includes(SKIP[i])) {
      e.respondWith(fetch(e.request).catch(function() {
        return new Response('', { status: 503 });
      }));
      return;
    }
  }
  // Network-first für HTML (index.html immer frisch laden). In den Cache kommt
  // nur eine Seite DIESER Version (ihre Scripts tragen ?v=VERSION): Laeuft noch
  // der alte Worker, waehrend der Server schon die neue Seite liefert, laege
  // sonst die neue Seite neben den alten Modulen — und offline fehlten ihr die
  // Funktionen, die mit dem Update in ein Modul gewandert sind (#257). Die neue
  // Seite cacht der neue Worker bei seiner Installation.
  if (u.includes('index.html') || u.endsWith('/nutritrack/') || u.endsWith('/nutritrack')) {
    e.respondWith(
      fetch(e.request).then(function(r) {
        if (r.ok) {
          var cl = r.clone(), probe = r.clone();
          probe.text().then(function(t) {
            if (t.indexOf('?v=' + VERSION + '"') < 0) return;
            return caches.open(CACHE).then(function(c) { return c.put(e.request, cl); });
          }).catch(function() {});
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
  // Versionierte Scripts (?v=…, gesetzt von tools/bump.js): Gehoert die
  // Version nicht zu DIESEM Worker, ist die Seite neuer (oder aelter) als sein
  // Cache — dann aus dem Netz, und nur offline aus dem Cache. Sonst lieferte ein
  // alter Worker alte Module zur neuen index.html.
  var ver = null;
  try { ver = new URL(u).searchParams.get('v'); } catch (x) {}
  if (ver && ver !== VERSION) {
    e.respondWith(fetch(e.request).catch(function() {
      return caches.match(e.request, { ignoreSearch: true });
    }));
    return;
  }
  // Cache-first für alle anderen Assets (eigene Version: Cache ohne ?v= vorab gefuellt)
  e.respondWith(
    caches.match(e.request, { ignoreSearch: !!ver }).then(function(c) {
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

// Tippen auf eine Erinnerung (#244): Seit v0.277 kommen Meldungen ueber den
// Service Worker (js/reminders.js, NTRemind.notify). Ein Klick darauf loest nur
// dieses Ereignis aus – ohne Handler taete er nichts, auch auf dem Desktop nicht,
// wo eine Meldung aus der Seite den Tab von selbst nach vorn geholt hat.
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var scope = self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(scope) === 0 && 'focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(scope);
    })
  );
});
