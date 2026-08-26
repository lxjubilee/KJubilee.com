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
  J:\torahsings.com               ─┼─► [1] INGEST ──► J:\kjubilee.com\music
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
         "J:/torahsings.com" "J:/singitdone.com/music"; do
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

### The four source trees

| Source | Tool | Contents |
|---|---|---|
| `J:\jubilujah.com\music\inspire` | `ingest_music.py` | The twelve Inspire Family personas |
| `J:\jubilujah.com\music\children` | `ingest_music.py` | Party Giggles, Tiny Tiggles |
| `J:\torahsings.com` | `ingest_torahsings.py` | Torah Sings — organised by book of the Bible, not by album, which is why it has its own ingester |
| `J:\singitdone.com\music` | `ingest_music.py --src-root` | The 2001–2003 declaration series, any persona prefix |

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

### Gate

```bash
node -e "global.window={};require('./public/js/stations-data.js');
const S=window.KJ_STATIONS||[];
console.log('stations '+S.length+'  ON AIR '+S.filter(s=>s.prototype).length
  +'  with tenant '+S.filter(s=>s.tenant).length);"
```

ON AIR should equal the number of stations with a built manifest. If it dropped,
Phase 2 did not run or a frequency changed without the manifests following.

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

```bash
# 1. Package just what changed
tar czf tmp/kj-public.tgz public/js public/css

# 2. Upload
scp -i ~/.ssh/id_ed25519_jubilee_prod tmp/kj-public.tgz \
    root@94.72.120.231:/tmp/kj-public.tgz

# 3. Back up, extract, restart
ssh -i ~/.ssh/id_ed25519_jubilee_prod root@94.72.120.231 'set -e
  cd /var/www/kjubilee.com-next
  tar czf /root/public-predeploy-$(date +%F-%H%M).tgz public/js public/css
  tar xzf /tmp/kj-public.tgz
  systemctl restart kjubilee
  sleep 4 && systemctl is-active kjubilee
  rm -f /tmp/kj-public.tgz'
```

`jubilee-prod` is an alias with no `~/.ssh/config` entry on the Windows workstation;
use the IP and the identity file directly, or add a `Host` block.

From PowerShell, use `$env:USERPROFILE\.ssh\...` — `~` does not expand — and do not
pipe `tar` into `ssh`: PowerShell pipes objects, not bytes, and will corrupt the
archive mid-stream. Write the file, then `scp` it.

---

## Phase 7 — Verify

Nothing counts as done until sound comes out.

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
— a passing Node test says nothing about either. Open the site, press play on a
station whose catalogue changed, and confirm a *new* track appears in the bar.

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
  HM308.70-EN    HM 308.70  kJubilee Radio               1561   1561      ·
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
| `HM308.70-EN` | kJubilee Radio *(flagship)* | CCI | EN | 4 artists, minus album `CAIM1027EN` |
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
| `HM326.20-RO` | Jubilee Praise (Română) | OHI | RO | **no filter** — every Romanian track, from whichever persona recorded it |
| `HM360.30-EN` | God's Little Lambs | CCI | EN | artist `tiny-tiggles` (ages 3–5) |
| `HM361.90-EN` | Jubilee Kids Party | CCI | EN | artist `party-giggles` (ages 6–8) |

### The five selection shapes

| Shape | Meaning | Use when |
|---|---|---|
| *(none)* | Pool + language only | The language is the whole identity — every track in it belongs |
| `artists: [...]` | A persona roster | The station is "these voices" |
| `albums: [...]` | Explicit album codes | A curated set that no rule can express |
| `albumPattern: '…'` | Regex on the album code | A numbered series, open-ended by design |
| `exclude: { albums: [...] }` | Subtraction from any of the above | A specific record must not air — duplicates, licensing, tone |

`exclude` composes with the others. `CAIM1027EN` is excluded from the flagship
because all twelve of its tracks are **byte-identical** to `CAIM1026EN` under
different titles; airing both played the same twelve recordings under twenty-four
names. The files stay in the repository — exclusion is an airing decision, not a
deletion.

### Adding a station to the pipeline

1. Add its block to `STATIONS` in `tools/build-station-manifest.js` — tenant id,
   slug, `hm`, `mount`, language, mode, pool, `select`.
2. Add its tenant record under `tenants/<TENANT-ID>.json`.
3. Confirm its frequency sits in the right five-fold block — see
   [`hm-bands.md`](hm-bands.md).
4. Run Phase 2 with `--station <ID> --dry-run` and read the track count. **Under
   ~150 tracks it will loop audibly**; that is a station to hold back, not ship.
5. Then Phases 3–7 as normal.

### Adding a source tree

Point `ingest_music.py --src-root` at it, or write a dedicated ingester when the
tree is not organised by album — that is exactly why `ingest_torahsings.py` exists
for a library filed by book of the Bible. Register the artist codes and genre lanes
in `catalog-config.json` first, dry-run until clean, then commit.

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

# 6  deploy  (target: kjubilee.com-next)
tar czf tmp/kj-public.tgz public/js public/css
scp -i ~/.ssh/id_ed25519_jubilee_prod tmp/kj-public.tgz root@94.72.120.231:/tmp/
ssh -i ~/.ssh/id_ed25519_jubilee_prod root@94.72.120.231 \
  'cd /var/www/kjubilee.com-next && tar xzf /tmp/kj-public.tgz && systemctl restart kjubilee'

# 7  verify
node tests/tenant-radio.test.js
# then press play in a real browser
```

---

**Related:** [`hm-bands.md`](hm-bands.md) · [`station-guidelines.md`](../docs/setup/station-guidelines.md) · [`../docs/MUSIC-REPOSITORY-SPEC.md`](../docs/MUSIC-REPOSITORY-SPEC.md) · [`../tools/music-ingest/README.md`](../tools/music-ingest/README.md)
