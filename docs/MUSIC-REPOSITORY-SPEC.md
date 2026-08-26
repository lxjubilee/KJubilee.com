# kJubilee.com Music Radio Song Repository — Specification

**Status:** active · **Owner:** gabe.ungureanu@outlook.com · **Established:** 2026-08-20 · **Last ingest:** 2026-08-21

This document defines the canonical filename format, the SongID contract, the folder
layout, the `album.json` sidecar, and the repeatable ingest procedure for every song
that enters the kjubilee.com radio ecosystem. It is the authority for the naming scheme —
the tooling in [`tools/music-ingest/`](../tools/music-ingest/) implements what is written
here.

**Current contents:** 6,045 tracks · 656 albums · 12 Inspire Family personas plus the
Torah Sings catalogue · 25 languages · ~34 GB, at `J:\kjubilee.com\music\`.

---

## 1. The Radio Song filename format

```
HMX[YEAR][LANGUAGE][TRACKNUMBER]-[SONGID]-[ARTISTCODE]-[PRIMARY][SECONDARY]_[ALBUMTITLE]_[SONGTITLE].mp3
```

Worked example:

```
HMX2026EN01-7XJ29ZW8X70P-JUBI-CCJP_sky-splits-open_sky-splits-open.mp3
└┬┘└┬─┘└┬┘└┬┘ └─────┬────┘ └─┬┘ └┬┘ └──────┬─────┘ └──────┬──────┘
 │   │   │   │       │        │    │        │              └─ song title slug
 │   │   │   │       │        │    │        └─ album title slug
 │   │   │   │       │        │    └─ primary + secondary genre (2 + 2)
 │   │   │   │       │        └─ artist code (4)
 │   │   │   │       └─ SongID (12, globally unique)
 │   │   │   └─ track number within the album (2)
 │   │   └─ language (ISO 639-1, uppercase)
 │   └─ year (4)
 └─ fixed prefix
```

### Field reference

| Field | Width | Charset | Rule |
|---|---|---|---|
| `HMX` | 3 | fixed | Constant prefix on every radio song file. |
| `YEAR` | 4 | `0-9` | Release year. Source `album.meta.json` has `release_date: null` across the entire catalog, so the ingest falls back to `default_year` in the config — currently **2026**. |
| `LANGUAGE` | 2 | `A-Z` | ISO 639-1, uppercase, taken from the source album folder code, e.g. `JEIM1002**RO**-piatra-rasturnata`. 25 in use — see §3. |
| `TRACKNUMBER` | 2 | `0-9` | Zero-padded position within the album. |
| `SONGID` | 12 | `A-Z0-9` | Globally unique. See §2. |
| `ARTISTCODE` | 4 | `A-Z0-9` | Per-persona code, e.g. `JUBI`. Table in §5. |
| `PRIMARY` | 2 | `A-Z` | Primary genre code. |
| `SECONDARY` | 2 | `A-Z` | Secondary genre code. |
| `ALBUMTITLE` | — | `a-z0-9-` | Album title slug, lowercase, `-` for spaces. |
| `SONGTITLE` | — | `a-z0-9-` | Song title slug, lowercase, `-` for spaces. |

Separator discipline matters: fields before the album title are joined with `-`, and the
last three segments are joined with `_`. That makes the filename losslessly parseable —
split on `_` for the three parts, then split the head on `-`. Because album and song
slugs may contain `-` but never `_`, this never ambiguates.

---

## 1a. Where the audio lives — non-negotiable

**Every song that airs on a kJubilee station must exist as a kJubilee-owned copy
under `J:\kjubilee.com\music\` and be served from the `cdn.kjubilee.com` bucket.**

No station manifest may point at another site's CDN or another project's master —
not `cdn.jubileeverse.com`, not a source production tree, not anything outside this
repository. Referencing an upstream copy instead of ingesting one is a defect, even
when the upstream URL resolves and plays.

Two reasons, and the second is the one that bites:

1. **The copies are working masters, not backups.** Repository audio gets processed
   for broadcast — radio-quality mastering and loudness normalisation across the
   catalogue so one track does not blast after another. That work happens on the
   kJubilee copy. A station pointed at an upstream master plays the *un-normalised*
   audio and silently misses every future correction.
2. **Upstream trees move.** They are other projects with their own release cycles.
   A track that plays today can be re-rendered, renamed or retired there tomorrow,
   and the first sign would be dead air mid-rotation.

So the ingest is a **copy**, deliberately duplicating bytes, and the duplication is
the point. Disk is cheap; a station that cannot be mastered is not.

### What this means in practice

| | Correct | Wrong |
|---|---|---|
| Manifest URLs | `/cdn/music/<artist>/<lang>/<album>/HMX….mp3` | `https://cdn.jubileeverse.com/…` |
| `--url-layout` | `canonical` (the default) | `source` — legacy, read-only |
| New catalogue | ingest into `J:\kjubilee.com\music\<artist>\` first | point a station at where it already lives |

`source` layout survives only to read manifests built before this repository
existed. Do not build with it.

---

## 2. The SongID contract

The SongID is the **primary key of the entire music ecosystem**. Radio rotation, play
logs, and analytics all track songs by this value.

- **12 characters, `A-Z` and `0-9`** — 36¹² = 4,738,381,338,321,616,896 combinations.
- **Uniqueness is verified, never assumed.** Before an ID is assigned, the ingest tool
  builds the set of every SongID already in the repository from *two* sources: a walk of
  every `HMX*.mp3` filename on disk, and the registry TSV. A candidate colliding with
  either is discarded and re-rolled.
- **Generated from `os.urandom`,** with rejection sampling (bytes ≥ 252 are discarded)
  so all 36 characters are exactly equiprobable. A naïve `byte % 36` would over-weight
  the first four letters.
- **An assigned SongID is permanent.** It is never re-rolled, even if the song is
  retitled, re-genred, or moved. Re-running the ingest re-uses the existing ID.

### Track identity

A track's stable identity is the tuple **(language, album slug, track number)** — *not*
the song title. This is what the tool keys on when deciding whether it has seen a track
before. A retitled song therefore keeps its SongID and simply gets a new filename; the
old filename is deleted in the same pass so a track never exists twice under two names.

A corollary the tool enforces: **one track number = one song.** If two source files claim
the same track number they would be handed the same SongID, silently breaking the primary
key. The ingest refuses the duplicate with a `WARN` rather than guessing — see §10.

---

## 3. Folder layout

```
J:\kjubilee.com\music\
├─ songid-registry.tsv              <- the SongID ledger (§4)
└─ <artist-slug>\
   └─ <language>\                   <- lowercase ISO 639-1
      └─ <album-slug>\
         ├─ album.json              <- provenance + song descriptions (§6)
         └─ HMX....mp3
```

Concretely:

```
J:\kjubilee.com\music\jubilee-inspire\en\sky-splits-open\HMX2026EN01-...mp3
J:\kjubilee.com\music\jubilee-inspire\ro\piatra-rasturnata\HMX2026RO01-...mp3
J:\kjubilee.com\music\zev-inspire\he\yevarechecha\HMX2026HE01-...mp3
```

**Why language sits above album:** album titles are not unique across languages.
`JEIM1069EN-jubilujah` and `JEIM1069RO-jubilujah` share the slug `jubilujah`, so an
album-only layout would collide. The language tier also matches how radio rotation
selects material.

Languages present: `ar bg br cs da de en es fr he hi hu it ja nl pl pt ro ru sv th tl tr vi zh`.

---

## 4. The SongID registry

`J:\kjubilee.com\music\songid-registry.tsv` — tab-separated, UTF-8, LF line endings,
one row per song, sorted by filename.

| Column | Meaning |
|---|---|
| `SongID` | The 12-char primary key |
| `Filename` | Full canonical filename |
| `Artist` | Artist slug |
| `AlbumCode` | Source catalog code, e.g. `JEIM1001EN` |
| `AlbumSlug` | Album title slug as used in the filename |
| `Track` | Zero-padded track number |
| `Title` | Original song title, **unmodified**, in its native script |
| `Genre` | 4-char genre pair |
| `Year` | Release year |
| `Lang` | Uppercase language code |
| `SlugSource` | How the song slug was produced — `metadata`, `derived`, `override`, or `fallback` |

The registry is the human-readable ledger and the collision-check backstop. It is
rewritten (merged, never truncated) on every ingest run. `Title` preserves the original
Arabic / Hebrew / Cyrillic / kanji / Thai text so a romanized slug is always traceable
back to the real title.

---

## 5. Personas, artist codes, and genres

### Current catalog

| Persona | Code | Genre | Albums | Tracks | Languages |
|---|---|---|---:|---:|---|
| jubilee-inspire | `JUBI` | `CCJP` + 7 per-album overrides | 77 | 916 | bg, cs, en, hi, hu, ja, ro, ru |
| santiago-inspire | `SANT` | `LATL` | 55 | 650 | br, en, es, ro |
| tahoma-inspire | `TAHO` | `INCL` | 53 | 623 | en, ro |
| caleb-inspire | `CALE` | `CCPW` | 50 | 599 | da, de, en, fr, it, pl, pt, ro, tl, vi, zh |
| zev-inspire | `ZEVI` | `MHHC` | 29 | 331 | en, he, ro |
| amir-inspire | `AMIR` | `MEAL` | 25 | 176 | ar, en, hi, ro, tr |
| elias-inspire | `ELIS` | `CWBA` | 21 | 213 | en, ro |
| nova-inspire | `NOVA` | `CEAH` | 20 | 218 | en, ja, nl, ro, sv, th |
| eliana-inspire | `ELIA` | `CFBA` | 19 | 204 | en, ro |
| imani-inspire | `IMAN` | `PCGC` | 16 | 188 | en |
| zariah-inspire | `ZARI` | `ACGS` | 13 | 154 | en, ro |
| melody-inspire | `MELO` | `MPSS` | 2 | 24 | ro |

**Catalogues** — bodies of work that are not a single persona:

| Catalogue | Code | Genre | Albums | Tracks | Mode |
|---|---|---|---:|---:|---|
| torah-sings | `TORA` | `COMH` | 276 | 1,749 | OHI |

Torah Sings is the Bible sung book by book. Thirteen personas perform it, so the
repository artist is the *work* (`torah-sings`), and each track keeps its performing
persona in `album.json` under `performed_by`. It is ingested by its own tool — see §8.

Artist codes follow the pattern the owner set with `JUBI`: the first four letters of the
persona's name. Two exceptions, both forced: **Eliana → `ELIA`** and **Elias → `ELIS`**
would otherwise both be `ELIA`; **Zev → `ZEVI`** because the name is only three letters.
Note the artist code is *not* the source catalog prefix (`JUBI` vs. `JEIM`).

### Genre codes

Two letters for primary, two for secondary, concatenated. All 27 codes are unique.

| Code | Genre | Code | Genre |
|---|---|---|---|
| `AA` | Anthemic Arena Worship | `GW` | Global Worship / World Fusion |
| `AC` | Afro-Caribbean Fusion Worship | `HC` | Hebraic Chant / Modern Fusion |
| `AH` | Ambient Healing / Contemplative Cinematic | `HR` | Hymns Reimagined |
| `AL` | Acoustic Lament | `IN` | Indigenous / Tribal Acoustic |
| `BA` | Bluegrass Americana | `JP` | Jubilee Praise |
| `CC` | Contemporary Christian / Modern Worship Band | `LA` | Latin / Spanish / South American Worship |
| `CE` | Celtic / European Ambient | `ME` | Middle Eastern / Arabic Maqam |
| `CF` | Country Folk | `MH` | Messianic / Hebraic Worship |
| `CG` | Contemporary Gospel | `MP` | Mainstream Pop |
| `CL` | A Cappella Lament | `PC` | Pentecostal / Charismatic Praise |
| `CP` | Celebration Praise | `PW` | Pop-Worship / Acoustic Worship |
| `CW` | Country / Cowboy / Western | `SS` | Singer-Songwriter CCM Pop |
| `GC` | Gospel Choir / Afro-Gospel | `TL` | Theatrical / Liturgical Worship |
| `GS` | Gospel-Soul & Teaching Hymnody | | |

### Genre precedence

1. **`album_genre_overrides`** — keyed by album **prefix + number**, e.g. `"JEIM1034"`.
   Language is stripped so every translation of an album inherits the same genre, while
   the prefix keeps `JEIM1034` and `SAIM1034` from colliding across personas.
2. **`artist_genres`** — the persona's default lane.
3. **`fallback_genre`** — `CCJP`, only if a persona has no entry at all.

**Source of the persona lanes:** `J:\jubilujah.com\music\inspire\persona-music-styles.md`,
the canonical Primary/Secondary style table for the twelve-persona roster. Per-album
overrides come from the `fused_genre` field in `album.meta.json` where it exists — that
is 10 Jubilee albums, and **no album with audio for any other persona**, which is why
the other eleven personas each sit on a single persona-lane code.

**Jubilee is deliberately off-lane.** The persona doc puts Jubilee at Celebration Praise ×
Global Worship, but the owner's original reference filename pinned it to `CCJP`, so
`CCJP` is what the config keeps. Change it there if that decision is revisited — SongIDs
survive a genre rename.

---

## 6. The `album.json` sidecar

One per album folder, written by `build_album_json.py`. It exists so the radio layer
never has to reach back into the jubilujah.com production tree to answer "where did this
come from?" or "what is this track about?".

```jsonc
{
  "schema": "kjubilee.album.v1",
  "album": {
    "album_code": "CAIM1009EN",     // source catalog code
    "album_slug": "healing-wounds",
    "album_title": "Healing Wounds",
    "artist_slug": "caleb-inspire",
    "artist_code": "CALE",
    "language": "EN",
    "year": 2026,
    "genre_code": "CCPW",
    "genre_primary": "Contemporary Christian / Modern Worship Band",
    "genre_secondary": "Pop-Worship / Acoustic Worship",
    "track_count": 12,
    "content_mode": "CCI",              // CCI | OHI — always present
    "content_mode_source": "blueprint", // song-file | lyrics | blueprint | persona-default
    "content_mode_raw": "Default (mainstream Christian — Jesus / Father / Holy Spirit)",
    "content_mode_variant": null,       // e.g. "secular_universal" when declared
    // present when the blueprint / lyrics files carry them:
    "vision": "...", "album_type": "...", "content_mode": "...",
    "target_audience": "...", "release_context": "...", "catalog_position": "...",
    "fused_genre": "...", "theological_anchors": "...", "three_act_arc": "..."
  },
  "source": {
    "copied_from": "J:\\jubilujah.com\\...\\CAIM1009EN-healing-wounds\\tracks",
    "blueprint":   "J:\\jubilujah.com\\...\\lyrics\\blueprint.md",
    "lyrics":      "J:\\jubilujah.com\\...\\lyrics\\Caleb Inspire-Healing Wounds-lyrics.md",
    "album_meta":  "J:\\jubilujah.com\\...\\album.meta.json",
    "ingested_by": "tools/music-ingest/ingest_music.py",
    "described_by":"tools/music-ingest/build_album_json.py",
    "note": "..."
  },
  "tracks": [{
    "song_id": "Z9BMJGXUACM3",
    "track": 1,
    "title": "The Wound Is Still Here",   // original, native script
    "slug": "the-wound-is-still-here",
    "content_mode": "CCI",                 // CCI | OHI — always present
    "content_mode_source": "blueprint",
    "filename": "HMX2026EN01-Z9BMJGXUACM3-CALE-CCPW_healing-wounds_the-wound-is-still-here.mp3",
    "about": "...",                        // <= 1000 chars
    "about_source": "blueprint:subtheme+blueprint:hook",
    "subtheme": "...", "role": "...", "hook": "...",
    "bpm": 68, "key": "D minor", "length": "3:15",
    "chorus": "...", "emotional_arc": "...", "styles": "..."
  }]
}
```

### Content mode — CCI vs OHI

**Every song carries `content_mode`, and it is never absent.** The album carries it too,
but it is stamped on each track so a consumer never has to walk up to the album to know
how a song names God.

| Mode | Meaning |
|---|---|
| `CCI` | Mainstream Christian naming — Jesus / Lord / God / Father / Holy Spirit (or Holy Ghost, or Jesús / Cristo / Padre / Espíritu Santo). The Spirit is "He". Written in source files as `Default`, `CCI / Default`, or `CCI`. |
| `OHI` | Hebraic naming — Yahuah / Yeshua / Ruach HaKodesh, feminine pronouns for the Ruach, Hebrew article rule honored (never "the Ruach HaKodesh"). |

Current split: **351 CCI albums / 3,965 tracks · 29 OHI albums / 331 tracks.** Every OHI
album belongs to `zev-inspire`, the roster's OHI-by-default persona.

**`content_mode_variant`** is set when the declared mode is a named sub-variant that would
otherwise be flattened away — currently `secular_universal` (Melody's pre-evangelistic,
faith-floor-**exempt** records) and `faith_forward`. Both are CCI-family naming, but the
distinction matters downstream, so it is preserved rather than lost.

**`content_mode_raw`** holds the verbatim declared string, so any normalization can be
audited against what the source actually said.

#### Resolution order

`content_mode_source` records which rung supplied the answer:

1. **`song-file`** — a per-song lyric file's own `**Content Mode:**` line.
2. **`lyrics`** — the album lyrics file.
3. **`blueprint`** — the album blueprint.
4. **`persona-default`** — `artist_content_modes` in `catalog-config.json`.

Current resolution: 150 albums from blueprint, 22 from lyrics, 208 from persona default.

#### Divine-name vocabulary is NOT used to infer mode

A declared mode always wins, and an undeclared mode falls back to the persona — the tool
never counts divine names in lyrics to guess. Token counting was tried and rejected: it
misreads translated albums. The Romanian *Jubilujah* record names **Isus** 73 times, which
an English `Jesus` matcher scores as zero CCI evidence, producing a confident and entirely
wrong OHI verdict. Declared modes were validated against vocabulary as a one-off check and
agreed on 168 of 171 albums; the three outliers were token-count noise, not real
disagreements.

#### Adding a persona

`artist_content_modes` must gain an entry for every new persona. If one is missing, the
tool prints a per-album `WARN` and a loud summary block rather than silently applying the
global `CCI` default — an unconfigured OHI persona would otherwise have every one of its
songs mislabelled.

### The `about` field is extracted, never generated

Every description is assembled from text that already exists in the album blueprint or
the lyrics file. Nothing is invented, and `about_source` always records the provenance so
a reader can tell a blueprint-authored subtheme from a chorus excerpt.

Composition order, best material first:

1. `blueprint:subtheme` — the per-track subtheme (usually scripture + concept)
2. `blueprint:core-message` — the track's stated core message
3. `blueprint:function` / `blueprint:role` — cinematic function or act role
4. `lyrics:emotional-arc` — Establish / Escalate / Elevate, from per-song lyric files
5. `blueprint:hook` or `lyrics:chorus` — appended as `Hook: "…"`
6. `lyrics:archetype` — last resort

Capped at **1000 characters**, trimmed at a sentence boundary where possible. Current
coverage is **4,296 / 4,296 tracks (100%)**; longest description 792 chars, mean 263.

### Source format variance

The blueprint and lyrics files were written by several generations of tooling, and the
parser handles all of the observed shapes. If a future album yields no description, it is
almost certainly a new variant of one of these:

| What varies | Forms handled |
|---|---|
| Blueprint track heading | `### Track 1 — "Title"` · `### **Track 1: "Title"**` |
| Lyrics song heading | `SONG TITLE:` · `Song Title:` · `**Song Title:**` |
| Archetype label | `ARCHETYPE:` · `Archetype Slot:` |
| Chorus tag | `[Chorus]` · `[CHORUS]` · `[Chorus — Double]` · `[Chorus 1]` |
| Chorus body | Leading production cues (`[Hammond]`, `[clap+stomp]`) skipped before lyrics |
| Lyrics file layout | One album file · one file per song (richer: emotional arc, BPM, key) |
| Per-song file naming | Translated albums may keep the **original language's** album code, so matching is prefix+number, language-agnostic |

---

## 7. Slug generation

Applied to both album titles and song titles. Deterministic and idempotent.

1. **Transliterate** non-Latin script to ASCII (see below).
2. **Strip diacritics** via Unicode NFD decomposition, dropping combining marks.
   Letters NFD does not decompose (`ő ű ů đ ł ø æ ß`) go through an explicit map.
3. **Delete apostrophes** — `'`, `’`, `ʼ`, `` ` `` vanish rather than becoming a
   separator, so *He's Descending Now* → `hes-descending-now`, not `he-s-...`.
4. **Lowercase**, then replace every run of non-`[a-z0-9]` with a single `-`.
5. **Trim** leading and trailing `-`.

*Maranatha, Come* → `maranatha-come` · *Piatra Răsturnată* → `piatra-rasturnata` ·
*Milost vešla dovnitř* → `milost-vesla-dovnitr`

### Song slug precedence

1. **`song_slug_overrides`** in the config — hand-authored, keyed `<ALBUM_CODE>/<track>`.
2. **`track_slug` from `album.meta.json`** — preserves the editorial slugs already
   established in the jubilujah catalog.
3. **Derived** from the source filename by the rules above.
4. **Fallback** `<album-slug>-<track>` if the result would not be pure ASCII. This
   emits a `WARN` — the correct fix is to add an override, not to ship the fallback.

Current split across the 4,296 tracks: 2,678 derived, ~1,500 from metadata, 128 override.

Some metadata generations prefix `track_slug` with its own track number
(`01-throne-room-multitude`). The tool strips that prefix, but only when the leading
number equals the track number — so a genuine title like *7 Trumpets* survives intact.

### Transliteration

| Script | Approach |
|---|---|
| Latin + diacritics (RO, CS, HU, PL, PT, DA, DE, FR, IT, SV, NL, TL, VI, TR, ES, BR) | NFD decomposition + explicit map |
| Russian (RU) | BGN/PCGN-flavoured table. `ц→ts`, `х→kh`, `щ→shch`, `ъ ь→∅` |
| Bulgarian (BG) | Same base, but `ц→c`, `щ→sht`, `х→h`, `ъ→a` |
| Arabic (AR), Hebrew (HE), Chinese (ZH), Japanese (JA), Thai (TH) | **Hand-authored** in `song_slug_overrides` |

**Why Bulgarian differs from Russian:** the existing catalog folder for
*Спасителят царува* is `spasitelyat-caruva` — `ц→c`, not `ts`. The table follows the
house convention already in the source tree rather than imposing a different standard.

**Why five scripts are hand-authored:** Arabic and Hebrew source titles are fully
vowelled and *could* be table-transliterated, but they sit alongside Chinese, Japanese and
Thai, which cannot be — Chinese needs a pinyin dictionary, Japanese mixes furigana-glossed
kanji (`父（ちち）の日`) with bare kanji (`走り寄る父`), and Thai needs syllable
segmentation. All 128 titles across these 11 albums are romanized by hand and pinned in
the config: Arabic and Hebrew by their vocalization, Chinese in Hanyu Pinyin without
tones, Japanese in Hepburn, Thai in RTGS. **Any future non-Latin album needs the same
treatment** — the tool emits a `WARN` and falls back rather than silently producing a bad
slug.

---

## 8. Running an ingest

```bash
cd w:\kJubilee.com\tools\music-ingest

# 1. Always dry-run first — prints every filename it would write, copies nothing.
python ingest_music.py --artist jubilee-inspire --dry-run

# 2. Then commit.
python ingest_music.py --artist jubilee-inspire

# 3. Then refresh the sidecars.
python build_album_json.py --artist jubilee-inspire

# One album only.
python ingest_music.py --artist jubilee-inspire --album JEIM1001EN-sky-splits-open

# Non-default roots.
python ingest_music.py --artist jubilee-inspire \
    --src-root "J:\jubilujah.com\music\inspire" --dest-root "J:\kjubilee.com\music"
```

**Run one persona at a time, sequentially.** Each run reads the registry written by the
previous one; running two concurrently would let both hand out the same SongID.

**The run is idempotent and safe to repeat.** Re-running:

- re-uses every existing SongID (identity = language + album slug + track number);
- skips any file already present at the same byte size;
- renames in place, deleting the stale filename, if the genre code or title changed;
- merges the registry rather than truncating it;
- rewrites `album.json` from scratch (it is a derived artifact — never hand-edit it).

**Source is read-only.** Nothing under `J:\jubilujah.com` is ever modified.

### Ingesting Torah Sings

Torah Sings (`J:	orahsings.com`) is organised by book of the Bible, not by
artist and album, so `ingest_music.py`'s tree walk does not fit it. It ships a
machine-written `catalog-manifest.json` naming every album, track, performer and
audio file, and `ingest_torahsings.py` reads that as the source of truth:

```bash
python ingest_torahsings.py --dry-run
python ingest_torahsings.py
python ingest_torahsings.py --book 19_Psalms
```

Both tools write the same HMX filenames into the same `songid-registry.tsv`, so
SongID uniqueness holds across every catalogue. This tool writes its own
`album.json` (the manifest is richer than anything the generic sidecar builder
could reconstruct) — do **not** run `build_album_json.py` over `torah-sings`.

Album title slugs are not unique across 276 albums — *New Heavens and a New Earth*
appears in two books — so a colliding slug gains a book suffix.

### Checklist for a new persona

1. Add the artist slug → 4-char code to `artist_codes` in `catalog-config.json`.
2. Add the persona's lane to `artist_genres`, using `persona-music-styles.md`. If the
   lane needs a genre code that does not exist yet, add it to `genre_codes` first and
   check it does not collide with the 27 already in use.
3. Add the persona to `artist_content_modes` (`CCI` or `OHI`). Skipping this makes
   `build_album_json.py` warn loudly and fall back to `CCI`, which is wrong for an OHI
   persona.
4. Dry-run and read the output for `WARN` lines and for slugs that look wrong.
5. Add `song_slug_overrides` for any non-Latin titles the tool cannot romanize.
6. Add `album_genre_overrides` (keyed `PREFIX+NUMBER`) for any album off the lane.
7. Dry-run again, then run for real, then run `build_album_json.py`.
8. Confirm `SongID collisions in this run: 0`, that no persona is reported missing a
   content mode, and spot-check the registry.

### Only audio that exists is ingested

The tool ingests an album only if `<album>/tracks/*.mp3` is non-empty. Most of the
jubilujah catalog is `lyrics_only_pending_audio` — of roughly 900 Inspire Family album
folders, 380 have audio. The rest are silently passed over and will be picked up
automatically once their audio lands, with no change to already-assigned SongIDs.

---

## 8. One station, one language — non-negotiable

**A station broadcasts in exactly one language.** `language` in a station
definition must always name a language; it must never be `null` or "all".

This is an audience rule, not a tidiness rule. A listener tuned to an English
station who hits a Romanian track does not hear range — they hear a station that
broke, and they retune. The cost of mixing is paid immediately and by the people
you were trying to reach.

The catalogue is deep in more than twenty languages *precisely so each can have
its own frequency*. A track in another language is never "extra content" for an
existing station; it is the seed of that language's station.

### How to add a language

Build a language edition: same pool, same `select`, different `language`, its own
station id and mount. The manifest and playlist tooling need no changes.

### Check before launching a language

Not every language has enough material to sustain a rotation. Counts are in
`songid-registry.tsv` — group by `Lang`:

| Tracks | Verdict |
|---:|---|
| 300+ | full rotation |
| 150–299 | workable, noticeably repetitive |
| 60–149 | marginal — repeats roughly every four hours |
| under 60 | not a station yet |

A 24-track language is about 90 minutes of audio. On air that repeats six times
in a working day, which is worse for the listener than not launching at all.

### Verifying it

Every filename carries its language, so a playlist can be checked directly:

```bash
grep -o 'HMX[0-9]\{4\}[A-Z]\{2\}' <mount>-a.m3u | sort -u
```

More than one result is a defect.

---

## 8a. Putting a station on air as a live Icecast mount

A manifest makes a station *playable in a browser*. A **live stream** — every
listener hearing the same track at the same moment — is a Liquidsoap source
broadcasting to an Icecast mount. The engine lives on the production host at
`/opt/jubilee-radio` (Docker Compose project `jubilee-radio-prod`: `icecast`,
`liquidsoap`, `api`, `postgres`, `caddy`).

Note the Icecast serving these mounts runs **inside that compose stack**. The
host also has an `icecast2.service` unit, and it is `failed` — that unit is not
what is on air, so debugging there is a dead end.

### The five pieces

| Piece | Where |
|---|---|
| Station script | `/opt/jubilee-radio/infra/liquidsoap/stations/<slug>.liq` |
| Include line | `/opt/jubilee-radio/infra/liquidsoap/main.liq` |
| Playlist pair | `/opt/jubilee-radio/storage/playlists/<slug>-a.m3u` and `-b.m3u` |
| Silent fallback | `/opt/jubilee-radio/storage/broadcast/fallback/<slug>-silent.mp3` |
| Site constant | `STREAM_<NAME>` in `public/radio.html`, set as the station's `streamUrl` |

### Procedure

```bash
# 1. Manifest (canonical layout — never `source`).
node tools/build-station-manifest.js --station HM305.40-EN

# 2. Playlist pair, absolute cdn.kjubilee.com URLs with real durations.
node tools/build-station-playlist.js --station HM305.40-EN --out-dir ./out

# 3. Copy playlists, the .liq, and a silent fallback to the radio host, then
#    add `%include "stations/<slug>.liq"` to main.liq and restart Liquidsoap.
```

**Order matters.** Do not add the include until the audio is actually on
`cdn.kjubilee.com` — the playlist is a list of HTTPS URLs, so enabling a station
whose tracks are not uploaded yet puts a mount on air that 404s every entry and
falls through to silence.

### The hot-swap pair

Each station runs two playlist slots. Liquidsoap plays one while the other is
rewritten, and `<slug>.swap` on the telnet port (1234) cuts to the fresh slot
with a crossfade. `<slug>.active_slot` reports which is live. For a first
provision write both slots identically; for a live update write the **inactive**
slot and then swap, so listeners never hear a gap.

### Playlists point at the CDN, not at local files

Entries are `https://cdn.kjubilee.com/music/...` rather than paths under
`/songs`. The broadcast then plays exactly the bytes listeners stream — one
copy, mastered once. A local second copy would be a place for the two to
diverge, and §1a applies to playlists as strictly as to manifests: never point
one at another project's CDN.

---

## 9. Verifying repository integrity

```bash
M=/j/kjubilee.com/music

# Every SongID unique across the whole repository?
find $M -name 'HMX*.mp3' -printf '%f\n' \
  | sed -n 's/.*-\([A-Z0-9]\{12\}\)-[A-Z0-9]\{4\}-[A-Z]\{4\}_.*/\1/p' \
  | sort | uniq -d
# (no output = no duplicates)

# Registry row count matches file count?
echo $(( $(wc -l < $M/songid-registry.tsv) - 1 )); find $M -name 'HMX*.mp3' | wc -l

# Any file that does not match the canonical format?
find $M -name '*.mp3' -regextype posix-extended \
  ! -regex '.*/HMX[0-9]{4}[A-Z]{2}[0-9]{2}-[A-Z0-9]{12}-[A-Z0-9]{4}-[A-Z]{4}_[a-z0-9-]+_[a-z0-9-]+\.mp3'

# Sidecars valid, complete, and pointing at files that exist?
python - <<'PY'
import io, json, os
root = r"J:\kjubilee.com\music"
for dp, _, fs in os.walk(root):
    if "album.json" not in fs: continue
    d = json.load(io.open(os.path.join(dp, "album.json"), encoding="utf-8"))
    for t in d["tracks"]:
        assert os.path.exists(os.path.join(dp, t["filename"])), t["filename"]
        assert t["about"] and len(t["about"]) <= 1000, t["song_id"]
        assert t["content_mode"] in ("CCI", "OHI"), t["song_id"]
print("sidecars OK")
PY
```

---

## 10. Decisions on record

| Decision | Choice | Rationale |
|---|---|---|
| Folder tier order | `artist / language / album` | Album slugs collide across languages (`jubilujah` EN + RO); language tier also matches rotation selection. |
| Year when `release_date` is null | `2026` | Every album in the source carries `release_date: null`. Configurable via `default_year`. |
| Genre source | `persona-music-styles.md` | The canonical Primary/Secondary style table for the 12-persona roster; no album with audio outside Jubilee carries a `fused_genre`. |
| Genre override key | Album **prefix + number** | Translations inherit the parent album's genre; `JEIM1034` and `SAIM1034` stay distinct across personas. |
| Jubilee's genre | `CCJP`, off its persona lane | The owner's original reference filename pinned it. |
| Artist codes | First 4 letters of the persona name | Matches the owner's `JUBI`. `ELIA`/`ELIS` and `ZEVI` are forced exceptions. |
| Non-Latin song slugs | Romanized | Keeps the song title legible in the filename; the native title is preserved in the registry `Title` column and in `album.json`. |
| Bulgarian `ц` | `c`, not `ts` | Follows the existing catalog slug `spasitelyat-caruva`. |
| AR/HE/ZH/JA/TH slugs | Hand-authored | No offline dictionary for pinyin, kanji readings, or Thai segmentation. |
| Content mode on every track | Stamped per song, not only per album | A consumer must never have to walk up to the album to know how a song names God. |
| Inferring mode from lyrics | Rejected | Divine-name token counting misreads translated albums — Romanian "Isus" scores zero against an English "Jesus" matcher. Declared mode wins; persona default fills gaps. |
| Unconfigured persona mode | Warn loudly, never silently default | An unconfigured OHI persona would otherwise have every song mislabelled `CCI`. |
| `about` text | Extracted only | A generated description would be an unverifiable claim about a song nobody has listened to. `about_source` records provenance. |
| Duplicate track numbers | Refuse, warn, do not guess | Two files sharing a track number would share a SongID and break the primary key. |
| ID randomness | `os.urandom` + rejection sampling | Uniform across all 36 characters; `% 36` alone would bias A–D. |

---

## 11. Open items

- **`THIM1037EN` track 09 is unresolved.** *Both Ends of the Circle* has two track-09
  files — `09 First Word, Last Word.mp3` and `09 First Word, Last Word (1).mp3`, different
  sizes — and **no track 10**. The `(1)` file is almost certainly the real track 10, but
  guessing would assign it a wrong track number permanently. Only the canonical `09` file
  was ingested; the album holds 11 tracks. **Fix at the source** by renumbering, then
  re-run the ingest — it will pick the file up and assign it a fresh SongID.
- **Non-Latin romanization is unreviewed.** 128 hand-authored slugs across Arabic (2
  albums), Hebrew (2), Chinese (2), Japanese (3), Thai (2), plus machine-transliterated
  Bulgarian (1) and Russian (2). No native speaker has checked them. The native titles are
  preserved in the registry and sidecars, so any slug can be corrected and re-run without
  disturbing SongIDs.
- **Genre granularity.** Eleven personas sit on a single persona-lane code because no
  per-album genre data exists for them. As albums are classified, add
  `album_genre_overrides` entries and re-run.
- **Remaining artists.** `kingdom-pulse` and `radiant-stones` have codes reserved in
  `catalog-config.json` but have not been ingested; they are outside the 12-persona
  Inspire Family roster.
- **Rotation / playlist layer.** `J:\kjubilee.com\radio\` is still empty — out of scope
  for this spec.
