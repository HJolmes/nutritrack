# NutriTrack — Wunsch-Workflow

Feature-Wünsche und Verbesserungsvorschläge werden ausschließlich als GitHub-Issues mit `label:enhancement` geführt — der Feedback-FAB in der App legt sie automatisch an (`enhancement` + `from-app`). Diese Datei beschreibt nur den Triage- und Abarbeitungs-Workflow, **keine Wunschliste** (die lebt in GitHub).

## Triage

Jeder Wunsch bekommt zusätzlich zum `enhancement`-Label genau ein **Themen-Label** `topic:<kebab-case>`. Vorgehen und Themen-Beispiele identisch zu `issues.md` — Bugs und Wünsche teilen denselben Topic-Namensraum.

## Abarbeitung (pro Iteration)

- **Genau ein Topic pro Iteration.** Wünsche desselben Topics werden zusammen umgesetzt, soweit sie kohärent sind.
- Reihenfolge: User-Priorität (Chat) > Topic-Volumen. Nicht nach Erstelldatum.
- Wünsche sind ein **Backlog, keine Zusagen** — was nicht passt, bleibt offen.
- Bug + Wunsch desselben Topics dürfen in einer Iteration kombiniert werden, wenn sie kohärent sind.
- Branch-Name `claude/nutritrack-vX.XXX` (ggf. mit Topic-Suffix). Versionierung laut `CLAUDE.md`.

## Verboten

Wunschlisten, -Kopien oder -Backlogs in dieser Datei. Quelle ist ausschließlich GitHub.
