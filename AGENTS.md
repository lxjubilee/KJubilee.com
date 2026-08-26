<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# kJubilee — source of truth

These files are authoritative for this workspace. When a question is covered by one
of them, it answers it; code comments and this file do not override them.

| Subject | Authority |
| --- | --- |
| Getting new `.mp3` files on the air, end to end | [`setup/import-refresh.md`](setup/import-refresh.md) |
| The five-fold band structure, frequency blocks, block colours | [`setup/hm-bands.md`](setup/hm-bands.md) |
| Programming, rotation, day files, the delivery contract | [`docs/setup/station-guidelines.md`](docs/setup/station-guidelines.md) |
| The music repository, SongIDs, filename format | [`docs/MUSIC-REPOSITORY-SPEC.md`](docs/MUSIC-REPOSITORY-SPEC.md) |
| Per-station selection rules (which tracks a frequency plays) | `tools/build-station-manifest.js` — the `STATIONS` table |
| What exists on the dial | `public/js/pages/radio.js` — the `stations` array |

## "import refresh"

When the operator types **`import refresh`**, run
[`setup/import-refresh.md`](setup/import-refresh.md) end to end: Phases 0 through 7,
in order, honouring every gate. `import refresh <TENANT-ID>` scopes the ingest to one
station; the CDN, schedule, site and deploy phases still run.

Every run **starts** with `node tools/import-report.js --snapshot` and **ends** with
`node tools/import-report.js` — the grid naming which stations changed and which
stations each new song reached. A run with no grid is not finished.

## Facts that are easy to get wrong

- **Generated files.** `public/js/stations-data.js` is written by
  `tools/build-home-data.js`; never hand-edit it. Its source is the `stations` array
  in `public/js/pages/radio.js`.
- **The SongID is a permanent primary key.** Never rename a track to fix a problem;
  fix `catalog-config.json` and re-run the ingest.
- **Ingest one artist at a time.** Concurrent runs can issue duplicate SongIDs.
- **`--rebuild-pools` after every ingest**, or the schedule is built from the cached
  pre-ingest pool and the new music silently never airs.
- **One song on several stations is intended.** Selections overlap by design; the
  import report's fan-out column exists to show it, not to flag it.
- **Deploy target is `/var/www/kjubilee.com-next`**, not `/var/www/kjubilee.com`.
  Production runs Express (`server.js`) serving static `public/` — there is no Next
  build step on the server.
- **Publish before retiring.** New CDN addresses must be live *and the site
  deployed* before old addresses are removed.
- **Node tests do not cover the browser.** CORS and autoplay are enforced only in a
  real browser; press play before calling audio work done.

