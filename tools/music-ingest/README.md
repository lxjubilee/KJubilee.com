# music-ingest

Copies album audio from the jubilujah.com production tree into the kjubilee.com radio
repository, renaming every track to the canonical Radio Song ID format with a
verified-unique 12-character SongID, then writes an `album.json` sidecar per album.

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

4,296 tracks · 380 albums · 12 Inspire Family personas · 25 languages, at
`J:\kjubilee.com\music\`. Every track has a description; every SongID is unique.

## Adding a persona

Add its 4-char code to `artist_codes` and its lane to `artist_genres`, dry-run, resolve
any `WARN` lines with `song_slug_overrides`, then run for real and rebuild sidecars.

**Full specification, field definitions, format-variance notes, and decision rationale:**
[`docs/MUSIC-REPOSITORY-SPEC.md`](../../docs/MUSIC-REPOSITORY-SPEC.md)
