#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ingest the Torah Sings catalogue into the kJubilee radio repository.

Torah Sings (J:\\torahsings.com) is organised by book of the Bible rather than by
artist and album, so it does not fit ingest_music.py's <artist>/<ALBUMCODE>/tracks
layout. What it has instead is better: a machine-written `catalog-manifest.json`
that already names every album, song, track number, performing persona and audio
file. This tool reads that manifest as the source of truth and hands the result to
the same naming and SongID machinery every other ingest uses.

    ingest_music.py  ->  filesystem walk of the jubilujah tree
    this tool        ->  catalog-manifest.json of the torahsings tree
    both             ->  the same HMX filename, the same songid-registry.tsv

The performing artist varies per track (13 Inspire Family personas sing this
catalogue), but the repository artist is `torah-sings` — that is the body of work
and the station. The per-track performer is preserved in album.json.

Usage:
    python ingest_torahsings.py --dry-run
    python ingest_torahsings.py
    python ingest_torahsings.py --book 19_Psalms
"""

import argparse
import io
import json
import os
import re
import shutil
import sys

import ingest_music as base

SRC_ROOT = r"J:\torahsings.com"
DEST_ROOT = r"J:\kjubilee.com\music"
ARTIST_SLUG = "torah-sings"
LANG = "EN"
CONFIG = base.CONFIG

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass


ABOUT_LIMIT = 1000


def cap(text, limit=ABOUT_LIMIT):
    """Trim to the sidecar's description budget, preferring a sentence break."""
    if not text:
        return None
    text = " ".join(str(text).split()).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit - 1]
    for sep in (". ", "; ", " "):
        i = cut.rfind(sep)
        if i > limit * 0.6:
            return cut[:i + (1 if sep == ". " else 0)].strip() + "…"
    return cut.strip() + "…"


def load_manifest(src_root):
    path = os.path.join(src_root, "catalog-manifest.json")
    with io.open(path, encoding="utf-8-sig") as fh:
        return json.load(fh)


def album_key(album):
    """Language-independent album key for genre overrides: prefix + digits."""
    m = re.match(r"^([A-Z]+?)(\d+)([A-Z]{2})$", album["code"])
    return (m.group(1) + m.group(2)) if m else album["code"]


def main():
    ap = argparse.ArgumentParser(description="Ingest Torah Sings into the kJubilee repository.")
    ap.add_argument("--dry-run", action="store_true", help="print the plan without copying")
    ap.add_argument("--book", help="limit to one book directory, e.g. 19_Psalms")
    ap.add_argument("--src-root", default=SRC_ROOT)
    ap.add_argument("--dest-root", default=DEST_ROOT)
    opts = ap.parse_args()

    with io.open(CONFIG, encoding="utf-8") as fh:
        cfg = json.load(fh)
    artist_code = cfg["artist_codes"].get(ARTIST_SLUG)
    if not artist_code:
        raise SystemExit("No artist_code for '%s' in catalog-config.json" % ARTIST_SLUG)
    year = cfg.get("default_year", 2026)
    default_genre = cfg.get("artist_genres", {}).get(ARTIST_SLUG) or cfg["fallback_genre"]

    manifest = load_manifest(opts.src_root)
    books = manifest["music"]["books"]

    registry_path = os.path.join(opts.dest_root, "songid-registry.tsv")
    used, assigned = base.scan_existing(opts.dest_root)
    for row in base.load_registry(registry_path):
        if row and row[0]:
            used.add(row[0])
    print("Existing SongIDs in repository: %d" % len(used))

    # Album title slugs are not unique across 285 albums ("New Heavens and a New
    # Earth" appears in two books), and the destination folder is the slug. Work
    # out the collisions up front and disambiguate with the book name, so no two
    # albums can ever land in the same folder.
    slug_counts = {}
    for book in books:
        for album in book["albums"]:
            if album.get("songsWithAudio"):
                s = base.slugify(album["title"])
                slug_counts[s] = slug_counts.get(s, 0) + 1
    collisions = set(s for s, n in slug_counts.items() if n > 1)
    if collisions:
        print("Album slugs needing a book suffix: %s" % ", ".join(sorted(collisions)))

    rows, copied, album_docs = [], 0, []
    skipped_no_audio = 0

    for book in books:
        if opts.book and book["id"] != opts.book:
            continue
        for album in book["albums"]:
            songs = [s for s in album["songs"] if s.get("hasAudio") and s.get("audio")]
            if not songs:
                skipped_no_audio += 1
                continue

            album_slug = base.slugify(album["title"])
            if album_slug in collisions:
                album_slug = album_slug + "-" + base.slugify(album["bookName"])
            genre = cfg["album_genre_overrides"].get(album_key(album), default_genre)
            dest_dir = os.path.join(opts.dest_root, ARTIST_SLUG, LANG.lower(), album_slug)

            print("  %-13s %-2s %-34s -> %s (%d tracks)"
                  % (album["code"], book["number"], album["title"][:34], album_slug[:34], len(songs)))

            tracks_doc = []
            claimed = {}
            for song in sorted(songs, key=lambda s: s["trackNumber"]):
                track_num = "%02d" % int(song["trackNumber"])
                if track_num in claimed:
                    print("    WARN duplicate track %s in %s -- NOT ingested: %s"
                          % (track_num, album["code"], song["title"]))
                    continue
                claimed[track_num] = True

                song_slug = base.slugify(song["title"])
                if not base.is_ascii_slug(song_slug):
                    print("    WARN non-ASCII slug for %s -> falling back" % song["title"])
                    song_slug = "%s-%s" % (album_slug, track_num)

                key = (LANG, album_slug, track_num)
                song_id = assigned.get(key)
                if song_id is None:
                    song_id = base.generate_song_id(used)
                    assigned[key] = song_id

                new_name = "HMX%s%s%s-%s-%s-%s_%s_%s.mp3" % (
                    year, LANG, track_num, song_id, artist_code, genre, album_slug, song_slug)
                src_path = os.path.join(opts.src_root, song["audio"]["file"].replace("/", os.sep))
                dest_path = os.path.join(dest_dir, new_name)

                rows.append([song_id, new_name, ARTIST_SLUG, album["code"], album_slug, track_num,
                             song["title"], genre, str(year), LANG, "manifest"])
                tracks_doc.append({
                    "song_id": song_id,
                    "track": int(song["trackNumber"]),
                    "title": song["title"],
                    "slug": song_slug,
                    "content_mode": "OHI",
                    "content_mode_source": "artist-default",
                    "filename": new_name,
                    # The performing persona varies per track across this catalogue.
                    "performed_by": song.get("artist"),
                    "lead_voices": song.get("leadVoices") or None,
                    "vocal_gender": song.get("vocalGender"),
                    "about": cap(song.get("archetype")),
                    "about_source": "manifest:archetype",
                    "styles": cap(song.get("styles"), 600),
                    "length": (song.get("audio") or {}).get("duration"),
                    "duration_s": round((song.get("audio") or {}).get("durationSeconds") or 0) or None,
                    "source_file": song["audio"]["file"],
                })

                if opts.dry_run:
                    continue
                if not os.path.isdir(dest_dir):
                    os.makedirs(dest_dir)
                for existing in os.listdir(dest_dir):
                    em = base.HMX_RE.match(existing)
                    if em and em.group("songid") == song_id and existing != new_name:
                        os.remove(os.path.join(dest_dir, existing))
                        print("    RENAMED from %s" % existing)
                if not os.path.exists(src_path):
                    print("    ERROR source audio missing: %s" % src_path)
                    continue
                if os.path.exists(dest_path) and os.path.getsize(dest_path) == os.path.getsize(src_path):
                    continue
                shutil.copyfile(src_path, dest_path)
                copied += 1

            album_docs.append((dest_dir, {
                "schema": "kjubilee.album.v1",
                "album": {
                    "album_code": album["code"],
                    "album_slug": album_slug,
                    "album_title": album["title"],
                    "artist_slug": ARTIST_SLUG,
                    "artist_code": artist_code,
                    "artist_name": "Torah Sings",
                    "language": LANG,
                    "year": year,
                    "genre_code": genre,
                    "genre_primary": cfg["genre_codes"].get(genre[:2]),
                    "genre_secondary": cfg["genre_codes"].get(genre[2:]),
                    "track_count": len(tracks_doc),
                    "content_mode": "OHI",
                    "content_mode_source": "artist-default",
                    "book": album.get("bookName"),
                    "book_number": album.get("bookNumber"),
                    "fused_genre": (album.get("lyricsFile") or {}).get("fusion"),
                    "production_status": album.get("productionStatus"),
                },
                "source": {
                    "copied_from": os.path.join(opts.src_root, album["directory"].replace("/", os.sep), "tracks"),
                    "catalog_manifest": os.path.join(opts.src_root, "catalog-manifest.json"),
                    "lyrics": (os.path.join(opts.src_root, album["lyricsFile"]["file"].replace("/", os.sep))
                               if album.get("lyricsFile") else None),
                    "ingested_by": "tools/music-ingest/ingest_torahsings.py",
                    "note": ("Audio copied verbatim from the Torah Sings production tree and renamed to the "
                             "canonical Radio Song ID format. Album, track and performer facts are taken from "
                             "that project's catalog-manifest.json, not re-derived. See "
                             "docs/MUSIC-REPOSITORY-SPEC.md."),
                },
                "tracks": tracks_doc,
            }))

    if not opts.dry_run:
        for dest_dir, doc in album_docs:
            if not os.path.isdir(dest_dir):
                continue
            with io.open(os.path.join(dest_dir, "album.json"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write(json.dumps(doc, indent=2, ensure_ascii=False))

        header = ["SongID", "Filename", "Artist", "AlbumCode", "AlbumSlug", "Track",
                  "Title", "Genre", "Year", "Lang", "SlugSource"]
        by_id = {}
        for r in base.load_registry(registry_path):
            if r and r[0]:
                by_id[r[0]] = r
        for r in rows:
            by_id[r[0]] = r
        with io.open(registry_path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\t".join(header) + "\n")
            for r in sorted(by_id.values(), key=lambda x: x[1]):
                fh.write("\t".join(r) + "\n")
        print("Registry: %s (%d songs)" % (registry_path, len(by_id)))

    ids = [r[0] for r in rows]
    print("\nAlbums ingested: %d | albums with no audio skipped: %d" % (len(album_docs), skipped_no_audio))
    print("Tracks named: %d | files copied: %d" % (len(rows), copied))
    print("SongID collisions in this run: %d" % (len(ids) - len(set(ids))))


if __name__ == "__main__":
    main()
