# Party Giggles — source inventory

**Recorded 2026-08-21**, after the duplicate clean-up, from
`J:\jubilujah.com\music\children\party-giggles`.

The machine-readable record is [`party-giggles.tsv`](party-giggles.tsv): one row
per file with its byte size and SHA-256. This page is what those numbers mean.

**Verify the tree still matches before any ingest:**

```bash
python tools/music-inventory.py --verify docs/inventory/party-giggles.tsv
```

Exit 0 means the tree is byte-for-byte what was recorded here. Exit 1 lists
every file that went missing, appeared, or changed, and flags any album that has
newly acquired a duplicate track number.

## What is there

**43 album folders · 30 hold audio · 379 mp3 · 1.31 GB**

| State | Albums | Tracks | Ingestible |
|---|---|---|---|
| Clean, 12 tracks each | 27 | 324 | yes |
| Clean, 14 tracks (`IX410EN`) | 1 | 14 | yes |
| **Duplicate track numbers** | **2** | **41** | **no — see below** |
| **Empty — never populated** | **13** | **0** | nothing to ingest |
| **Total** | **43** | **379** | **338 ready** |

## The two albums that are still blocked

These were missed in the clean-up. Two files still claim one track number, which
the ingest refuses to guess past — `MUSIC-REPOSITORY-SPEC.md` §2: *one track
number = one song*.

| Album | Files | Duplicated numbers |
|---|---|---|
| `IX429EN-fireflies-flourish-bright` | 24 | **1–12, every one doubled** — untouched by the clean-up |
| `IX430EN-nala-the-donkey` | 17 | 4, 5, 6, 8, 9 |

Clearing these releases **41 more tracks**, taking the catalogue to 379 of 379.

## The 13 empty albums are not a deletion

`IX431EN` through `IX443EN` hold a `tracks/` folder with nothing in it but
`desktop.ini`. **This predates the clean-up and is not damage:** each one's
`album.meta.json`, last written **2026-05-30**, already records
`"track_count": 0`, and the folders were last touched 2026-07-27 — weeks before
the deletion. The audio for these was never produced.

They expect 12 tracks each, so **156 songs exist as metadata with no audio
behind them**. Worth knowing before anyone reads "43 albums" as a promise.

```
IX431EN-zahara-the-camel            IX438EN-tiny-the-fireplace-sparrow
IX432EN-shiloh-the-shepherd-pup     IX439EN-grumble-the-mountain-goat
IX433EN-mira-the-barn-cat           IX440EN-whispa-the-snowy-owl
IX434EN-grumpy-the-old-goat         IX441EN-snip-the-white-rabbit
IX435EN-libi-the-little-lamb        IX442EN-sheba-the-little-lamb
IX436EN-sheva-the-stable-dove       IX443EN-aurora-the-arctic-fox
IX437EN-minetta-the-church-mouse
```

## What the clean-up did

Thirteen album folders were modified on 2026-08-21. Twelve came out at exactly
12 tracks; `IX410EN-hard-hydes-stomp` came out at 14, which is **correct** — its
files are numbered 1–14 with no repeats and its own metadata says
`track_count: 14`. The `expected_track_count: 12` on every album in this
catalogue is a default, not a target.

```
IX401EN  IX402EN  IX403EN  IX404EN  IX405EN  IX406EN  IX407EN
IX409EN  IX410EN  IX411EN  IX412EN  IX413EN  IX418EN
```

135 files were removed: 514 → 379.

## Why this file exists

This tree is hand-curated and lives on a share that other machines and the
sibling site `gopartygiggles.com` also hold copies of. A later sync from a backup
can silently undo the clean-up — the duplicates return, numbering doubles again,
and nothing announces it. The ingest would then refuse the album, or take a file
nobody meant to publish.

The SHA-256 column is what makes `--verify` meaningful: sizes alone would miss a
same-length substitution.

## Next

1. Renumber `IX429EN` and `IX430EN` at the source, then re-run the scan to
   refresh this inventory.
2. Ingest into `J:\kjubilee.com\music\party-giggles\` — this catalogue has an
   album-code shape (`IX401EN`) that `ingest_music.py`'s `ALBUM_RE` does not yet
   match, and needs an `artist_codes` entry and a genre lane in
   `catalog-config.json`.
3. Point HM 361.90 at the ingested result and activate it.
