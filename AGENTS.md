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
| Which songs a frequency plays right now, and their A/B/C rating | `/analytics/start.html` — the operator's console |
| Whether every station is actually playable right now | `tools/check-station-health.js` (drilled by `tools/drill-station-health.js`) |
| Whether the dial can still be spun (mouse and touch) | `tools/drill-dial-spin.js` — needs the page served somewhere |
| Which written songs still need an `.mp3`, per station | `/analytics/todo.html` — the recording queue |
| Correcting a lyric after it is written | `/todo/<project>.html`, Edit — admins only; `tools/apply-lyric-edits.js` carries it back to J: |
| Where a station broadcasts from (anchor + relays) | [`data/broadcast-bases.json`](data/broadcast-bases.json) — `tools/build-broadcast-bases.js` seeds any station that lacks one |

## "import refresh"

When the operator types **`import refresh`**, run
[`setup/import-refresh.md`](setup/import-refresh.md) end to end: Phases 0 through 7,
in order, honouring every gate. `import refresh <TENANT-ID>` scopes the ingest to one
station; the CDN, schedule, site and deploy phases still run.

Every run **starts** with `node tools/import-report.js --snapshot` and **ends** with
`node tools/import-report.js` — the grid naming which stations changed and which
stations each new song reached. A run with no grid is not finished.

## Facts that are easy to get wrong

- **The ledger only knows songs that have audio.** Every index in this repo is
  built on `songid-registry.tsv`, so ~7,100 written-but-unrecorded tracks are
  invisible to all of them. `tools/build-todo-index.js` is the one tool that
  walks the nine authoring trees instead, and `/analytics/todo.html` is where
  that backlog is readable.
- **Every station shows a language code, and every station has a home.** The
  dial prints a two-letter code to the right of each frequency (`EN`, `JA`,
  `EN-ES` for a station that mixes) — derived from the tenant id suffix, or set
  explicitly as `langCode` in `public/js/pages/radio.js` where a station airs
  more than one language. And every station carries broadcast bases: an anchor
  plus relays in `data/broadcast-bases.json`, seeded from its `hostCity` if
  nobody wrote one. Both are requirements of a new frequency, not options —
  `setup/import-refresh.md` § "Adding a station to the pipeline".
- **Generated files.** `public/js/stations-data.js` is written by
  `tools/build-home-data.js`; never hand-edit it. Its source is the `stations` array
  in `public/js/pages/radio.js`. `public/data/analytics-stations.json` is written by
  `tools/build-analytics-index.js`, which reads that output — so it runs *after*
  `build-home-data.js`, never before.
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
- **ON AIR does not mean audible.** ON AIR is derived from having a manifest,
  and nothing more. Four things must be true before a listener hears anything,
  and each fails independently and silently: the station has a manifest, a day
  file is published, that day file *covers the whole day*, and the audio it
  names *serves*. A schedule with 551 entries proves only the second — it can be
  valid, fully playable, and stop at lunchtime. `node tools/check-schedules.js 7`
  still covers the second alone; `node tools/check-station-health.js` covers all
  four, and a cron runs it every 15 minutes and republishes what it can fix.
- **Never trust an alarm you have not seen fire.** `tools/drill-station-health.js`
  breaks a station three ways behind a local proxy and asserts the watch catches
  each. Its control run matters as much as its drills: without one, a "FAIL"
  might only mean the harness is broken. Re-run it after any change to the
  checker.
- **A phone is not a small desktop.** iOS suspends a backgrounded page's
  timers, so every recovery mechanism in `kj-footer-player.js` — the 15s
  re-derive, the 2s stall watchdog — stops with it, and whatever breaks while
  the listener is in another app goes unnoticed until they return. The return
  itself is therefore the trigger: `visibilitychange`, `pageshow` and a
  wall-clock heartbeat each force one re-derive from the clock. Never make
  recovery depend on a timer alone.
- **A buffered `<audio>` must be released, not dropped.** On iOS an element that
  has loaded a track holds a decoder, and dropping the last reference does not
  free it. `warm()` builds one per track; without an explicit
  `src=''` + `load()` that is 17 abandoned decoders an hour, measured — which is
  a phone that plays fine all evening and then goes quiet. Guarded by
  "a long session does not hoard audio elements" in
  `tests/footer-player-playback.test.js`.
- **Crossing the dial must not load the band.** The scale is dragged and
  thrown, and passing a frequency shows it without fetching anything —
  `preview()` in `public/js/pages/player.js` updates the readout, and only
  `settle()` ever calls `play()`. Stepping with Next used to tune every
  frequency it crossed, which is why the band was slow to cross. If you touch
  the gesture, re-run `node tools/drill-dial-spin.js`: it counts day-file and
  `.mp3` requests during the drag and fails if any happen.
- **THE DIAL'S STATION BLOCK IS THREE LINES. Do not add a fourth.** Under the
  frequency there is the station name, then `format · host (circulation)`, then
  the broadcast cities — and that is the whole of it. No album links, no
  badges, no promos, no "new" flags. The block is sized and spaced for three
  lines and a fourth pushes the dial down and unbalances the page.

  This is a standing instruction from the owner (2026-09-01), given after a
  link to `/prayers/upper-room.html` was added there unasked. Other pages may
  link wherever they like; this block is closed. If something genuinely has to
  reach the dial, ask first — do not add it and see.
- **A CORRECTED LYRIC IS NOT IN THE SHEET UNTIL A TOOL PUTS IT THERE.** An
  admin editing a lyric on `/todo` writes a row in `kj_lyric_edits`, and
  `public/js/pages/todo.js` lays it over the album bundle as it renders — so
  the console is right immediately and the sheet on the J: share still says
  what it always said. That split is deliberate: the bundles under
  `<CDN_LOCAL_ROOT>/lyrics/` are DERIVED, rewritten by `build-todo-index.js`
  from the authoring trees, so an edit written into one would vanish at the
  next index build with nothing reporting it. `node tools/apply-lyric-edits.js`
  is the other half — run it where J: is visible, then rebuild the index and
  deploy the lyrics tree. Until it runs, a render made from the sheet is made
  from the uncorrected words. The console says which revisions are still
  waiting; `--apply` writes, and it refuses any block the sheet has changed
  underneath rather than overwriting somebody's work.
- **A static page under `public/` gets the site's header, not the site's
  behaviour.** `tools/build-todo-pages.js` lifts the bar's markup out of the
  prerendered home page, which is what React emits on the SERVER — where
  localStorage does not exist and nobody is ever signed in. So it ships a
  hardcoded "Sign In" and no Admin pill however signed-in the reader is.
  `/js/kj-static-header.js` is the runtime half: it reads the same session in
  the same two keys, swaps in the account control, asks `/api/auth/me` for the
  role and paints the pill. Any static page carrying `.topbar` must load it
  along with `site-header.css` and `account.css`, or it lies about who is
  there. Drilled by `tools/drill-todo-console.js`.
- **Node tests do not cover the browser.** CORS and autoplay are enforced only in a
  real browser; press play before calling audio work done. `/todo`'s sign-in,
  Admin pill and lyric editor are all runtime-only for the same reason —
  `node tools/drill-todo-console.js https://kjubilee.com` drives them in a real
  Chrome, and its own first version passed locally and failed over the network
  because it waited on a control the un-hydrated page already had.

