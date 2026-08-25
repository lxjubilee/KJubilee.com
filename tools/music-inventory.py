#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
music-inventory.py — record exactly what is in a source music tree, and later
prove it is still that.

    python tools/music-inventory.py --scan   "J:\\jubilujah.com\\music\\children\\party-giggles" \\
                                    --out    docs/inventory/party-giggles.tsv
    python tools/music-inventory.py --verify docs/inventory/party-giggles.tsv

WHY THIS EXISTS

These trees are hand-curated before ingest — duplicates removed, numbering
corrected — and they live on a share that other machines and other projects also
write to. A later sync from a backup, or from the sibling site that holds the
same catalogue, can silently undo that work: files come back, numbering doubles
again, and nothing announces it. The ingest would then either refuse the album
(one track number = one song) or, worse, quietly take a file nobody meant to
publish.

So the cleaned state gets written down, with a SHA-256 per file, and --verify
turns "did the tree change?" into a question with an answer instead of a
suspicion. Run it before any ingest.

WHAT IT RECORDS

One row per .mp3: album folder, the track number parsed from the filename, the
filename, byte size, and SHA-256. Sizes alone would miss a same-length
substitution; the hash is what makes a row a fact rather than a guess.

It also carries a header block of counts, and flags albums where two files claim
the same track number — the specific fault this catalogue has had, and the one
the ingest refuses to guess its way past.

Exit status: 0 when the tree matches, 1 on any drift or on a scan error.
Python 3, standard library only.
"""

import argparse
import collections
import hashlib
import io
import os
import re
import sys

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass

# Track filenames arrive as "01 Title.mp3", "01_title.mp3", "1-title.mp3".
TRACK_RE = re.compile(r"^(\d{1,3})[\s._-]+(.+)\.mp3$", re.IGNORECASE)
SCHEMA = "kj.music.inventory/1"


def sha256_of(path, buf=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(buf), b""):
            h.update(chunk)
    return h.hexdigest()


def scan(root):
    """Every .mp3 under <root>/<album>/tracks/, as sorted rows."""
    rows = []
    if not os.path.isdir(root):
        raise SystemExit("not a directory: " + root)
    for album in sorted(os.listdir(root)):
        tracks_dir = os.path.join(root, album, "tracks")
        if not os.path.isdir(tracks_dir):
            continue
        for name in sorted(os.listdir(tracks_dir)):
            if not name.lower().endswith(".mp3"):
                continue
            full = os.path.join(tracks_dir, name)
            m = TRACK_RE.match(name)
            rows.append({
                "album": album,
                "track": m.group(1).lstrip("0") or "0" if m else "",
                "file": name,
                "bytes": str(os.path.getsize(full)),
                "sha256": sha256_of(full),
            })
    return rows


def duplicate_numbers(rows):
    """Albums where two files claim one track number, and which numbers."""
    per = collections.defaultdict(collections.Counter)
    for r in rows:
        if r["track"]:
            per[r["album"]][r["track"]] += 1
    out = {}
    for album, counter in per.items():
        dupes = sorted((int(n) for n, c in counter.items() if c > 1))
        if dupes:
            out[album] = dupes
    return out


COLUMNS = ["album", "track", "file", "bytes", "sha256"]


def write(rows, out_path, root):
    albums = sorted({r["album"] for r in rows})
    dupes = duplicate_numbers(rows)
    total_bytes = sum(int(r["bytes"]) for r in rows)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    with io.open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("# schema\t%s\n" % SCHEMA)
        f.write("# root\t%s\n" % root)
        f.write("# albums\t%d\n" % len(albums))
        f.write("# tracks\t%d\n" % len(rows))
        f.write("# bytes\t%d\n" % total_bytes)
        # Recorded, not hidden: an album listed here cannot be ingested until it
        # is renumbered at the source, and the inventory is where that is stated.
        f.write("# albums_with_duplicate_track_numbers\t%d\n" % len(dupes))
        for album in sorted(dupes):
            f.write("# duplicate\t%s\t%s\n" % (album, ",".join(str(n) for n in dupes[album])))
        f.write("\t".join(COLUMNS) + "\n")
        for r in rows:
            f.write("\t".join(r[c] for c in COLUMNS) + "\n")
    return {"albums": len(albums), "tracks": len(rows), "bytes": total_bytes, "dupes": dupes}


def read(path):
    rows, meta = [], {}
    with io.open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith("# "):
                parts = line[2:].split("\t")
                if parts[0] == "duplicate":
                    meta.setdefault("duplicate", {})[parts[1]] = parts[2]
                elif len(parts) >= 2:
                    meta[parts[0]] = parts[1]
                continue
            if not line or line.startswith("album\t"):
                continue
            vals = line.split("\t")
            rows.append(dict(zip(COLUMNS, vals)))
    return meta, rows


def verify(inv_path, root_override=None):
    meta, expected = read(inv_path)
    root = root_override or meta.get("root")
    print("verifying %s" % root)
    print("  recorded: %s albums, %s tracks\n" % (meta.get("albums"), meta.get("tracks")))

    actual = scan(root)
    by_key = lambda rows: {(r["album"], r["file"]): r for r in rows}
    exp, act = by_key(expected), by_key(actual)

    missing = sorted(set(exp) - set(act))
    added = sorted(set(act) - set(exp))
    changed = sorted(k for k in (set(exp) & set(act))
                     if exp[k]["sha256"] != act[k]["sha256"])

    for k in missing:
        print("  MISSING  %s / %s" % k)
    for k in added:
        print("  ADDED    %s / %s  (%s bytes)" % (k[0], k[1], act[k]["bytes"]))
    for k in changed:
        print("  CHANGED  %s / %s  %s -> %s" % (k[0], k[1],
              exp[k]["sha256"][:12], act[k]["sha256"][:12]))

    # Duplicate track numbers are reported against the recorded state, so a
    # newly-doubled album stands out from one that was already known bad.
    was = {a: v for a, v in (meta.get("duplicate") or {}).items()}
    now = {a: ",".join(str(n) for n in v) for a, v in duplicate_numbers(actual).items()}
    for album in sorted(set(now) - set(was)):
        print("  NEW DUPLICATE NUMBERS  %s  tracks %s" % (album, now[album]))
    for album in sorted(set(was) - set(now)):
        print("  duplicates resolved     %s  (was %s)" % (album, was[album]))

    drift = len(missing) + len(added) + len(changed) + len(set(now) - set(was))
    print("\n%d file(s) missing, %d added, %d changed, %d album(s) newly duplicated"
          % (len(missing), len(added), len(changed), len(set(now) - set(was))))
    print("RESULT: " + ("MATCHES the recorded inventory" if drift == 0 else "DRIFTED"))
    return 0 if drift == 0 else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scan", metavar="DIR", help="tree to record")
    ap.add_argument("--out", metavar="FILE", help="inventory to write")
    ap.add_argument("--verify", metavar="FILE", help="inventory to check the tree against")
    ap.add_argument("--root", metavar="DIR", help="override the root recorded in the inventory")
    args = ap.parse_args()

    if args.verify:
        return verify(args.verify, args.root)

    if not args.scan or not args.out:
        ap.error("--scan needs --out (or use --verify)")

    rows = scan(args.scan)
    stats = write(rows, args.out, args.scan)
    print("%s\n  %d albums, %d tracks, %.2f GB"
          % (args.out, stats["albums"], stats["tracks"], stats["bytes"] / 1024 ** 3))
    if stats["dupes"]:
        print("  %d album(s) still hold a duplicate track number:" % len(stats["dupes"]))
        for album in sorted(stats["dupes"]):
            print("     %s  tracks %s" % (album, ",".join(str(n) for n in stats["dupes"][album])))
        print("  These cannot be ingested until renumbered at the source")
        print("  (MUSIC-REPOSITORY-SPEC §2: one track number = one song).")
    else:
        print("  no duplicate track numbers — the tree is ingestible")
    return 0


if __name__ == "__main__":
    sys.exit(main())
