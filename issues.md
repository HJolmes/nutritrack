# NutriTrack — Bug-Workflow

Bugs werden ausschließlich als GitHub-Issues mit `label:bug` geführt — der Feedback-FAB in der App legt sie automatisch an (`bug` + `from-app`). Diese Datei beschreibt nur den Triage- und Abarbeitungs-Workflow, **keine Issue-Liste** (die lebt in GitHub).

## Triage (vor jeder Arbeit am Issue)

Jeder Bug bekommt zusätzlich zum `bug`-Label genau ein **Themen-Label** `topic:<kebab-case>`.

1. Bestehende `topic:*`-Labels prüfen (GitHub MCP-Tools).
2. Passt eines thematisch → anwenden.
3. Passt keines → neues `topic:<bereich>` anlegen (kurze Beschreibung) + anwenden.

**Themen-Schnitt:** Seiten und Funktionen, die zusammengehören, teilen sich ein Topic. Bugs und Wünsche teilen denselben Topic-Namensraum (siehe `wuensche.md`). Beispiele:

- `topic:feedback` — Feedback-FAB, Feedback-Modal, Worker `/feedback`, Bug-/Wunsch-Reports
- `topic:hauptseite` — Heute-Tab, Hero-kcal, Mahlzeiten-Grid, Begrüßung
- `topic:share-import` — `/share`, `?s=<id>`, Import-Paste, iOS-Handoff, `iosSwitchOv`
- `topic:trends` — Stats-Screen, Streak, Gewicht-Card, KI-Bericht
- `topic:scanner` — Barcode-Scan, Decoder, ZXing
- `topic:onedrive` — OAuth-PKCE, Graph-API, Backup-Sync
- `topic:setup` — Einrichtung, `setupScreen`, Zielwerte
- (weitere analog bei Bedarf)

## Abarbeitung (pro Iteration)

- **Genau ein Topic pro Iteration.** Mehrere offene Issues mit demselben `topic:` werden in einer Iteration / einem PR gemeinsam erledigt, wenn sie kohärent sind.
- Reihenfolge: User-Priorität (Chat) > kritischste Bugs > Topic-Volumen. Nicht nach Erstelldatum.
- Branch-Name `claude/nutritrack-fix-<topic>` oder `claude/nutritrack-vX.XXX`.
- PR-Body: `Closes #N` für jedes erledigte Issue. Versionierung laut `CLAUDE.md`.

## Verboten

Issue-Listen, -Kopien oder -Backlogs in dieser Datei. Quelle ist ausschließlich GitHub.
