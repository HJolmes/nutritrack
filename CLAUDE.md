# NutriTrack – Claude Code Instructions

> **Erste Aktion in jeder neuen Session: Lies `UEBERGABE.md`.** Diese Datei enthält den aktuellen Projekt-Stand, die Architektur, offene Live-Tests und die Versions-Historie. Sie wird bei jedem deployablen Merge aktualisiert. Ohne sie ist keine sinnvolle Iteration möglich.

Bei Abschluss einer funktionalen Iteration (vor dem Merge) `UEBERGABE.md` aktualisieren: Versionsstand, Architektur-Änderungen, Live-Test-Status, Versions-Historie.

Befolge ausserdem immer die vollständigen Regeln in `AGENTS.md`. Die wichtigsten Punkte zusammengefasst:

## Versioning (PFLICHT bei jeder deployablen Änderung)

Bei jeder funktionalen Änderung (neue Features, Bugfixes, UI-Änderungen) MÜSSEN folgende vier Dinge gleichzeitig aktualisiert werden:

1. `APP_VERSION` in `index.html` – um `0.001` erhöhen
2. `VERSION` in `sw.js` – auf denselben Wert setzen
3. Sichtbarer Versionstext `Beta vX.XXX` in `index.html` – alle Vorkommen (2×)
4. `CHANGELOG`-Eintrag in `index.html` – kurze, nutzerlesbare Beschreibung

Dokumentationsänderungen ohne Auswirkung auf die App dürfen den Versionsbump überspringen.

## Architektur

- Alles in `index.html` (HTML + CSS + JS) – keine separaten Dateien anlegen
- `sw.js` – Service Worker, nur Versions-Bump nötig
- `worker/` – Cloudflare Worker AI-Proxy, separat deployen
- Keine npm/React/Build-Tools – statische GitHub Pages App

## Git-Workflow

- Immer Feature-Branch → PR → Merge (nie direkt auf `main` pushen)
- Branch-Namen: `claude/nutritrack-vX.XXX` für Features, `claude/nutritrack-fix-*` für Fixes
- Nach Merge: lokalen Stand mit `git reset --hard origin/main` synchronisieren

## Datenschutz

Niemals committen: API Keys, OAuth Tokens, Backups, persönliche Ernährungsdaten, `.env`-Dateien.
