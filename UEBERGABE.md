# NutriTrack — Übergabe an die nächste Claude-Session

> **Anweisung für neue Sessions:** Lies diese Datei zuerst. Sie ersetzt jede manuelle Kontext-Übergabe. Beim Abschluss einer Iteration (Merge auf `main`) wird sie aktualisiert.

**Letzte Aktualisierung:** 2026-05-02 (nach v0.144)

---

## Aktueller Versionsstand

- **Live:** v0.144 auf `main` (Bloom-Redesign + 5-Tab-Nav + Mahlzeit-Detail)
- **PWA:** https://hjolmes.github.io/nutritrack/
- **Worker:** https://nutritrack-ai-proxy.h-jolmes.workers.dev (codeVersion `v0.142-pwa-origin-share`, vom Redesign nicht berührt)
- **Decoder:** https://nutritrack-decoder-294137824893.europe-west1.run.app

## Architektur (Stand v0.144)

### UI-Struktur (neu in v0.144)

- **Theme:** Cream-Background `#faf6f1`, Coral-Akzent `#e96e3c`, Fraunces-Serif (display) + Inter (body). Implementiert als Override-Block ganz unten im `<style>`-Bereich von `index.html` (`/* BLOOM REDESIGN v0.144 */`) — bestehende Klassen werden re-skinned, alle JS-Hooks bleiben erhalten.
- **Screens:**
  - `mainScreen` — Heute mit personalisierter „Hej {Name}"-Begrüßung, Hero-Kalorienzahl + `kcalTrendPill`, 3 Makro-Pills, Mahlzeiten-Grid (2×2).
  - `historyScreen` — Verlauf der letzten 30 Tage als anklickbare Liste (`renderHistory()` → `goToDay(k)`).
  - `mealDetailScreen` — Mahlzeit-Detail mit Foto-Header, Stat-Pills (kcal/P/C/F) und Zutaten-Liste; geöffnet via `openMealDetail(meal)`, geschlossen via `closeMealDetail()`.
  - `statsScreen` — Trends (orange Streak-Card, Ø-kcal, Gewicht-Card, KI-Bericht).
  - `moreScreen` — Hub mit Bibliothek, Einstellungen, Daten, Code einlösen, Hilfe, Was-ist-neu.
- **Navigation:** Bottom-Nav als dunkle Pille mit 5 Items (Heute / Verlauf / + / Trends / Mehr). `switchTab(tab)` mappt via `data-tab`-Attribut, `'stats'` als Alias auf `'trends'`.
- **Datenkompatibilität:** Alle bestehenden IDs (`tP/tC/tF`, `fP/fC/fF`, `entries-<meal>`, `sub-<meal>`) bleiben funktional — die alte renderAll-Schleife befüllt sie weiter, parallel werden die neuen Grid-IDs (`kcal-<meal>`, `time-<meal>`, `preview-<meal>`, `mealsTotal`, `mealsCount`) sowie die offene Detail-Seite über `_mealDetailOpen` mit aktualisiert.

### Share-Flow (Rezepte / Mahlzeiten / Lebensmittel)

```
Sender PWA → POST /share (Cloudflare Worker, KV-write, 1y TTL)
           ← {short: "https://hjolmes.github.io/nutritrack/?s=Ab12X"}
           → navigator.share() bzw. clipboard

Empfänger:
─── Android Chrome PWA installiert ────────────────────────
    Link tippen → handle_links matcht PWA-Scope → PWA öffnet
    → boot detect ?s=<id> → GET /share/<id> (Worker, KV-read)
    → _previewImport(d) → user confirms → recipes/customFoods/meals

─── Android Chrome (ohne PWA) / Desktop ───────────────────
    Link → Browser-Tab → PWA als Webseite → identischer Flow

─── iOS Safari (non-standalone) ───────────────────────────
    Apple isoliert seit iOS 17.4 Safari-Storage von der
    installierten PWA. Lösung:
    Link → Safari → boot detect ?s=<id> + iOS-Safari →
    Auto-Copy URL in Zwischenablage → iosSwitchOv-Modal mit
    3-Schritt-Anleitung („Schließe Safari → NutriTrack vom
    Home-Bildschirm → 📥 antippen")
    → User wechselt zur PWA → 📥 antippen
    → openImportPaste() liest Clipboard → Auto-Fill
    → Vorschau → user confirms → save

─── iOS PWA (standalone) ──────────────────────────────────
    Direkt-Import wie Android-PWA-Pfad
```

### URL-Format-Kompatibilität (alles backwards-kompatibel)

- `?s=<id>` — v0.142+ (Worker-KV-Lookup, primär)
- `#x=<base64>` — v0.139 unifiziertes Schema (inline, offline-fähig)
- `#r=<base64>` — v0.138 nur-Rezept (inline, legacy)
- `workers.dev/s/<id>` — v0.140 Legacy-URL (Worker leitet auf `?s=<id>` um)
- Roher Code-Paste in `importPasteOv` Textarea funktioniert ebenfalls

### Payload-Schema (base64-encoded JSON)

```js
// Rezept
{t:'r', n:name, em:emoji, ins:instructions, i:[{n,em,a,p:{k,pr,c,f}}, ...]}
// Lebensmittel (Custom Food)
{t:'f', n:name, em:emoji, p:{k,pr,c,f}}
// Mahlzeit
{t:'m', m:mealKey, e:[entries]}
```

## Endpoints / Secrets

### Cloudflare Worker

URL: `https://nutritrack-ai-proxy.h-jolmes.workers.dev`

| Endpoint | Zweck |
|---|---|
| `GET /health` | JSON inkl. `shareConfigured`, `decoderConfigured`, `codeVersion` |
| `POST /v1/messages` | Anthropic-Proxy (KI-Foto/Chat), Token-Auth |
| `POST /decode-barcode` | OSS-Decoder + optionaler Vision-Fallback |
| `POST /share` | Body `{code:"<base64>"}` → `{ok:true, data:{id, short}}` |
| `GET /share/<id>` | Lookup → `{ok:true, data:{id, code}}` |
| `GET /s/<id>` | Legacy (v0.140) → HTML-Redirect zu `?s=<id>` |

### Worker-Bindings/Secrets

- `ANTHROPIC_API_KEY` (secret, optional via `ENABLE_VISION_FALLBACK=true`)
- `NUTRITRACK_PROXY_TOKEN` (secret)
- `DECODER_URL` (secret)
- `SHARE_KV` (KV-Namespace, ID `873c9976307f4af087ff8205ba957b1c`)

### Cloud Run Decoder

URL: `https://nutritrack-decoder-294137824893.europe-west1.run.app`
- OpenCV `BarcodeDetector` + pyzbar Fallback
- Schutz: `--max-instances=2` + Budget-Alarm 1 €/Monat

## Code-Layout

### `index.html` (Hauptdatei)

Suchpfade für die wichtigsten Sektionen:

- `// SECTION: SHARE & IMPORT` — universaler Share-/Import-Code
- `_isIos()`, `_isPwaStandalone()` — Plattform-Detection
- `_checkSharedItemOnBoot()` — Boot-Hook, verzweigt nach Plattform
- `_showIosBrowserToAppFlow()` — iOS-Safari-Modal-Trigger
- `openImportPaste()` — liest Clipboard, füllt Eingabefeld
- Modale: `shareItemOv`, `importPasteOv`, `importConfirmOv`, `iosSwitchOv`
- Top-Header `<button onclick="openImportPaste()">📥</button>` (Hauptansicht)

### `worker/src/index.js`

- `// ─── SHARE-LINK SHORTENER (KV-backed) ───`
- `handleShareCreate()` — POST /share
- `handleShareLookup()` — GET /share/<id>
- `handleShareRedirect()` — GET /s/<id> (Legacy)
- `generateShareId()` — Base58-7-char IDs (kein 0/O/1/I/l)

### `manifest.json`

- `"handle_links": "preferred"` (Android Chrome ≥97 PWA-Routing)
- `"launch_handler": {"client_mode": "navigate-existing"}`

### `sw.js`

- `VERSION = '0.143'`
- SKIP-Liste: `workers.dev`, `is.gd`, `v.gd`, etc. (kein SW-Caching für Shortener)

## Versioning-Workflow (PFLICHT bei jedem deployablen Bump)

1. `APP_VERSION` in `index.html`
2. `VERSION` in `sw.js` (gleicher Wert)
3. Sichtbarer Versionstext `Beta vX.XXX` in `index.html` (2× Vorkommen via `replace_all`)
4. CHANGELOG-Eintrag in `index.html` ganz oben
5. **Diese `UEBERGABE.md` aktualisieren** (Versionsstand, evtl. Architektur, Live-Test-Status)

Doku-only Änderungen dürfen den App-Bump überspringen.

## Git-Workflow

- Aktiver Default-Branch: `main`
- Branch-Namen: `claude/nutritrack-vX.XXX` (Features), `claude/nutritrack-fix-*` (Fixes), `claude/nutritrack-<topic>` (sonstiges)
- PRs werden via **squash** gemerged
- Nach Merge: `git checkout main && git pull origin main`
- Nie direkt auf `main` pushen

## Cross-Platform-Regel (vom User explizit verlangt)

**Eine Codebase, identische Features auf iOS und Android.** Nur der Barcode-Live-Scanner darf Plattform-Pfade haben (iOS Safari Live-Stream-Workaround). Alles andere muss auf beiden Plattformen identisch funktionieren. Manifest-Einträge die auf einer Plattform ignoriert werden (z. B. `handle_links` auf iOS) sind OK — kein Code-Fork.

## Datenschutz

Niemals committen: API Keys, OAuth Tokens, exportierte Backups, persönliche Ernährungsdaten, `.env`-Dateien, `.dev.vars`.

## Live-Test-Status (offen)

- ✅ Android Chrome PWA: Kurzlink funktioniert grundsätzlich (User-bestätigt)
- ⏳ Android Direct-PWA-Open (v0.142): noch nicht live-getestet (eventuell PWA-Reinstall nötig damit Manifest neu geladen wird)
- ⏳ iOS Safari-Handoff (v0.143): 3-Schritt-Flow noch nicht in der Praxis durchgespielt
- ⏳ iOS PWA standalone Direct-Import: noch nicht getestet
- ⏳ v0.144 Bloom-Redesign: nicht in echter PWA durchgespielt — Heute-Header personalisiert, 2×2-Grid und Mahlzeit-Detail bisher nur über statisches HTTP-Serving + JS-Syntax-Check verifiziert

## Versions-Historie

| Version | PR | Was |
|---|---|---|
| v0.138 | #36 | Rezepte als Link teilen (`#x=<base64>`) + Auto-Import-Dialog |
| v0.139 | #37 | DRY-Refactor (Rezept/Mahlzeit/Lebensmittel ein Pfad), Custom-Food-Sharing |
| v0.140 | #38 | Eigener Cloudflare-Worker-Shortener mit KV-Storage |
| v0.141 | #39 | 📥 Import-Button in Top-Header der Hauptansicht |
| v0.142 | #43 | Kurzlink wandert auf PWA-Origin → Android öffnet PWA direkt |
| v0.143 | #43 | iOS-Safari-Handoff via Zwischenablage + Auto-Paste |
| v0.144 | #45 | Bloom-Redesign (Cream/Coral/Fraunces) + 5-Tab-Bottom-Nav + Mahlzeit-Detail-Subseite + Verlauf/Mehr-Hub |

## Mögliche Folge-Iterationen (nicht eingeplant)

- iOS-Live-Test des v0.143 Handoff-Flows in der Praxis durchspielen
- Android-Live-Test mit PWA-Reinstall (damit neues Manifest greift)
- KV-TTL evtl. von 1 Jahr auf 90 Tage senken wenn Volumen wächst
- Wenn der Anthropic-Vision-Fallback nach Wochen ungenutzt: kompletter Removal aus `worker/src/index.js` (~60 LOC weniger)
- v0.144 Folgearbeit: echte Foto-Vorschau im Mahlzeit-Detail (aktuell orange Platzhalter wenn keiner der Einträge ein `photo`-Feld hat), Trends-Card 12M-Toggle, „Mehr" um Datenexport-Slots erweitern

## Cost / Limits

- Cloud Run Decoder: Always-Free-Tier (2M req/Monat)
- Anthropic Vision: 0 Calls (`ENABLE_VISION_FALLBACK=false`)
- Cloudflare Workers KV: 100k Reads/Tag, 1k Writes/Tag, 1 GB — weit unter NutriTrack-Volumen
- Worker selbst: Free-Tier, 100k req/Tag

---

**Pflege-Hinweis für Claude:** Beim Abschluss jeder funktionalen Iteration vor dem Merge die Felder _Letzte Aktualisierung_, _Aktueller Versionsstand_, _Live-Test-Status_ und _Versions-Historie_ aktualisieren. Architektur-Änderungen entsprechend. Diese Datei ist die Single Source of Truth für den Projekt-Stand.
