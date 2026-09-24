# Job Tracker

A tiny, local-first PWA for capturing job posting links and tracking which ones you've applied to.

Capture → **To apply** → **Applied** (or Skipped / Closed).

## Run

No build step. Serve the folder over HTTP(S):

```sh
npm start        # serves on http://localhost:5173
npm test         # URL normalization + status rule tests
```

Production: GitHub Pages from `main`, folder `/ (root)`, served at https://mcroney531-ctrl.github.io/track-applications/. Every path (assets, manifest, service worker, share target) is relative, so the app works under that sub-path with no config.

## Structure

| File | Role |
| --- | --- |
| `index.html`, `styles.css` | Single screen: capture bar, filters, search, list, settings sheet |
| `src/app.js` | UI, capture, share-target handling, export/import |
| `src/jobs.js` | Job model and status rules (no DOM, no storage) |
| `src/url.js` | URL extraction + normalization for duplicate checks |
| `src/db.js` | IndexedDB persistence. The only storage-aware module; swap it to migrate to a real DB |
| `sw.js` | Offline app-shell cache |
| `manifest.webmanifest` | Install metadata + Web Share Target |

## Sharing into the app

- **Android (Chrome/Edge):** install the app, then Share → Jobs. The manifest uses a GET share target, so a share opens `./?url=…&text=…&title=…` (in production, `/track-applications/?url=…`). The app extracts the link, saves it, and opens the inline editor.
- **Desktop:** paste. Multiple links (one per line) work.

## Data

Stored in IndexedDB in this browser only. The app requests persistent storage on first save. Export JSON from the ⋯ menu to back up. Import merges by id and skips links already saved under a different record.

`source` and `externalId` exist on every record as extension points for a future automated intake; nothing uses them yet except `source: "share"`.
