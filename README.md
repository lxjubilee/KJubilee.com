# kJubilee — Kingdom Jubilee Radio

A focused **radio + music streaming spinoff** of JubileeVerse.com. Multi-station Icecast streams,
album-driven programming, listener favorites/follows/feedback, and the full
**Jubilee Radio Engine** specification ([docs/Radio-Engine-Spec.md](docs/Radio-Engine-Spec.md)).

```
W:/kJubilee.com/
├── server.js                 # Express server (radio API + page routes + /cdn)
├── lib/                      # auth (local JWT) and Postgres pool
├── public/                   # radio.html (player), music.html, landing, login/signup
├── migrations/               # idempotent SQL — applied by `npm run migrate`
├── scripts/                  # run-migrations, r2-sync-music, album setup
├── tools/jubilee-speak/      # VSIX TTS extension (Jubilee Speak)
├── tools/music-ingest/       # song repository ingest — canonical filenames + SongIDs
├── tools/build-station-manifest.js  # repository -> station delivery/music.json
├── tools/StationImageStudio/ # WPF app — one cover image per station, hosted by its Inspire Family persona
├── personas/                 # the twelve likeness reference portraits the studio attaches
├── docs/
│   ├── MUSIC-REPOSITORY-SPEC.md  # Radio Song ID format + SongID contract (naming authority)
│   ├── Radio-BRD.md          # business requirements
│   ├── Radio-Engine-Spec.md  # 2,791-line engine spec (Icecast + Liquidsoap, OHI, Sabbath)
│   ├── Radio-Engine-Testing.md
│   ├── qa-radio-cross-reference.md
│   └── DEPLOYMENT.md         # publish-to-production runbook (read this before going live)
├── .env.example              # copy to .env and fill in
└── package.json
```

## Quickstart (local dev)

```bash
cp .env.example .env          # then fill in DB_PASSWORD and JWT_SECRET
npm install
npm run migrate               # creates kj_users / kj_radio_* / kj_albums tables
npm start                     # http://localhost:3210
```

Endpoints:
- `GET /`, `/radio`, `/music`, `/login`, `/signup`, `/health`
- `/api/auth/{register,login,me}`
- `/api/radio/{feedback,voicemail,favorites,follows}` (favorites/follows require auth)
- `/api/music/follows`, `/api/admin/albums`
- `/cdn/*` static — audio assets with byte-range support

## Production architecture (what's in scope vs. external)

| Layer | Status | Notes |
|---|---|---|
| Node app (`server.js`) | ✅ in this repo | one process |
| Postgres database | 🔌 external service | dedicated `kjubilee` DB; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §2 |
| Icecast streaming server | 🔌 external service | `radio.kjubilee.com/stream/<format>` — see [docs/Radio-Engine-Spec.md](docs/Radio-Engine-Spec.md) §8 |
| Liquidsoap playlist engine | 🔌 external service | dual-playlist hot-swap, runs alongside Icecast |
| Audio object storage (R2) | 🔌 external service | `cdn.kjubilee.com` Cloudflare R2 bucket |
| DNS / TLS | 🔌 external | `kjubilee.com`, `radio.kjubilee.com`, `cdn.kjubilee.com` |

The Node app is **publish-ready code**; the streaming engine + DB + R2 + DNS are
operator provisioning steps documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Music repository

Radio audio lives outside this repo at `J:\kjubilee.com\music\<artist>\<language>\<album>\`,
with every file named to the canonical Radio Song ID format:

```
HMX2026EN01-7XJ29ZW8X70P-JUBI-CCJP_sky-splits-open_sky-splits-open.mp3
```

Currently **6,574 tracks across 700 albums** — 12 Inspire Family personas in 25 languages, plus the Torah Sings catalogue and the SingItDone declaration albums.

`songid-registry.tsv` at the music root is the SongID ledger — the 12-char SongID is the
primary key the rotation and play logs track songs by, and it is verified unique before
assignment. Each album folder also carries an `album.json` sidecar recording where the
audio came from and what each song is about, so the radio layer never has to reach back
into the jubilujah.com production tree.

To ingest more albums (one persona at a time, sequentially):

```bash
python tools/music-ingest/ingest_music.py    --artist jubilee-inspire --dry-run
python tools/music-ingest/ingest_music.py    --artist jubilee-inspire
python tools/music-ingest/build_album_json.py --artist jubilee-inspire
```

Format definition, slug rules, genre codes, and decision rationale:
[docs/MUSIC-REPOSITORY-SPEC.md](docs/MUSIC-REPOSITORY-SPEC.md).

### Catalog stations (manifest-driven playback)

Most stations point at one of the five Icecast mounts on `radio.kjubilee.com`. A few
instead play straight from the repository: the player fetches a `music.json` manifest,
shuffles it, and runs a continuous rotation, reshuffling on each pass. Nothing plays
that isn't in the manifest (BR-G2).

| Station | HM | Rotation |
|---|---|---|
| Jubilee Radio | 088.70 | the Inspire Family catalog |
| Jubilee Praise (Română) | 326.20 | every Romanian track by one of the twelve Inspire Family members |
| Country Gospel | 309.30 | 420 country tracks — Elias & Eliana whole, plus selected albums and cuts |
| Jubilee Gospel Fire | 302.50 | 188 tracks — Imani Inspire's whole English catalog |
| Torah Sings | 305.40 | 1,749 tracks — the Bible sung book by book, Genesis to Revelation |
| Yes and Amen | 303.10 | 191 tracks — the SingItDone declaration albums, all twelve personas, one record each |

Manifests are generated from `songid-registry.tsv` — the ledger is the authority, so a
track can only reach a manifest under the SongID the play logs already know.

Most stations select **declaratively** (a language plus an artist pool), so **re-run after
every ingest** — newly ingested members join the rotation with no code change. A station
may also narrow that with an explicit `select` block (whole artists, whole albums, and
individual SongIDs), which is how Country Gospel is built: no ledger column identifies
country, because the genre code names the *persona's* lane rather than what each album
was actually produced as. **An explicitly selected station does not grow on its own** —
re-run the selection analysis when new albums land.

**Every airing song must be a kJubilee-owned copy.** Audio lives under
`J:\kjubilee.com\music\` and is served from the `cdn.kjubilee.com` bucket. A station
manifest must never point at another project's CDN or master — the repository copies are
working masters that get mastered and loudness-normalised for broadcast, so a station
pointed upstream plays un-normalised audio and misses every later correction. Ingest
first, then build the station. Full rule: [docs/MUSIC-REPOSITORY-SPEC.md](docs/MUSIC-REPOSITORY-SPEC.md) §1a.

**URL layout.** `canonical` is the default and the only correct choice for anything that
airs. `source` is legacy — absolute URLs into `cdn.jubileeverse.com` — and survives only
to read manifests built before this repository existed:

```bash
node tools/build-station-manifest.js --station HM332.16-RO --url-layout source \
  --out /tmp/music.json

# Legacy, read-only. Do not build airing stations with this.
node tools/build-station-manifest.js --station HM332.16-RO --url-layout source
```

Building with the wrong layout is the failure mode to watch for: the station still shows
**On air** and the manifest still loads, but every track 404s and the rotation skips
silently through the whole catalog. Verify after generating — every URL should give
`206`:

```bash
node -e "require('<manifest>').albums.flatMap(a=>a.tracks).forEach(t=>console.log(t.url))" \
  | xargs -I{} curl -s -o /dev/null -r 0-255 -w "%{http_code} {}\n" {}
```

Output defaults to `<CDN_LOCAL_ROOT>/radio/<STATION_ID>/delivery/music.json`, served at
`/cdn/radio/<STATION_ID>/delivery/music.json`. The canonical repository is not on the
production CDN yet — once `scripts/r2-sync-music.js` has synced it, production can switch
to `--url-layout canonical` and the two stop diverging.

### Home page categories

The category bar carries four station sections on the left — **Home (Christian Music)**,
**Bible Studies & Prayers**, **Family Friendly**, **International Stations** — and one
pinned to the right, **Heavenly Modulation (HM)**.

The HM tab is editorial, not a shelf: articles explaining what the band is and what it
changes for a listener. Every figure in that copy (station count, dial range, how many
are live, how many languages) is **computed from the catalog at build time**, so the page
cannot drift out of step with the dial it describes. A section carries either `shelves`
or `articles`; the build reports which. Source: `HM_ARTICLES` in `tools/build-home-data.js`.

The **home page** is a single flat grid of every English Christian music station —
`primary: music` plus the `mainstream` AI music formats — with the on-air ones first.
The ordering keys on `prototype` (true exactly when a station has a manifest), so a
station joins the top of the page automatically the moment it goes live; nothing here
needs editing. The hero carousel is derived from the same list and can only feature a
station that actually plays. See `englishMusic()` in `tools/build-home-data.js`.

To add another language station: add an entry to `STATIONS` in the tool and a
`musicManifestUrl` to that station in `public/radio.html`, then re-run
`node tools/build-home-data.js` (that regenerates `public/js/stations-data.js`, which is
what puts the **On air** badge on the home page — a station without it renders as a
placeholder card).

## Station artwork

`tools/StationImageStudio/` is a WPF app that generates one cover image per
station — **people listening to kJubilee on white radio equipment**, with that
station's assigned Inspire Family member listening along with them. It hosts a
real browser, you log in to ChatGPT yourself, and it drives your own session.

The station's persona comes from the `host` field the catalog already carries for
all 102 stations; the studio can override it per station in its own
`station-hosts.json` without touching the generated catalog. Images land in
`public/images/stations/<slug>.webp`, and the file on disk is the record of what
is done — there is no status field anywhere.

```
tools\StationImageStudio\Build-And-Run.cmd
```

Details, including why the prompt is composed rather than stored:
[tools/StationImageStudio/README.md](tools/StationImageStudio/README.md).

## Notes for the team

- This was forked from JubileeVerse.com on 2026-06-06. Tables use the `kj_` prefix; the player + APIs are otherwise byte-equivalent.
- The radio engine itself (Icecast + Liquidsoap config, OHI compliance layer, Kingdom Calendar scheduler) is fully specified in `docs/Radio-Engine-Spec.md` — that doc is the source of truth, not the brief here.
- A 30-day JWT auth is built in (`lib/auth.js`). To swap to an external auth service, replace `getUserIdFromAuth(req)` in `lib/auth.js`.

## License
ISC.
