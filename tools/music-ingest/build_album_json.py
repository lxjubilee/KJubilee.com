#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Write one album.json sidecar into every ingested album folder.

Each sidecar records where the audio came from and what each song is about, so the
radio layer never has to reach back into the jubilujah.com production tree to answer
"what is this track?".

Everything in the sidecar is EXTRACTED, never invented. Song descriptions are built
from the album blueprint's per-track brief (subtheme, hook, role) and the Suno lyrics
file's chorus, in that order of preference. If neither exists the field is null rather
than a guess, and `about_source` always says where the text came from.

Usage:
    python build_album_json.py                       # all ingested albums
    python build_album_json.py --artist nova-inspire # one artist
    python build_album_json.py --dry-run
"""

import argparse
import io
import json
import os
import re
import sys

SRC_ROOT = r"J:\jubilujah.com\music\inspire"
# Every authoring tree an ingested album can have come from, searched in order.
# SingItDone.com is a second property filing its own 2001-2003 series under the
# same persona folder names.
# The children's catalogues (Party Giggles, My Tiny Tiggles) are filed beside
# `inspire`, not inside it, so a run that searched only the two roots above
# reported "no source album found, LEFT UNTOUCHED: 31" for every My Tiny Tiggles
# album - correctly refusing to write a sidecar it could not source, and
# correctly refusing to null the descriptions, but leaving the catalogue with no
# sidecars at all.
SRC_ROOTS = [SRC_ROOT, r"J:\singitdone.com\music", r"J:\jubilujah.com\music\children"]
DEST_ROOT = r"J:\kjubilee.com\music"
CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "catalog-config.json")
SIDECAR = "album.json"
ABOUT_LIMIT = 1000

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass

HMX_RE = re.compile(
    r"^HMX(?P<year>\d{4})(?P<lang>[A-Z]{2})(?P<track>\d{2})-(?P<songid>[A-Z0-9]{12})"
    r"-(?P<artist>[A-Z0-9]{4})-(?P<genre>[A-Z]{4})_(?P<album>[^_]+)_(?P<song>.+)\.mp3$")


# --------------------------------------------------------------------------
# Small parsing helpers
# --------------------------------------------------------------------------

def read(path):
    for enc in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            with io.open(path, encoding=enc) as fh:
                return fh.read()
        except (UnicodeDecodeError, OSError):
            continue
    return ""


def clean(text):
    """Collapse markdown emphasis and whitespace into one readable line."""
    if not text:
        return None
    text = re.sub(r"\*\*|__|[`*]", "", text)
    text = re.sub(r"\s+", " ", text).strip().strip(" -—·")
    return text or None


def cap(text, limit=ABOUT_LIMIT):
    if not text:
        return None
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[:limit - 1]
    # Prefer to end on a sentence, then a word, rather than mid-syllable.
    for sep in (". ", "; ", " "):
        i = cut.rfind(sep)
        if i > limit * 0.6:
            return cut[:i + (1 if sep == ". " else 0)].strip() + "\u2026"
    return cut.strip() + "\u2026"


def normalize_content_mode(raw):
    """Any declared Content Mode string -> ('CCI'|'OHI', variant or None).

    OHI is the Hebraic-naming mode (Yahuah / Yeshua / Ruach HaKodesh, feminine Ruach).
    Everything else — "Default", "CCI / Default", "secular_universal", "Faith-Forward" —
    uses mainstream Christian naming and is CCI. The distinguishing variants are kept
    rather than flattened away, because Melody's secular_universal albums are the
    faith-floor-exempt pre-evangelistic records and that matters downstream.
    """
    if not raw:
        return None, None
    s = raw.strip().lstrip("*_ ").strip()
    upper = s.upper()
    variant = None
    if re.match(r"^OHI\b", upper):
        return "OHI", None
    if "SECULAR_UNIVERSAL" in upper:
        variant = "secular_universal"
    elif upper.startswith("FAITH-FORWARD"):
        variant = "faith_forward"
    return "CCI", variant


def find_content_mode(text):
    """Verbatim '**Content Mode:** ...' value, or None."""
    m = re.search(r"\*\*Content\s*Mode:?\*\*\s*([^\n]+)", text or "", re.I)
    if not m:
        m = re.search(r"^\s*[-*]?\s*Content\s*Mode:\s*([^\n]+)", text or "", re.I | re.M)
    return clean(m.group(1)) if m else None


def field(block, name):
    """Pull `- **Name:** value` out of a markdown block."""
    m = re.search(r"\*\*%s:?\*\*\s*(.+?)(?=\n\s*[-*]\s*\*\*|\n\s*\n|\Z)" % re.escape(name),
                  block, re.S | re.I)
    return clean(m.group(1)) if m else None


# --------------------------------------------------------------------------
# Blueprint
# --------------------------------------------------------------------------

def parse_blueprint(path):
    """-> (album_level_dict, {track_number: brief_dict})"""
    text = read(path)
    if not text:
        return {}, {}

    album = {}
    m = re.search(r"##\s*Section B[^\n]*\n+(.+?)(?=\n##\s|\Z)", text, re.S)
    if m:
        album["vision"] = cap(clean(m.group(1)), ABOUT_LIMIT)
    m = re.search(r"##\s*Section A[^\n]*\n+(.+?)(?=\n##\s|\Z)", text, re.S)
    if m:
        head = m.group(1)
        for key, label in (("album_type", "Album Type"),
                           ("target_audience", "Target Audience"),
                           ("release_context", "Release Context"),
                           ("catalog_position", "Catalog Position")):
            val = field(head, label)
            if val:
                album[key] = cap(val, 600)
    # Searched over the whole document, not just Section A: blueprint generations differ
    # on where the header block lives ("Section A" vs "Section 1" vs the title line).
    cm = find_content_mode(text)
    if cm:
        album["content_mode_raw"] = cap(cm, 400)
    fusion = re.search(r"\*\*Fused Genre(?: Identity)?:?\*\*\s*(.+)", text)
    if fusion:
        album["fused_genre"] = clean(fusion.group(1))

    # Track-by-track section. Heading styles vary across blueprint generations:
    #   "### Track 1 - \"Title\""  and  "### **Track 1: \"Title\"**"
    tracks = {}
    blocks = re.split(r"\n#{2,4}\s+\**\s*Track\s+", "\n" + text, flags=re.I)
    for blk in blocks[1:]:
        head = blk.split("\n", 1)[0]
        num = re.match(r"(\d{1,3})", head)
        if not num:
            continue
        n = "%02d" % int(num.group(1))
        body = blk
        # Stop at the next section so we never bleed into unrelated prose.
        body = re.split(r"\n##\s", body)[0]
        brief = {}
        for key, label in (("subtheme", "Subtheme"), ("role", "Act + Role"),
                           ("hook", "Hook Concept"), ("function", "Cinematic Function"),
                           ("ministry_moment", "Ministry Moment"),
                           ("core_message", "Core Message"),
                           ("emotional_payload", "Emotional Payload"),
                           ("quotable", "Quotable Lines"),
                           ("sonic_profile", "Sonic Profile")):
            val = field(body, label)
            if val:
                brief[key] = val
        if not brief.get("role"):
            brief["role"] = field(body, "Role")
        length = re.search(r"\*\*Target Length:?\*\*\s*([0-9]{1,2}:[0-9]{2})", body)
        if length:
            brief["length"] = length.group(1)
        sonic = brief.get("sonic_profile") or ""
        bpm = re.search(r"(\d{2,3})\s*BPM", sonic) or re.search(r"(\d{2,3})\s*BPM", body)
        if bpm:
            brief["bpm"] = int(bpm.group(1))
        key_m = re.search(r"\b([A-G][b#\u266d\u266f]?\s*(?:major|minor|maj|min))\b", sonic, re.I)
        if key_m:
            brief["key"] = clean(key_m.group(1))
        if brief:
            tracks[n] = brief
    return album, tracks


# --------------------------------------------------------------------------
# Lyrics
# --------------------------------------------------------------------------

# Structural section tags, as opposed to production cues like [gospel choir enters].
SECTION_TAG = re.compile(
    r"^\[(intro|verse|pre-?chorus|post-?chorus|chorus|final chorus|bridge|outro|hook|"
    r"refrain|interlude|vamp|tag|break|key change|fade ?out|instrumental|spoken)\b",
    re.I)


def extract_chorus(body):
    """First chorus, skipping the production cues that open the block.

    A [Chorus] block typically starts with cue lines ([Hammond], [clap+stomp]) before
    any lyric. Scanning line by line rather than regex-matching to the next '[' is what
    makes those blocks yield their words.
    """
    lines = body.splitlines()
    start = None
    for i, line in enumerate(lines):
        # "[Chorus]", "[CHORUS]", "[Chorus - Double]", "[Chorus 1]" all count.
        if re.match(r"^\[chorus\b", line.strip(), re.I):
            start = i + 1
            break
    if start is None:
        return None
    out = []
    for line in lines[start:]:
        s = line.strip()
        if not s:
            if out:
                break          # blank line after lyrics ends the block
            continue
        if s.startswith("["):
            if SECTION_TAG.match(s) and out:
                break          # next real section
            continue           # production cue, skip
        out.append(s)
        if len(out) >= 6:
            break
    return " / ".join(out) if out else None


def parse_song_file(path):
    """Per-song lyric file: richer than the album file (emotional arc, BPM, key)."""
    text = read(path)
    if not text:
        return {}
    entry = {}
    arc = re.search(r"##\s*Song-Level Emotional Arc\s*\n+(.+?)(?=\n##\s|\n---|\Z)", text, re.S)
    if arc:
        bits = []
        for label in ("Establish", "Escalate", "Elevate"):
            v = field(arc.group(1), label)
            if v:
                bits.append(v)
        if bits:
            entry["emotional_arc"] = cap(" ".join(bits), 700)
    for key, label in (("bpm", "Tempo (BPM)"), ("key", "Key"),
                       ("length", "Song Length"), ("styles", "Music Styles")):
        v = field(text, label)
        if v:
            entry[key] = v
    if entry.get("bpm"):
        m = re.search(r"\d{2,3}", entry["bpm"])
        entry["bpm"] = int(m.group(0)) if m else None
        if entry["bpm"] is None:
            entry.pop("bpm")
    cm = find_content_mode(text)
    if cm:
        entry["content_mode_raw"] = cap(cm, 400)
    ch = extract_chorus(text)
    if ch:
        entry["chorus"] = cap(ch, 600)
    return entry


def parse_song_files(lyrics_dir, album_code):
    """-> {track_number: entry} from '<ALBUMCODE>-NN Title.md' files."""
    tracks = {}
    if not os.path.isdir(lyrics_dir):
        return tracks
    # Translated albums sometimes keep the ORIGINAL language's album code on their
    # lyric filenames (JEIM1071HI's files are named JEIM1071EN-...), so match on the
    # language-independent prefix+number as well as the exact code.
    stem = album_code[:-2] if re.match(r"^[A-Z]{4}\d{4}[A-Z]{2}$", album_code) else album_code
    for f in sorted(os.listdir(lyrics_dir)):
        if not f.lower().endswith(".md") or f.lower() == "blueprint.md":
            continue
        m = (re.match(r"^%s[-_ ]+(\d{1,3})\b" % re.escape(album_code), f, re.I)
             or re.match(r"^%s[A-Z]{0,2}[-_ ]+(\d{1,3})\b" % re.escape(stem), f, re.I)
             or re.match(r"^(\d{1,3})[\s._-]+", f))
        if not m:
            continue
        entry = parse_song_file(os.path.join(lyrics_dir, f))
        if entry:
            tracks["%02d" % int(m.group(1))] = entry
    return tracks


def parse_lyrics(path):
    """-> (album_level_dict, {track_number: {chorus, archetype}})"""
    text = read(path)
    if not text:
        return {}, {}

    album = {}
    anchors = re.search(r"\*\*Theological Anchors:?\*\*\s*(.+)", text)
    if anchors:
        album["theological_anchors"] = cap(clean(anchors.group(1)), 900)
    arc = re.search(r"\*\*Three-Act Arc:?\*\*\s*(.+)", text)
    if arc:
        album["three_act_arc"] = cap(clean(arc.group(1)), 600)
    cm = find_content_mode(text)
    if cm:
        album["content_mode_raw"] = cap(cm, 400)

    # Header casing varies by generation: "SONG TITLE:" and "Song Title:",
    # "ARCHETYPE:" and "Archetype Slot:".
    tracks = {}
    parts = re.split(r"\n\s*\**\s*SONG\s+TITLE:?\**\s*", "\n" + text, flags=re.I)
    for part in parts[1:]:
        head = part.split("\n", 1)[0].strip()
        num = re.match(r"(\d{1,3})\b", head)
        if not num:
            continue
        n = "%02d" % int(num.group(1))
        body = part
        entry = {}
        arch = re.search(r"ARCHETYPE(?:\s+SLOT)?:\s*(.+)", body, re.I)
        if arch:
            entry["archetype"] = cap(clean(arch.group(1)), 300)
        # First [Chorus] block: the plainest statement of what the song says.
        ch = extract_chorus(body)
        if ch:
            entry["chorus"] = cap(ch, 600)
        if entry:
            tracks[n] = entry
    return album, tracks


# --------------------------------------------------------------------------
# Description assembly
# --------------------------------------------------------------------------

def build_about(brief, lyric):
    """Compose the <=1000 char 'what this song is about' from extracted material."""
    brief, lyric = brief or {}, lyric or {}
    parts, source = [], None

    if brief.get("subtheme"):
        parts.append(brief["subtheme"])
        source = "blueprint:subtheme"
    if brief.get("core_message") and len(" ".join(parts)) < 500:
        parts.append(brief["core_message"].strip('"“”'))
        source = source or "blueprint:core-message"
    if brief.get("function") and len(" ".join(parts)) < 400:
        parts.append(brief["function"])
        source = source or "blueprint:function"
    if not parts and lyric.get("emotional_arc"):
        parts.append(lyric["emotional_arc"])
        source = "lyrics:emotional-arc"
    if not parts and brief.get("role"):
        parts.append(brief["role"])
        source = "blueprint:role"

    hook = brief.get("hook") or lyric.get("chorus")
    hook_src = "blueprint:hook" if brief.get("hook") else ("lyrics:chorus" if lyric.get("chorus") else None)
    if hook:
        hook = hook.strip().strip('"\u201c\u201d')
        parts.append("Hook: \u201c%s\u201d" % hook)
        source = source or hook_src
        if source and hook_src and source != hook_src:
            source = source + "+" + hook_src

    if not parts and lyric.get("archetype"):
        parts.append(lyric["archetype"])
        source = "lyrics:archetype"

    if not parts:
        return None, None
    return cap(" \u2014 ".join(p.strip(" .") for p in parts if p), ABOUT_LIMIT), source


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def find_source_album(src_roots, artist, album_code):
    """Locate an album's authoring folder across every configured source tree.

    SEVERAL ROOTS, NOT ONE, AND THAT IS LOAD-BEARING. This tool walks the
    DESTINATION repository and looks each album back up in its source. One
    persona's albums no longer all come from one place: the jubilujah.com
    catalogue and the SingItDone.com declaration property both file records
    under `elias-inspire`, in different trees.

    With a single root, running this for one property REWROTE the other
    property's sidecars with the source missing -- and a missing source is not
    an error here, it is simply an album with no blueprint and no lyrics, so
    every `about` silently became null. That is exactly what happened: 381
    sidecars lost every track description in one run, and nothing failed.
    Searching all the roots is what makes the tool safe to run at all.
    """
    for src_root in src_roots:
        adir = os.path.join(src_root, artist)
        if not os.path.isdir(adir):
            continue
        for name in os.listdir(adir):
            if name.startswith(album_code) and os.path.isdir(os.path.join(adir, name)):
                return os.path.join(adir, name)
    return None


def main():
    ap = argparse.ArgumentParser(description="Write album.json sidecars into ingested albums.")
    ap.add_argument("--artist", help="limit to one artist slug")
    ap.add_argument("--dry-run", action="store_true")
    # Repeatable, and it defaults to BOTH trees rather than to the jubilujah one.
    # See find_source_album for why a single root is unsafe here.
    ap.add_argument("--src-root", action="append", default=None,
                    help="authoring tree to look albums up in; repeatable "
                         "(default: every root in SRC_ROOTS)")
    ap.add_argument("--dest-root", default=DEST_ROOT)
    opts = ap.parse_args()
    src_roots = opts.src_root or SRC_ROOTS

    cfg = json.load(io.open(CONFIG, encoding="utf-8"))
    genre_names = {k: v for k, v in cfg["genre_codes"].items() if not k.startswith("_")}

    # Registry rows carry the album code and original titles; index them by album folder.
    registry = {}
    reg_path = os.path.join(opts.dest_root, "songid-registry.tsv")
    with io.open(reg_path, encoding="utf-8") as fh:
        rows = [l.rstrip("\n").split("\t") for l in fh if l.strip()]
    header = rows[0]
    for r in rows[1:]:
        row = dict(zip(header, r))
        registry.setdefault((row["Artist"], row["Lang"], row["AlbumSlug"]), []).append(row)

    written = skipped = 0
    unsourced = []
    stats = {"blueprint": 0, "lyrics": 0, "neither": 0}
    about_sources = {}
    mode_counts, source_counts, track_mode_counts = {}, {}, {}
    unconfigured = set()

    for (artist, lang, album_slug), tracks in sorted(registry.items()):
        if opts.artist and artist != opts.artist:
            continue
        dest_dir = os.path.join(opts.dest_root, artist, lang.lower(), album_slug)
        if not os.path.isdir(dest_dir):
            print("  MISSING album folder, skipped: %s" % dest_dir)
            skipped += 1
            continue

        tracks.sort(key=lambda r: r["Track"])
        album_code = tracks[0]["AlbumCode"]
        src_album = find_source_album(src_roots, artist, album_code)

        # NO SOURCE, NO WRITE. An album this tool cannot find the authoring
        # folder for still produces a perfectly well-formed sidecar -- one with
        # every `about`, every anchor and every blueprint field null -- and
        # writing it over a good one destroys the descriptions without failing.
        #
        # It is not a hypothetical. Torah Sings writes its own album.json from
        # its own tool (ingest_torahsings.py) out of a tree this one has never
        # heard of, and a run without --artist reached all 285 of those albums
        # and stripped them. Skipping is right in both directions: a genuinely
        # new album that cannot be sourced is a naming problem worth a message,
        # and an album owned by another tool is not this tool's to rewrite.
        if not src_album:
            unsourced.append((artist, album_code, album_slug))
            skipped += 1
            continue

        bp_album, bp_tracks = {}, {}
        ly_album, ly_tracks = {}, {}
        bp_path = ly_path = meta_path = None
        if src_album:
            ldir = os.path.join(src_album, "lyrics")
            if os.path.isdir(ldir):
                for f in os.listdir(ldir):
                    if f.lower() == "blueprint.md":
                        bp_path = os.path.join(ldir, f)
                    elif f.lower().endswith("-lyrics.md"):
                        ly_path = os.path.join(ldir, f)
            mp = os.path.join(src_album, "album.meta.json")
            if os.path.exists(mp):
                meta_path = mp
        if bp_path:
            bp_album, bp_tracks = parse_blueprint(bp_path)
        if ly_path:
            ly_album, ly_tracks = parse_lyrics(ly_path)
        # Some albums ship one lyric file per song instead of a single album file;
        # those carry an explicit emotional arc, so let them fill any gaps.
        if src_album:
            for n, entry in parse_song_files(os.path.join(src_album, "lyrics"), album_code).items():
                merged = dict(entry)
                merged.update(ly_tracks.get(n, {}))
                for k, v in entry.items():
                    merged.setdefault(k, v)
                ly_tracks[n] = merged

        if bp_tracks:
            stats["blueprint"] += 1
        elif ly_tracks:
            stats["lyrics"] += 1
        else:
            stats["neither"] += 1

        album_title = None
        if meta_path:
            try:
                album_title = json.load(io.open(meta_path, encoding="utf-8-sig")).get("album_title")
            except (ValueError, OSError):
                pass
        if not album_title and src_album:
            album_title = os.path.basename(src_album)[len(album_code):].lstrip("-_ ").replace("-", " ").title()

        genre_code = tracks[0]["Genre"]
        doc = {
            "schema": "kjubilee.album.v1",
            "album": {
                "album_code": album_code,
                "album_slug": album_slug,
                "album_title": album_title,
                "artist_slug": artist,
                "artist_code": tracks[0]["Filename"].split("-")[2],
                "language": lang,
                "year": int(tracks[0]["Year"]),
                "genre_code": genre_code,
                "genre_primary": genre_names.get(genre_code[:2]),
                "genre_secondary": genre_names.get(genre_code[2:]),
                "track_count": len(tracks),
            },
            "source": {
                "copied_from": os.path.join(src_album, "tracks") if src_album else None,
                "blueprint": bp_path,
                "lyrics": ly_path,
                "album_meta": meta_path,
                "ingested_by": "tools/music-ingest/ingest_music.py",
                "described_by": "tools/music-ingest/build_album_json.py",
                "note": ("Audio copied verbatim from the jubilujah.com production tree and renamed "
                         "to the canonical Radio Song ID format. Descriptions are extracted from the "
                         "album blueprint and lyrics files, never generated. See "
                         "docs/MUSIC-REPOSITORY-SPEC.md."),
            },
            "tracks": [],
        }
        for key in ("vision", "album_type", "target_audience",
                    "release_context", "catalog_position", "fused_genre"):
            if bp_album.get(key):
                doc["album"][key] = bp_album[key]
        for key in ("theological_anchors", "three_act_arc"):
            if ly_album.get(key):
                doc["album"][key] = ly_album[key]

        # ---- Content mode (CCI / OHI) --------------------------------------
        # Declared beats inferred, always. Precedence: the album lyrics file, then the
        # blueprint, then the persona's configured default. Divine-name vocabulary is
        # NOT used to infer a mode: token counting misreads translated albums (a Romanian
        # record naming "Isus" 73 times scores zero on an English "Jesus" match).
        album_raw, mode_source = None, None
        for cand_raw, cand_src in ((ly_album.get("content_mode_raw"), "lyrics"),
                                   (bp_album.get("content_mode_raw"), "blueprint")):
            if cand_raw:
                album_raw, mode_source = cand_raw, cand_src
                break
        album_mode, album_variant = normalize_content_mode(album_raw)
        if not album_mode:
            # A per-album override, keyed like album_genre_overrides on PREFIX+NUMBER.
            # It sits ABOVE the persona default and BELOW anything the album itself
            # declares, so it can only speak where the source is silent: a record that
            # states its own mode is never overridden by a config file. It exists for
            # a body of work whose mode is a property of the property rather than of
            # the persona -- SingItDone's declaration albums are OHI throughout while
            # eleven of the twelve personas are CCI on their own catalogues.
            declared_over = cfg.get("album_content_mode_overrides", {}).get(
                re.sub(r"[A-Z]{2}$", "", album_code))
            album_mode, album_variant = normalize_content_mode(declared_over)
            if album_mode:
                mode_source = "album-override"
        if not album_mode:
            configured = cfg.get("artist_content_modes", {}).get(artist)
            if not configured:
                # Never guess a persona's mode. An unconfigured OHI persona silently
                # falling through to CCI would mislabel every one of its songs.
                print("  WARN %s declares no Content Mode and '%s' has no entry in "
                      "artist_content_modes -- assuming %s. Add the persona to "
                      "catalog-config.json and re-run."
                      % (album_code, artist, cfg.get("default_content_mode", "CCI")))
                unconfigured.add(artist)
            album_mode = configured or cfg.get("default_content_mode", "CCI")
            mode_source = "persona-default"
        doc["album"]["content_mode"] = album_mode
        doc["album"]["content_mode_source"] = mode_source
        if album_raw:
            doc["album"]["content_mode_raw"] = album_raw
        if album_variant:
            doc["album"]["content_mode_variant"] = album_variant
        mode_counts[album_mode] = mode_counts.get(album_mode, 0) + 1
        source_counts[mode_source] = source_counts.get(mode_source, 0) + 1

        for row in tracks:
            n = row["Track"]
            brief, lyric = bp_tracks.get(n, {}), ly_tracks.get(n, {})
            about, about_src = build_about(brief, lyric)
            about_sources[about_src or "none"] = about_sources.get(about_src or "none", 0) + 1
            # Every track carries the mode explicitly, so a consumer never has to walk
            # up to the album to know how a song names God. A per-song lyric file may
            # declare its own; otherwise the song inherits the album's.
            t_mode, t_variant = normalize_content_mode(lyric.get("content_mode_raw"))
            t_source = "song-file"
            if not t_mode:
                t_mode, t_variant, t_source = album_mode, album_variant, mode_source
            entry = {
                "song_id": row["SongID"],
                "track": int(n),
                "title": row["Title"],
                "slug": row["Filename"].rsplit("_", 1)[-1][:-4],
                "content_mode": t_mode,
                "content_mode_source": t_source,
                "filename": row["Filename"],
                "about": about,
                "about_source": about_src,
            }
            if t_variant:
                entry["content_mode_variant"] = t_variant
            track_mode_counts[t_mode] = track_mode_counts.get(t_mode, 0) + 1
            for k in ("subtheme", "role", "hook", "length", "bpm", "key"):
                if brief.get(k):
                    entry[k] = brief[k]
                elif lyric.get(k):
                    entry[k] = lyric[k]
            for k in ("chorus", "emotional_arc", "styles"):
                if lyric.get(k):
                    entry[k] = lyric[k]
            doc["tracks"].append(entry)

        out = os.path.join(dest_dir, SIDECAR)
        if opts.dry_run:
            print("  DRY %s (%d tracks, about: %d)"
                  % (out, len(doc["tracks"]), sum(1 for t in doc["tracks"] if t["about"])))
        else:
            with io.open(out, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(json.dumps(doc, indent=2, ensure_ascii=False))
        written += 1

    print("\nalbum.json written: %d | skipped: %d" % (written, skipped))
    if unsourced:
        by_artist = {}
        for a, code, slug in unsourced:
            by_artist.setdefault(a, []).append(code)
        print("no source album found, LEFT UNTOUCHED: %d" % len(unsourced))
        for a in sorted(by_artist):
            codes = by_artist[a]
            print("   %-18s %4d  e.g. %s" % (a, len(codes), ", ".join(codes[:3])))
    print("description source per album: blueprint=%d lyrics-only=%d neither=%d"
          % (stats["blueprint"], stats["lyrics"], stats["neither"]))
    print("per-track about source:")
    for k, v in sorted(about_sources.items(), key=lambda kv: -kv[1]):
        print("   %-28s %d" % (k, v))
    print("content mode - albums: %s | tracks: %s"
          % (dict(sorted(mode_counts.items())), dict(sorted(track_mode_counts.items()))))
    print("content mode resolved from: %s" % dict(sorted(source_counts.items())))
    if unconfigured:
        print("\n!! PERSONAS MISSING A CONTENT MODE: %s\n"
              "   Their songs were labelled with the global default and may be wrong.\n"
              "   Add them to artist_content_modes in catalog-config.json and re-run."
              % ", ".join(sorted(unconfigured)))


if __name__ == "__main__":
    main()
