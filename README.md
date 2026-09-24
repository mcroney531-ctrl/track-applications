# Job Tracker

A tiny, local-first PWA for capturing job posting links and tracking which ones you've applied to.

Capture → **To apply** → **Applied** (or Skipped / Closed).

## Run

No build step. Serve the folder over HTTP(S):

```sh
npm start        # serves on http://localhost:5173
npm test         # URL normalization + status rule tests
```

Deploy by uploading the folder to any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages). All paths are relative, so a sub-path works.

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

- **Android (Chrome/Edge):** install the app, then Share → Jobs. The manifest uses a GET share target, so a share opens `./?url=…&text=…&title=…`. The app extracts the link, saves it, and opens the inline editor.
- **iOS:** Safari does not support Web Share Target. Workaround: create a Shortcut that accepts URLs from the Share Sheet and runs **Open URL** with `https://<your-host>/?url=[Shortcut Input]`. It uses the same code path.
- **Desktop:** paste. Multiple links (one per line) work.

## Data

Stored in IndexedDB in this browser only. The app requests persistent storage on first save. Export JSON from the ⋯ menu to back up. Import merges by id and skips links already saved under a different record.

`source` and `externalId` exist on every record as extension points for a future automated intake; nothing uses them yet except `source: "share"`.
