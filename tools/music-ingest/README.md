# music-ingest

Copies album audio from the production trees into the kjubilee.com radio
repository, renaming every track to the canonical Radio Song ID format with a
verified-unique 12-character SongID, then writes an `album.json` sidecar per album.

Six source trees feed it — jubilujah.com (the twelve personas, and the children's
catalogues beside them), singitdone.com, cornercipher.com, backrowfaith.com and
gospelbymusic.com. Each is registered once, in a map, rather than passed as a flag
every time.

```
HMX2026EN01-7XJ29ZW8X70P-JUBI-CCJP_sky-splits-open_sky-splits-open.mp3
```

## Quick start

```bash
python ingest_music.py    --artist jubilee-inspire --dry-run   # preview, copies nothing
python ingest_music.py    --artist jubilee-inspire             # commit
python build_album_json.py --artist jubilee-inspire            # refresh sidecars
```

Run one persona at a time, **sequentially** — each run reads the registry the previous
one wrote, and two concurrent runs could hand out the same SongID.

Both tools are idempotent. Re-running re-uses existing SongIDs, skips unchanged files,
renames in place if a genre code or title changed, and rewrites sidecars from scratch.
The source tree is never modified.

## Files

| File | Purpose |
|---|---|
| `ingest_music.py` | Copies + renames audio, assigns SongIDs, maintains `songid-registry.tsv`. |
| `build_album_json.py` | Writes `album.json` per album: provenance + per-song descriptions extracted from blueprint and lyrics files. |
| `catalog-config.json` | Artist codes, genre codes, per-persona genre lanes, per-album genre overrides, hand-authored song slugs. **Edit this, not the scripts.** |

Python 3, standard library only.

## Current contents

7,832 tracks · 810 albums · 12 Inspire Family personas plus six catalogues ·
25 languages · 36 genre codes, at `J:\kjubilee.com\music\`. Every track has a
description; every SongID is unique.

## Adding a persona

Add its 4-char code to `artist_codes`, its lane to `artist_genres` and its naming to
`artist_content_modes`, dry-run, resolve any `WARN` lines with `song_slug_overrides`,
then run for real and rebuild sidecars. Skipping `artist_content_modes` does not
fail — it warns and falls back to `CCI`, which is wrong for an OHI persona and wrong
quietly.

## Adding a source tree

Three maps at the top of `ingest_music.py`, in increasing order of how odd the tree is:

| Map | For | Example |
|---|---|---|
| `ARTIST_ROOTS` | `<root>/<artist>/<album>`, new root only | `marcus-reed` → `J:\cornercipher.com\music` |
| `ARTIST_TREES` | no artist tier, or an extra tier | `gospel-by-music` → `J:\gospelbymusic.com\music`, `depth: 2` |
| `ARTIST_LANG` | folder names carry no language code | `tiny-tiggles` → `EN` |

`ARTIST_TREES` is read by `build_album_json.py` too, by import rather than by copy —
the two tools disagreeing about where an album lives once nulled 381 sidecars'
descriptions in a single silent run.

Write a dedicated ingester only when the source carries more than a tree walk can
read; `ingest_torahsings.py` earns it with a manifest naming every performer.

**Full specification, field definitions, format-variance notes, and decision rationale:**
[`docs/MUSIC-REPOSITORY-SPEC.md`](../../docs/MUSIC-REPOSITORY-SPEC.md)
