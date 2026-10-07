# Ping — Table Tennis Tournament Planner

**Live app:** <https://rgrund-inform.github.io/ping/>

A small offline-first PWA for organizing table-tennis tournaments. Round-robin and single-elimination knockout, fast tap-the-loser score entry, mid-tournament roster edits (round-robin), persistent local history, suggested players from previous runs, and a "random facts" engine that mines your match history.

By default all data lives in `localStorage` on the device — no account, no server. An optional self-hostable **sync backend** (see [Sync](#sync-optional)) can back the data up and share it across devices through a group code.

## Stack

- Vue 3.5 + TypeScript, Vite 6
- PrimeVue 4 (Aura, custom Inform-teal preset) + Tailwind 4
- Pinia (`pinia-plugin-persistedstate` → `localStorage` key `ping.v1`)
- Vue Router (hash mode)
- `vite-plugin-pwa` (Workbox precache, auto-update)
- Bun for install / scripts / tests

## Develop

```bash
bun install
bun run dev          # http://localhost:5173
bun test             # logic-module unit tests
bun run build        # production bundle in ./dist
bun run preview      # serve the production build
```

## Sync backend (optional)

The sync service is plain Node 24 (`node:http` + `node:sqlite`), with no npm
dependencies:

```bash
bun run test:server    # backend unit tests (node --test)
bun run start:server   # serves ./dist plus the API on http://localhost:8080
```

Configuration (environment variables):

| Variable     | Default            | Purpose                                  |
| ------------ | ------------------ | ---------------------------------------- |
| `PORT`       | `8080`             | Listen port                              |
| `HOST`       | `0.0.0.0`          | Listen address                           |
| `PING_DB`    | `./data/ping.sqlite` | SQLite database file (created if absent) |
| `STATIC_DIR` | `./dist`           | Built PWA to serve                       |

A container image that runs just the sync API is in `Dockerfile`:

```bash
docker build -t ping .
docker run -p 8080:8080 -v ping-data:/data ping
```

The PWA is deployed separately (for example to GitHub Pages) and points at this
backend through its `SYNC_URL` build variable. Serving the built `dist/` from the
same process is still supported via `STATIC_DIR` (as `bun run start:server` does).

`.github/workflows/container.yml` publishes the image to GHCR whenever
semantic-release cuts a version, tagged with that version and `latest` (both
derived from the repository, e.g. `ghcr.io/<owner>/<repo>:1.14.1`).

Build-time configuration (inlined into the PWA bundle):

| Variable   | Default   | Purpose                                                                                                                                        |
| ---------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `SYNC_URL` | *(empty)* | Default sync server URL. Empty means "use the app's own origin" (correct when the sync backend serves the app). Set it when the app is hosted elsewhere, e.g. a GitHub Pages build pointing at a separate sync server. It only prefills the field; users can still change the URL in **Sync** settings. |

## Enabling sync in the app

Open **Sync** in the app, turn it on, keep the server URL (prefilled with the
app's own address, or with `SYNC_URL` when the build sets it) and choose a
**group code** — any shared secret. Every device
that uses the same code shares the same players, tournaments and match history.
The app stays offline-first: changes are queued locally and pushed when the
server is reachable, and merging is per-entity last-write-wins.

## Deploy (GitHub Pages)

The included workflow at `.github/workflows/deploy.yml` builds the PWA and deploys it to GitHub Pages on every push to `main`. Run the sync backend as the container above and set the `SYNC_URL` variable (step 4) so the deployed app prefills the backend's address.

One-time repo setup:

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.
3. Push to `main`; the action publishes to `https://<user>.github.io/<repo>/`.
4. Optional: add a repository variable `SYNC_URL` (**Settings → Secrets and variables → Actions → Variables**) pointing at a separate sync server, so a Pages-hosted build prefills it — e.g. `https://ping.whatyougoby.com`.

The Vite `base` is set from the `GITHUB_PAGES_BASE` env var that the workflow injects, so the same build runs locally at `/` and on Pages at `/<repo>/`. Hash routing is used to avoid the SPA-fallback dance.

## Data

Everything lives in one localStorage key: `ping.v1` (schema v2, migrated from v1 on load). Clearing site data resets the app. The JSON shape is defined in `src/types.ts`; **Export** and **Import** in the header move the whole store to a file.

When sync is enabled the server keeps the same entities plus a normalised
`matches` table, exposed read-only at `GET /matches` (see [Sync](#sync-optional)).
