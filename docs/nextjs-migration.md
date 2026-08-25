# Next.js migration

**Done. There are no HTML files left — every page is a Next route.**

```
npm run dev      # Next dev, port 3210
npm run build    # production build
npm start        # production server, port 3210
```

`--webpack` is pinned. Turbopack externalizes `pg` through a symlink under
`.next/node_modules`, which needs Windows Developer Mode; without it the build
fails with `EPERM` / `Cannot find module 'pg-<hash>'`. Drop the flag once
Developer Mode is on.

`npm run express:api` still starts `server.js`, which now serves **only the
API** — its page routes are gone with the files they sent. Next serves both.

## Where everything went

| Was | Is |
|---|---|
| `public/*.html` (8 files) | `app/**/page.js` + `client.js` (10 routes incl. `/dial`, `/signin`) |
| each page's inline `<style>` | `public/css/pages/<name>.css` — 5,896 lines, verbatim |
| each page's inline `<script>` | `public/js/pages/<name>.js` — 7,907 lines, verbatim |
| page markup | JSX in `app/**/client.js` — 1,018 lines |
| `public/js/kj-nav.js` | `app/_chrome.js` + `lib/use-page-script.js` + Next's router |
| 21 Express API routes | `app/api/**/route.js` (stage 1) |
| `express.static('/cdn')` | `app/cdn/[...path]/route.js`, hand-written byte ranges |
| helmet / cors / rate-limit | `next.config.js` headers + `middleware.js` |
| production secret guard | `instrumentation.js` |

Originals are in `legacy/html/` and `legacy/kj-nav.js` — **moved, not deleted**,
because six of them had uncommitted edits at migration time. Delete them once
you have exercised the site in a browser.

## The part that needed real thought: kj-nav.js

`kj-nav.js` was a hand-built same-document router whose whole purpose was
`streaming-services.md §9.8` — *"Audio must continue playing while the listener
navigates the site… A single stray anchor tag causing a full document load kills
audio."* It could not survive alongside Next's router (both intercept every
link, and it replaced `document.head`/`document.body` wholesale, which would
destroy React's tree). It was replaced in three pieces:

1. **The document never reloads** — Next's router does this, and `SiteChrome`
   (with the footer player and its `<audio>`) is mounted in `app/layout.js`, so
   it is never unmounted as pages change beneath it.

2. **Plain `<a>` still has to be intercepted** (`app/_chrome.js`). Next only
   intercepts `<Link>`, and every anchor here is a plain `<a href>` — including
   the ones page scripts build with `innerHTML`, which no JSX conversion could
   reach. The original click rule is kept verbatim, including its two
   exemptions: `/radio` (runs its own full player, so a document load there is
   correct) and same-page hash links.

3. **Page scripts still have to be unwound** (`lib/use-page-script.js`). This is
   the part Next does *not* give you. From kj-nav.js's own comments: *"Re-running
   index.html's script after a round trip would leave TWO copies of its click
   handler bound, and a click on a card's play badge would toggle the station
   twice — play, then pause."* So `addEventListener`, `setInterval`,
   `setTimeout` and `ResizeObserver` are wrapped while a page's scripts load and
   everything they registered is released on unmount. The boundary that used to
   be a `<script>KJNav.pageDone()</script>` tag is the effect's lifetime now.

`kj-footer-player.js:58` reads `window.KJ_STATIONS` at load time, and React runs
child effects *before* parent effects — so a layout cannot simply load the
catalogue first. `lib/session-scripts.js` makes it a cached promise every caller
awaits, so it is fetched once per visit rather than once per page.

## How the port was verified

Conversion was scripted, not hand-typed, and checked against the originals:

- **Element IDs: 0 missing** across all 8 pages (90 on `/radio` alone). The page
  scripts find their elements by id, so this is the check that matters.
- **CSS classes: 0 missing** — 116/116 on radio, 64/64 on music, and so on.
- **58 inline handlers** in static markup converted to React props, with `this`
  → `event.currentTarget`. The remaining ~49 live inside JS template strings and
  are written via `innerHTML`, so they were correctly left alone.
- **Both catalogue tools regenerate byte-identical output** after being
  repointed at `public/js/pages/radio.js` (`build-home-data.js`,
  `build-broadcast-bases.js`) — the station list is the site's source of truth.
- **All 4 test scripts still pass.**
- API and CDN parity from stage 1 still holds (206 byte-ranges, 401/400 guards).

Two extractor bugs were caught and fixed by these checks rather than shipped:
`index.html` contains the literal text `<body>` inside a CSS comment, which made
a naive body match start 371 lines early; and script order had to be preserved
because `music.html` loads `site-translate.js` and `stations-data.js` *after* its
own inline block.

## Not verified, and worth doing before you ship

- **No browser was available in this environment**, so nothing here proves a
  click works at runtime. The build compiles, the DOM matches, and the global
  function references survive bundling (`setSidebarTab("all")` is intact in the
  built chunk) — but exercise the player, the modals and the sidebar tabs
  yourself.
- **Style bleed between routes is untested.** Page CSS is loaded via
  `<link rel="stylesheet" precedence="kj-page">`, which React 19 hoists and
  dedupes; whether it *unloads* on navigation was not confirmed. These files
  define conflicting rules for the same class names (`.topbar`, `.logo`), so if
  a page looks wrong after navigating to it — but right on a hard refresh —
  that is the cause, and the fix is to scope each file under a route class.
- `tools/apply-scrollbars.js` still targets `public/*.html` and is now stale.
- `middleware.js` rate-limit state is per-process, as `express-rate-limit`'s
  MemoryStore was. A multi-instance deploy needs a shared store — already true
  before this migration.
- The 4 suites in `tests/` are standalone node scripts, not jest suites (no
  `test()` blocks, and they call `process.exit`), so `npx jest` reports "failed
  to run" while `node tests/x.test.js` exits 0. That predates this work.
