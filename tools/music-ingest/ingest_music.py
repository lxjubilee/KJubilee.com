#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kJubilee.com Music Radio Song Repository - ingest tool.

Copies album tracks out of the jubilujah.com production tree into the kjubilee.com
radio repository, renaming every file to the canonical Radio Song ID format:

    HMX[YEAR][LANG][TRACK]-[SONGID]-[ARTISTCODE]-[PRIMARY][SECONDARY]_[album]_[song].mp3

SongIDs are 12 chars of A-Z0-9, generated from os.urandom and verified unique
against every SongID already present in the repository (registry + on-disk
filenames) before being assigned. Re-running is safe: an already-ingested track
keeps the SongID it was first given.

Usage:
    python ingest_music.py --artist jubilee-inspire            # ingest everything
    python ingest_music.py --artist jubilee-inspire --dry-run  # preview only
    python ingest_music.py --artist jubilee-inspire --album JEIM1001EN-sky-splits-open

See docs/MUSIC-REPOSITORY-SPEC.md for the full format definition.
"""

import argparse
import io
import json
import os
import re
import shutil
import sys
import unicodedata

# Track titles arrive in Arabic, Hebrew, Thai, Chinese, Japanese and Cyrillic. The
# Windows console defaults to cp1252, which cannot encode them, so printing a warning
# about a title would itself crash. Force UTF-8 on the streams we print to.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass

SRC_ROOT = r"J:\jubilujah.com\music\inspire"
DEST_ROOT = r"J:\kjubilee.com\music"
CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "catalog-config.json")

ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
ID_LENGTH = 12

# Album folders look like JEIM1001EN-sky-splits-open  ->  code / number / lang / slug
#
# The prefix and number are RANGES, not fixed widths. The Inspire personas all
# use four letters and four digits (JEIM1001EN), but the children's catalogues
# do not: Party Giggles is IX401EN — two letters, three digits. Widening the
# pattern was checked against all 756 album folders in both trees and changes
# how none of them parse; greedy matching still splits JEIM1001EN exactly as
# before. A folder that does not match is skipped with a message, so the cost of
# being too narrow was silent invisibility rather than an error.
#
# THE LANGUAGE SUFFIX IS OPTIONAL, and only usable with --lang. A third
# catalogue shape arrived with My Tiny Tiggles: TTX301-penguino-s-palooza, which
# carries no language at all where JEIM1001EN and IX401EN both do. Requiring one
# meant all thirty-two of its albums failed to parse.
#
# Optional rather than defaulted, and inert without --lang, because a folder
# with no language is genuinely ambiguous: the tool cannot know whether
# TTX301 is English or the Romanian edition of the same record. Silently
# assuming EN would file a translated album under the wrong language and every
# language-filtered station would then carry it. So an unlanguaged folder is
# only ingested when the caller says which language it is, and is otherwise
# skipped by name and reported.
#
# Previously-matching folders parse identically: the optional group only comes
# into play where the old pattern failed outright, and the greedy prefix still
# splits JEIM1001EN exactly as before (verified against both trees).
ALBUM_RE = re.compile(
    r"^(?P<code>(?P<prefix>[A-Z]{2,4})(?P<number>\d{3,4})(?P<lang>[A-Z]{2})?)[-_ ](?P<slug>.+)$")
# Track files look like "01 Sky Splits Open.mp3"
# A leading "track-" or "song-" is optional. Two My Tiny Tiggles albums are
# filed that way throughout - TTX312 as song-9-pennys-praise-parade.mp3 and
# TTX322 as track-1-im-a-pelican-praise-the-son.mp3 - and requiring the
# number first skipped both albums entire, fifteen tracks, as unparseable.
# A filename that merely STARTS with those letters is unaffected: after the
# optional word a digit still has to follow, so tracks-of-hope.mp3 fails to
# parse exactly as it did before.
TRACK_RE = re.compile(r"^(?:track|song)?[\s._-]*(?P<num>\d{1,3})[\s._-]+(?P<title>.+)\.mp3$", re.IGNORECASE)
# Already-ingested files: HMX2026EN01-7XJ29ZW8X70P-JUBI-CCJP_album_song.mp3
HMX_RE = re.compile(
    r"^HMX(?P<year>\d{4})(?P<lang>[A-Z]{2})(?P<track>\d{2})-(?P<songid>[A-Z0-9]{12})"
    r"-(?P<artist>[A-Z0-9]{4})-(?P<genre>[A-Z]{4})_(?P<album>[^_]+)_(?P<song>.+)\.mp3$")

# --------------------------------------------------------------------------
# Transliteration
# --------------------------------------------------------------------------

# Latin letters that NFD decomposition does NOT reduce to a bare ASCII letter.
LATIN_SPECIAL = {
    "\u0151": "o", "\u0150": "O",   # o-double-acute  (Hungarian)
    "\u0171": "u", "\u0170": "U",   # u-double-acute  (Hungarian)
    "\u016f": "u", "\u016e": "U",   # u-ring          (Czech)
    "\u0111": "d", "\u0110": "D",   # d-stroke
    "\u0142": "l", "\u0141": "L",   # l-stroke
    "\u00f8": "o", "\u00d8": "O",   # o-slash
    "\u00e6": "ae", "\u00c6": "Ae",
    "\u0153": "oe", "\u0152": "Oe",
    "\u00df": "ss",
    "\u0131": "i",
}

# Russian -> Latin (BGN/PCGN flavoured; matches the existing jubilujah folder slugs,
# e.g. "Slava tronnogo zala", "Venchanie nebes").
RU_MAP = {
    "\u0430": "a", "\u0431": "b", "\u0432": "v", "\u0433": "g", "\u0434": "d",
    "\u0435": "e", "\u0451": "yo", "\u0436": "zh", "\u0437": "z", "\u0438": "i",
    "\u0439": "y", "\u043a": "k", "\u043b": "l", "\u043c": "m", "\u043d": "n",
    "\u043e": "o", "\u043f": "p", "\u0440": "r", "\u0441": "s", "\u0442": "t",
    "\u0443": "u", "\u0444": "f", "\u0445": "kh", "\u0446": "ts", "\u0447": "ch",
    "\u0448": "sh", "\u0449": "shch", "\u044a": "", "\u044b": "y", "\u044c": "",
    "\u044d": "e", "\u044e": "yu", "\u044f": "ya",
}

# Bulgarian -> Latin. Differs from Russian: ts -> c and a hard-vowel yer, following
# the existing folder slug "spasitelyat-caruva" for "Spasitelyat tsaruva".
BG_MAP = dict(RU_MAP)
BG_MAP.update({
    "\u0446": "c",       # ts -> c   (per existing catalog convention)
    "\u0449": "sht",
    "\u044a": "a",       # hard sign is a vowel in Bulgarian
    "\u0445": "h",
})


def translit_cyrillic(text, table):
    out = []
    for ch in text:
        lower = ch.lower()
        out.append(table[lower] if lower in table else ch)
    return "".join(out)


def strip_diacritics(text):
    text = "".join(LATIN_SPECIAL.get(ch, ch) for ch in text)
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def slugify(text, lang=None):
    """Title -> lowercase ASCII slug, spaces and punctuation collapsed to '-'."""
    if lang == "RU":
        text = translit_cyrillic(text, RU_MAP)
    elif lang == "BG":
        text = translit_cyrillic(text, BG_MAP)
    text = strip_diacritics(text)
    # Apostrophes vanish rather than becoming a separator: "He's" -> "hes"
    text = re.sub("['\u2018\u2019\u02bc\u0060]", "", text)
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return re.sub(r"-{2,}", "-", text).strip("-")


def is_ascii_slug(s):
    return bool(s) and re.match(r"^[a-z0-9-]+$", s) is not None


# --------------------------------------------------------------------------
# SongID generation
# --------------------------------------------------------------------------

def generate_song_id(used):
    """Rejection-sampled uniform 12-char ID, retried until globally unique."""
    while True:
        raw = os.urandom(ID_LENGTH * 3)
        chars = [ID_ALPHABET[b % 36] for b in raw if b < 252][:ID_LENGTH]
        if len(chars) < ID_LENGTH:
            continue
        candidate = "".join(chars)
        if candidate not in used:
            used.add(candidate)
            return candidate


def scan_existing(dest_root):
    """Harvest every SongID already in the repository, keyed for re-use.

    Returns (used_ids, assigned) where `assigned` maps the stable track identity
    (lang, album_slug, track_number) -> SongID, so a re-ingest never re-rolls an
    ID that is already published.
    """
    used, assigned = set(), {}
    if not os.path.isdir(dest_root):
        return used, assigned
    for dirpath, _dirnames, filenames in os.walk(dest_root):
        for name in filenames:
            m = HMX_RE.match(name)
            if not m:
                continue
            used.add(m.group("songid"))
            assigned[(m.group("lang"), m.group("album"), m.group("track"))] = m.group("songid")
    return used, assigned


def load_registry(path):
    if not os.path.exists(path):
        return []
    with io.open(path, encoding="utf-8") as fh:
        rows = [line.rstrip("\n").split("\t") for line in fh if line.strip()]
    return rows[1:] if rows else []


# --------------------------------------------------------------------------
# Metadata
# --------------------------------------------------------------------------

def load_album_meta(album_dir):
    """(track_number -> track_slug, track_slug -> display title) from album.meta.json."""
    path = os.path.join(album_dir, "album.meta.json")
    if not os.path.exists(path):
        return {}, {}
    try:
        with io.open(path, encoding="utf-8-sig") as fh:
            data = json.load(fh)
    except (ValueError, OSError):
        return {}, {}
    slugs, titles = {}, {}
    for track in data.get("tracks") or []:
        # Some album.meta.json generations store tracks as bare title strings
        # rather than objects; those carry no slug, so fall through to derivation.
        if not isinstance(track, dict):
            continue
        num, slug = track.get("track_number"), track.get("track_slug")
        if num is None or not slug:
            continue
        key = "%02d" % int(num)
        # Newer metadata generations prefix the slug with its own track number
        # ("01-throne-room-multitude"). Strip that, but only when the leading
        # number IS the track number, so a title like "7 Trumpets" survives.
        stripped = re.sub(r"^0*%d-" % int(num), "", slug)
        slugs[key] = stripped or slug
        # And the display title, keyed BY SLUG rather than by track number.
        #
        # Number is the wrong key here. These album.meta.json files still list
        # the tracks the catalogue had BEFORE its duplicates were cleaned up, so
        # a number can name two different songs and a lookup by number returns
        # whichever survived the dict. Slug is what actually identifies the file
        # that is on disk now, so matching on it cannot mislabel a track.
        title = track.get("track_title")
        if title and isinstance(title, str):
            titles[stripped or slug] = title.strip()
    return slugs, titles


# --------------------------------------------------------------------------
# Ingest
# --------------------------------------------------------------------------

def ingest_album(album_dir, artist_slug, cfg, used, assigned, rows, opts):
    folder = os.path.basename(album_dir.rstrip("\\/"))
    m = ALBUM_RE.match(folder)
    if not m:
        print("  SKIP (unrecognised folder name): %s" % folder)
        return 0

    album_code = m.group("code")
    # Prefix+number, language stripped: every language edition of an album shares this,
    # while JEIM1034 and SAIM1034 stay distinct.
    album_key = m.group("prefix") + m.group("number")
    lang = m.group("lang") or (opts.lang or "").upper() or None
    if not lang:
        print("  SKIP (no language in the folder name, and no --lang given): %s" % folder)
        return 0
    album_slug = slugify(m.group("slug"), lang)

    # AUDIO LIVES IN <album>/tracks/, EXCEPT WHERE IT DOES NOT.
    #
    # Almost every album folder keeps its files in a tracks/ subfolder, and this
    # used to look only there. Radiant Stones' Romanian record keeps its twelve
    # files directly in the album folder, so they were skipped - with no warning,
    # because "no tracks/ dir" and "an album with no audio yet" were the same
    # `return 0`. A staged album with no audio is normal here; twelve files the
    # tool cannot see is not. Prefer tracks/ when it exists, fall back to the
    # album folder, so both layouts ingest and neither has to be special-cased
    # per album.
    tracks_dir = os.path.join(album_dir, "tracks")
    if not os.path.isdir(tracks_dir):
        tracks_dir = album_dir
    sources = [f for f in os.listdir(tracks_dir)
               if f.lower().endswith(".mp3") and os.path.isfile(os.path.join(tracks_dir, f))]
    if not sources:
        return 0
    # Order by track number, then prefer the canonical name over a " (1)" copy so the
    # duplicate-track guard below keeps the original rather than whichever sorts first.
    sources.sort(key=lambda f: (int(TRACK_RE.match(f).group("num")) if TRACK_RE.match(f) else 999,
                                1 if re.search(r"\s\(\d+\)\.mp3$", f, re.I) else 0, f))

    year = cfg.get("default_year", 2026)
    artist_code = cfg["artist_codes"].get(artist_slug)
    if not artist_code:
        raise SystemExit("No artist_code configured for '%s' in catalog-config.json" % artist_slug)
    # Genre precedence: per-album override > per-persona lane > global fallback.
    genre = cfg["album_genre_overrides"].get(album_key)
    if not genre:
        genre = cfg.get("artist_genres", {}).get(artist_slug) or cfg["fallback_genre"]

    meta_slugs, meta_titles = load_album_meta(album_dir)
    overrides = cfg.get("song_slug_overrides", {})
    dest_dir = os.path.join(opts.dest_root, artist_slug, lang.lower(), album_slug)

    print("  %s [%s] -> %s/%s  (%s, %d tracks)"
          % (album_code, lang, lang.lower(), album_slug, genre, len(sources)))

    written = 0
    claimed = {}
    for src_name in sources:
        tm = TRACK_RE.match(src_name)
        if not tm:
            print("    WARN unparseable track filename, skipped: %s" % src_name)
            continue
        track_num = "%02d" % int(tm.group("num"))
        title = tm.group("title").strip()

        # A track number identifies exactly one song. If two source files claim the
        # same number they would be handed the same SongID, silently breaking the
        # primary key. Ingest the first and refuse the rest — a human has to decide
        # which is the real track and renumber it at the source.
        if track_num in claimed:
            print("    WARN duplicate track number %s in %s -- NOT ingested: %s\n"
                  "         (already ingested as track %s: %s)"
                  % (track_num, album_code, src_name, track_num, claimed[track_num]))
            continue
        claimed[track_num] = src_name

        # Song slug priority: hand-authored override > album metadata > transliterated title
        #
        # UNLESS THE CATALOGUE SAYS ITS FILENAMES ARE THE AUTHORED SLUGS.
        # `artist_slug_source: "filename"` in catalog-config.json skips the
        # metadata step for that artist, and it exists because a whole catalogue
        # can arrive with a stale album.meta.json. My Tiny Tiggles is one: its
        # metadata lists a running order that no longer matches the audio, and
        # for 55 of 342 tracks the title it supplies names a song that HAS NO
        # AUDIO IN THE FOLDER AT ALL - track 01 is "Waddle With Me" in metadata
        # over a file called 01_flippers-up.mp3, and "Waddle With Me" is nowhere
        # on disk. Taking the metadata there would air a title the listener can
        # never hear, which is the Party Giggles failure again (82 of 338).
        #
        # A declaration rather than 55 song_slug_overrides, because it is one
        # decision about one catalogue, not 55 decisions; and per-artist rather
        # than global, because for every other catalogue here the metadata IS
        # the authority and the filename is a romanisation.
        slug_from = cfg.get("artist_slug_source", {}).get(artist_slug, "metadata")
        song_slug = overrides.get("%s/%s" % (album_code, track_num))
        slug_source = "override"
        if not song_slug and slug_from != "filename":
            song_slug = meta_slugs.get(track_num)
            slug_source = "metadata"
        if not song_slug:
            song_slug = slugify(title, lang)
            slug_source = "derived"

        # RE-AIM THE AUDIO AT THE TITLE.
        #
        # The slug decided above is what this track will AIR as, and it is bound
        # to a permanent SongID through (language, album_slug, track_number). The
        # audio must be the recording of that song. When the source folder holds
        # a file whose own name IS this slug, that file is the audio -- even if a
        # different file claimed the track number first. Without this, a folder
        # holding two albums that share track numbers pairs one album's audio
        # with the other's running order.
        if slug_source in ("override", "metadata"):
            for cand in sources:
                cm = TRACK_RE.match(cand)
                if not cm or "%02d" % int(cm.group("num")) != track_num:
                    continue
                if slugify(cm.group("title").strip(), lang) == song_slug and cand != src_name:
                    print("    re-aimed %s track %s: audio %s -> %s (matches title)"
                          % (album_code, track_num, src_name, cand))
                    src_name = cand
                    title = cm.group("title").strip()
                    break

        # AUDIO/TITLE PAIRING GUARD.
        #
        # The audio for this slot comes from src_name; the slug may instead come
        # from the album metadata. If those two name different songs, the track
        # airs under a title that is not what a listener hears. That is not
        # hypothetical: 82 of the 338 Party Giggles tracks shipped that way,
        # because 13 source folders hold two albums sharing track numbers and the
        # metadata listed one album's running order while the files on disk were
        # the other's. Track 10 aired as "Jesus Loves Me Anyway" and played
        # "Barnyard Boot Scootin' Hoot". Found 2026-08-23 by hashing every file
        # against its source.
        #
        # Only compared when the filename's own title is ASCII. For non-Latin
        # catalogues the metadata slug is a romanisation and is SUPPOSED to
        # differ from the title on disk, so comparing there would be noise.
        if slug_source in ("override", "metadata") and is_ascii_slug(slugify(title, lang)):
            from_file = slugify(title, lang)
            if from_file and from_file != song_slug:
                print("    WARN title/audio mismatch for %s track %s:"
                      % (album_code, track_num))
                print("         audio file  : %s" % src_name)
                print("         %-11s: %s" % (slug_source, song_slug))
                print("         would air as '%s' while playing '%s'."
                      % (song_slug, from_file))
                print("         Fix the source numbering or add a song_slug_override.")
                if getattr(opts, "strict_pairing", False):
                    print("         --strict-pairing: NOT ingested.")
                    continue
        if not is_ascii_slug(song_slug):
            print("    WARN non-ASCII slug for %s -> add a song_slug_override for %s/%s"
                  % (src_name, album_code, track_num))
            song_slug = "%s-%s" % (album_slug, track_num)
            slug_source = "fallback"

        # DISPLAY TITLE. The title comes off the source filename, which is right
        # for catalogues whose files are named "01 Sky Splits Open.mp3" and wrong
        # for ones already slugified on disk ("01_flip-flop-hallelujah.mp3"),
        # where it yields a slug that then shows up verbatim in the player and
        # the schedule guide. When the derived title looks like a slug and the
        # album metadata carries a real one for THIS slug, prefer the real one.
        if re.match(r"^[a-z0-9]+(-[a-z0-9]+)+$", title):
            better = meta_titles.get(song_slug) if meta_titles else None
            if better:
                title = better
            else:
                # NOTHING AIRS AS A SLUG. When the metadata has no title for this
                # song - which is the normal case for a catalogue whose filenames
                # are the authority - the words are still all there in the
                # filename, just hyphenated. "flippers-up" as a display title is
                # a bug the listener sees in the player and the schedule guide;
                # "Flippers Up" is the same information, readable.
                #
                # Deliberately plain title case. Guessing at apostrophes and
                # exclamation marks ("Penguino's Prayer Igloo", "Flippers Up!")
                # would be inventing punctuation that the source did not carry.
                title = " ".join(w[:1].upper() + w[1:] for w in title.split("-") if w)

        key = (lang, album_slug, track_num)
        song_id = assigned.get(key)
        if song_id is None:
            song_id = generate_song_id(used)
            assigned[key] = song_id

        new_name = "HMX%s%s%s-%s-%s-%s_%s_%s.mp3" % (
            year, lang, track_num, song_id, artist_code, genre, album_slug, song_slug)
        dest_path = os.path.join(dest_dir, new_name)

        rows.append([song_id, new_name, artist_slug, album_code, album_slug, track_num,
                     title, genre, str(year), lang, slug_source])

        if opts.dry_run:
            print("    DRY %s" % new_name)
            continue

        if not os.path.isdir(dest_dir):
            os.makedirs(dest_dir)

        # Drop a stale filename for this same track (retitle / genre change) so the
        # track never appears twice under two names.
        for existing in os.listdir(dest_dir):
            em = HMX_RE.match(existing)
            if em and em.group("songid") == song_id and existing != new_name:
                os.remove(os.path.join(dest_dir, existing))
                print("    RENAMED from %s" % existing)

        src_path = os.path.join(tracks_dir, src_name)
        if os.path.exists(dest_path) and os.path.getsize(dest_path) == os.path.getsize(src_path):
            continue  # already ingested, byte-size identical
        shutil.copyfile(src_path, dest_path)
        written += 1

    return written


def main():
    ap = argparse.ArgumentParser(description="Ingest albums into the kJubilee radio repository.")
    ap.add_argument("--artist", required=True, help="artist slug, e.g. jubilee-inspire")
    ap.add_argument("--album", help="single album folder name, e.g. JEIM1001EN-sky-splits-open")
    ap.add_argument("--dry-run", action="store_true", help="print the plan without copying")
    ap.add_argument("--exclude", default="",
                    help="comma-separated album folder names to hold back. Use for albums "
                         "whose numbering is still ambiguous: the duplicate guard would "
                         "otherwise ingest whichever file sorts first and freeze that "
                         "arbitrary choice into a permanent SongID.")
    ap.add_argument("--lang", default="",
                    help="two-letter language for album folders that carry no language "
                         "suffix (e.g. --lang EN for TTX301-penguino-s-palooza). Folders "
                         "that DO carry one always keep it; this never overrides.")
    ap.add_argument("--src-root", default=SRC_ROOT)
    ap.add_argument("--dest-root", default=DEST_ROOT)
    opts = ap.parse_args()

    with io.open(CONFIG, encoding="utf-8") as fh:
        cfg = json.load(fh)

    artist_src = os.path.join(opts.src_root, opts.artist)
    if not os.path.isdir(artist_src):
        raise SystemExit("Artist source folder not found: %s" % artist_src)

    registry_path = os.path.join(opts.dest_root, "songid-registry.tsv")
    used, assigned = scan_existing(opts.dest_root)
    for row in load_registry(registry_path):
        if row and row[0]:
            used.add(row[0])
    print("Existing SongIDs in repository: %d" % len(used))

    if opts.album:
        albums = [opts.album]
    else:
        # REPORT WHAT IS NOT BEING INGESTED. This filter used to drop unparsable
        # folder names here, before ingest_album could print its SKIP line, so a
        # run that ingested nothing at all printed nothing at all about why
        # — which is exactly what My Tiny Tiggles did on its first run: "Albums
        # with audio: 0" and not one word about the thirty-two folders it had
        # just walked past.
        all_dirs = sorted(d for d in os.listdir(artist_src)
                          if os.path.isdir(os.path.join(artist_src, d)))
        albums = [d for d in all_dirs if ALBUM_RE.match(d)]
        for d in all_dirs:
            if d not in albums:
                print("  SKIP (unrecognised folder name): %s" % d)

    held = set(x.strip() for x in opts.exclude.split(",") if x.strip())
    if held:
        skipped = [a for a in albums if a in held]
        albums = [a for a in albums if a not in held]
        for a in skipped:
            print("  HELD BACK (--exclude): %s" % a)
        missing = held - set(skipped)
        for a in sorted(missing):
            print("  note: --exclude named '%s', which is not an album here" % a)

    rows, copied, ingested_albums = [], 0, 0
    for album in albums:
        before = len(rows)
        copied += ingest_album(os.path.join(artist_src, album), opts.artist, cfg,
                               used, assigned, rows, opts)
        if len(rows) > before:
            ingested_albums += 1

    if not opts.dry_run and rows:
        header = ["SongID", "Filename", "Artist", "AlbumCode", "AlbumSlug", "Track",
                  "Title", "Genre", "Year", "Lang", "SlugSource"]
        by_id = {}
        for r in load_registry(registry_path):
            if r and r[0]:
                by_id[r[0]] = r
        for r in rows:
            by_id[r[0]] = r
        with io.open(registry_path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\t".join(header) + "\n")
            for r in sorted(by_id.values(), key=lambda x: x[1]):
                fh.write("\t".join(r) + "\n")
        print("Registry: %s (%d songs)" % (registry_path, len(by_id)))

    print("\nAlbums with audio: %d | files copied: %d | tracks named: %d"
          % (ingested_albums, copied, len(rows)))
    ids = [r[0] for r in rows]
    print("SongID collisions in this run: %d" % (len(ids) - len(set(ids))))


if __name__ == "__main__":
    main()
