# Import & Refresh

The standard process for getting new `.mp3` files onto the air.

New audio arrives on the J: drive continuously — daily, weekly, in bursts after a
recording session. This document is the one procedure that takes it from a file
sitting in a source folder to a track playing on a frequency, with the website,
the schedules and the catalogue all agreeing about it.

**It must be done the same way every time.** Every phase below feeds the next, and
skipping one leaves a state that looks finished and is not: audio on the CDN that
no manifest names, a manifest no schedule reads, a schedule the website has never
heard of. The failure is always silent.

---

## The one command

> **"import refresh"**

Typing that in this workspace means: run this document, end to end, for every
station. Phases 0 through 7, in order, with the verification gates honoured.

`import refresh <station-id>` limits it to one station — e.g.
`import refresh HM308.70-EN`. Phase 0 and Phases 3–7 still run, because a single
station's new audio still has to reach the CDN and the site.

**Every run ends with the import report** — the grid naming exactly which stations
changed and which stations each new song reached. See
[The import report](#the-import-report) below. A run that cannot produce that grid
is a run that did not take a snapshot first, and it is not finished.

---

## The pipeline at a glance

```
  J:\jubilujah.com\music\inspire  ─┐
  J:\jubilujah.com\music\children ─┤
  J:\torahsings.com               ─┤
  J:\gospelbymusic.com\music      ─┼─► [1] INGEST ──► J:\kjubilee.com\music
  J:\singitdone.com\music         ─┘                  + songid-registry.tsv
                                     ▲                       │
                          [0] SNAPSHOT                       ▼
                          (before ingest)     [2] MANIFESTS  (per-station rules)
                                     │          J:\kjubilee.com\radio\<TENANT>\
                                     │                  delivery\music.json
                                     └──────────► [2b] IMPORT REPORT ◄── the grid
                                                             │
                                     ┌───────────────────────┴───────────┐
                                     ▼                                   ▼
                        [3] AUDIO → R2                        [4] SCHEDULES → R2
                        music/**                              radio/<TENANT>/delivery/
                                     └───────────────────────┬───────────┘
                                                             ▼
                                                    [5] SITE DATA
                                                 public/js/stations-data.js
                                                             │
                                                             ▼
                                                     [6] DEPLOY
                                                             │
                                                             ▼
                                                     [7] VERIFY
```

**The ledger is the authority.** `J:\kjubilee.com\music\songid-registry.tsv` decides
what exists. Nothing reaches a manifest under a SongID the ledger does not already
know, and nothing plays that is not in a manifest. If a track is missing at the end
of this process, trace it backwards from the ledger — not forwards from the file.

---

## Phase 0 — Find what is new

Before anything is copied, establish what changed. The ingest tools are idempotent,
so a full run is safe, but knowing the delta tells you whether Phase 4's
`--rebuild-pools` is going to take minutes or an hour.

```bash
# How many tracks the ledger currently knows
wc -l < "J:/kjubilee.com/music/songid-registry.tsv"

# Source .mp3 counts, per tree
for d in "J:/jubilujah.com/music/inspire" "J:/jubilujah.com/music/children" \
         "J:/torahsings.com" "J:/singitdone.com/music" \
         "J:/cornercipher.com/music" "J:/backrowfaith.com/music" \
         "J:/gospelbymusic.com/music"; do
  printf "%-38s %s\n" "$d" "$(find "$d" -name '*.mp3' 2>/dev/null | wc -l)"
done
```

Record the ledger line count. Phase 1 should raise it by exactly the number of
genuinely new tracks; if it rises by more, an album has been double-ingested under
a second slug, and that is a problem to solve before continuing.

### Take the snapshot — this is not optional

```bash
node tools/import-report.js --snapshot --label "before <what you are ingesting>"
```

This records every station's current track list. **Without it there is no report at
the end**, because "what changed" is only answerable against a before. The snapshot
lives at `tmp/import-snapshot.json` (gitignored) and taking a new one replaces the
last, so the report always means "since the last snapshot".

---

## Phase 1 — Ingest (source trees → music repository)

Copies audio into the canonical repository, renames each file to the Radio Song ID
format, assigns a verified-unique 12-character SongID, and appends to the ledger.

**Canonical filename:**

```
HMX2026EN01-7XJ29ZW8X70P-JUBI-CCJP_sky-splits-open_sky-splits-open.mp3
└─ batch ─┘ └─ SongID ─┘ └art┘ └gen┘ └─ album ──┘ └─ song slug ──┘
```

### The seven source trees

| Source | Tool | Contents |
|---|---|---|
| `J:\jubilujah.com\music\inspire` | `ingest_music.py` | The twelve Inspire Family personas |
| `J:\jubilujah.com\music\children` | `ingest_music.py` | Party Giggles, Tiny Tiggles |
| `J:\torahsings.com` | `ingest_torahsings.py` | Torah Sings — organised by book of the Bible, not by album, which is why it has its own ingester |
| `J:\singitdone.com\music` | `ingest_music.py --src-root` | The 2001–2003 declaration series, one folder per persona |
| `J:\cornercipher.com\music` | `ingest_music.py` | Marcus Reed / Corner Cipher |
| `J:\gospelbymusic.com\music` | `ingest_music.py` | Gospel By Music — the Gospel of Matthew, chapter by chapter. Filed by book of the Bible like Torah Sings, but it needs no ingester of its own: see `ARTIST_TREES` below |
| `J:\jubileeprayers.com\cantillation` | `ingest_music.py` | Jubilee Prayers — sung Scripture prayers, filed under the seven petitions of the Model Prayer. Same shape as Gospel By Music and registered the same way, in `ARTIST_TREES` at `depth: 2` |

`singitdone` is the one tree that still needs `--src-root`, because its twelve
folders are the SAME personas whose default root is `inspire`, and an artist can
only have one registered root. Everything else resolves on its own:

- **`ARTIST_ROOTS`** in `ingest_music.py` maps an artist to its tree, so Corner
  Cipher and the children’s catalogues need no flag.
- **`ARTIST_TREES`** is for a tree that is not `<root>/<artist>/<album>` at
  all. Gospel By Music has no artist tier — twelve personas perform it — and a
  book-of-the-Bible tier instead, so the entry names the album folder outright
  and says how many levels down the albums sit. Torah Sings has the same shape
  and answered it with a second ingester; that was right for Torah Sings, which
  ships a manifest richer than any tree walk, and would have been a copy of
  `ingest_music.py` here.
- **`ARTIST_LANG`** does the same for a language the folder names do not carry.
  Tiny Tiggles’ folders are `TTX301-penguino-s-palooza`, with no language code, so
  without it every one of its thirty-one albums is skipped — and skipped SILENTLY,
  reporting "Albums with audio: 0" and exiting successfully.

Register a new property in both, once, rather than remembering a flag forever.

Destination is always `J:\kjubilee.com\music`, laid out one folder per artist slug.

### Running it

```bash
cd tools/music-ingest

# ONE ARTIST AT A TIME, SEQUENTIALLY. Never in parallel.
python ingest_music.py --artist jubilee-inspire --dry-run   # preview, copies nothing
python ingest_music.py --artist jubilee-inspire             # commit
python build_album_json.py --artist jubilee-inspire         # refresh sidecars

# Torah Sings has its own tool and its own source root
python ingest_torahsings.py --dry-run
python ingest_torahsings.py
```

> **Sequential is not a style preference.** Each run reads the registry the previous
> run wrote. Two concurrent runs can hand out the same SongID, and a duplicate
> SongID corrupts the one identifier the rotation and the play logs both key on.

**Resolve every `WARN` line before committing.** A warning means the tool could not
derive a clean song slug. Fix it in `catalog-config.json` under `song_slug_overrides`
— never by renaming the source file, and never by hand-renaming the destination.
The SongID is a permanent primary key.

**Genre and artist codes live in `catalog-config.json`, not in the scripts.** A new
persona needs its 4-char code in `artist_codes` and its lane in `artist_genres`.

### Gate

```bash
wc -l < "J:/kjubilee.com/music/songid-registry.tsv"    # up by the expected amount?
```

Every track must carry a genre; the ledger currently has **zero** unclassified rows
across 32 genre codes, and it should stay that way. An unclassified track cannot be
selected by any format station.

---

## Phase 2 — Manifests (ledger → per-station catalogues)

Builds each station's playable catalogue from the ledger, applying that station's
own selection rules.

```bash
node tools/build-station-manifest.js --station HM308.70-EN --dry-run
node tools/build-station-manifest.js --all
```

Output: `J:\kjubilee.com\radio\<TENANT-ID>\delivery\music.json`
(root overridable with `CDN_LOCAL_ROOT`).

**This is where every station's business rules live** — see the reference table
below. Selection is declarative: a station names a pool, a language and a filter,
and every ledger row matching all three is included. A new ingest joins on the next
build with no edit here, which is the entire point.

### Two rules that hold for every station

1. **One language per frequency.** A listener who hears a Romanian track land in
   the middle of an English set leaves. Other-language tracks are not lost — they
   belong on that language's own frequency.
2. **Pool before filter.** `inspire-family` is the twelve personas. `catalogues` is
   the separate brands — Torah Sings, Party Giggles, Tiny Tiggles. A station that
   selects "the Inspire Family" must not quietly absorb 338 kids' party tracks.

### Gate — run the report

```bash
node tools/import-report.js
```

**A station whose count dropped is a station to investigate before publishing** — a
selection rule that no longer matches is far more likely than tracks having
genuinely disappeared. The report marks those with `** -n **`.

**A new song that reached zero stations is the other thing to chase.** It means no
selection rule matched it: wrong language tag, an artist not on any roster, or a
genre lane that no format station claims. The file is fine; the rule is the problem.

---

## Phase 3 — Audio to the CDN

Pushes the audio itself to the R2 bucket `kjubilee-music` under `music/`, which is
what `cdn.kjubilee.com` serves.

```bash
node scripts/r2-sync-music.js            # diff only — the default, and safe
node scripts/r2-sync-music.js --apply    # upload missing/changed
node scripts/r2-sync-music.js --apply --concurrency=8
```

Incremental: only missing or changed files move. Review the diff before `--apply`.

> **Audio goes up before schedules.** A day file that names a track the CDN does not
> yet hold is a station that plays silence at that slot.

---

## Phase 4 — Schedules (the day files)

Builds each station's dated broadcast schedule and publishes it to
`radio/<TENANT>/delivery/<TENANT-flat>-<YYYYMMDD>.json`.

```bash
node scripts/r2-publish-schedules.js                              # dry run (default)
node scripts/r2-publish-schedules.js --apply --rebuild-pools
node scripts/r2-publish-schedules.js --apply --days 3
node scripts/r2-publish-schedules.js --apply --station HM308.70-EN
```

> ### `--rebuild-pools` after **every** ingest. This is the step most often missed.
>
> Building a pool reads the frame headers of every track in a station's selection —
> thousands of files off a network share — so pools are cached under `tmp/pools/`
> and reused between runs. Without `--rebuild-pools`, the schedule is built from
> the pool as it was *before* the ingest and **the new tracks simply do not appear**.
> Everything succeeds. Nothing is wrong in any log. The new music is just not on
> the air.

### Tomorrow's schedule

The generator runs days ahead. The default run publishes today and tomorrow: today's
with `max-age=300` because it may still be revised, tomorrow's with `max-age=3600`.
**New audio ingested today reaches listeners on tomorrow's schedule** — today's is
already in browsers' caches and mid-broadcast.

To put new music on the air sooner, republish today explicitly and accept that
listeners pick it up within the five-minute cache window.

### The nightly job — and the sync it depends on

Day files are also published every night by cron on the app host:

```
/etc/cron.d/kjubilee-schedules
  0 12 * * *  cd /var/www/kjubilee.com && node scripts/r2-publish-schedules.js --apply --days 3
```

`--days 3` is what keeps at least 48 hours in front of every listener at all
times, in every timezone the dial broadcasts into.

> **THAT DIRECTORY IS NOT THE WEBSITE, AND IT DOES NOT UPDATE ITSELF.**
>
> The site deploys to `/var/www/kjubilee.com-next`. The scheduler runs out of
> `/var/www/kjubilee.com`, which is a separate checkout kept only because it has
> what the publisher needs and the standalone build does not: `scripts/`,
> `tools/`, `tenants/`, `node_modules` and — crucially — `tmp/pools/`, which
> cannot be rebuilt on a host that cannot see the music share.
>
> **A station added to the dial does not reach that checkout by deploying the
> site.** On 2026-08-29 it still held 41 tenants against the dial's 43: Gospel
> By Music (HM 316.00) had never had a single day file published, and The Upper
> Room's move to HM 350.00 was unknown to it. Both stations flashed the pause
> icon and fell straight back to play, because the player asks for a day file
> that answers 404. The cron had been running successfully every night the whole
> time, publishing 123 files for the stations it knew about.
>
> So after adding, moving or retiring a station, push the publisher's inputs:
>
> ```bash
> tar czf tmp/kj-sched.tgz tenants tools/build-station-manifest.js >     tools/build-schedule-manifest.js tools/lib >     scripts/r2-publish-schedules.js tmp/pools
> scp -i ~/.ssh/id_ed25519_jubilee_prod tmp/kj-sched.tgz root@94.72.120.231:/tmp/
> ssh -i ~/.ssh/id_ed25519_jubilee_prod root@94.72.120.231 >     'cd /var/www/kjubilee.com && tar xzf /tmp/kj-sched.tgz && ls tenants/*.json | wc -l'
> ```
>
> The count it prints must equal the number of on-air stations. Extracting does
> not delete, so a RETIRED frequency has to be removed by hand — otherwise the
> job keeps publishing day files for an address the dial no longer has.

### The watchdog

The nightly cron is the routine job. `scripts/kj-watchdog.js` is the safety net
under it, running every 15 minutes as its own systemd timer on the app host:

```
/etc/systemd/system/kj-watchdog.timer        -> kj-watchdog.service      (every 15 min, --repair --days 2)
/etc/systemd/system/kj-watchdog-heartbeat.timer -> the checker           (hourly)
/var/lib/kj-watchdog/heartbeat.json          the last run, machine-readable
/var/log/kj-watchdog.log                     what it did
```

**It asks the live site, not the disk.** It reads `stations-data.js` over HTTP —
the same file a listener's browser gets — and requires every on-air station to
have a day file on the CDN for today and the next two days. That is the whole
design: the outage on 2026-08-29 happened because every local list agreed with
every other local list and all of them were wrong. A watchdog reading `tenants/`
would have reported all clear.

**It repairs a station it has never heard of.** A pool IS the station's
manifest, and manifests are published to `radio/<ID>/delivery/music.json` by
`scripts/r2-publish-manifests.js`. So when a station is missing locally the
watchdog fetches its manifest, normalises the URL layout, writes it as the pool,
derives the tenant record from the same document, and publishes. Proven on the
host by deleting a day file AND both local inputs: it recovered all three.

A tenant it reconstructs carries `_recoveredBy` and is marked PROVISIONAL — it
is faithful enough to schedule from but cannot recover `pending`, which is
editorial. Re-run the sync above to put the authored file back.

Exit codes are the contract: `0` all covered, `1` something was missing and is
now fixed, `2` something is missing that it could not fix — that one is worth a
page. `SuccessExitStatus=0 1` in the unit is why a successful repair is not
recorded as a unit failure.

> **Both halves run on the same box, and that is the honest limit of it.** The
> watchdog is independent of the website — it does not need `kjubilee.service`
> and will keep repairing while the site is down — and the heartbeat checker is
> plain `/bin/sh` with no dependency on node or the checkout, so it still works
> when those are what broke. But if the machine itself dies, both die with it.
> Genuine out-of-band monitoring needs a second host or an external uptime
> service pinging a health endpoint; nothing here can substitute for that.

**A few songs is not a reason to skip a station.** The generator fills the whole
broadcast day from whatever the pool holds, reshuffling as it goes, so a station
with 12 tracks gets the same 24-hour file as one with 1,700 — it simply comes
round more often. There is no minimum, and there should not be one: a station
that is thin today is a station being filled this month.

---

## Phase 5 — Site data

Regenerates the catalogue the website reads.

```bash
node tools/build-home-data.js
```

Reads the station array in `public/js/pages/radio.js`, enriches it, and writes
`public/js/stations-data.js` — the file every page loads. **Never edit
`stations-data.js` by hand; it is overwritten on every run.**

This step is what updates:

- **Track counts** on every station card and in the "at a glance" panels
- **ON AIR badges** — derived from whether a station has a built manifest with
  tracks in it, joined on frequency. A station with a stream but no catalogue is a
  placeholder and the card says so.
- **The `/music` catalogue page** — the browsable record of what exists
- **Article facts** — the dial range, station count and language count are read
  live from the catalogue, so they correct themselves

Then rebuild the index behind the operator's console:

```bash
node tools/build-analytics-index.js
```

Writes `public/data/analytics-stations.json`, which is what
[`/analytics/start.html`](../public/analytics/start.html) reads for the dial, the
per-station counts and the planned column. **It must run AFTER
`build-home-data.js`** — it reads that file's output for the station list, so
running it first means a station added today is missing from the panel.

It is also the one place the *planned* side of the ledger is reported: albums
named as `pending` in the `STATIONS` table, written and awaiting audio. A pending
album that gained audio in this run stops being counted here, which is the same
GRADUATED event Phase 2 prints — and the same cue to listen to what arrived.

It indexes the **voice scripts** too — the `branded/`, `breaks/`, `scripture/`,
`donation/` and `delight/` text beside each delivery tree. Nothing else in the
toolchain looks at them, so a station can be perfectly programmed and completely
silent between the songs with nothing reporting it. The run prints how many
on-air stations have none.

Then rebuild the recording queue:

```bash
node tools/build-todo-index.js
```

Writes `public/data/todo-index.json` and one lyric bundle per album under
`<CDN_LOCAL_ROOT>/lyrics/`, which is what
[`/analytics/todo.html`](../public/analytics/todo.html) reads. It answers the
question no other tool here can: **which written songs still have no mp3.**
Every other index in this pipeline is built on the ledger, and the ledger only
knows songs that HAVE audio, so the ~7,100 tracks that exist only as words are
invisible to all of them. This one walks the nine authoring trees directly.

It is the natural end of an import refresh because an ingest is exactly what
moves a track off this list. Re-run it and the queue shrinks by what Phase 1
brought in.

> **The lyric bundles do not ship with `public/`.** They are 59 MB and live on
> the CDN with the station manifests. Deploy them separately — see Phase 6.

### Gate

```bash
node -e "global.window={};require('./public/js/stations-data.js');
const S=window.KJ_STATIONS||[];
console.log('stations '+S.length+'  ON AIR '+S.filter(s=>s.prototype).length
  +'  with tenant '+S.filter(s=>s.tenant).length);"
```

ON AIR should equal the number of stations with a built manifest. If it dropped,
Phase 2 did not run or a frequency changed without the manifests following.

`build-analytics-index.js` prints the same count and one number no other step
reports: how many ingested songs are on **no station at all**. That is a
selection rule that did not fire, not a file to re-copy — see
[Phase 2's note on fan-out](#phase-2--manifests-ledger--per-station-catalogues).

---

## Phase 6 — Deploy

> **The target is `/var/www/kjubilee.com-next`, not `/var/www/kjubilee.com`.**
>
> The `kjubilee` systemd unit runs `node server.js` with
> `WorkingDirectory=/var/www/kjubilee.com-next`. The other directory is a stale
> copy of the pre-migration site and nothing serves it. Deploying there changes
> nothing and looks like it worked.

> **Production is a Next.js STANDALONE build.** `ls` hides it, because `.next` starts
> with a dot — use `ls -a`. The `server.js` there is Next's generated launcher, not
> the Express `server.js` in this repo, and the compiled app lives in `.next/`.
>
> **This changes what a deploy is, depending on what you changed:**
>
> | Changed | Deploy |
> | --- | --- |
> | Anything under `public/` (station data, css, js) | Copy the files. No build. |
> | Anything under `app/` or `lib/` (routes, pages, API) | `npx next build`, then ship `.next/standalone/.next`, `.next/static`, `server.js` |
>
> Ship neither `.env` (production has its own secrets) nor `node_modules` unless
> `package.json` actually changed — compare its md5 against the server first.
> Remove `.next/server` before extracting so a stale route cannot linger.

Only `public/` needs to move. Skip `images/` unless artwork changed; it is 21 MB and
almost never part of an audio refresh.

**`public/data` must go with `public/js`.** The Heavenly Band article bodies were
split out of `stations-data.js` into `public/data/hm-articles/` — one file per
slug, fetched when a reader opens the piece — because at full length they were
four fifths of a file that every page loads and that is served `no-store`.
Shipping `js` without `data` leaves a hundred and thirteen article pages fetching
bodies that are not there, and the failure is invisible from the shelf: the cards
render, the reading times are right, and only opening one shows the retry.

```bash
# 1. Package just what changed
tar czf tmp/kj-public.tgz public/js public/css public/data public/analytics

# 2. Upload
scp -i ~/.ssh/id_ed25519_jubilee_prod tmp/kj-public.tgz \
    root@94.72.120.231:/tmp/kj-public.tgz

# 3. Back up, extract, restart
ssh -i ~/.ssh/id_ed25519_jubilee_prod root@94.72.120.231 'set -e
  cd /var/www/kjubilee.com-next
  tar czf /root/public-predeploy-$(date +%F-%H%M).tgz public/js public/css public/data
  tar xzf /tmp/kj-public.tgz
  systemctl restart kjubilee
  sleep 4 && systemctl is-active kjubilee
  rm -f /tmp/kj-public.tgz'
```

### The lyric bundles — a separate copy, to a different tree

`tools/build-todo-index.js` writes 59 MB of per-album lyric JSON to
`<CDN_LOCAL_ROOT>/lyrics/`. That is **not** under `public/` and does not move with
the tarball above. It goes where the station manifests go — the VPS's
`CDN_LOCAL_ROOT`, which is `/var/www/kjubilee.com/cdn-local`, served at `/cdn/`
by Express for everything that is not `/cdn/music/`.

```powershell
# From PowerShell — write the archive, then scp it. Do not pipe tar into ssh.
tar czf tmp/kj-lyrics.tgz -C J:\kjubilee.com lyrics
scp -i $env:USERPROFILE\.ssh\id_ed25519_jubilee_prod tmp/kj-lyrics.tgz `
    root@94.72.120.231:/tmp/kj-lyrics.tgz
ssh -i $env:USERPROFILE\.ssh\id_ed25519_jubilee_prod root@94.72.120.231 `
    'tar xzf /tmp/kj-lyrics.tgz -C /var/www/kjubilee.com/cdn-local && rm -f /tmp/kj-lyrics.tgz'
```

Only re-send it when the queue was rebuilt. The build rewrites a bundle only when
its bytes change, so `rsync` moves a handful of files after a normal ingest — but
`tar` is what survives a Windows-to-Linux hop without a working rsync.

`jubilee-prod` is an alias with no `~/.ssh/config` entry on the Windows workstation;
use the IP and the identity file directly, or add a `Host` block.

From PowerShell, use `$env:USERPROFILE\.ssh\...` — `~` does not expand — and do not
pipe `tar` into `ssh`: PowerShell pipes objects, not bytes, and will corrupt the
archive mid-stream. Write the file, then `scp` it.

---

## Phase 7 — Verify

Nothing counts as done until sound comes out.

```bash
# Every on-air station has a populated day file for the next week.
node tools/check-schedules.js 7
```

**ON AIR is not the same question as playable.** `prototype` is derived from a
station having a built manifest — what it *could* play. What the player fetches
is the day file, and until this tool existed nothing checked one was there. The
nightly cron publishes `--days 7` for exactly this reason: at `--days 3` a
single bad weekend was three days from silence, and a missing day file is
invisible until a listener presses play.

```bash
# 1. Every tenant's day file resolves at its published address
node tests/tenant-radio.test.js          # expect all green

# 2. Spot-check one station's day file directly
D=$(TZ=America/Los_Angeles date +%Y%m%d)
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://cdn.kjubilee.com/radio/HM308.70-EN/delivery/HM308.70EN-$D.json"

# 3. The live site is serving the new catalogue
curl -s "https://www.kjubilee.com/js/stations-data.js" -o /tmp/p.js
node -e "global.window={};require('/tmp/p.js');
const S=window.KJ_STATIONS||[];
console.log('live: '+S.length+' stations, '+S.filter(s=>s.prototype).length+' on air');"
```

**Then press play in a browser.** CORS and autoplay are enforced only in the browser
— a passing Node test says nothing about either.

```bash
node tools/play-check.js <station-slug>          # against production
node tools/play-check.js <station-slug> http://localhost:3000
```

Drives a real headless Chrome, tunes the station through `window.kjPlayer.play()`
with a user gesture, and exits non-zero unless sound is actually coming out. It
reports the track the bar lands on, the analyser's peak bin (`0` is silence even
when the player claims to be playing), and any CORS or network failure.

Two things it does deliberately: it leaves the autoplay policy at its default,
because relaxing it would hide the failure the check exists to catch; and it reads
the player's state rather than a DOM `<audio>` element, because there isn't one —
the player builds its element with `new Audio()`.

Still open the site yourself afterwards and confirm a *new* track appears in the
bar. The check proves sound; only you can say it is the right sound.

---

## The import report

The grid that says what actually changed. Run it after Phase 2, against the
snapshot taken in Phase 0.

```bash
node tools/import-report.js            # the grid
node tools/import-report.js --json     # same data, for a dashboard or a diff
```

```
  TENANT          FREQ       STATION                     WAS    NOW    NEW
  --------------------------------------------------------------------------
  HM302.50-EN    HM 302.50  Pentecostal Shout             370    379     +9
  HM303.10-EN    HM 303.10  Yes and Amen                  185    191     +6
  HM308.70-EN    HM 308.70  Year of Jubilee               1561   1561      ·
  …

  9 new song(s) → 15 placement(s) across 2 station(s)
  6 reached more than one station · 3 reached exactly one

  WHERE EACH NEW SONG LANDED  (overlap is intended)
  --------------------------------------------------------------------------
  The Fear Of Yahuah              Imani Inspire    302.50 303.10
  I Do Not Cringe                 Imani Inspire    302.50 303.10
```

### One song, several stations — by design

**A song is normally on more than one frequency, and that is not duplication.**
Station selections overlap deliberately: a Caleb record belongs on the flagship
because Caleb is one of its four voices, *and* on Gospel Country if it is a country
record, *and* on a language edition if he recorded it in that language. As of the
last baseline, **753 of 6,369 songs already sit on more than one station** — 7,182
placements from 6,931 catalogued tracks.

So the report counts two different things and both matter:

| Number | Means |
|---|---|
| **new songs** | Distinct SongIDs that were not on any station before |
| **placements** | Song-on-station rows added. Always ≥ new songs |
| **stations updated** | How many frequencies changed at all |

A new song reaching six stations is six stations' worth of value from one ingest.
**The number worth chasing is one that reached none** — see the Phase 2 gate.

### Orphans — in the ledger, on no station

The report also checks the whole ledger against every manifest and names anything
that is catalogued but plays nowhere:

```
  ⚠ 562 track(s) in the ledger are on NO station:
         24  amir-inspire  [AR]
         24  santiago-inspire  [BR]
         24  jubilee-inspire  [CS]
```

**This is a rule that did not fire, not a file that failed to copy.** Check the
pool, the language and the `select` of the station that should carry them. The
current 562 are the international-language tracks — 24 per language across nineteen
languages whose frequencies have no tenant yet, plus anything a narrowed rule
stranded.

Checked against the whole ledger rather than only what changed, because a rule
narrowed months ago strands tracks that were playing fine before, and nothing else
reports it.

### Reading it

| Column | Meaning |
|---|---|
| `WAS` / `NOW` | Track count at snapshot / now |
| `NEW` | `+n` gained · `·` unchanged |
| `** -n **` | Lost tracks — investigate before publishing |
| `** manifest missing **` | Station had a manifest at snapshot and has none now |

The fan-out block lists every song that landed on more than one frequency, with the
frequencies it reached. Songs that landed on exactly one are counted but not listed
— the interesting case is the spread.

`--json` emits the same data with a `fanOut` array of `{songId, stations}`, which is
what an admin page or a nightly diff should read rather than parsing the grid.

---

## Station rules reference

Every frequency selects differently. This is the current table, from
`tools/build-station-manifest.js` — **edit it there, not here**; this is a mirror
for reading.

| Tenant | Station | Mode | Lang | Selection rule |
|---|---|---|---|---|
| `HM308.70-EN` | Year of Jubilee *(flagship)* | CCI | EN | 4 artists, minus album `CAIM1027EN` |
| `HM305.40-EN` | Torah Sings | OHI | EN | artist `torah-sings` |
| `HM304.80-EN` | Celebrate Yeshua! | CCI | EN | 4 curated albums from `data/yeshua-selection.json` |
| `HM303.10-EN` | Yes and Amen | OHI | EN | album pattern `^[A-Z]{4}200[0-9][A-Z]{2}$` — the SingItDone 2001–2003 series, any persona |
| `HM302.50-EN` | Pentecostal Shout | CCI | EN | 2 artists |
| `HM306.20-EN` | Hebraic Celebrations | OHI | EN | 1 artist |
| `HM309.30-EN` | Gospel Country | CCI | EN | 2 artists |
| `HM310.90-EN` | Latin Worship (Sung in English) | CCI | EN | 1 artist, minus albums |
| `HM311.50-EN` | Riddim and Rhyme | CCI | EN | 1 artist, 9 explicit albums |
| `HM312.10-EN` | Island Hallelujah | CCI | EN | 1 artist |
| `HM313.80-EN` | The Ancient Paths | CCI | EN | 1 artist |
| `HM314.40-EN` | Midnight Praise | CCI | EN | 1 artist |
| `HM316.00-EN` | Gospel By Music | CCI | EN | artist `gospel-by-music`, plus 19 `pending` albums |
| `HM350.00-EN` | The Upper Room | OHI | EN | artist `jubilee-prayers`, plus 11 `pending` albums — **12 tracks, below every depth floor; see the station block** |
| `HM326.20-RO` | Jubilee Praise (Română) | OHI | RO | **no filter** — every Romanian track, from whichever persona recorded it |
| `HM360.30-EN` | God's Little Lambs | CCI | EN | artist `tiny-tiggles` (ages 3–5) |
| `HM361.90-EN` | Jubilee Kids Party | CCI | EN | artist `party-giggles` (ages 6–8) |

### The six selection shapes

| Shape | Meaning | Use when |
|---|---|---|
| *(none)* | Pool + language only | The language is the whole identity — every track in it belongs |
| `artists: [...]` | A persona roster | The station is "these voices" |
| `albums: [...]` | Explicit album codes | A curated set that no rule can express |
| `pending: [...]` | Albums written but not yet recorded | The same curated set, declared ahead of its audio |
| `albumPattern: …` | Regex on the album code | A numbered series, open-ended by design |
| `exclude: { albums: [...] }` | Subtraction from any of the above | A specific record must not air — duplicates, licensing, tone |

`exclude` composes with the others. `CAIM1027EN` is excluded from the flagship
because all twelve of its tracks are **byte-identical** to `CAIM1026EN` under
different titles; airing both played the same twelve recordings under twenty-four
names. The files stay in the repository — exclusion is an airing decision, not a
deletion.

#### `albums` vs `pending` — and why they are not one list

An album named in `albums` that matches nothing in the ledger is an **ERROR**: it
is a typo or a track that left the ledger, and either way the station is quietly
smaller than intended. That guard is the reason a curated station can be trusted.

But "written and not yet recorded" is the normal condition for most of a
persona’s catalogue — Melody has ~90 English records written and 22 recorded — and
naming one is neither a typo nor a mistake. `pending` says "when this is recorded,
it belongs here", so the album joins on the day its audio is ingested without
anyone having to remember that the station file exists.

Keeping them separate is what preserves the guard. If any unmatched entry were
acceptable, a mistyped code would never be reported again.

The builder prints one of two lines for `pending`:

- `note: N album(s) are named as pending and have no audio yet` — the steady state.
- `GRADUATED: ...` — an album named as pending now HAS audio and is on the station.

**`GRADUATED` is a cue to listen.** A blueprint describes what was written, not
what was recorded against it, and the two can differ: Zariah’s `ZHIM1030RO` holds
an entirely different album’s audio under its own name. Pre-registering spends a
reading now to save one later, and that line plus the import report’s track-count
change are the only things standing between new audio and the air.

### Adding a station to the pipeline

1. Add its block to `STATIONS` in `tools/build-station-manifest.js` — tenant id,
   slug, `hm`, `mount`, language, mode, pool, `select`.
2. Add its tenant record under `tenants/<TENANT-ID>.json`. **Its `timezone` is
   `America/Los_Angeles` — always, for every station on the dial including the
   Romanian one.** That field is the *broadcast day*, not where the host lives: the
   whole network turns over on one clock so a listener switching stations never
   crosses a day boundary mid-song. The host's real zone goes in the `STATIONS`
   entry as `hostCity`/`timezone`, which the manifest carries as metadata and the
   day file ignores. Getting this wrong publishes a day of the right length at the
   wrong offset, and `tests/tenant-radio.test.js` is what catches it.
3. Confirm its frequency sits in the right five-fold block — see
   [`hm-bands.md`](hm-bands.md).
4. **Give it a home city, and let the base build seed the rest.** `hostCity` in
   the `STATIONS` block is what `sync-tenants.js` writes into the tenant's
   `origin.city`, and that origin is the anchor
   `tools/build-broadcast-bases.js` reads. Run it: a station with no entry in
   `data/broadcast-bases.json` is **seeded automatically** from that origin and
   marked `"auto": true`, so a frequency can never go on air with no origin —
   but `--check` still fails on a seeded entry, because the placeholder
   rationale is meant to be replaced with a real anchor and relays. **A station
   with no `hostCity` cannot be seeded at all** and is a hard failure.
5. **Give it a language code.** Every station prints a two-letter code to the
   right of its frequency, the way `HM` sits to its left — `EN`, `JA`, `RO`.
   It is derived automatically from the tenant id suffix
   (`HM336.60-JA` → `JA`), so a station named correctly in step 1 needs nothing
   here. **A station that airs more than one language must say so** with an
   explicit `langCode` in the catalogue entry in `public/js/pages/radio.js`:
   HM 310.90 carries English and Spanish and prints `EN-ES`, because the code
   derived from its tenant id would have been a half-truth. See `langCodeFor()`
   in `tools/build-home-data.js`.
6. Run Phase 2 with `--station <ID> --dry-run` and read the track count. **Under
   ~150 tracks it will loop audibly**; that is a station to hold back, not ship.
7. Then Phases 3–7 as normal.
8. **Prove it is playable, not merely on air.** `node tools/check-schedules.js 7`
   — ON AIR is derived from having a *manifest*, which says what a station
   could play; the day file is what the player actually fetches, and a station
   can read ON AIR, carry two thousand tracks and be silent.

### Adding a source tree

Register it, in this order of preference:

1. **`ARTIST_ROOTS`** — the tree is `<root>/<artist>/<album>` and only the root
   is new. One line.
2. **`ARTIST_TREES`** — the tree has no artist tier, or an extra one. Name the
   folder that holds the albums and how deep they sit. Gospel By Music is filed
   `music/40_matthew/GBMX4001EN-.../tracks`, so it is `depth: 2`.
3. **A dedicated ingester** — only when the source carries more than a tree walk
   can read. `ingest_torahsings.py` earns its existence that way: its
   `catalog-manifest.json` names every performer and audio file, which no walk
   could reconstruct. Do not write one for a tree that is merely shaped oddly.

Register the artist codes and genre lanes in `catalog-config.json` first, dry-run
until clean, then commit. `--src-root` remains for a genuine one-off; a property
that will keep growing belongs in a map, because a flag you have to remember is a
flag you forget.

---

## Failure modes

Each of these has actually happened. All of them look like success.

| Symptom | Cause | Fix |
|---|---|---|
| New tracks nowhere on air, no errors anywhere | `--rebuild-pools` omitted in Phase 4 | Re-run Phase 4 with it |
| A station reads as a placeholder after an ingest | Phase 2 not run, so it has no manifest | Run Phase 2, then Phase 5 |
| Station plays silence at some slots | Schedule published before audio (Phase 4 before 3) | Run Phase 3, republish Phase 4 |
| Deploy "succeeded", site unchanged | Deployed to `/var/www/kjubilee.com` | Deploy to `kjubilee.com-next` |
| A frequency 404s after renumbering | Tenant id embeds the frequency; the CDN tree did not follow | Rebuild manifests and republish before retiring old addresses |
| Duplicate SongIDs in the ledger | Two ingest runs in parallel | Never parallel. Restore the ledger and re-run sequentially |
| A track plays under two names | Byte-identical albums both airing | `exclude` the duplicate; verify by hash first |
| One station's day starts at the wrong hour | Tenant `timezone` set to the host's city instead of `America/Los_Angeles` | Correct the tenant record, republish that station |

### The ordering rule

**Publish before retiring.** When addresses change, the new ones must be live and
verified before the old ones are removed — and the *site* must be deployed before
the old addresses are deleted, or listeners on the deployed-but-stale catalogue are
pointed at directories that no longer exist. Publish, deploy, verify, *then* clean up.

---

## Quick reference

```bash
# 0  what's new  +  SNAPSHOT (required for the report)
wc -l < "J:/kjubilee.com/music/songid-registry.tsv"
node tools/import-report.js --snapshot --label "before <what>"

# 1  ingest (one artist at a time)
python tools/music-ingest/ingest_music.py --artist <slug> --dry-run
python tools/music-ingest/ingest_music.py --artist <slug>
python tools/music-ingest/build_album_json.py --artist <slug>

# 2  manifests  +  the grid
node tools/build-station-manifest.js --all
node tools/import-report.js

# 3  audio to CDN
node scripts/r2-sync-music.js && node scripts/r2-sync-music.js --apply

# 4  schedules  ← --rebuild-pools after every ingest
node scripts/r2-publish-schedules.js
node scripts/r2-publish-schedules.js --apply --rebuild-pools

# 5  site data
node tools/build-home-data.js
node tools/build-analytics-index.js       # after build-home-data, never before
node tools/build-todo-index.js            # the recording queue: what still has no mp3

# 6  deploy  (target: kjubilee.com-next)
#     public/analytics and public/data ride along: the operator's console is a
#     static file plus its index, and shipping js+css alone leaves it reporting
#     the dial as it stood at the last deploy.
tar czf tmp/kj-public.tgz public/js public/css public/data public/analytics
scp -i ~/.ssh/id_ed25519_jubilee_prod tmp/kj-public.tgz root@94.72.120.231:/tmp/
ssh -i ~/.ssh/id_ed25519_jubilee_prod root@94.72.120.231 \
  'cd /var/www/kjubilee.com-next && tar xzf /tmp/kj-public.tgz && systemctl restart kjubilee'

# 7  verify
node tests/tenant-radio.test.js
# then press play in a real browser
```

---

**Related:** [`hm-bands.md`](hm-bands.md) · [`station-guidelines.md`](../docs/setup/station-guidelines.md) · [`../docs/MUSIC-REPOSITORY-SPEC.md`](../docs/MUSIC-REPOSITORY-SPEC.md) · [`../tools/music-ingest/README.md`](../tools/music-ingest/README.md)
