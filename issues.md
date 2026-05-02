# NutriTrack — Bug-Workflow

Bugs werden ausschließlich als GitHub-Issues mit `label:bug` geführt — der Feedback-FAB in der App legt sie automatisch an (`bug` + `from-app`). Diese Datei beschreibt nur den Triage- und Abarbeitungs-Workflow, **keine Issue-Liste** (die lebt in GitHub).

## Triage (vor jeder Arbeit am Issue)

Jeder Bug bekommt zusätzlich zum `bug`-Label genau ein **Themen-Label** `topic:<kebab-case>`.

1. **Typ prüfen:** ist das wirklich ein Bug oder eigentlich ein Wunsch? Falls Wunsch → `bug`-Label entfernen, `enhancement` setzen, ab da gilt `wuensche.md`. Spiegelregel auch andersrum: ein als `enhancement` gelabeltes Item, das in Wahrheit ein Bug ist, wird ent-`enhancement`et und mit `bug` versehen. Reine Mischfälle (Bug **und** Wunsch in einem Issue) bekommen beide Labels.
2. Bestehende `topic:*`-Labels prüfen (GitHub MCP-Tools).
3. Passt eines thematisch → anwenden.
4. Passt keines → neues `topic:<bereich>` anlegen (kurze Beschreibung) + anwenden.

**Themen-Schnitt:** Seiten und Funktionen, die zusammengehören, teilen sich ein Topic. Bugs und Wünsche teilen denselben Topic-Namensraum (siehe `wuensche.md`). Beispiele:

- `topic:feedback` — Feedback-FAB, Feedback-Modal, Worker `/feedback`, Bug-/Wunsch-Reports
- `topic:hauptseite` — Heute-Tab, Hero-kcal, Mahlzeiten-Grid, Begrüßung
- `topic:share-import` — `/share`, `?s=<id>`, Import-Paste, iOS-Handoff, `iosSwitchOv`
- `topic:trends` — Stats-Screen, Streak, Gewicht-Card, KI-Bericht
- `topic:scanner` — Barcode-Scan, Decoder, ZXing
- `topic:onedrive` — OAuth-PKCE, Graph-API, Backup-Sync
- `topic:setup` — Einrichtung, `setupScreen`, Zielwerte
- (weitere analog bei Bedarf)

## Vorschau im Chat (vor Code-Edits)

Bevor Branch oder Code-Edits beginnen, fasst der Agent **direkt im Chat** zusammen — **gruppiert nach Topic**, eine Iteration nach der anderen:

- Topic-Überschrift
- Pro Issue 1 Satz: Problem laut Reporter + `#N`
- Pro Issue 1 Satz: geplanter Fix (was wird wo geändert)

Erst nach Bestätigung („ok", „los", „mach") im Chat geht es an den Code. Die Vorschau ist auch bei „mach alle nacheinander" Pflicht — **pro Topic** eine Vorschau, dann Bestätigung, dann Code, dann Commit/PR. Grund: der Mensch kennt die einzelnen Issues nicht auswendig und soll nicht raten müssen, was gerade passiert.

## Abarbeitung (pro Iteration)

- **Genau ein Topic pro Iteration.** Mehrere offene Issues mit demselben `topic:` werden in einer Iteration / einem PR gemeinsam erledigt, wenn sie kohärent sind.
- Reihenfolge: User-Priorität (Chat) > kritischste Bugs > Topic-Volumen. Nicht nach Erstelldatum.
- Branch-Name `claude/nutritrack-fix-<topic>` oder `claude/nutritrack-vX.XXX`.
- PR-Body: `Closes #N` für jedes erledigte Issue. Versionierung laut `CLAUDE.md`.

## Verboten

Issue-Listen, -Kopien oder -Backlogs in dieser Datei. Quelle ist ausschließlich GitHub.
