# NutriTrack Agent Guide

These rules apply to Claude Code, Codex, and human contributors working in this repository.

## Product Rules

NutriTrack is a static mobile-first PWA for nutrition tracking. Extend existing flows instead of adding parallel buttons, duplicate modals, or separate workflows.

Most app logic currently lives in `index.html`. Before changing behavior, search the existing sections and update the existing flow in place. Keep shared logic centralized for storage, import/export, OneDrive sync, food lookup, barcode scanning, AI parsing, recipe handling, and meal editing.

Do not add special-case UI for one food, diet, meal, or import source if the existing picker, recipe, settings, or meal-entry flow can support it.

Protect user data. Nutrition logs, photos, API keys, OneDrive tokens, backups, and personal body/health data are private. Do not log raw backups, meal photos, API keys, OAuth tokens, or extracted personal data.

## Architecture Notes

This repository is a static GitHub Pages app, not a bundled npm/React project.

- `index.html` contains HTML, CSS, app state, rendering, event handlers, storage, AI calls, OpenFoodFacts calls, OneDrive sync, backup/import/export, and most UI flows.
- `sw.js` is the PWA service worker and cache updater.
- `manifest.json` defines PWA install metadata.
- `icon.svg` is the app icon.
- `nutritrack_anleitung.pdf` is the user guide.

Runtime integrations currently include:

- Browser `localStorage` keys including `nt_v6`, `nt_x`, `nt_bc`, `nt_od`, `nt_offline_queue`, version/reminder/install keys.
- Anthropic Messages API called directly from the browser.
- OpenFoodFacts API for search/barcode/product lookup.
- Microsoft OneDrive OAuth PKCE and Graph API backup sync.
- ZXing loaded from `https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js`.
- Google Fonts.

## Versioning

At the start of every work session, read the current version in both places:

- `index.html`: `APP_VERSION`
- `sw.js`: `VERSION`

For deployable functional changes:

- Increment the beta version by `0.001`.
- Update `APP_VERSION` in `index.html`.
- Update visible version text in `index.html` if present.
- Add a user-readable `CHANGELOG` entry in `index.html`.
- Update `VERSION` in `sw.js` to the same version so the service worker refreshes caches.

Documentation-only changes may skip app versioning unless they affect setup, deployment, user-visible help, or agent workflow.

## Editing Rules

Keep edits tightly scoped. Because `index.html` is large, search first and change the smallest relevant section.

Prefer existing helper functions and state shape over introducing duplicate state. Preserve backward compatibility for existing localStorage data and backups.

When adding or changing persisted fields, make imports, exports, OneDrive sync, and old saved data behave safely. Avoid destructive migrations unless explicitly requested.

Do not commit real secrets, API keys, OAuth tokens, `.env` files, exported backups, personal nutrition data, or test files containing private data.

Avoid adding new external CDNs or APIs unless necessary. If adding one, document why and ensure the service worker skip/cache behavior is correct.

## Checks Before PR

There is currently no npm build or automated test suite. Before opening or merging a PR, perform focused manual/static checks:

- Open `index.html` through a local server, not by double-clicking the file.
- Verify the changed flow on a mobile-width viewport.
- Check browser console for errors.
- Test install/update behavior when `sw.js` changed.
- Test backup export/import if persisted data shape changed.
- Test OneDrive sync only with non-private test data if sync code changed.
- Test offline/online behavior if fetch, cache, or service-worker logic changed.

Recommended local serving pattern from the parent directory of the repo:

```sh
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/nutritrack/
```

## GitHub Workflow

Prefer PRs over direct pushes to `main`.

Keep PRs focused and describe:

- which existing flow was extended,
- which version/changelog entries were updated,
- which manual checks were performed,
- whether storage, backup, OneDrive, service worker, or API behavior changed.

Recommended branch protection for `main`:

- require pull request before merging,
- optionally block direct pushes,
- add CI once lightweight HTML/static checks exist.
